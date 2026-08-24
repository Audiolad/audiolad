#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for
 * library_saves + audio_items preview window.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migrationName = "20260823200000_library_saves_and_preview_window.sql";
const migrationPath = join(migrationsDir, migrationName);
const stubPath = join(repoRoot, "scripts/lib/catalog-foundation-sql-stub.sql");
const migration = readFileSync(migrationPath, "utf8");

const priorMigrations = readdirSync(migrationsDir)
  .filter((name) => name.toLowerCase().endsWith(".sql") && name < migrationName)
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

assert.doesNotMatch(
  priorMigrations,
  /CREATE TABLE[\s\S]*public\.library_saves/i,
  "preflight: no prior library_saves table",
);
assert.doesNotMatch(
  priorMigrations,
  /preview_start_ms|preview_end_ms/,
  "preflight: no prior preview window columns",
);

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.library_saves/);
assert.match(migration, /user_id uuid NOT NULL/);
assert.match(migration, /practice_id uuid NOT NULL/);
assert.match(migration, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
assert.match(
  migration,
  /CONSTRAINT library_saves_user_practice_unique\s+UNIQUE \(user_id, practice_id\)/,
);
assert.match(migration, /REFERENCES auth\.users \(id\)/);
assert.match(migration, /REFERENCES public\.practices \(id\)/);
assert.match(migration, /ALTER TABLE public\.library_saves ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /GRANT SELECT, INSERT, DELETE ON TABLE public\.library_saves TO authenticated/);
assert.match(migration, /Users can view own library saves/);
assert.match(migration, /Users can insert own library saves/);
assert.match(migration, /Users can delete own library saves/);
assert.match(migration, /USING \(auth\.uid\(\) = user_id\)/);
assert.match(migration, /WITH CHECK \(auth\.uid\(\) = user_id\)/);
assert.doesNotMatch(migration, /FOR UPDATE/);
assert.doesNotMatch(migration, /access_source\s*=\s*'saved'/);
assert.doesNotMatch(migration, /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?favorites/i);

assert.match(
  migration,
  /ADD COLUMN IF NOT EXISTS preview_start_ms integer/,
);
assert.match(
  migration,
  /ADD COLUMN IF NOT EXISTS preview_end_ms integer/,
);
assert.match(migration, /audio_items_preview_window_check/);
assert.match(migration, /BETWEEN 30000 AND 90000/);
assert.match(migration, /preview_start_ms IS NULL AND preview_end_ms IS NULL/);

assert.doesNotMatch(migration, /DROP TABLE public\.(practices|user_practices|orders)/i);
assert.doesNotMatch(migration, /create_practice_order/);
assert.doesNotMatch(migration, /ALTER TABLE public\.orders/);
assert.doesNotMatch(migration, /ALTER TABLE public\.user_practices/);

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
  if (!existsSync(stubPath)) {
    throw new Error("catalog-foundation SQL stub is missing");
  }

  const dbName = "audiolad_catalog_foundation_test";
  const sql = [
    readFileSync(stubPath, "utf8"),
    migration,
    readFileSync(join(repoRoot, "supabase/tests/library_saves_preview_foundation_smoke.sql"), "utf8"),
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
        `DROP DATABASE IF EXISTS ${dbName}; CREATE DATABASE ${dbName};`,
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
      { input: sql, stdio: ["pipe", "ignore", "inherit"] },
    );
    return;
  }

  execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${dbName};`],
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
    { input: sql, stdio: ["pipe", "ignore", "inherit"] },
  );
}

if (dockerAvailable() || localPostgresAvailable()) {
  runIsolatedSql();
  console.log("catalog-foundation-sql-unit: parse + isolated sql ok");
} else {
  console.log("catalog-foundation-sql-unit: parse-only ok (no local postgres)");
}
