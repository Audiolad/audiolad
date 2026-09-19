#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migName = "20261009120500_studio_require_commercial_author.sql";
const migPath = join(migrationsDir, migName);
const smokePath = join(
  repoRoot,
  "supabase/tests/studio_require_commercial_author_smoke.sql",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(migPath), "migration exists");
assert(existsSync(smokePath), "smoke exists");
const mig = readFileSync(migPath, "utf8");
assert(mig.includes("can_acquire_studio_music"), "replaces acquire gate");
assert(mig.includes("commercial_active"), "commercial_active check");
assert(mig.includes("'commercial'"), "legacy commercial check");
assert(!/UPDATE\s+public\.practices/i.test(mig), "no practices update");
assert(!/studio_music_entitlements/i.test(mig), "no entitlements mutate");
assert(
  !/UPDATE\s+public\.authors/i.test(mig),
  "no authors update",
);

const versions = readdirSync(migrationsDir)
  .filter((n) => n.endsWith(".sql"))
  .map((n) => n.match(/^(\d{8,})_/)?.[1])
  .filter(Boolean);
assert(versions.includes("20261009120500"), "stamp listed");
assert(versions.includes("20261009120400"), "previous stamp remains");

const isolated = process.env.AUDIOLAD_STUDIO_MUSIC_ISOLATED === "1";
if (!isolated) {
  console.log(
    "studio-require-commercial-author-sql-unit: parse-ok (isolated skipped)",
  );
  process.exit(0);
}

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const dbName = "audiolad_studio_commercial_author_test";

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
CREATE TABLE public.authors (
  id uuid PRIMARY KEY,
  access_status text NOT NULL
);

CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors(id),
  status text,
  deleted_at timestamptz,
  product_kind text,
  publication_class text,
  music_usage_permission text,
  is_free boolean,
  price numeric,
  studio_music_pricing_mode text,
  studio_music_price_minor integer,
  catalog_visibility text,
  is_catalog_listed boolean
);

CREATE OR REPLACE FUNCTION public.is_studio_music_publication(p_practice public.practices)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_practice.product_kind = 'music'
      OR p_practice.publication_class = 'release';
$$;

CREATE OR REPLACE FUNCTION public.viewer_can_commercially_access_practice(
  p_practice public.practices,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT true;
$$;

-- Entitlement use path: always true for smoke user (existing grant preserved).
CREATE OR REPLACE FUNCTION public.can_use_music_in_studio(
  p_practice_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT true;
$$;
`,
  dbName,
);

psqlFile(migPath, dbName);
psqlFile(smokePath, dbName);
console.log("studio-require-commercial-author-sql-unit: isolated-ok");
