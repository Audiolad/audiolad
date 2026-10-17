#!/usr/bin/env node
/**
 * Isolated scratch-Postgres smoke for admin «Оценки → Слушатели» RPCs.
 * Never writes to production postgres. Parse-only is not a pass.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const migration = read("supabase/migrations/20270106120000_admin_ratings_listeners.sql");
const ratings = read("supabase/migrations/20260921120000_practice_ratings.sql");

// Static guarantees (cheap, always run).
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_ratings_listeners\(/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_ratings_listener_detail\(/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_ratings_listeners[\s\S]*FROM anon, authenticated/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_ratings_listener_detail[\s\S]*FROM anon, authenticated/);
assert.doesNotMatch(migration, /TO authenticated/);
assert.doesNotMatch(migration, /TO anon/);
assert.doesNotMatch(migration, /\b(INSERT INTO|UPDATE public|DELETE FROM|ALTER TABLE|DROP |CREATE TABLE|CREATE INDEX|TRUNCATE)\b/i);
assert.doesNotMatch(migration, /'vote_ip_hmac'|'device_id_hmac'/, "HMAC must never be a returned key");
assert.equal((migration.match(/\bSTABLE\b/g) ?? []).length, 2, "both RPCs STABLE");

/**
 * Disposable Postgres ONLY: a brand-new cluster is created with initdb in a
 * temp dir, listens on a unix socket inside that dir (no TCP), and is
 * destroyed afterwards. Never targets Docker `supabase-db`, a system
 * service, or any existing server — so cluster-wide stub statements (e.g.
 * ALTER ROLE service_role BYPASSRLS) cannot touch a real database.
 */
function findPgBin() {
  const candidates = [];
  if (process.env.AUDIOLAD_PG_BINDIR) candidates.push(process.env.AUDIOLAD_PG_BINDIR);
  try {
    candidates.push(execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim());
  } catch {
    /* ignore */
  }
  try {
    for (const v of readdirSync("/usr/lib/postgresql").sort().reverse()) {
      candidates.push(`/usr/lib/postgresql/${v}/bin`);
    }
  } catch {
    /* ignore */
  }
  return candidates.find((dir) => existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) ?? null;
}

if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
  console.log("admin-ratings-listeners-sql-unit: static ok; isolated smoke skipped");
  process.exit(0);
}

const bin = findPgBin();
if (!bin) {
  console.error("ISOLATED_POSTGRES_SMOKE = NOT_AVAILABLE: no initdb/pg_ctl for a disposable cluster");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "al-listeners-pg-"));
const data = join(dir, "data");
const port = String(20000 + Math.floor(Math.random() * 30000));
let started = false;
try {
  execFileSync(join(bin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--no-sync"], { stdio: "ignore" });
  execFileSync(
    join(bin, "pg_ctl"),
    ["-D", data, "-w", "-l", join(dir, "pg.log"), "-o", `-k ${dir} -p ${port} -c listen_addresses=''`, "start"],
    { stdio: "ignore" },
  );
  started = true;
  const sql = [
    read("scripts/lib/admin-ratings-analytics-stub.sql"),
    read("scripts/lib/admin-ratings-listeners-stub.sql"),
    ratings,
    read("supabase/migrations/20260922120000_admin_ratings_analytics.sql"),
    migration,
    read("scripts/lib/admin-ratings-listeners-seed.sql"),
    read("supabase/tests/admin_ratings_listeners_smoke.sql"),
  ].join("\n");
  const psql = existsSync(join(bin, "psql")) ? join(bin, "psql") : "psql";
  const out = execFileSync(
    psql,
    ["-h", dir, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
    { input: sql, stdio: ["pipe", "pipe", "inherit"] },
  ).toString();
  assert.match(out, /admin_ratings_listeners_smoke: PASS/);
  console.log("ISOLATED_POSTGRES_SMOKE = PASS (disposable initdb cluster, unix socket only)");
  console.log("admin-ratings-listeners-sql-unit: isolated RPC/privileges ok");
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
