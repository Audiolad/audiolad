#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for practice_listen_stats.
 * Scratch database only. Never writes to production postgres.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20260920120000_practice_listen_stats.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/practice-listen-stats-rls-stub.sql");
const seedPath = join(repoRoot, "scripts/lib/practice-listen-stats-rls-seed.sql");
const smokePath = join(
  repoRoot,
  "supabase/tests/practice_listen_stats_rls_smoke.sql",
);
const dbName = "audiolad_practice_listen_stats_rls_test";

const migration = readFileSync(migrationPath, "utf8");

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_listen_stats/);
assert.match(migration, /real_listened_ms/);
assert.match(migration, /rating_eligible_at/);
assert.match(migration, /PRIMARY KEY \(user_id, practice_id\)/);
assert.match(migration, /Users select own practice listen stats/);
assert.match(migration, /FOR SELECT/);
assert.match(migration, /REVOKE ALL ON TABLE public\.practice_listen_stats FROM anon/);
assert.match(
  migration,
  /REVOKE ALL ON TABLE public\.practice_listen_stats FROM authenticated/,
);
assert.match(
  migration,
  /GRANT SELECT ON TABLE public\.practice_listen_stats TO authenticated/,
);
assert.match(
  migration,
  /GRANT ALL ON TABLE public\.practice_listen_stats TO service_role/,
);
assert.match(migration, /apply_practice_listen_stats_heartbeat/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.apply_practice_listen_stats_heartbeat/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.apply_practice_listen_stats_heartbeat/);
assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
assert.doesNotMatch(migration, /practice_ratings|practice_rating_events/);
assert.doesNotMatch(
  migration,
  /ALTER TABLE public\.practice_audio_progress/,
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
    throw new Error("practice_listen_stats RLS stub, seed, or smoke is missing");
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
  console.log("practice-listen-stats-rls-sql-unit: parse + isolated RLS ok");
} else {
  console.log(
    skipIsolatedSql
      ? "practice-listen-stats-rls-sql-unit: parse-only ok (isolated SQL disabled)"
      : "practice-listen-stats-rls-sql-unit: parse-only ok (no local postgres)",
  );
}
