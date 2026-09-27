#!/usr/bin/env node
/**
 * Contract + optional isolated scratch-DB smoke for Business Player Foundation (A2).
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261202120000_business_player_foundation.sql";
const a1Migration = "20261201120000_business_domain_core.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const a1Path = join(repoRoot, "supabase/migrations", a1Migration);
const stubPath = join(repoRoot, "scripts/lib/business-player-foundation-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/business_player_foundation_smoke.sql");
const dbName = "audiolad_business_player_foundation_test";

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
assert(existsSync(a1Path), "missing A1 migration dependency");
assert(existsSync(stubPath), "missing stub");
assert(existsSync(smokePath), "missing smoke");

const migration = readFileSync(migrationPath, "utf8");
const smoke = readFileSync(smokePath, "utf8");

assert(migration.includes("CREATE TABLE IF NOT EXISTS public.business_players"), "players table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.business_player_assignments"), "assignments");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.business_player_credentials"), "credentials");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.business_player_runtime"), "runtime");
assert(migration.includes("AL-P-"), "player code prefix");
assert(migration.includes("business_player_code_seq"), "player code sequence");
{
  const playersIdx = migration.indexOf("CREATE TABLE IF NOT EXISTS public.business_players");
  const playersEnd = migration.indexOf("\n);", playersIdx);
  const playersDdl = migration.slice(playersIdx, playersEnd + 3);
  assert(!/\bzone_id\b/.test(playersDdl), "no zone_id column on business_players");
  assert(migration.includes("not a zone_id column"), "docs: zone via assignment");
}
assert(migration.includes("WHERE unassigned_at IS NULL"), "one active assignment");
assert(!/UNIQUE \(zone_id\).*unassigned_at IS NULL/s.test(migration), "no unique active per zone");
assert(migration.includes("cross_organization_assignment"), "cross-org guard");
assert(migration.includes("credential_hash bytea"), "hash bytea");
assert(migration.includes("business_player_hash_credential"), "hash helper");
assert(migration.includes("sha256(convert_to(p_credential, 'UTF8'))"), "core sha256 hash");
{
  const codeOnly = migration.replace(/--[^\n]*/g, "");
  assert(!/CREATE\s+EXTENSION/i.test(migration), "A2 must not CREATE EXTENSION");
  assert(!/\bpgcrypto\b/i.test(codeOnly), "A2 must not depend on pgcrypto");
  assert(!/extensions\.digest/i.test(migration), "no extensions.digest");
  assert(!/\bdigest\s*\(/i.test(codeOnly), "no digest()");
  assert(!/\bgen_random_bytes\s*\(/i.test(codeOnly), "no gen_random_bytes()");
}
assert(migration.includes("replace(gen_random_uuid()::text, '-', '')"), "UUID-based credential entropy");
assert(migration.includes("^[0-9a-f]{64}$"), "strict 64-hex credential validate");
assert(migration.includes("FOR UPDATE"), "player row lock on assign");
assert(migration.includes("player_runtime_missing"), "heartbeat fail-closed without runtime");
assert(migration.includes("statement_timestamp()"), "STABLE health uses statement_timestamp");
assert(!/DEFAULT clock_timestamp\(\)/.test(migration), "no clock_timestamp default on health");
assert(migration.includes("create_business_player"), "create rpc");
assert(migration.includes("assign_business_player_to_zone"), "assign rpc");
assert(migration.includes("record_business_player_heartbeat"), "heartbeat rpc");
assert(migration.includes("get_business_player_health"), "health rpc");
assert(migration.includes("rotate_business_player_credential"), "rotate rpc");
assert(migration.includes("business_player_derived_health"), "derived health");
assert(migration.includes("<= 90"), "online threshold");
assert(migration.includes("<= 300"), "stale threshold");
assert(migration.includes("never_seen"), "never_seen");
assert(migration.includes("GRANT EXECUTE ON FUNCTION public.record_business_player_heartbeat(text, timestamptz, text)\n  TO anon")
  || /GRANT EXECUTE ON FUNCTION public\.record_business_player_heartbeat\([^)]+\)\s+TO anon/i.test(migration),
  "anon execute heartbeat");
assert(!/GRANT SELECT ON TABLE public\.business_player_credentials TO authenticated/i.test(migration), "no cred select");
assert(!/GRANT SELECT ON TABLE public\.business_player_runtime TO authenticated/i.test(migration), "no runtime select");
assert(!/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON TABLE public\.business_players TO authenticated/i.test(migration), "no auth write players");
assert(!/ALTER TABLE[\s\S]*playback_usage_facts|CREATE TABLE[\s\S]*playback_usage_facts/i.test(migration), "must not alter playback_usage_facts");
assert(!/business_players[\s\S]*sonic|music_passport|rights_passport/i.test(migration), "no music passport");
assert(!/BUSINESS_HOME_MOCK/.test(migration), "no UI mock wiring");
assert(migration.includes("Post-check failed"), "structural post-checks");
assert(migration.includes("authenticated must not SELECT credentials"), "post-check credentials");
assert(migration.includes("business_domain_set_updated_at"), "reuse A1 updated_at helper");

assert(smoke.includes("not_authenticated"), "smoke case1");
assert(smoke.includes("not_organization_owner"), "smoke case2");
assert(smoke.includes("AL-P-"), "smoke player code");
assert(smoke.includes("Case4"), "smoke credentials select denied");
assert(smoke.includes("cross_organization_assignment"), "smoke cross-org");
assert(smoke.includes("idempotent"), "smoke idempotent assign");
assert(smoke.includes("record_business_player_heartbeat"), "smoke heartbeat");
assert(smoke.includes("never_seen"), "smoke never_seen");
assert(smoke.includes("expected online"), "smoke online");
assert(smoke.includes("expected stale"), "smoke stale");
assert(smoke.includes("expected offline"), "smoke offline");
assert(smoke.includes("direct INSERT must fail"), "smoke no insert");
assert(smoke.includes("direct UPDATE must fail"), "smoke no update");
assert(smoke.includes("direct DELETE must fail"), "smoke no delete");
assert(smoke.includes("multi player per zone"), "smoke multi zone players");
assert(smoke.includes("rotate_business_player_credential"), "smoke rotation");
assert(smoke.includes("player_code must not authenticate"), "smoke code != credential");
assert(smoke.includes("short credential"), "smoke short credential reject");
assert(smoke.includes("overlong credential"), "smoke overlong credential reject");
assert(smoke.includes("non-hex credential"), "smoke non-hex credential reject");
assert(smoke.includes("player_runtime_missing"), "smoke runtime missing");
assert(!/CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(readFileSync(stubPath, "utf8")), "stub must not install pgcrypto");

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
    return "skipped";
  }
  const sql = [
    readFileSync(stubPath, "utf8"),
    readFileSync(a1Path, "utf8"),
    migration,
    smoke,
  ].join("\n");
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;
  if (!container) {
    console.log("business-player-foundation-sql-unit: contract ok; isolated SQL skipped (no docker db)");
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
console.log(`business-player-foundation-sql-unit: ok (${mode})`);
