#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migName = "20261009120300_studio_disable_new_free_music.sql";
const migPath = join(migrationsDir, migName);
const smokePath = join(repoRoot, "supabase/tests/studio_disable_new_free_music_smoke.sql");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(migPath), "migration exists");
assert(existsSync(smokePath), "smoke exists");
const mig = readFileSync(migPath, "utf8");
const body = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
assert(mig.includes("studio_new_free_disabled"), "marker");
assert(mig.includes("CREATE TRIGGER practices_no_new_studio_free_trg"), "trigger");
assert(!/UNIQUE/i.test(body), "no unique index");
assert(!/UPDATE\s+public\.practices/i.test(body), "no practices update");
assert(!/studio_music_entitlements/i.test(body), "no entitlements");
assert(!existsSync(join(migrationsDir, "20261008120300_studio_one_free_music_per_author.sql")), "old migration removed");

const versions = readdirSync(migrationsDir)
  .filter((n) => n.endsWith(".sql"))
  .map((n) => n.match(/^(\d{8,})_/)?.[1])
  .filter(Boolean);
assert(versions.includes("20261009120300"), "stamp listed");
assert(versions.includes("20261009120200"), "previous stamp remains");

const isolated = process.env.AUDIOLAD_STUDIO_MUSIC_ISOLATED === "1";
if (!isolated) {
  console.log("studio-music-new-free-policy-sql-unit: parse-ok (isolated skipped)");
  process.exit(0);
}

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const dbName = "audiolad_studio_new_free_policy_test";

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

psql(`DROP DATABASE IF EXISTS ${dbName};`);
psql(`CREATE DATABASE ${dbName};`);
psql(
  `
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
`,
  dbName,
);
psqlFile(migPath, dbName);
psqlFile(smokePath, dbName);
console.log("studio-music-new-free-policy-sql-unit: isolated-ok");
