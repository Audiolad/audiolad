#!/usr/bin/env node
/**
 * Parse listener-comment migration. Optional scratch Postgres only.
 * Never uses the production supabase-db container.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "supabase/migrations/20270124120000_practice_listener_comments.sql"),
  "utf8",
);

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_listener_comments/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_listener_comment_reports/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_listener_comment_moderation_events/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_listener_comment_notices/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_listener_comment_edits/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /Rollback is not executed by this file/);
assert.match(migration, /keep the rows/);
assert.match(migration, /DROP VIEW IF EXISTS public\.practice_listener_comment_feed/);
assert.match(migration, /DROP TABLE IF EXISTS public\.practice_listener_comment_edits/);
assert.match(migration, /DROP TABLE IF EXISTS public\.practice_listener_comments;/);
assert.match(migration, /DROP FUNCTION IF EXISTS public\.practice_listener_comment_row_visible/);
assert.match(migration, /Visible listener comments/);
assert.match(migration, /Users read own listener comment notices/);
assert.match(migration, /author_cannot|author_members/);
assert.doesNotMatch(migration, /ALTER TABLE public\.(practices|profiles|practice_ratings|users)\b/);
const executableSql = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
assert.doesNotMatch(executableSql, /\bDROP TABLE\b|\bTRUNCATE\b|DELETE FROM public\./);
assert.match(migration, /REVOKE ALL ON TABLE public\.practice_listener_comment_reports FROM authenticated/);
assert.match(migration, /GRANT SELECT ON TABLE public\.practice_listener_comment_notices TO authenticated/);
assert.doesNotMatch(migration, /GRANT INSERT ON TABLE public\.practice_listener_comments TO authenticated/);

function findPgBin() {
  const candidates = [];
  if (process.env.AUDIOLAD_PG_BINDIR) candidates.push(process.env.AUDIOLAD_PG_BINDIR);
  try {
    candidates.push(execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim());
  } catch {
    /* ignore */
  }
  try {
    for (const version of readdirSync("/usr/lib/postgresql").sort().reverse()) {
      candidates.push(`/usr/lib/postgresql/${version}/bin`);
    }
  } catch {
    /* ignore */
  }
  return (
    candidates.find((dir) => existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) ??
    null
  );
}

function runScratch(bin) {
  const dir = mkdtempSync(join(tmpdir(), "al-listener-comments-pg-"));
  const data = join(dir, "data");
  const port = String(20000 + Math.floor(Math.random() * 30000));
  let started = false;
  try {
    execFileSync(join(bin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--no-sync"], {
      stdio: "ignore",
    });
    execFileSync(
      join(bin, "pg_ctl"),
      ["-D", data, "-w", "-l", join(dir, "pg.log"), "-o", `-k ${dir} -p ${port} -c listen_addresses=''`, "start"],
      { stdio: "ignore" },
    );
    started = true;
    const sql = [
      readFileSync(join(root, "scripts/lib/practice-listener-comments-stub.sql"), "utf8"),
      migration,
      readFileSync(join(root, "supabase/tests/practice_listener_comments_rls_smoke.sql"), "utf8"),
    ].join("\n");
    const psql = existsSync(join(bin, "psql")) ? join(bin, "psql") : "psql";
    const out = execFileSync(
      psql,
      ["-X", "-h", dir, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
      { input: sql, stdio: ["pipe", "pipe", "inherit"] },
    ).toString();
    assert.match(out, /practice_listener_comments_rls_smoke: PASS/);
  } finally {
    if (started) {
      try {
        execFileSync(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore" });
      } catch {
        /* ignore */
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

const pgBin = findPgBin();
if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1" || !pgBin) {
  console.log(
    process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1"
      ? "practice-listener-comments-sql-unit: parse-only ok (isolated SQL disabled)"
      : "practice-listener-comments-sql-unit: parse-only ok (no local postgres)",
  );
} else {
  runScratch(pgBin);
  console.log("practice-listener-comments-sql-unit: parse + scratch RLS ok");
}
