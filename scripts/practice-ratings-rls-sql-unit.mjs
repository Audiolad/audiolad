#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for practice_ratings.
 * Scratch database only. Never writes to production postgres.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20260921120000_practice_ratings.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/practice-ratings-rls-stub.sql");
const seedPath = join(repoRoot, "scripts/lib/practice-ratings-rls-seed.sql");
const smokePath = join(repoRoot, "supabase/tests/practice_ratings_rls_smoke.sql");
const dbName = "audiolad_practice_ratings_rls_test";

const migration = readFileSync(migrationPath, "utf8");

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_ratings/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_rating_events/);
assert.match(migration, /UNIQUE \(user_id, practice_id\)/);
assert.match(migration, /CHECK \(stars >= 1 AND stars <= 5\)/);
assert.match(migration, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
assert.match(migration, /vote_ip_hmac/);
assert.match(migration, /device_id_hmac/);
assert.match(migration, /excluded_at/);
assert.match(migration, /Users select own practice ratings/);
assert.match(migration, /FOR SELECT/);
assert.match(migration, /REVOKE ALL ON TABLE public\.practice_ratings FROM anon/);
assert.match(migration, /REVOKE ALL ON TABLE public\.practice_ratings FROM authenticated/);
assert.match(migration, /GRANT SELECT ON TABLE public\.practice_ratings TO authenticated/);
assert.match(migration, /GRANT ALL ON TABLE public\.practice_ratings TO service_role/);
assert.match(migration, /REVOKE ALL ON TABLE public\.practice_rating_events FROM anon/);
assert.match(migration, /REVOKE ALL ON TABLE public\.practice_rating_events FROM authenticated/);
assert.doesNotMatch(
  migration,
  /GRANT SELECT ON TABLE public\.practice_rating_events/,
);
assert.match(migration, /set_practice_rating/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_practice_rating/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_practice_rating/);
assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
assert.match(migration, /WHEN unique_violation THEN/);
assert.match(migration, /v_row\.stars = p_stars/);
assert.match(
  migration,
  /created_at is the first rating time and is immutable on edit/i,
);

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
    execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-c", "SELECT 1"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function runIsolatedSql() {
  if (!existsSync(stubPath) || !existsSync(seedPath) || !existsSync(smokePath)) {
    throw new Error("practice_ratings RLS stub, seed, or smoke is missing");
  }

  const sql = [
    readFileSync(stubPath, "utf8"),
    migration,
    readFileSync(seedPath, "utf8"),
    readFileSync(smokePath, "utf8"),
  ].join("\n");

  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE); CREATE DATABASE ${dbName};`,
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        dbName,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, stdio: ["pipe", "pipe", "inherit"] },
    );
    return;
  }

  execFileSync(
    "sudo",
    [
      "-n",
      "-u",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`],
    { stdio: "ignore" },
  );
  execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1"],
    { input: sql, stdio: ["pipe", "pipe", "inherit"] },
  );
}

const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";

if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  runIsolatedSql();
  console.log("practice-ratings-rls-sql-unit: parse + isolated RLS ok");
} else {
  console.log(
    skipIsolatedSql
      ? "practice-ratings-rls-sql-unit: parse-only ok (isolated SQL disabled)"
      : "practice-ratings-rls-sql-unit: parse-only ok (no local postgres)",
  );
}
