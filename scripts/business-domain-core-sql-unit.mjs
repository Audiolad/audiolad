#!/usr/bin/env node
/**
 * Contract + optional isolated scratch-DB smoke for Business Domain Core (A1).
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261201120000_business_domain_core.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/business-domain-core-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/business_domain_core_smoke.sql");
const dbName = "audiolad_business_domain_core_test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolveDockerDbContainer() {
  if (process.env.AUDIOLAD_SUPABASE_DB_CONTAINER?.trim()) {
    return process.env.AUDIOLAD_SUPABASE_DB_CONTAINER.trim();
  }
  const candidates = ["supabase-db", "audiolad-seo-attach-pg", "audiolad-test-db"];
  for (const name of candidates) {
    try {
      execFileSync(
        "docker",
        ["exec", name, "psql", "-U", "postgres", "-c", "SELECT 1"],
        { stdio: "ignore" },
      );
      return name;
    } catch {
      // try next
    }
  }
  return null;
}

assert(existsSync(migrationPath), `missing migration ${migrationName}`);
assert(existsSync(stubPath), "missing stub");
assert(existsSync(smokePath), "missing smoke");

const migration = readFileSync(migrationPath, "utf8");

assert(migration.includes("CREATE TABLE IF NOT EXISTS public.business_organizations"), "orgs table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.business_organization_members"), "members table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.business_locations"), "locations table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.business_zones"), "zones table");

assert(migration.includes("CONSTRAINT business_organizations_status_check"), "org status check");
assert(migration.includes("role IN ('owner', 'manager')"), "A1 roles only");
assert(!/role IN \('owner', 'manager', 'employee'\)/.test(migration), "no employee role in A1");
assert(!/owner_user_id/.test(migration), "no owner_user_id column");

assert(migration.includes("business_locations_country_code_check"), "country check");
assert(migration.includes("country_code ~ '^[A-Z]{2}$'"), "ISO-style country");
assert(migration.includes("pg_timezone_names"), "timezone catalog check");
assert(!/CREATE.*FUNCTION.*IMMUTABLE[\s\S]*pg_timezone_names/i.test(migration), "no IMMUTABLE timezone helper");

assert(migration.includes("business_zones_one_default_per_location_uidx"), "one default zone");
assert(migration.includes("WHERE is_default = true"), "partial unique default");
assert(migration.includes("ON DELETE RESTRICT"), "restrict deletes");

assert(migration.includes("is_business_organization_member"), "member helper");
assert(migration.includes("is_business_organization_owner"), "owner helper");
assert(migration.includes("STABLE"), "helpers STABLE");
assert(migration.includes("SECURITY DEFINER"), "security definer");
assert(migration.includes("SET search_path = public, pg_temp"), "search_path lock");

assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
assert(migration.includes("GRANT SELECT ON TABLE public.business_organizations TO authenticated"), "auth SELECT orgs");
assert(migration.includes("REVOKE ALL ON TABLE public.business_organizations FROM PUBLIC, anon, authenticated"), "revoke orgs");
assert(!/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON TABLE public\.business_organizations TO authenticated/i.test(migration), "no auth write orgs");

assert(
  migration.includes("create_business_organization_with_location"),
  "bootstrap RPC",
);
assert(migration.includes("not_authenticated"), "auth gate");
assert(!/p_owner_user_id/.test(migration), "no client-controlled owner id");
assert(migration.includes("auth.uid()"), "owner from auth.uid");
assert(migration.includes("'owner'"), "inserts owner membership");
assert(migration.includes("is_default"), "default zone field");
assert(
  migration.includes("name, is_default, status") || migration.includes("NULL, true, 'active'"),
  "default zone insert",
);

assert(!/CREATE TABLE[\s\S]*playback_usage_facts|ALTER TABLE[\s\S]*playback_usage_facts/i.test(migration), "must not alter playback_usage_facts");
assert(!/business_players/i.test(migration), "no players table");
assert(!/CREATE TABLE[\s\S]*sonic|music_passport|rights_passport/i.test(migration), "no sonic/rights tables");
assert(!/profiles\.role\s*=/.test(migration), "no profiles.role mutation");
assert(!/BUSINESS_HOME_MOCK/.test(migration), "no UI mock wiring");
assert(!/src\/(app|components|lib)\/business-app/.test(migration), "no business-app path edits in SQL");

assert(migration.includes("Post-check failed"), "structural post-checks");

const smoke = readFileSync(smokePath, "utf8");
assert(smoke.includes("not_authenticated"), "smoke case1");
assert(smoke.includes("create_business_organization_with_location"), "smoke bootstrap");
assert(smoke.includes("is_default = true"), "smoke default zone");
assert(smoke.includes("invalid_country_code"), "smoke country");
assert(smoke.includes("invalid_timezone"), "smoke timezone");
assert(smoke.includes("outsider"), "smoke outsider");
assert(smoke.includes("direct org INSERT"), "smoke no direct mutation");
assert(smoke.includes("duplicate membership"), "smoke unique membership");
assert(smoke.includes("orphan location"), "smoke FK");
assert(smoke.includes("Multi-org") || smoke.includes("Second Org"), "smoke multi-org");

const stub = readFileSync(stubPath, "utf8");
assert(stub.includes("CREATE OR REPLACE FUNCTION auth.uid()"), "stub auth.uid");
assert(stub.includes("CREATE ROLE authenticated"), "stub roles");

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
    return "skipped";
  }
  const sql = [stub, migration, smoke].join("\n");
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;
  if (!container) {
    console.log("business-domain-core-sql-unit: contract ok; isolated SQL skipped (no docker db)");
    return "no-db";
  }

  execFileSync(
    "docker",
    [
      "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1",
      "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "docker",
    [
      "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1",
      "-c", `CREATE DATABASE ${dbName};`,
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "docker",
    [
      "exec", "-i", container, "psql", "-U", "postgres", "-d", dbName,
      "-v", "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "inherit"] },
  );
  return `docker:${container}`;
}

const mode = runIsolatedSql();
console.log(`business-domain-core-sql-unit: ok (${mode})`);
