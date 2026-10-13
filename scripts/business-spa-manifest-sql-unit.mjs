#!/usr/bin/env node
/** Business SPA PR3 manifest contract (task 0e05333f). Behaviour: business_spa_manifest_smoke.sql in the real replay. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20261230120000_business_spa_program_manifest.sql");
const smoke = read("supabase/tests/business_spa_manifest_smoke.sql");
const sql = migration.replace(/--[^\n]*/g, "");

assert.match(sql, /^\s*BEGIN;[\s\S]*COMMIT;\s*$/);
assert.equal([...sql.matchAll(/CREATE TABLE /g)].length, 0, "no new tables");
assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|ALTER TABLE|TRUNCATE)\b/i, "read-only manifest");
for (const fn of sql.matchAll(/CREATE FUNCTION ([\s\S]*?)AS \$\$/g)) {
  assert.ok(fn[1].includes("SET search_path = public, pg_temp"), "fixed function search_path");
}
// One universal 7-day cap, independent of license term; bounded by grant valid_until.
assert.match(sql, /business_spa_offline_cache_max\(\)\s+RETURNS interval[\s\S]*?SELECT interval '7 days'/);
assert.match(sql, /least\(v_cap, public\.business_spa_grants_valid_until\(d\.off\), d\.play_until\)/);
assert.match(sql, /d\.play_until IS NULL OR d\.play_until > v_now/);
assert.doesNotMatch(sql, /rightsholder_id|author_id/, "no per-rightsholder exceptions");
// Rights only from the existing engine, fail-closed.
assert.ok(sql.includes("resolve_business_track_eligibility(i.audio_item_id, p_location_id, NULL, 'business_background_playback', v_now)"));
assert.ok(sql.includes("resolve_business_track_eligibility(i.audio_item_id, p_location_id, NULL, 'offline_storage_cache', v_now)"));
assert.match(sql, /it\.published AND coalesce\(it\.bbp->>'decision' = 'ELIGIBLE', false\)/);
assert.match(sql, /AND public\.business_spa_offline_grants_cited\(it\.off\)\) AS cacheable/);
assert.match(sql, /AND public\.business_spa_track_visible\(i\.audio_item_id\)/);
assert.doesNotMatch(sql, /CREATE (?:OR REPLACE )?FUNCTION public\.resolve_business_track_eligibility/);
assert.doesNotMatch(sql, /reason_codes/, "withheld reasons are not exposed");
// Access: pilot allowlist + tenant scope; no anon.
assert.match(sql, /NOT public\.has_business_pilot_access\(v_org\)/);
assert.match(sql, /business_spa_location_scope_mismatch/);
assert.match(sql, /business_spa_program_archived/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.business_spa_program_manifest\(uuid, uuid\) FROM PUBLIC, anon;/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.business_spa_grants_valid_until\(jsonb\) FROM PUBLIC, anon, authenticated;/);
assert.doesNotMatch(sql, /TO anon\b/);
for (const scenario of ["NoAllowlist", "GrantHelperPrivate", "EligibleOnly", "WithheldCount", "NoLeak", "CacheMax", "OfflineCap7d",
  "OfflineGrantBound", "PlayOnlineOnly", "OfflineNeedsCitedGrant", "HiddenPractice", "PlaybackGrantBound", "ManifestExpiry", "StableHash", "LocationScope", "CrossOrganization",
  "Revocation", "ReadOnly", "ArchivedProgram"]) {
  assert.ok(smoke.includes(`${scenario}:`), `smoke ${scenario}`);
}
assert.match(smoke, /SET LOCAL ROLE authenticated/);
assert.match(smoke, /ROLLBACK;\s*$/);
assert.ok(read("scripts/database-migrations-compile-isolated.mjs").includes("supabase/tests/business_spa_manifest_smoke.sql"), "smoke runs in real replay");
assert.ok(read(".github/workflows/database-migrations-compile-isolated.yml").includes("supabase/tests/business_spa_manifest_smoke.sql"));
assert.ok(read("docs/DATABASE.md").includes("20261230120000_business_spa_program_manifest.sql"));
assert.ok(read(".github/workflows/business-pr-validation.yml").includes("npm run test:business-spa-manifest"));
console.log("business-spa-manifest-sql-unit: contract ok");
