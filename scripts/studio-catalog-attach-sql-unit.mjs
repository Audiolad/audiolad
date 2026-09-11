#!/usr/bin/env node
/**
 * Parse + executable isolated Postgres tests for catalog attach.
 * Scratch / local isolated database only. Never writes to production postgres.
 *
 * CI isolated path: AUDIOLAD_STUDIO_CATALOG_ATTACH_ISOLATED=1 + local DATABASE_URL
 * (GitHub Actions postgres:16 service). That path must CALL
 * attach_studio_catalog_project_asset against a table whose id has no default.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const pr4Name = "20261004120000_studio_catalog_project_assets.sql";
const hotfixName = "20261004120100_studio_catalog_attach_asset_id.sql";
const previousLatest = "20261003120700_studio_music_independent_pricing.sql";
const entitlementsName = "20261003120000_studio_music_entitlements.sql";
const licenseStubPath = join(repoRoot, "scripts/lib/studio-music-license-sql-stub.sql");
const studioStubPath = join(repoRoot, "scripts/lib/studio-catalog-attach-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/studio_catalog_attach_smoke.sql");
const dbName = "audiolad_studio_catalog_attach_test";
const isolatedDbName = "audiolad_studio_catalog_attach_isolated";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(existsSync(join(migrationsDir, previousLatest)), "previous latest migration stays intact");
assert(existsSync(join(migrationsDir, pr4Name)), "PR4 catalog attach migration stays intact");
assert(existsSync(join(migrationsDir, hotfixName)), "PR4.1 catalog attach id hotfix exists");
assert(existsSync(join(migrationsDir, entitlementsName)), "entitlements migration exists");
assert(existsSync(licenseStubPath), "license stub exists");
assert(existsSync(studioStubPath), "catalog attach studio stub exists");
assert(existsSync(smokePath), "catalog attach smoke SQL exists");

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20261004120000"), "20261004120000 is listed");
assert(versions.includes("20261004120100"), "20261004120100 is listed");

const pr4 = readFileSync(join(migrationsDir, pr4Name), "utf8");
const hotfix = readFileSync(join(migrationsDir, hotfixName), "utf8");
const stub = readFileSync(studioStubPath, "utf8");
const smoke = readFileSync(smokePath, "utf8");

assert(/ADD COLUMN IF NOT EXISTS catalog_practice_id/.test(pr4));
assert(/CREATE OR REPLACE FUNCTION public\.attach_studio_catalog_project_asset/.test(pr4));
const pr4AttachInsert = pr4.match(
  /CREATE OR REPLACE FUNCTION public\.attach_studio_catalog_project_asset[\s\S]*?INSERT INTO public\.studio_project_assets \(([\s\S]*?)\) VALUES/,
)?.[1];
assert(pr4AttachInsert, "PR4 attach INSERT column list is present");
assert(/project_id/.test(pr4AttachInsert));
assert(!/^\s*id\s*,/m.test(pr4AttachInsert), "PR4 attach INSERT still omits id (left unchanged)");
assert(!/ALTER COLUMN id SET DEFAULT/.test(pr4));
assert(/can_use_music_in_studio/.test(pr4));
assert(/WHEN unique_violation/.test(pr4));
assert(!/FROM public\.user_practices/.test(pr4));
assert(!/JOIN public\.user_practices/.test(pr4));

assert(/CREATE OR REPLACE FUNCTION public\.attach_studio_catalog_project_asset/.test(hotfix));
assert(/p_project_id uuid,\s*p_user_id uuid,\s*p_practice_id uuid,\s*p_audio_item_id uuid,\s*p_original_name text,\s*p_mime_type text,\s*p_duration_seconds numeric/.test(hotfix));
assert(/INSERT INTO public\.studio_project_assets \(\s*id,/.test(hotfix));
assert(/gen_random_uuid\(\)/.test(hotfix));
assert(/can_use_music_in_studio/.test(hotfix));
assert(/WHEN unique_violation/.test(hotfix));
assert(/source_type,\s+'catalog'/.test(hotfix) || /'catalog'/.test(hotfix));
assert(/0,\s+p_duration_seconds/.test(hotfix) || /size_bytes,\s+0/.test(hotfix));
assert(/upload_state/.test(hotfix));
assert(/'ready'/.test(hotfix));
assert(/GRANT EXECUTE ON FUNCTION public\.attach_studio_catalog_project_asset/.test(hotfix));
assert(/TO service_role/.test(hotfix));
assert(/REVOKE ALL ON FUNCTION public\.attach_studio_catalog_project_asset/.test(hotfix));
assert(/FROM anon, authenticated/.test(hotfix));
assert(!/ALTER TABLE public\.studio_project_assets/.test(hotfix));
assert(!/ALTER COLUMN id SET DEFAULT/.test(hotfix));
assert(!/id uuid PRIMARY KEY DEFAULT/.test(hotfix));
assert(!/FROM public\.user_practices/.test(hotfix));
assert(!/JOIN public\.user_practices/.test(hotfix));
assert(!/INSERT INTO storage\.objects/.test(hotfix));
assert(!/DROP TABLE/.test(hotfix));
assert(!/TRUNCATE/.test(hotfix));
assert(!/schemaVersion/.test(hotfix));
assert(/Forward-only/.test(hotfix) || /forward-only/.test(hotfix));
assert(/no column default/.test(hotfix));

assert(/CREATE TABLE IF NOT EXISTS public\.studio_project_assets \(\s*id uuid PRIMARY KEY,/.test(stub));
assert(!/studio_project_assets[\s\S]{0,80}id uuid PRIMARY KEY DEFAULT/.test(stub));
assert(/NO DEFAULT/.test(stub));

assert(/attach_studio_catalog_project_asset/.test(smoke));
assert(/column_default/.test(smoke));
assert(/returned asset\.id must not be null/.test(smoke));
assert(/second attach must reuse/.test(smoke));
assert(/catalog_music_forbidden/.test(smoke));
assert(/user_practices-only/.test(smoke));
assert(/no entitlement/.test(smoke));
assert(/schemaVersion must stay 2/.test(smoke));
assert(/must not copy into storage\.objects/.test(smoke));

function dockerAvailable() {
  const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    execFileSync(
      "docker",
      ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-c", "SELECT 1"],
      { stdio: "ignore" },
    );
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

function allowedIsolatedTarget(url) {
  if (!url) return { ok: false, reason: "database URL is required" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "database URL is invalid" };
  }
  const database = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, "");
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, reason: "database URL must use the PostgreSQL protocol" };
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    return { ok: false, reason: `refusing non-local database host: ${parsed.hostname || "(none)"}` };
  }
  if (database !== isolatedDbName && database !== dbName) {
    return { ok: false, reason: `refusing non-isolated database: ${database || "(none)"}` };
  }
  return { ok: true, database, url };
}

function bootstrapSql() {
  return [
    readFileSync(licenseStubPath, "utf8"),
    readFileSync(join(migrationsDir, entitlementsName), "utf8"),
    readFileSync(studioStubPath, "utf8"),
    readFileSync(join(migrationsDir, pr4Name), "utf8"),
    readFileSync(join(migrationsDir, hotfixName), "utf8"),
    readFileSync(smokePath, "utf8"),
  ].join("\n");
}

function runPsql(database, input) {
  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  }

  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

function adminSql(sqlText) {
  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
    return execFileSync(
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
        sqlText,
      ],
      { encoding: "utf8" },
    );
  }

  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", sqlText],
    { encoding: "utf8" },
  );
}

function runIsolatedViaUrl(databaseUrl) {
  execFileSync(
    "psql",
    [
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--set",
      "VERBOSITY=verbose",
      "--dbname",
      databaseUrl,
    ],
    {
      input: bootstrapSql(),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: "5",
        PGPASSWORD: process.env.PGPASSWORD ?? "",
      },
    },
  );
}

function runIsolatedSql() {
  adminSql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
  adminSql(`CREATE DATABASE ${dbName};`);
  runPsql(dbName, bootstrapSql());
}

const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";
const isolatedMode = process.env.AUDIOLAD_STUDIO_CATALOG_ATTACH_ISOLATED === "1";

if (isolatedMode) {
  if (skipIsolatedSql) {
    throw new Error(
      "studio-catalog-attach-sql-unit: isolated mode cannot skip executable SQL",
    );
  }
  const target = allowedIsolatedTarget(
    process.env.AUDIOLAD_STUDIO_CATALOG_ATTACH_DATABASE_URL,
  );
  if (!target.ok) {
    throw new Error(`studio-catalog-attach-sql-unit: ${target.reason}`);
  }
  runIsolatedViaUrl(target.url);
  console.log(
    `studio-catalog-attach-sql-unit: parse + executable SQL ok (${target.database})`,
  );
} else if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  runIsolatedSql();
  console.log("studio-catalog-attach-sql-unit: parse + isolated sql ok");
} else if (skipIsolatedSql) {
  console.log("studio-catalog-attach-sql-unit: parse-only ok (isolated SQL disabled)");
} else {
  console.log("studio-catalog-attach-sql-unit: parse-only ok (no local postgres)");
}
