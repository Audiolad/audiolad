#!/usr/bin/env node
/**
 * Contract + optional isolated scratch-DB smoke for Rights Eligibility (A5).
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261206120000_business_rights_eligibility.sql";
const a4Migration = "20261205120000_music_rights_foundation.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const a4Path = join(repoRoot, "supabase/migrations", a4Migration);
const stubPath = join(repoRoot, "scripts/lib/business-rights-eligibility-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/business_rights_eligibility_smoke.sql");
const dbName = "audiolad_business_rights_eligibility_test";

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
assert(existsSync(a4Path), "missing A4 migration");
assert(existsSync(stubPath), "missing stub");
assert(existsSync(smokePath), "missing smoke");

const migration = readFileSync(migrationPath, "utf8");
const smoke = readFileSync(smokePath, "utf8");
const stub = readFileSync(stubPath, "utf8");
const a4 = readFileSync(a4Path, "utf8");

assert(migration.includes("ceased_at"), "ceased_at hardening");
assert(migration.includes("ceased_at_immutable"), "ceased_at immutable");
assert(migration.includes("ceased_at_forbidden"), "client cannot set ceased_at on insert");
assert(migration.includes("music_country_rights_profiles"), "country profiles");
assert(migration.includes("music_country_rights_profile_rules"), "profile rules");
assert(migration.includes("business_location_rights_contexts"), "location contexts");
assert(migration.includes("business_location_rights_context_use_statuses"), "use statuses");
assert(migration.includes("resolve_business_track_eligibility"), "eligibility RPC");
assert(migration.includes("rights_eligibility_v1"), "engine version");
assert(migration.includes("'ELIGIBLE'"), "ELIGIBLE");
assert(migration.includes("'INELIGIBLE'"), "INELIGIBLE");
assert(migration.includes("'CONDITIONAL'"), "CONDITIONAL");
assert(migration.includes("'UNKNOWN'"), "UNKNOWN");
assert(migration.includes("COUNTRY_RIGHTS_PROFILE_MISSING"), "profile missing reason");
assert(migration.includes("LOCATION_RIGHTS_CONTEXT_MISSING"), "context missing reason");
assert(migration.includes("COUNTRY_USE_UNSUPPORTED"), "unsupported reason");
assert(migration.includes("RECORDING_RIGHTS_NOT_VERIFIED"), "recording unknown");
assert(migration.includes("COMPOSITION_RIGHTS_NOT_VERIFIED"), "composition unknown");
assert(migration.includes("CLIENT_REQUIREMENT_NOT_CONFIRMED"), "conditional reason");
assert(migration.includes("business_background_playback"), "reuse A4 use_type");
assert(migration.includes("advertising_synchronization"), "full use_type vocab");
assert(migration.includes("music_rights_use_type_is_valid"), "shared use_type helper");
assert(!/IF\s+.*country_code\s*=\s*'RU'/i.test(migration), "no country-if RU");
assert(!/IF\s+.*country_code\s*=\s*'US'/i.test(migration), "no country-if US");
assert(!/\blicensed\s+boolean\b/i.test(migration.replace(/No licensed boolean/gi, "")), "no licensed boolean");
assert(!/\bis_licensed\b/i.test(migration), "no is_licensed");
assert(!/\bbusiness_licensed\b/i.test(migration), "no business_licensed");
assert(!/INSERT INTO public\.music_country_rights_profiles/i.test(migration), "no production profile seed");
assert(!/INSERT INTO public\.music_country_rights_profile_rules/i.test(migration), "no production rule seed");
assert(!/ALTER TABLE public\.playback_usage_facts/i.test(migration), "no A3 ledger alter");
assert(!/royalty_eligible_ms/i.test(migration), "no royalty");
assert(!/sonic_dna|music_passport_analysis/i.test(migration), "no analyzer");
assert(!/SET\s+music_usage_permission|music_usage_permission\s*=/i.test(migration), "no Studio auto-map");
assert(!/rights_eligibility_decisions/i.test(migration), "no persistent decision ledger");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS");
assert(migration.includes("REVOKE ALL ON TABLE public.music_country_rights_profiles FROM PUBLIC, anon, authenticated"), "revoke profiles");
assert(migration.includes("GRANT EXECUTE ON FUNCTION public.resolve_business_track_eligibility"), "rpc grant");
assert(/REVOKE ALL ON FUNCTION public\.resolve_business_track_eligibility\([^)]+\) FROM anon/i.test(migration), "rpc not anon");
assert(migration.includes("music_country_rights_profiles_one_active_uidx"), "one active profile");
assert(migration.includes("business_location_rights_contexts_one_active_uidx"), "one active context");
assert(migration.includes("country_profile_reviewed_at_required"), "reviewed_at gate");
assert(migration.includes("country_profile_rules_immutable"), "rules immutability");
assert(migration.includes("zone_location_mismatch"), "zone mismatch");
assert(a4.includes("music_rights_grants"), "A4 still present");
assert(!a4.includes("ceased_at"), "A4 migration file unchanged (ceased_at only in A5)");
assert(smoke.includes("Case1"), "smoke Case1");
assert(smoke.includes("Case12"), "smoke Case12");
assert(smoke.includes("Case25"), "smoke Case25");
assert(smoke.includes("Case35"), "smoke Case35");
assert(smoke.includes("Case43"), "smoke Case43");
assert(smoke.includes("Case49"), "smoke Case49");
assert(smoke.includes("Case51"), "smoke Case51");
assert(smoke.includes("Case56"), "smoke Case56");
assert(smoke.includes("Case57"), "smoke Case57");

assert(migration.includes("clock_timestamp()"), "server clock_timestamp for transitions");
assert(migration.includes("CLIENT_REQUIREMENT_STATUS_CONFLICT"), "required+not_required conflict");
assert(migration.includes("country_profile_reviewed_at_future"), "future reviewed_at rejected");
assert(migration.includes("country_profile_root_version_required"), "root version=1");
assert(migration.includes("country_profile_predecessor_not_historical"), "draft pred cannot activate successor");
assert(migration.includes("location_context_predecessor_not_historical"), "context pred historical");
assert(!/coalesce\(NEW\.ceased_at/i.test(migration), "no coalesce ceased_at");
assert(!/coalesce\(NEW\.activated_at/i.test(migration), "no coalesce activated_at");
assert(smoke.includes("CaseA"), "smoke CaseA");
assert(smoke.includes("CaseK"), "smoke CaseK");
assert(smoke.includes("CaseH"), "smoke CaseH");
assert(smoke.includes("CaseI"), "smoke CaseI");
assert(smoke.includes("CaseM"), "smoke CaseM");
assert(smoke.includes("CaseP"), "smoke CaseP");
assert(smoke.includes("CLIENT_REQUIREMENT_STATUS_CONFLICT"), "smoke conflict reason");

assert(smoke.includes("'AA'"), "synthetic AA");
assert(smoke.includes("'BB'"), "synthetic BB");
assert(!/\b'RU'\b/.test(smoke), "smoke no RU seed");
assert(!/\b'US'\b/.test(smoke), "smoke no US seed");
assert(stub.includes("business_locations"), "stub locations");
assert(stub.includes("music_usage_permission"), "stub Studio sentinel");

{
  const docs = [
    readFileSync(join(repoRoot, "docs/DATABASE.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/ARCHITECTURE.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/DECISIONS.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/PROJECT_STATE.md"), "utf8"),
  ].join("\n");
  assert(/Country Rights Profile/i.test(docs), "docs: Country Rights Profile");
  assert(/Location Rights Context/i.test(docs), "docs: Location Rights Context");
  assert(/rights_eligibility_v1/i.test(docs), "docs: engine version");
  assert(/UNKNOWN never/i.test(docs) || /UNKNOWN[^\n]*never[^\n]*ELIGIBLE/i.test(docs), "docs: UNKNOWN fail-closed");
  assert(/ceased_at/i.test(docs), "docs: ceased_at");
  assert(!/IF country_code = 'RU'/i.test(docs), "docs: no country-if");
}

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
    return "skipped";
  }
  const sql = [
    stub,
    readFileSync(a4Path, "utf8"),
    migration,
    smoke,
  ].join("\n");
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;
  if (!container) {
    console.log("business-rights-eligibility-sql-unit: contract ok; isolated SQL skipped (no docker db)");
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
console.log(`business-rights-eligibility-sql-unit: ok (${mode})`);
