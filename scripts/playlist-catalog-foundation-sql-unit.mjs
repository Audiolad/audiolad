#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for
 * playlist listing aggregates + playlist_saves.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migrationName = "20260825163000_playlist_catalog_foundation.sql";
const migrationPath = join(migrationsDir, migrationName);
const stubPath = join(repoRoot, "scripts/lib/playlist-catalog-foundation-sql-stub.sql");
const migration = readFileSync(migrationPath, "utf8");

const priorMigrations = readdirSync(migrationsDir)
  .filter((name) => name.toLowerCase().endsWith(".sql") && name < migrationName)
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

assert.match(priorMigrations, /CREATE TABLE IF NOT EXISTS public\.playlists/);
assert.match(priorMigrations, /CREATE TABLE IF NOT EXISTS public\.playlist_items/);
assert.doesNotMatch(
  priorMigrations,
  /CREATE TABLE[\s\S]*public\.playlist_saves/i,
  "preflight: no prior playlist_saves table",
);

assert.doesNotMatch(migration, /DROP TABLE public\.playlists/i);
assert.doesNotMatch(migration, /DROP TABLE public\.playlist_items/i);
assert.doesNotMatch(migration, /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?library_saves/i);

assert.match(migration, /ADD COLUMN IF NOT EXISTS items_count integer NOT NULL DEFAULT 0/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS saves_count integer NOT NULL DEFAULT 0/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS listed_at timestamptz/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.playlist_saves/);
assert.match(migration, /user_id uuid NOT NULL/);
assert.match(migration, /playlist_id uuid NOT NULL/);
assert.match(migration, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
assert.match(
  migration,
  /CONSTRAINT playlist_saves_user_playlist_unique\s+UNIQUE \(user_id, playlist_id\)/,
);
assert.match(migration, /REFERENCES auth\.users \(id\)/);
assert.match(migration, /REFERENCES public\.playlists \(id\)/);
assert.match(migration, /ALTER TABLE public\.playlist_saves ENABLE ROW LEVEL SECURITY/);
assert.match(
  migration,
  /GRANT SELECT, INSERT, DELETE ON TABLE public\.playlist_saves TO authenticated/,
);
assert.match(migration, /Users can view own playlist saves/);
assert.match(migration, /Users can insert own playlist saves/);
assert.match(migration, /Users can delete own playlist saves/);
assert.match(migration, /USING \(auth\.uid\(\) = user_id\)/);
assert.match(migration, /WITH CHECK \(auth\.uid\(\) = user_id\)/);
assert.doesNotMatch(migration, /FOR UPDATE/);
assert.doesNotMatch(migration, /access_source\s*=\s*'saved'/);
assert.match(migration, /refresh_playlist_listing_aggregates/);
assert.match(migration, /playlists_listed_at_idx/);
assert.match(migration, /clear_playlist_listed_at_when_unlisted/);

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
    throw new Error("playlist-catalog-foundation SQL stub is missing");
  }

  const dbName = "audiolad_playlist_catalog_foundation_test";
  const sql = [
    readFileSync(stubPath, "utf8"),
    migration,
    readFileSync(
      join(repoRoot, "supabase/tests/playlist_catalog_foundation_smoke.sql"),
      "utf8",
    ),
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
  console.log("playlist-catalog-foundation-sql-unit: parse + isolated sql ok");
} else {
  console.log("playlist-catalog-foundation-sql-unit: parse-only ok (no local postgres)");
}
