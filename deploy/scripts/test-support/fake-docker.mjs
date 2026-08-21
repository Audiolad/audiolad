#!/usr/bin/env node
/**
 * Test-only docker/psql stand-in. Never talks to a real container.
 * Driven by FAKE_DOCKER_STATE directory.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STATE = process.env.FAKE_DOCKER_STATE;
if (!STATE) {
  process.stderr.write("FAKE_DOCKER_STATE is required\n");
  process.exit(2);
}
mkdirSync(STATE, { recursive: true });

function readState(name, fallback = "") {
  const path = join(STATE, name);
  if (!existsSync(path)) return fallback;
  return readFileSync(path, "utf8");
}

function writeState(name, value) {
  writeFileSync(join(STATE, name), String(value));
}

function appendState(name, value) {
  appendFileSync(join(STATE, name), String(value));
}

function recordCall(args) {
  const redacted = args.map((arg) =>
    /^(postgres|postgresql):\/\//i.test(arg) ? "[redacted-db-url]" : arg,
  );
  appendState("calls", `${redacted.join(" ")}\n`);
}

function increment(name) {
  const next = Number(readState(name, "0").trim() || "0") + 1;
  writeState(name, `${next}\n`);
  return next;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function stripSql(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSelectOnly(sql) {
  const stripped = stripSql(sql);
  if (!stripped) return true;
  const parts = stripped
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return true;
  return parts.every((part) => /^(select|with|show|explain)\b/i.test(part));
}

function failReadonly(sql) {
  if (readState("readonly", "").trim() !== "1") return false;
  if (isSelectOnly(sql)) return false;
  increment("mutation_blocks");
  appendState("mutations", `${sql}\n---\n`);
  process.stderr.write("FAKE_READONLY_MUTATION_BLOCKED\n");
  process.exit(1);
  return true;
}

function containerStatus() {
  return readState("container_status", "running").trim() || "running";
}

function handleInspect(args) {
  const name = args[args.length - 1] || "";
  const expected = readState("container_name", "supabase-db").trim() || "supabase-db";
  if (name !== expected && name !== process.env.AUDIOLAD_SUPABASE_DB_CONTAINER) {
    process.stderr.write(`Error: No such object: ${name}\n`);
    process.exit(1);
  }
  const status = containerStatus();
  if (status === "missing") {
    process.stderr.write(`Error: No such object: ${name}\n`);
    process.exit(1);
  }
  const formatIdx = args.findIndex((a) => a === "--format" || a === "-f");
  if (formatIdx >= 0) {
    process.stdout.write(`${status}\n`);
    process.exit(0);
  }
  process.stdout.write(`[{"State":{"Status":"${status}"}}]\n`);
  process.exit(0);
}

function extractPsqlCommand(args) {
  const execArgs = [...args];
  let interactive = false;
  while (execArgs[0] === "-i" || execArgs[0] === "--interactive") {
    interactive = true;
    execArgs.shift();
  }
  const container = execArgs.shift();
  const rest = execArgs;
  const cIdx = rest.findIndex((a) => a === "-c" || a === "--command");
  let sql = "";
  if (cIdx >= 0) {
    sql = rest[cIdx + 1] || "";
  } else {
    const combined = rest.find((a) => a.startsWith("-") && a.includes("c") && a !== "-c");
    if (combined) {
      const after = rest[rest.indexOf(combined) + 1];
      if (after && !after.startsWith("-")) sql = after;
    }
  }
  if (!sql && interactive) {
    sql = readStdin();
  }
  return { container, sql, rest, interactive };
}

function remoteVersions() {
  return readState("remote", "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function addRemote(version) {
  if (!version) return;
  const current = new Set(remoteVersions());
  if (!current.has(version)) {
    appendState("remote", `${version}\n`);
  }
}

function handleSql(sql) {
  failReadonly(sql);
  appendState("sql_log", `${sql}\n---\n`);
  const compact = stripSql(sql);
  const lower = compact.toLowerCase();

  if (readState("select1", "ok").trim() === "fail" && /^select 1\b/.test(lower)) {
    process.stderr.write("select 1 failed\n");
    process.exit(1);
  }

  if (/^select 1\b/.test(lower)) {
    process.stdout.write("1\n");
    return;
  }

  if (lower.includes("information_schema.tables") && lower.includes("schema_migrations")) {
    const table = readState("table_status", "missing").trim() || "missing";
    process.stdout.write(table === "missing" ? "f\n" : "t\n");
    return;
  }

  if (lower.includes("count(*)") && lower.includes("supabase_migrations.schema_migrations")) {
    const table = readState("table_status", "missing").trim() || "missing";
    if (table === "missing") {
      process.stderr.write('ERROR:  relation "supabase_migrations.schema_migrations" does not exist\n');
      process.exit(1);
    }
    if (table === "empty") {
      process.stdout.write("0\n");
      return;
    }
    process.stdout.write(`${remoteVersions().length}\n`);
    return;
  }

  if (lower.includes("select version") && lower.includes("schema_migrations")) {
    const table = readState("table_status", "missing").trim() || "missing";
    if (table === "missing") {
      process.stderr.write('ERROR:  relation "supabase_migrations.schema_migrations" does not exist\n');
      process.exit(1);
    }
    for (const version of remoteVersions()) {
      process.stdout.write(`${version}\n`);
    }
    return;
  }

  if (lower.includes("current_database()") || lower.includes("inet_server_addr")) {
    process.stdout.write(`${readState("current_database", "postgres").trim() || "postgres"}|${readState("inet_server_addr", "127.0.0.1").trim()}\n`);
    return;
  }

  if (lower.includes("information_schema.tables") && lower.includes("table_schema = 'public'")) {
    process.stdout.write(`${readState("public_table_count", "42").trim() || "42"}\n`);
    return;
  }

  if (lower.includes("author_project_limit_override")) {
    const value = readState("olga_override", "").trim();
    if (!value) {
      process.stdout.write("\n");
      return;
    }
    process.stdout.write(`${value}\n`);
    return;
  }

  if (/^insert\s+into\s+supabase_migrations\.schema_migrations\b/.test(lower)) {
    increment("history_inserts");
    const match = sql.match(/values\s*\(\s*'(\d{8,})'/i);
    if (match) addRemote(match[1]);
    writeState("table_status", "ready");
    return;
  }

  if (lower.includes("create schema") || lower.includes("create table") && lower.includes("schema_migrations")) {
    increment("ddl_writes");
    if (readState("table_status", "missing").trim() === "missing") {
      writeState("table_status", "empty");
    }
    return;
  }

  if (!isSelectOnly(sql)) {
    if (readState("apply_fail", "").trim() === "1") {
      increment("apply_failures");
      process.stderr.write("fake psql apply failed\n");
      process.exit(1);
    }
    increment("apply_count");
    appendState("applied_sql", `${sql}\n---\n`);
    const versionMatch = sql.match(/--\s*(\d{8,})/);
    if (versionMatch) appendState("applied_versions", `${versionMatch[1]}\n`);
    return;
  }

  const fixturePath = join(STATE, "probe_results.json");
  if (existsSync(fixturePath)) {
    try {
      const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
      const probes = fixture.probes || fixture;
      for (const [key, value] of Object.entries(probes)) {
        if (sql.includes(key) || compact.includes(key)) {
          if (value === true || value === "t" || value === "1") {
            process.stdout.write("t\n");
            return;
          }
          if (value === false || value === "f" || value === "0") {
            process.stdout.write("f\n");
            return;
          }
          process.stdout.write(`${value}\n`);
          return;
        }
      }
      if (typeof fixture.defaultSelect === "string") {
        process.stdout.write(`${fixture.defaultSelect}\n`);
        return;
      }
    } catch {
      // fall through
    }
  }
  process.stdout.write("t\n");
}

function main(argv) {
  recordCall(argv);
  const cmd = argv[0] || "";
  if (cmd === "inspect") {
    handleInspect(argv.slice(1));
    return;
  }
  if (cmd === "exec") {
    if (containerStatus() !== "running") {
      process.stderr.write("Error: container is not running\n");
      process.exit(1);
    }
    const { sql } = extractPsqlCommand(argv.slice(1));
    handleSql(sql);
    return;
  }
  if (cmd === "version" || cmd === "info") {
    process.stdout.write("Docker version 27.0.0 (fake)\n");
    return;
  }
  process.stderr.write(`unknown fake docker command: ${argv.join(" ")}\n`);
  process.exit(2);
}

main(process.argv.slice(2));
