#!/usr/bin/env node
/** Contract always; SQL only with explicit isolated-test-container opt-in. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const migrationPath = "supabase/migrations/20261231120000_business_spa_programs_playback_log.sql";
const migration = read(migrationPath);
const smoke = read("supabase/tests/business_spa_programs_smoke.sql");
const sql = migration.replace(/--[^\n]*/g, "");
const columns = {
  business_programs: ["id", "organization_id", "name", "kind", "status", "created_by", "created_at", "updated_at"],
  business_program_items: ["id", "program_id", "audio_item_id", "position", "added_by", "created_at", "excluded_at", "excluded_reason"],
  business_pilot_allowlist: ["user_id", "organization_id", "enabled", "note", "added_by", "created_at"],
  business_playback_log: ["id", "player_id", "zone_id", "organization_id", "audio_item_id", "program_id", "usage_fact_id", "started_at", "ended_at", "played_ms", "event", "client_event_id", "offline", "received_at"],
};
assert.match(sql, /^\s*BEGIN;[\s\S]*COMMIT;\s*$/);
assert.equal([...sql.matchAll(/CREATE TABLE /g)].length, 4, "exactly four new tables");
for (const [table, expected] of Object.entries(columns)) {
  const definition = sql.match(new RegExp(`CREATE TABLE public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
  assert.ok(definition, `table ${table}`);
  const actual = [...definition.matchAll(/^  ([a-z_]+) (?:uuid|text|integer|bigint|boolean|timestamptz)\b/gm)].map((m) => m[1]);
  assert.deepEqual(actual, expected, `${table}: no rights or duplicated metadata columns`);
  assert.ok(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`), `${table} RLS`);
  assert.match(sql, new RegExp(`CREATE POLICY [a-z_]+ ON public\\.${table} FOR SELECT TO authenticated`));
}
assert.match(sql, /UNIQUE \(program_id, audio_item_id\)/);
assert.match(sql, /UNIQUE \(player_id, client_event_id\)/);
assert.match(sql, /status IN \('draft', 'active', 'archived'\)/);
assert.match(sql, /DEFAULT 'spa'/);
assert.match(sql, /event IN \('start', 'complete', 'skip', 'error'\)/);
assert.match(sql, /played_ms >= 0/);
assert.match(sql, /ended_at >= started_at/);
assert.match(sql, /NEW.received_at := clock_timestamp\(\)/);
assert.match(sql, /public.is_business_organization_member\(p_organization_id, auth.uid\(\)\)/);
assert.match(sql, /a.organization_id = p_organization_id AND a.user_id = auth.uid\(\) AND a.enabled/);
assert.match(sql, /REVOKE ALL ON FUNCTION public.has_business_pilot_access\(uuid\) FROM PUBLIC, anon/);
for (const policy of sql.matchAll(/CREATE POLICY ([\s\S]*?);/g)) {
  assert.ok(policy[1].includes("public.has_business_pilot_access("), "every policy requires pilot access");
}
assert.match(sql, /GRANT SELECT ON TABLE public.business_pilot_allowlist TO authenticated/);
assert.doesNotMatch(sql, /GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]*business_pilot_allowlist[^;]*TO authenticated/);
assert.match(sql, /GRANT SELECT, INSERT ON TABLE public.business_playback_log TO authenticated/);
assert.doesNotMatch(sql, /GRANT (?:ALL|UPDATE|DELETE)[^;]*business_playback_log[^;]*TO authenticated/);
assert.match(sql, /GRANT ALL ON TABLE[\s\S]*?business_playback_log TO service_role/);
assert.match(sql, /REVOKE ALL ON TABLE[\s\S]*?FROM PUBLIC, anon, authenticated/);
assert.match(sql, /usage_fact_id uuid REFERENCES public.playback_usage_facts\(id\) ON DELETE RESTRICT/);
assert.match(sql, /f.usage_kind = 'business'/);
for (const field of ["organization_id", "player_id", "zone_id", "audio_item_id"]) {
  assert.ok(sql.includes(`f.${field} = NEW.${field}`), `canonical attribution ${field}`);
}
assert.match(sql, /a.assigned_at <= NEW.started_at/);
assert.match(sql, /NEW.started_at < a.unassigned_at/);
assert.match(sql, /p.organization_id = NEW.organization_id/);
assert.match(sql, /l.organization_id = NEW.organization_id/);
assert.match(sql, /business_spa_program_organization_immutable/);
assert.match(sql, /business_spa_item_identity_immutable/);
for (const fn of sql.matchAll(/CREATE FUNCTION ([\s\S]*?)AS \$\$/g)) {
  assert.ok(fn[1].includes("SET search_path = public, pg_temp"), "fixed function search_path");
}
assert.doesNotMatch(sql, /INSERT INTO public\.(?:business_pilot_allowlist|playback_usage_facts|music_rights_grants)/i);
assert.doesNotMatch(sql, /ALTER TABLE public\.(?:playback_usage|audio_items|music_)/i);
assert.doesNotMatch(sql, /CREATE (?:OR REPLACE )?FUNCTION public.resolve_business_track_eligibility/);
assert.doesNotMatch(sql, /TO anon\s*;/);
assert.ok(migration.includes("resolve_business_track_eligibility"));
assert.ok(migration.includes("business_background_playback"));
assert.ok(migration.includes("offline_storage_cache"));
for (const scenario of ["NoAllowlist", "SelfEnrollment", "AllowlistWithoutMembership", "CrossOrganization", "Idempotency", "AppendOnly", "ScopeValidation", "CanonicalLedger", "ManagerRole", "DisabledAllowlist", "ServiceRole", "NoRightsColumns", "ProgramItemUnique", "ImmutableScope", "HistoricalAssignment"]) {
  assert.ok(smoke.includes(`${scenario}:`), `smoke ${scenario}`);
}
assert.match(smoke, /ON CONFLICT \(player_id, client_event_id\) DO NOTHING/);
assert.match(smoke, /SET LOCAL ROLE authenticated/);
assert.match(smoke, /ROLLBACK;/);
assert.ok(read("docs/DATABASE.md").includes("20261231120000_business_spa_programs_playback_log.sql"));
assert.equal(JSON.parse(read("package.json")).scripts["test:business-spa-programs"], "node scripts/business-spa-programs-sql-unit.mjs");
assert.ok(read(".github/workflows/business-pr-validation.yml").includes("AUDIOLAD_SKIP_ISOLATED_SQL=1 npm run test:business-spa-programs"));
console.log("business-spa-programs-sql-unit: contract ok");

function runIsolatedSql() {
  // Check the skip switch before any subprocess, including Docker discovery.
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") return "skipped";
  const container = process.env.AUDIOLAD_BUSINESS_SPA_TEST_CONTAINER?.trim();
  // No production container discovery. Caller must supply a dedicated disposable
  // test container whose name ends in -test-db, and explicitly opt into SQL.
  if (process.env.AUDIOLAD_BUSINESS_SPA_ISOLATED_SQL !== "1" || !container) return "no isolated DB opted in";
  assert.match(container, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*-test-db$/, "dedicated test container required");
  const dbName = "audiolad_business_spa_programs_test";
  const deps = [
    "scripts/lib/business-playback-attribution-sql-stub.sql",
    "supabase/migrations/20261127120000_playback_usage_facts.sql",
    "supabase/migrations/20261130120000_author_stats_listening_time.sql",
    "supabase/migrations/20261201120000_business_domain_core.sql",
    "supabase/migrations/20261202120000_business_player_foundation.sql",
    "supabase/migrations/20261203120000_business_playback_attribution.sql",
  ].map(read);
  const args = ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];
  // CREATE fails if this scratch name already exists; never drop an existing DB.
  execFileSync("docker", [...args, "-d", "postgres", "-c", `CREATE DATABASE ${dbName};`], { stdio: "pipe" });
  try {
    execFileSync("docker", [...args, "-d", dbName], {
      input: [...deps, migration, smoke].join("\n"), stdio: ["pipe", "pipe", "inherit"],
    });
  } finally {
    execFileSync("docker", [...args, "-d", "postgres", "-c", `DROP DATABASE ${dbName};`], { stdio: "pipe" });
  }
  return "isolated SQL ok";
}
console.log(`business-spa-programs-sql-unit: ok (${runIsolatedSql()})`);
