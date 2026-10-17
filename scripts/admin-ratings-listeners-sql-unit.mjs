#!/usr/bin/env node
/**
 * Isolated scratch-Postgres smoke for admin «Оценки → Слушатели» RPCs.
 * Never writes to production postgres. Parse-only is not a pass.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const migration = read("supabase/migrations/20270106120000_admin_ratings_listeners.sql");
const ratings = read("supabase/migrations/20260921120000_practice_ratings.sql");
const dbName = "audiolad_admin_ratings_listeners_test";

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

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function localPostgresAvailable() {
  try {
    execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-c", "SELECT 1"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function psql(args, input) {
  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
    return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", ...args], {
      input,
      stdio: ["pipe", "pipe", "inherit"],
    });
  }
  return execFileSync("sudo", ["-n", "-u", "postgres", "psql", ...args], {
    input,
    stdio: ["pipe", "pipe", "inherit"],
  });
}

if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
  console.log("admin-ratings-listeners-sql-unit: static ok; isolated smoke skipped");
} else if (dockerAvailable() || localPostgresAvailable()) {
  const sql = [
    read("scripts/lib/admin-ratings-analytics-stub.sql"),
    read("scripts/lib/admin-ratings-listeners-stub.sql"),
    ratings,
    read("supabase/migrations/20260922120000_admin_ratings_analytics.sql"),
    migration,
    read("scripts/lib/admin-ratings-listeners-seed.sql"),
    read("supabase/tests/admin_ratings_listeners_smoke.sql"),
  ].join("\n");
  psql(["-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`]);
  psql(["-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`]);
  const out = psql(["-d", dbName, "-v", "ON_ERROR_STOP=1", "-q", "-At"], sql).toString();
  assert.match(out, /admin_ratings_listeners_smoke: PASS/);
  psql(["-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`]);
  console.log("ISOLATED_POSTGRES_SMOKE = PASS");
  console.log("admin-ratings-listeners-sql-unit: isolated RPC/privileges ok");
} else {
  console.error("ISOLATED_POSTGRES_SMOKE = NOT_AVAILABLE");
  process.exit(1);
}
