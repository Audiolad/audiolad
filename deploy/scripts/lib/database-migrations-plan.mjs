#!/usr/bin/env node
/**
 * Pure planner + parsers for self-hosted supabase-db migration apply.
 * Never repairs history. Never talks to a database.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ABORT_UNINITIALIZED = "database_migration_history_uninitialized";
const ABORT_DRIFT = "database_migration_history_drift";

export function normalizeVersion(input) {
  if (input == null) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  const base = raw.split(/[/\\]/).pop() || "";
  const noExt = base.replace(/\.sql$/i, "");
  const match = noExt.match(/^(\d{8,})/);
  if (match) return match[1];
  const digitsOnly = noExt.match(/^(\d{8,})$/);
  return digitsOnly ? digitsOnly[1] : "";
}

function uniqueSorted(versions) {
  return [...new Set(versions.map(normalizeVersion).filter(Boolean))].sort();
}

export function versionsFromMigrationFilenames(names) {
  const list = Array.isArray(names) ? names : [];
  return uniqueSorted(list);
}

export function listLocalMigrationFiles(dir) {
  const files = [];
  const byVersion = new Map();
  let names = [];
  try {
    names = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".sql"));
  } catch {
    return { files: [], versions: [], duplicates: [], fileCount: 0 };
  }
  for (const filename of names) {
    const version = normalizeVersion(filename);
    if (!version) continue;
    const rec = {
      version,
      filename,
      path: join(dir, filename),
      name: filename.replace(/^\d+_/, "").replace(/\.sql$/i, ""),
    };
    files.push(rec);
    if (!byVersion.has(version)) byVersion.set(version, []);
    byVersion.get(version).push(filename);
  }
  files.sort((a, b) => {
    if (a.version === b.version) return a.filename.localeCompare(b.filename);
    return a.version < b.version ? -1 : 1;
  });
  const duplicates = [...byVersion.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([version, list]) => ({ version, files: list }))
    .sort((a, b) => a.version.localeCompare(b.version));
  return {
    files,
    versions: uniqueSorted(files.map((f) => f.version)),
    duplicates,
    fileCount: files.length,
  };
}

export function parsePsqlVersionList(text) {
  const versions = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^ERROR:/i.test(trimmed)) continue;
    if (/does not exist/i.test(trimmed)) continue;
    const version = extractVersionToken(trimmed);
    if (version) versions.push(version);
  }
  return uniqueSorted(versions);
}

export function classifyRemoteHistory({ tableExists, versions = [] } = {}) {
  if (!tableExists) {
    return {
      status: "missing",
      ready: false,
      code: ABORT_UNINITIALIZED,
    };
  }
  const remote = uniqueSorted(versions);
  if (remote.length === 0) {
    return {
      status: "empty",
      ready: false,
      code: ABORT_UNINITIALIZED,
    };
  }
  return {
    status: "ready",
    ready: true,
    code: "ready",
    remoteVersions: remote,
  };
}

function collectFilenames(args) {
  const names = [];
  for (const arg of args) {
    if (!arg) continue;
    try {
      const st = statSync(arg);
      if (st.isDirectory()) {
        for (const ent of readdirSync(arg)) {
          if (ent.toLowerCase().endsWith(".sql")) {
            names.push(join(arg, ent));
          }
        }
        continue;
      }
    } catch {
      // treat as a bare filename
    }
    names.push(arg);
  }
  return names;
}

function extractVersionToken(cell) {
  if (cell == null) return "";
  const text = String(cell).trim();
  if (!text) return "";
  const match = text.match(/(\d{8,})/);
  return match ? match[1] : "";
}

function tryParseJson(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  const candidates = [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    candidates.push(trimmed);
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next
    }
  }
  return null;
}

function versionsFromJson(parsed) {
  const local = [];
  const remote = [];
  if (Array.isArray(parsed)) {
    for (const row of parsed) {
      if (row == null) continue;
      if (typeof row === "string" || typeof row === "number") {
        local.push(normalizeVersion(row));
        continue;
      }
      const localCell = row.local ?? row.LOCAL ?? row.localVersion ?? "";
      const remoteCell = row.remote ?? row.REMOTE ?? row.remoteVersion ?? "";
      const lv = extractVersionToken(localCell);
      const rv = extractVersionToken(remoteCell);
      if (lv) local.push(lv);
      if (rv) remote.push(rv);
    }
    return { localVersions: uniqueSorted(local), remoteVersions: uniqueSorted(remote) };
  }
  if (parsed && typeof parsed === "object") {
    const localRaw = parsed.localVersions ?? parsed.local ?? parsed.LOCAL ?? [];
    const remoteRaw = parsed.remoteVersions ?? parsed.remote ?? parsed.REMOTE ?? [];
    const asList = (value) => {
      if (Array.isArray(value)) return value;
      if (value == null || value === "") return [];
      return [value];
    };
    return {
      localVersions: uniqueSorted(asList(localRaw).map(extractVersionToken)),
      remoteVersions: uniqueSorted(asList(remoteRaw).map(extractVersionToken)),
    };
  }
  return null;
}

function parseMigrationTable(text) {
  const local = [];
  const remote = [];
  const lines = String(text ?? "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/LOCAL/i.test(trimmed) && /REMOTE/i.test(trimmed)) continue;
    if (/^[─┼─\-|=+\s]+$/.test(trimmed)) continue;
    if (/^connecting\b/i.test(trimmed)) continue;
    const cells = trimmed.split(/│|\|/).map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const localCell = cells[0] ?? "";
    const remoteCell = cells[1] ?? "";
    if (/^local$/i.test(localCell) && /^remote$/i.test(remoteCell)) continue;
    const lv = extractVersionToken(localCell);
    const rv = extractVersionToken(remoteCell);
    if (!lv && !rv) continue;
    if (lv) local.push(lv);
    if (rv) remote.push(rv);
  }
  return {
    localVersions: uniqueSorted(local),
    remoteVersions: uniqueSorted(remote),
  };
}

export function parseMigrationListOutput(text) {
  const parsed = tryParseJson(text);
  if (parsed != null) {
    const fromJson = versionsFromJson(parsed);
    if (fromJson) return fromJson;
  }
  return parseMigrationTable(text);
}

export function planDatabaseMigrations({
  localVersions = [],
  remoteVersions = [],
  allowEmptyRemote = false,
} = {}) {
  const local = uniqueSorted(localVersions);
  const remote = uniqueSorted(remoteVersions);
  const remoteSet = new Set(remote);
  const pending = local.filter((version) => !remoteSet.has(version));
  const pendingCount = pending.length;

  const base = {
    pending,
    pendingCount,
    database_migrations_pending: pendingCount,
    localVersions: local,
    remoteVersions: remote,
  };

  if (remote.length === 0 && local.length > 0 && !allowEmptyRemote) {
    return {
      ...base,
      action: "abort",
      code: ABORT_UNINITIALIZED,
    };
  }

  if (remote.length > 0) {
    const maxRemote = remote[remote.length - 1];
    const hasHole = pending.some((version) => version < maxRemote);
    if (hasHole) {
      return {
        ...base,
        action: "abort",
        code: ABORT_DRIFT,
      };
    }
  }

  if (pendingCount === 0) {
    return {
      ...base,
      action: "noop",
      code: "database_migrations_pending=0",
    };
  }

  return {
    ...base,
    action: "apply",
    code: "apply",
  };
}

const POSTGRES_URL_RE = /(?:postgres(?:ql)?:\/\/)[^\s"'`<>\\]+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const SERVICE_ROLE_ASSIGN_RE = /(SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*)\S+/gi;
const DB_URL_ASSIGN_RE = /(SUPABASE_DB_URL\s*[:=]\s*)\S+/gi;
const SB_SECRET_RE = /sb_secret_[A-Za-z0-9_-]+/g;

export function redactMigrationSecrets(text) {
  let out = String(text ?? "");
  out = out.replace(POSTGRES_URL_RE, "postgresql://[redacted]");
  out = out.replace(JWT_RE, "[redacted-jwt]");
  out = out.replace(SB_SECRET_RE, "[redacted-service-role]");
  out = out.replace(SERVICE_ROLE_ASSIGN_RE, "$1[redacted]");
  out = out.replace(DB_URL_ASSIGN_RE, "$1[redacted]");
  return out;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main(argv) {
  const mode = argv[2] || "";
  const rest = argv.slice(3);
  const needsStdin = (
    mode === "plan" ||
    mode === "parse-list" ||
    mode === "parse-psql-versions" ||
    mode === "redact" ||
    (mode === "from-files" && rest.length === 0)
  );
  const stdin = needsStdin ? readStdin() : "";

  if (mode === "plan") {
    const parsed = tryParseJson(stdin);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      process.stderr.write("plan mode expects JSON object on stdin\n");
      process.exit(2);
    }
    writeJson(
      planDatabaseMigrations({
        localVersions: parsed.localVersions ?? parsed.local ?? [],
        remoteVersions: parsed.remoteVersions ?? parsed.remote ?? [],
        allowEmptyRemote: Boolean(parsed.allowEmptyRemote),
      }),
    );
    return;
  }

  if (mode === "parse-list") {
    writeJson(parseMigrationListOutput(stdin));
    return;
  }

  if (mode === "from-files") {
    let names = rest;
    if (names.length === 0 && stdin.trim()) {
      const parsed = tryParseJson(stdin);
      if (Array.isArray(parsed)) {
        names = parsed.map((item) => String(item));
      } else {
        names = stdin.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      }
    }
    writeJson(versionsFromMigrationFilenames(collectFilenames(names)));
    return;
  }

  if (mode === "redact") {
    process.stdout.write(redactMigrationSecrets(stdin));
    return;
  }

  if (mode === "from-files-detailed") {
    const dir = rest[0] || "";
    writeJson(listLocalMigrationFiles(dir));
    return;
  }

  if (mode === "parse-psql-versions") {
    writeJson(parsePsqlVersionList(stdin));
    return;
  }

  process.stderr.write("usage: database-migrations-plan.mjs plan|parse-list|from-files|from-files-detailed|parse-psql-versions|redact\n");
  process.exit(2);
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main(process.argv);
}
