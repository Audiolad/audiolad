#!/usr/bin/env node
/** Business SPA PR2 contract always; SQL only on an explicit isolated test container. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20261231130000_business_spa_program_composition.sql");
const smoke = read("supabase/tests/business_spa_composition_smoke.sql");
const sql = migration.replace(/--[^\n]*/g, "");

assert.match(sql, /^\s*BEGIN;[\s\S]*COMMIT;\s*$/);
assert.equal([...sql.matchAll(/CREATE TABLE /g)].length, 0, "no new tables");
assert.match(sql, /ADD COLUMN gain_db numeric\(5,2\) CHECK \(gain_db IS NULL OR gain_db BETWEEN -30 AND 6\)/);
for (const fn of sql.matchAll(/CREATE FUNCTION ([\s\S]*?)AS \$\$/g)) {
  assert.ok(fn[1].includes("SET search_path = public, pg_temp"), "fixed function search_path");
}
// Pilot access + tenant scope on every entry point.
assert.equal([...sql.matchAll(/NOT public\.has_business_pilot_access\(v_org\)/g)].length, 3, "setter, single exclusion, reader");
assert.match(sql, /business_spa_location_scope_mismatch/);
assert.match(sql, /l\.organization_id = v_org/);
// Rights: only the existing engine, fail-closed on anything but ELIGIBLE.
assert.ok(sql.includes("resolve_business_track_eligibility(i.audio_item_id, p_location_id, NULL, 'business_background_playback')"));
assert.ok(sql.includes("resolve_business_track_eligibility(i.audio_item_id, p_location_id, NULL, 'offline_storage_cache')"));
assert.match(sql, /coalesce\(it\.bbp->>'decision' = 'ELIGIBLE', false\)/);
// Offline needs ELIGIBLE playback AND an ELIGIBLE offline decision that cites at least one grant.
assert.match(sql, /coalesce\(it\.bbp->>'decision' = 'ELIGIBLE', false\) AND public\.business_spa_offline_grants_cited\(it\.off\)/);
assert.match(sql, /jsonb_array_length\([\s\S]*recording_grant_ids[\s\S]*composition_grant_ids[\s\S]*\) > 0/);
// Catalog visibility: setter, reader and direct-write trigger share one gate.
assert.match(sql, /public\.can_current_viewer_read_practice\(ai\.practice_id\)/);
assert.match(sql, /p\.product_kind = 'music'/);
assert.match(sql, /NOT public\.business_spa_track_visible\(x\)/);
assert.match(sql, /AND public\.business_spa_track_visible\(i\.audio_item_id\)/);
assert.match(sql, /BEFORE INSERT OR UPDATE OF audio_item_id, excluded_at ON public\.business_program_items/);
// Single removal locks the program and never re-activates others.
assert.match(sql, /business_spa_exclude_program_item[\s\S]*FOR UPDATE/);
assert.doesNotMatch(sql, /CREATE (?:OR REPLACE )?FUNCTION public\.resolve_business_track_eligibility/);
assert.doesNotMatch(sql, /INSERT INTO public\.(?:business_pilot_allowlist|playback_usage_facts|music_rights_grants|music_rightsholders)/i);
assert.doesNotMatch(sql, /ALTER TABLE public\.(?:playback_usage|audio_items|music_)/i);
assert.doesNotMatch(sql, /DELETE FROM/i, "composition excludes softly, never deletes");
assert.match(sql, /ai\.status = 'published'/);
assert.match(sql, /business_spa_program_archived/);
assert.doesNotMatch(sql, /TO anon\s*;/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.business_spa_set_program_items\(uuid, uuid\[\], text\) FROM PUBLIC, anon/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.business_spa_program_composition\(uuid, uuid\) FROM PUBLIC, anon/);
for (const scenario of ["NoAllowlist", "Compose", "Idempotent", "SoftExclude", "Reorder", "Readd", "Duplicates", "Unpublished", "FailClosed", "LocationScope", "CrossOrganization", "NoRightsWrites", "GainRange", "ArchivedProgram", "OfflineNeedsCitedGrant", "HiddenTrack", "NonMusic", "ExcludeOne"]) {
  assert.ok(smoke.includes(`${scenario}:`), `smoke ${scenario}`);
}
assert.match(smoke, /SET LOCAL ROLE authenticated/);
assert.match(smoke, /ROLLBACK;\s*$/);
const pilot = JSON.parse(read("docs/business/spa-pilot-aurafon-v1.json"));
assert.equal(pilot.tracks.length, 12, "12 verified Aurafon tracks");
assert.equal(new Set(pilot.tracks.map((t) => t.audio_item_id)).size, 12);
for (const code of ["AL-T-000000730", "AL-T-000000732", "AL-T-000000726", "AL-T-000000762"]) {
  assert.ok(!pilot.tracks.some((t) => t.track_code === code), `${code} excluded`);
}
for (const t of pilot.tracks) assert.ok(t.proposed_gain_db >= -30 && t.proposed_gain_db <= 6, `${t.track_code} gain`);
assert.match(pilot.rights_status, /not a license/i);
assert.ok(read("docs/DATABASE.md").includes("20261231130000_business_spa_program_composition.sql"));
assert.equal(JSON.parse(read("package.json")).scripts["test:business-spa-composition"], "node scripts/business-spa-composition-sql-unit.mjs");
assert.ok(read(".github/workflows/business-pr-validation.yml").includes("AUDIOLAD_SKIP_ISOLATED_SQL=1 npm run test:business-spa-composition"));
console.log("business-spa-composition-sql-unit: contract ok");

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") return "skipped";
  const container = process.env.AUDIOLAD_BUSINESS_SPA_TEST_CONTAINER?.trim();
  if (process.env.AUDIOLAD_BUSINESS_SPA_ISOLATED_SQL !== "1" || !container) return "no isolated DB opted in";
  assert.match(container, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*-test-db$/, "dedicated test container required");
  const dbName = "audiolad_business_spa_composition_test";
  const deps = [
    "scripts/lib/business-playback-attribution-sql-stub.sql",
    "supabase/migrations/20261127120000_playback_usage_facts.sql",
    "supabase/migrations/20261130120000_author_stats_listening_time.sql",
    "supabase/migrations/20261201120000_business_domain_core.sql",
    "supabase/migrations/20261202120000_business_player_foundation.sql",
    "supabase/migrations/20261203120000_business_playback_attribution.sql",
    "supabase/migrations/20261231120000_business_spa_programs_playback_log.sql",
  ].map(read);
  const args = ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];
  execFileSync("docker", [...args, "-d", "postgres", "-c", `CREATE DATABASE ${dbName};`], { stdio: "pipe" });
  try {
    execFileSync("docker", [...args, "-d", dbName], { input: [...deps, migration, smoke].join("\n"), stdio: ["pipe", "pipe", "inherit"] });
  } finally {
    execFileSync("docker", [...args, "-d", "postgres", "-c", `DROP DATABASE ${dbName};`], { stdio: "pipe" });
  }
  return "isolated SQL ok";
}
console.log(`business-spa-composition-sql-unit: ok (${runIsolatedSql()})`);
