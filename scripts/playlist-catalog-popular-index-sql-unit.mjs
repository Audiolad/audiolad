#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migrationName = "20260825165000_playlist_catalog_popular_index.sql";
const migration = readFileSync(join(migrationsDir, migrationName), "utf8");

const priorMigrations = readdirSync(migrationsDir)
  .filter((name) => name.toLowerCase().endsWith(".sql") && name < migrationName)
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

assert.match(priorMigrations, /ADD COLUMN IF NOT EXISTS saves_count/);
assert.match(priorMigrations, /playlists_listed_at_idx/);
assert.doesNotMatch(priorMigrations, /playlists_saves_count_listed_at_idx/);

assert.match(migration, /CREATE INDEX IF NOT EXISTS playlists_saves_count_listed_at_idx/);
assert.match(
  migration,
  /ON public\.playlists \(saves_count DESC, listed_at DESC, id DESC\)/,
);
assert.match(migration, /WHERE listed_at IS NOT NULL/);
assert.doesNotMatch(migration, /touch_playlist_saves_count/);
assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION/);
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /materialized view|to_tsvector|gin_trgm|pg_trgm/i);

console.log("playlist-catalog-popular-index-sql-unit: parse-only ok");
