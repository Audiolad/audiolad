#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for admin Ratings RPCs.
 * Scratch database only. Never writes to production postgres.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ratingsMigration = join(
  repoRoot,
  "supabase/migrations/20260921120000_practice_ratings.sql",
);
const adminMigration = join(
  repoRoot,
  "supabase/migrations/20260922120000_admin_ratings_analytics.sql",
);
const stubPath = join(repoRoot, "scripts/lib/admin-ratings-analytics-stub.sql");
const seedPath = join(repoRoot, "scripts/lib/admin-ratings-analytics-seed.sql");
const smokePath = join(
  repoRoot,
  "supabase/tests/admin_ratings_analytics_smoke.sql",
);
const dbName = "audiolad_admin_ratings_analytics_test";

const migration = readFileSync(adminMigration, "utf8");
const ratings = readFileSync(ratingsMigration, "utf8");

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_ratings_summary/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_ratings_products/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_ratings_authors/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_ratings_events/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_ratings_diagnostics/);
assert.match(migration, /created_at[\s\S]*FIRST rating timestamp/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_ratings_summary/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_ratings_summary/);
assert.doesNotMatch(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.admin_ratings_summary[\s\S]*TO authenticated/,
);
assert.match(migration, /practice_ratings_created_at_active_idx/);
assert.match(migration, /practice_rating_events_occurred_at_id_idx/);
assert.match(
  migration,
  /jsonb_agg\(row_json ORDER BY occurred_at DESC, id DESC\)/,
);
assert.doesNotMatch(ratings, /admin_ratings_/);

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
    throw new Error("admin ratings stub, seed, or smoke is missing");
  }

  const sql = [
    readFileSync(stubPath, "utf8"),
    readFileSync(seedPath, "utf8"),
    ratings,
    migration,
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
  console.log("admin-ratings-analytics-sql-unit: parse + isolated RPC/RLS ok");
} else {
  console.log(
    skipIsolatedSql
      ? "admin-ratings-analytics-sql-unit: parse-only ok (isolated SQL disabled)"
      : "admin-ratings-analytics-sql-unit: parse-only ok (no local postgres)",
  );
}
