#!/usr/bin/env node
/**
 * Read-only migration audit: build probes from static SQL and classify versions.
 * Never applies migration SQL. Never writes to a database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeVersion } from "./database-migrations-plan.mjs";

export const AUDIT_FORMAT = "audiolad.migration-audit.v1";
export const OLGA_VERSION = "20260821140000";
export const OLGA_EMAIL = "olganevska@yandex.ru";

const DATA_NAME_RE =
  /(backfill|seed_|repair_|rename_|grant_|archive_|clear_|unlink_|assign_|reset_)/i;

function stripSqlComments(sql) {
  return String(sql ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function unquoteIdent(raw) {
  let value = String(raw ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function splitIdent(raw) {
  const cleaned = String(raw ?? "").trim();
  const parts = cleaned.split(".").map(unquoteIdent).filter(Boolean);
  if (parts.length >= 2) {
    return { schema: parts[parts.length - 2], name: parts[parts.length - 1] };
  }
  return { schema: "public", name: parts[0] || "" };
}

function addProbe(probes, probe) {
  if (!probe?.id || !probe.sql) return;
  if (probes.some((item) => item.id === probe.id)) return;
  probes.push(probe);
}

function tableExistsSql(schema, name) {
  return `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '${schema}' AND table_name = '${name}')`;
}

function columnExistsSql(schema, table, column) {
  return `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' AND column_name = '${column}')`;
}

function functionExistsSql(schema, name) {
  return `SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = '${schema}' AND routine_name = '${name}')`;
}

function triggerExistsSql(name) {
  return `SELECT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = '${name}')`;
}

function indexExistsSql(name) {
  return `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = '${name}')`;
}

function policyExistsSql(name, table) {
  const tableClause = table
    ? ` AND tablename = '${table}'`
    : "";
  return `SELECT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '${name}'${tableClause})`;
}

function typeExistsSql(schema, name) {
  return `SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = '${schema}' AND t.typname = '${name}')`;
}

export function olgaOverrideProbe() {
  return {
    id: "olga_author_project_limit_override",
    kind: "special",
    conclusive: true,
    sql: `SELECT EXISTS (SELECT 1 FROM public.profiles WHERE email = '${OLGA_EMAIL}' AND author_project_limit_override = 5)`,
    evidenceHint: "profiles.author_project_limit_override=5 for olganevska@yandex.ru",
  };
}

export function isDataOrBackfillMigration(filename, sql) {
  if (DATA_NAME_RE.test(filename)) return true;
  const stripped = stripSqlComments(sql);
  const hasSchema =
    /\bCREATE\s+TABLE\b/i.test(stripped) ||
    /\bADD\s+COLUMN\b/i.test(stripped) ||
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i.test(stripped) ||
    /\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\b/i.test(stripped) ||
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(stripped) ||
    /\bCREATE\s+POLICY\b/i.test(stripped) ||
    /\bCREATE\s+TYPE\b/i.test(stripped);
  const hasData =
    /\bUPDATE\b/i.test(stripped) ||
    /\bINSERT\s+INTO\b/i.test(stripped) ||
    /\bDELETE\s+FROM\b/i.test(stripped);
  return hasData && !hasSchema;
}

export function buildProbesFromSql(filename, sql) {
  const version = normalizeVersion(filename);
  const probes = [];
  if (version === OLGA_VERSION) {
    addProbe(probes, olgaOverrideProbe());
    return {
      version,
      filename: basename(filename),
      kind: "special",
      probes,
    };
  }

  const stripped = stripSqlComments(sql);
  const tableRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)/gi;
  let match;
  while ((match = tableRe.exec(stripped))) {
    const ident = splitIdent(match[1]);
    if (!ident.name) continue;
    addProbe(probes, {
      id: `table:${ident.schema}.${ident.name}`,
      kind: "table",
      conclusive: true,
      sql: tableExistsSql(ident.schema, ident.name),
    });
  }

  const alterRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)\s+([\s\S]*?)(?=;|$)/gi;
  while ((match = alterRe.exec(stripped))) {
    const tableIdent = splitIdent(match[1]);
    const tail = match[2] || "";
    const colRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|(\w+))/gi;
    let col;
    while ((col = colRe.exec(tail))) {
      const column = col[1] || col[2];
      addProbe(probes, {
        id: `column:${tableIdent.schema}.${tableIdent.name}.${column}`,
        kind: "column",
        conclusive: true,
        sql: columnExistsSql(tableIdent.schema, tableIdent.name, column),
      });
    }
  }

  const fnRe =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)/gi;
  while ((match = fnRe.exec(stripped))) {
    const ident = splitIdent(match[1]);
    addProbe(probes, {
      id: `function:${ident.schema}.${ident.name}`,
      kind: "function",
      conclusive: true,
      sql: functionExistsSql(ident.schema, ident.name),
    });
  }

  const triggerRe = /CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+(?:"([^"]+)"|(\w+))/gi;
  while ((match = triggerRe.exec(stripped))) {
    const name = match[1] || match[2];
    addProbe(probes, {
      id: `trigger:${name}`,
      kind: "trigger",
      conclusive: true,
      sql: triggerExistsSql(name),
    });
  }

  const indexRe =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|(\w+))/gi;
  while ((match = indexRe.exec(stripped))) {
    const name = match[1] || match[2];
    addProbe(probes, {
      id: `index:${name}`,
      kind: "index",
      conclusive: true,
      sql: indexExistsSql(name),
    });
  }

  const policyRe =
    /CREATE\s+POLICY\s+(?:"([^"]+)"|(\w+))\s+ON\s+((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)/gi;
  while ((match = policyRe.exec(stripped))) {
    const name = match[1] || match[2];
    const table = splitIdent(match[3]).name;
    addProbe(probes, {
      id: `policy:${table}.${name}`,
      kind: "policy",
      conclusive: true,
      sql: policyExistsSql(name, table),
    });
  }

  const typeRe =
    /CREATE\s+TYPE\s+((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)/gi;
  while ((match = typeRe.exec(stripped))) {
    const ident = splitIdent(match[1]);
    addProbe(probes, {
      id: `type:${ident.schema}.${ident.name}`,
      kind: "type",
      conclusive: true,
      sql: typeExistsSql(ident.schema, ident.name),
    });
  }

  const kind = isDataOrBackfillMigration(filename, sql) ? "data" : "schema";
  return {
    version,
    filename: basename(filename),
    kind,
    probes,
  };
}

function truthyResult(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  if (["t", "true", "1", "yes"].includes(text)) return true;
  if (["f", "false", "0", "no"].includes(text)) return false;
  if (text === "5") return true;
  return false;
}

export function classifyMigration({ filename, sql, probeResults = {} } = {}) {
  const built = buildProbesFromSql(filename, sql);
  const evidence = [];
  const probes = built.probes.map((probe) => {
    const raw = probeResults[probe.id];
    const hasResult = Object.prototype.hasOwnProperty.call(probeResults, probe.id);
    const ok = hasResult ? truthyResult(raw) : null;
    const item = { ...probe, result: raw ?? null, ok, executed: hasResult };
    evidence.push({
      id: probe.id,
      kind: probe.kind,
      ok,
      result: raw ?? null,
    });
    return item;
  });

  let status = "REQUIRES_MANUAL_REVIEW";
  if (built.version === OLGA_VERSION) {
    const olga = probes[0];
    if (olga?.executed && olga.ok === true) status = "PROVEN_APPLIED";
    else if (olga?.executed && olga.ok === false) status = "PROVEN_NOT_APPLIED";
    else status = "REQUIRES_MANUAL_REVIEW";
  } else if (built.kind === "data" && probes.length === 0) {
    status = "REQUIRES_MANUAL_REVIEW";
  } else if (probes.length === 0) {
    status = "REQUIRES_MANUAL_REVIEW";
  } else if (probes.every((probe) => probe.executed && probe.ok === true)) {
    status = "PROVEN_APPLIED";
  } else if (probes.every((probe) => probe.executed && probe.ok === false)) {
    status = "PROVEN_NOT_APPLIED";
  } else {
    status = "REQUIRES_MANUAL_REVIEW";
  }

  return {
    version: built.version,
    file: built.filename,
    kind: built.kind,
    status,
    probes,
    evidence,
  };
}

export function buildAuditReport({
  migrationsDir,
  probeResultsByVersion = {},
  exec = false,
} = {}) {
  const names = readdirSync(migrationsDir)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort();
  const versions = [];
  for (const name of names) {
    const sql = readFileSync(join(migrationsDir, name), "utf8");
    versions.push(
      classifyMigration({
        filename: name,
        sql,
        probeResults: probeResultsByVersion[normalizeVersion(name)] || {},
      }),
    );
  }
  const counts = {
    PROVEN_APPLIED: versions.filter((row) => row.status === "PROVEN_APPLIED").length,
    PROVEN_NOT_APPLIED: versions.filter((row) => row.status === "PROVEN_NOT_APPLIED").length,
    REQUIRES_MANUAL_REVIEW: versions.filter((row) => row.status === "REQUIRES_MANUAL_REVIEW").length,
  };
  return {
    format: AUDIT_FORMAT,
    generatedAt: new Date().toISOString(),
    migrationsDir,
    exec: Boolean(exec),
    counts,
    versions,
  };
}

export function assertAuditReport(report) {
  if (!report || typeof report !== "object") {
    throw new Error("audit report missing");
  }
  if (report.format !== AUDIT_FORMAT) {
    throw new Error("audit report stale or unknown format");
  }
  if (!Array.isArray(report.versions)) {
    throw new Error("audit report missing versions");
  }
  return report;
}

export function approvedBaselineVersions(report) {
  const parsed = assertAuditReport(report);
  const review = parsed.versions.filter((row) => row.status === "REQUIRES_MANUAL_REVIEW");
  if (review.length > 0) {
    const error = new Error("baseline refuses REQUIRES_MANUAL_REVIEW");
    error.code = "REQUIRES_MANUAL_REVIEW";
    error.versions = review.map((row) => row.version);
    throw error;
  }
  return parsed.versions
    .filter((row) => row.status === "PROVEN_APPLIED")
    .map((row) => ({
      version: row.version,
      name: String(row.file || "").replace(/^\d+_/, "").replace(/\.sql$/i, ""),
      file: row.file,
    }));
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main(argv) {
  const mode = argv[2] || "";
  if (mode === "build-report") {
    const dir = argv[3];
    const fixturePath = argv[4] || "";
    let probeResultsByVersion = {};
    if (fixturePath) {
      probeResultsByVersion = JSON.parse(readFileSync(fixturePath, "utf8"));
    } else if (!process.stdin.isTTY) {
      const raw = readStdin().trim();
      if (raw) probeResultsByVersion = JSON.parse(raw);
    }
    process.stdout.write(
      `${JSON.stringify(buildAuditReport({ migrationsDir: dir, probeResultsByVersion, exec: false }), null, 2)}\n`,
    );
    return;
  }
  if (mode === "classify-one") {
    const filename = argv[3];
    const sql = readFileSync(filename, "utf8");
    const results = argv[4] ? JSON.parse(argv[4]) : {};
    process.stdout.write(`${JSON.stringify(classifyMigration({ filename, sql, probeResults: results }), null, 2)}\n`);
    return;
  }
  if (mode === "approve-baseline") {
    const report = JSON.parse(readFileSync(argv[3], "utf8"));
    try {
      assertAuditReport(report);
      const approved = approvedBaselineVersions(report);
      process.stdout.write(`${JSON.stringify({ ok: true, approved })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        ok: false,
        code: error.code || "invalid_report",
        message: error.message,
        versions: error.versions || [],
      })}\n`);
    }
    return;
  }
  if (mode === "list-probes") {
    const dir = argv[3];
    const names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".sql")).sort();
    const probes = [];
    for (const name of names) {
      const built = buildProbesFromSql(name, readFileSync(join(dir, name), "utf8"));
      for (const probe of built.probes) {
        probes.push({ version: built.version, id: probe.id, sql: probe.sql });
      }
    }
    process.stdout.write(`${JSON.stringify(probes)}\n`);
    return;
  }
  process.stderr.write("usage: migration-audit.mjs build-report|list-probes <dir> [fixture.json]\n");
  process.exit(2);
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main(process.argv);
}
