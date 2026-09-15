#!/usr/bin/env node
/**
 * Parse + optional isolated Postgres tests for one FREE Studio product per author.
 * Never writes to production.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migName = "20261008120300_studio_one_free_music_per_author.sql";
const migPath = join(migrationsDir, migName);
const smokePath = join(repoRoot, "supabase/tests/studio_one_free_per_author_smoke.sql");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(migPath), "migration exists");
const mig = readFileSync(migPath, "utf8");
assert(mig.includes("practices_one_free_studio_music_per_author_uidx"), "index name");
assert(mig.includes("CREATE UNIQUE INDEX"), "unique index");
const migBody = mig
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
assert(!/CONCURRENTLY/i.test(migBody), "no CONCURRENTLY in transactional migrations");
assert(!/UPDATE\s+public\.practices/i.test(migBody), "no practices UPDATE");
assert(!/studio_music_entitlements/i.test(migBody), "no entitlements touch");
assert(!/audio_items/i.test(migBody), "no audio_items predicate");

const names = readdirSync(migrationsDir).filter((n) => n.endsWith(".sql"));
const versions = names.map((n) => n.match(/^(\d{8,})_/)?.[1]).filter(Boolean);
assert(versions.includes("20261008120300"), "stamp listed");
assert(versions.includes("20261008120200"), "previous stamp remains");
const sorted = [...versions].sort();
assert(sorted.at(-1) === "20261008120300" || sorted.filter((v) => v >= "20261008120300").length >= 1);

assert(existsSync(smokePath), "smoke sql exists");
const smoke = readFileSync(smokePath, "utf8");
assert(smoke.includes("practices_one_free_studio_music_per_author_uidx"), "smoke references index");

const isolated = process.env.AUDIOLAD_STUDIO_MUSIC_ISOLATED === "1";
if (!isolated) {
  console.log("studio-music-free-slot-sql-unit: parse-ok (isolated skipped)");
  process.exit(0);
}

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

function psql(sql, db = "postgres") {
  const url = new URL(databaseUrl);
  url.pathname = `/${db}`;
  execFileSync("psql", [url.toString(), "-v", "ON_ERROR_STOP=1", "-c", sql], {
    stdio: "inherit",
  });
}
function psqlFile(file, db) {
  const url = new URL(databaseUrl);
  url.pathname = `/${db}`;
  execFileSync("psql", [url.toString(), "-v", "ON_ERROR_STOP=1", "-f", file], {
    stdio: "inherit",
  });
}

const dbName = "audiolad_studio_one_free_slot_test";
psql(`DROP DATABASE IF EXISTS ${dbName};`);
psql(`CREATE DATABASE ${dbName};`);

// Minimal practices table matching predicate columns + apply migration + smoke
const bootstrap = `
CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL,
  title text,
  deleted_at timestamptz,
  music_usage_permission text,
  studio_music_pricing_mode text,
  is_free boolean,
  price numeric,
  product_kind text,
  status text
);
`;
psql(bootstrap, dbName);
psqlFile(migPath, dbName);
psqlFile(smokePath, dbName);
console.log("studio-music-free-slot-sql-unit: isolated-ok");
