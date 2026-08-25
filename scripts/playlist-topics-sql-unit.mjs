#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for playlist_topics.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migrationName = "20260825141000_playlist_topics.sql";
const migrationPath = join(migrationsDir, migrationName);
const stubPath = join(repoRoot, "scripts/lib/playlist-topics-sql-stub.sql");
const migration = readFileSync(migrationPath, "utf8");

const priorMigrations = readdirSync(migrationsDir)
  .filter((name) => name.toLowerCase().endsWith(".sql") && name < migrationName)
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

assert.match(priorMigrations, /CREATE TABLE IF NOT EXISTS public\.playlists/);
assert.match(priorMigrations, /CREATE TABLE IF NOT EXISTS public\.topics/);
assert.doesNotMatch(
  priorMigrations,
  /CREATE TABLE[\s\S]*public\.playlist_topics/i,
  "preflight: no prior playlist_topics table",
);

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.playlist_topics/);
assert.match(migration, /PRIMARY KEY \(playlist_id, topic_id\)/);
assert.match(migration, /playlist_topics_topic_id_idx/);
assert.match(migration, /set_playlist_topics/);
assert.match(migration, /topic_limit_exceeded/);
assert.match(migration, /duplicate_topic_keys/);
assert.match(migration, /topic_not_found/);
assert.doesNotMatch(migration, /DROP TABLE public\.playlists/i);
assert.doesNotMatch(migration, /DROP TABLE public\.topics/i);
assert.doesNotMatch(migration, /ALTER TABLE public\.practice_topics/);
assert.doesNotMatch(migration, /ADD COLUMN.*direction_id|playlists\.direction_id/);

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
    throw new Error("playlist-topics SQL stub is missing");
  }

  const dbName = "audiolad_playlist_topics_test";
  const sql = [
    readFileSync(stubPath, "utf8"),
    migration,
    readFileSync(join(repoRoot, "supabase/tests/playlist_topics_smoke.sql"), "utf8"),
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
  console.log("playlist-topics-sql-unit: parse + isolated sql ok");
} else {
  console.log("playlist-topics-sql-unit: parse-only ok (no local postgres)");
}
