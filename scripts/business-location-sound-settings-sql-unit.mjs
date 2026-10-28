#!/usr/bin/env node
/**
 * Contract + optional isolated scratch-DB smoke for location sound settings.
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20270205120000_business_location_sound_settings.sql";
const a1Name = "20261201120000_business_domain_core.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const a1Path = join(repoRoot, "supabase/migrations", a1Name);
const stubPath = join(repoRoot, "scripts/lib/business-domain-core-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/business_location_sound_settings_smoke.sql");
const dbName = "audiolad_location_sound_settings_test";

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
  if (process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER?.trim()) {
    return process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER.trim();
  }
  const candidates = [
    "audiolad-onboarding-test-ci",
    "supabase-db",
    "audiolad-seo-attach-pg",
    "audiolad-test-db",
  ];
  for (const name of candidates) {
    try {
      execFileSync("docker", ["exec", name, "psql", "-U", "postgres", "-c", "SELECT 1"], { stdio: "ignore" });
      return name;
    } catch {
      // try next
    }
  }
  return null;
}

assert(existsSync(migrationPath), `missing migration ${migrationName}`);
assert(existsSync(a1Path), "missing domain core migration");
assert(existsSync(stubPath), "missing stub");
assert(existsSync(smokePath), "missing smoke");

const migration = readFileSync(migrationPath, "utf8");
const smoke = readFileSync(smokePath, "utf8");

assert(migration.includes("CREATE TABLE public.business_location_sound_settings"), "table");
assert(migration.includes("point_can_edit_settings boolean NOT NULL DEFAULT true"), "flag default");
assert(migration.includes("settings_version bigint NOT NULL DEFAULT 1"), "version");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "rls");
assert(migration.includes("Business members can read location sound settings"), "select policy");
assert(migration.includes("GRANT SELECT ON TABLE public.business_location_sound_settings TO authenticated"), "select grant");
assert(!/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON TABLE public\.business_location_sound_settings TO authenticated/i.test(migration), "no auth write");
assert(migration.includes("point_settings_locked"), "point lock");
assert(migration.includes("point_cannot_change_flag"), "point cannot change flag");
assert(migration.includes("point_session_not_available"), "point save closed");
assert(migration.includes("save_business_location_sound_settings"), "owner save");
assert(migration.includes("rename_business_location"), "rename");
assert(migration.includes("is_business_organization_owner"), "owner gate");
assert(migration.includes("not_organization_owner"), "owner error");
assert(!/ALTER TABLE public\.business_locations/i.test(migration), "no location table change");
assert(!/ALTER TABLE public\.business_organizations/i.test(migration), "no org table change");
assert(!/DROP TABLE/i.test(migration.split("COMMIT;")[0]), "no drop before commit");
assert(migration.includes("REVOKE ALL ON FUNCTION public.save_business_point_sound_settings"), "point revoke");
assert(!/GRANT EXECUTE ON FUNCTION public\.save_business_point_sound_settings/i.test(migration), "point not granted");
assert(smoke.includes("point_settings_locked"), "smoke lock");
assert(smoke.includes("LastWrite"), "smoke version");
assert(smoke.includes("Кофейня Уют"), "smoke venue name");
assert(smoke.includes("OutsiderRead"), "smoke rls");

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") return "skipped";
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;
  if (!container) {
    console.log("business-location-sound-settings-sql-unit: contract ok; isolated SQL skipped (no docker db)");
    return "no-db";
  }
  const sql = [
    readFileSync(stubPath, "utf8"),
    readFileSync(a1Path, "utf8"),
    migration,
    smoke,
  ].join("\n");
  execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`], { stdio: "ignore" });
  execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`], { stdio: "ignore" });
  execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", dbName, "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "pipe", "inherit"] });
  return `docker:${container}`;
}

const mode = runIsolatedSql();
console.log(`business-location-sound-settings-sql-unit: ok (${mode})`);
