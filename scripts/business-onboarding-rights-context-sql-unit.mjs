// Onboarding auto-creates an active Location Rights Context v1 (idempotent,
// fail-closed, service-only helper). Contract asserts + isolated SQL smoke.
// Isolated SQL runs in a disposable docker container
// (AUDIOLAD_ONBOARDING_TEST_CONTAINER) or a scratch local postgres
// (AUDIOLAD_TEST_PGHOST + AUDIOLAD_TEST_PGPORT). Never against production.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(repoRoot, p), "utf8");

const migrationPath = "supabase/migrations/20270122120000_business_onboarding_rights_context.sql";
const migration = read(migrationPath);
const smoke = read("supabase/tests/business_onboarding_rights_context_smoke.sql");
const coreMigration = read("supabase/migrations/20261201120000_business_domain_core.sql");

// --- contract: helper -------------------------------------------------------
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.business_ensure_location_rights_context\(\s*p_location_id uuid\s*\)\s*RETURNS uuid/);
assert.match(migration, /SECURITY DEFINER\s+SET search_path = public, pg_temp/);
assert.match(migration, /FOR UPDATE;/, "location row lock serialises retries");
assert.match(migration, /c\.status = 'active'[\s\S]*RETURN v_context_id;/, "returns existing active context");
assert.match(migration, /r\.service_status = 'supported'/);
assert.match(migration, /r\.client_requirement = 'none'/);
assert.match(migration, /r\.use_type = 'business_background_playback'/);
assert.match(migration, /'draft',\s*now\(\)\s*\)/, "inserts draft with reviewed_at");
assert.match(migration, /SET status = 'active'\s+WHERE id = v_context_id/);
assert.doesNotMatch(migration, /status = 'superseded'/, "never supersedes history");
assert.doesNotMatch(migration, /DELETE FROM/i);
assert.doesNotMatch(migration, /'RU'/, "no country hardcode");
for (const role of ["PUBLIC", "anon", "authenticated"]) {
  assert.ok(
    migration.includes(`REVOKE ALL ON FUNCTION public.business_ensure_location_rights_context(uuid) FROM ${role};`),
    `revoke ${role}`,
  );
}
assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.business_ensure_location_rights_context(uuid) TO service_role;"));
assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.business_ensure_location_rights_context\(uuid\) TO (anon|authenticated)/);
assert.doesNotMatch(migration, /CREATE TRIGGER/i, "explicit call, not a trigger");

// --- contract: onboarding RPC keeps the original body + ensure call ---------
const fnRe = /CREATE OR REPLACE FUNCTION public\.create_business_organization_with_location\([\s\S]*?\n\$\$;/;
const oldFn = coreMigration.match(fnRe)?.[0];
const newFn = migration.match(fnRe)?.[0];
assert.ok(oldFn && newFn, "both RPC bodies found");
const ensureBlock = /\n  -- Location Rights Context v1[\s\S]*?business_ensure_location_rights_context\(v_location_id\);\n/;
assert.match(newFn, ensureBlock);
const normalized = newFn
  .replace(ensureBlock, "\n")
  .replace("  v_rights_context_id uuid;\n", "")
  .replace(",\n    'rights_context_id', v_rights_context_id", "");
assert.equal(normalized.replace(/\n\n+/g, "\n"), oldFn.replace(/\n\n+/g, "\n"), "onboarding RPC body otherwise unchanged");
assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)\n  TO authenticated;"));
assert.ok(migration.includes("FROM anon;"));

// --- contract: smoke coverage ----------------------------------------------
for (const c of ["OnbCtxA", "OnbCtxB", "OnbCtxC", "OnbCtxD", "OnbCtxE", "OnbCtxF", "OnbCtxG"]) {
  assert.ok(smoke.includes(`RAISE NOTICE '${c} ok'`), `smoke ${c}`);
}
assert.doesNotMatch(smoke, /'RU'/, "smoke uses synthetic countries only");

// --- isolated SQL ------------------------------------------------------------
const sql = [
  read("scripts/lib/business-domain-core-sql-stub.sql"),
  coreMigration,
  read("scripts/lib/business-rights-eligibility-sql-stub.sql"),
  read("supabase/migrations/20261205120000_music_rights_foundation.sql"),
  read("supabase/migrations/20261206120200_business_rights_eligibility.sql"),
  migration,
  smoke,
].join("\n");

function psqlCommand(db) {
  const container = process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER;
  if (container) {
    return ["docker", ["exec", "-i", container, "psql", "-X", "-q", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"]];
  }
  const host = process.env.AUDIOLAD_TEST_PGHOST;
  if (host) {
    const port = process.env.AUDIOLAD_TEST_PGPORT ?? "5432";
    return ["psql", ["-X", "-q", "-h", host, "-p", port, "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"]];
  }
  return null;
}

function runPsql(db, input) {
  const [cmd, args] = psqlCommand(db);
  const res = spawnSync(cmd, args, { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`isolated SQL failed (${db}):\n${res.stderr || res.error?.message}`);
  }
  return `${res.stdout}\n${res.stderr}`;
}

let mode = "contract-only";
if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1" || !psqlCommand("postgres")) {
  assert.notEqual(process.env.AUDIOLAD_REQUIRE_ONBOARDING_SQL, "1", "isolated SQL required; provide disposable test container");
} else {
  const db = `onb_rights_ctx_${process.pid}`;
  runPsql("postgres", `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  runPsql("postgres", `CREATE DATABASE ${db};`);
  try {
    const out = runPsql(db, sql);
    for (const c of ["OnbCtxA", "OnbCtxB", "OnbCtxC", "OnbCtxD", "OnbCtxE", "OnbCtxF", "OnbCtxG"]) {
      assert.ok(out.includes(`${c} ok`), `isolated ${c} passed`);
    }
    mode = "isolated-sql";
  } finally {
    runPsql("postgres", `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  }
}

console.log(`business-onboarding-rights-context-sql-unit: ok (${mode})`);
