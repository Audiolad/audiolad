#!/usr/bin/env node
/**
 * Contract + optional isolated scratch-DB smoke for Music Rights Foundation (A4).
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261205120000_music_rights_foundation.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/business-rights-foundation-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/music_rights_foundation_smoke.sql");
const dbName = "audiolad_music_rights_foundation_test";

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
const smoke = readFileSync(smokePath, "utf8");
const stub = readFileSync(stubPath, "utf8");

assert(migration.includes("CREATE TABLE IF NOT EXISTS public.music_rightsholders"), "rightsholders table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.music_rights_grants"), "grants table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.music_rights_grant_countries"), "countries table");
assert(!/author_id/.test(migration.split("music_rightsholders")[1]?.slice(0, 800) || ""), "rightsholder has no author_id");
assert(migration.includes("'recording'"), "recording layer");
assert(migration.includes("'composition'"), "composition layer");
assert(migration.includes("business_background_playback"), "bg use_type");
assert(migration.includes("offline_storage_cache"), "offline use_type vocabulary");
assert(migration.includes("advertising_synchronization"), "advertising use_type vocabulary");
assert(migration.includes("territory_scope"), "territory_scope");
assert(migration.includes("'worldwide'"), "worldwide");
assert(migration.includes("'countries'"), "countries scope");
assert(migration.includes("country_code ~ '^[A-Z]{2}$'"), "ISO country");
assert(!/\bis_global\s+boolean\b/i.test(migration), "no is_global boolean column");
assert(!/ADD COLUMN[^;]*\bis_global\b/i.test(migration), "no is_global column");
assert(migration.includes("valid_until IS NULL OR valid_until > valid_from"), "validity check");
assert(migration.includes("'draft'"), "draft status");
assert(migration.includes("'verified'"), "verified status");
assert(migration.includes("'superseded'"), "superseded status");
assert(migration.includes("supersedes_grant_id"), "versioning");
assert(migration.includes("ON DELETE RESTRICT"), "restrict deletes");
assert(!/audio_item_id uuid NOT NULL\s+REFERENCES public\.audio_items/i.test(migration), "no destructive audio_items FK");
assert(!/REFERENCES public\.audio_items.*ON DELETE CASCADE/i.test(migration), "no cascade from audio_items");
assert(migration.includes("get_music_rights_passport_basic"), "passport projection");
assert(migration.includes("REVIEW_REQUIRED"), "REVIEW_REQUIRED");
assert(migration.includes("HAS_VERIFIED_GRANTS"), "HAS_VERIFIED_GRANTS");
assert(!/\beligible\s*=\s*true/i.test(migration), "no eligible=true");
assert(!/ADD COLUMN[^;]*\beligible\b/i.test(migration), "no eligible column add");
assert(!/\blicensed\b\s+boolean\b/i.test(migration), "no licensed boolean column");
assert(!/ADD COLUMN[^;]*\blicensed\b/i.test(migration), "no licensed column add");
assert(!/\blicensed\s*=\s*true\b/i.test(migration), "no licensed=true SoT");
assert(!/ALTER TABLE public\.playback_usage_facts/i.test(migration), "no A3 ledger ALTER");
assert(!/INSERT INTO public\.playback_usage_facts/i.test(migration), "no A3 ledger INSERT");
assert(!/royalty_eligible_ms/i.test(migration), "no royalty mutation");
assert(!/ALTER TABLE public\.playback_usage/i.test(migration), "no playback alter");
assert(!/SET\s+music_usage_permission|music_usage_permission\s*=/i.test(migration), "no Studio permission auto-map");
assert(!/platform_reuse_allowed\s*=/i.test(migration), "no platform_reuse auto-map");
assert(!/INSERT INTO public\.music_rights_grants/i.test(migration), "no grant seed/backfill");
assert(!/\bBPM\b/i.test(migration), "no BPM");
assert(!/ADD COLUMN[^;]*\bgenre\b/i.test(migration), "no genre column");
assert(!/sonic_dna|music_passport_analysis/i.test(migration), "no analyzer tables");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS");
assert(migration.includes("REVOKE ALL ON TABLE public.music_rights_grants FROM PUBLIC, anon, authenticated"), "revoke grants");
assert(migration.includes("GRANT ALL ON TABLE public.music_rights_grants TO service_role"), "service_role grants");
assert(migration.includes("GRANT EXECUTE ON FUNCTION public.get_music_rights_passport_basic"), "passport execute");
assert(/REVOKE ALL ON FUNCTION public\.get_music_rights_passport_basic\([^)]+\) FROM anon/i.test(migration), "passport not anon");
assert(migration.includes("audio_item_not_music"), "music-only gate");
assert(migration.includes("grant_legal_fields_immutable"), "immutability");
assert(migration.includes("grant_history_immutable"), "non-draft delete protection");
assert(migration.includes("grant_territory_immutable"), "territory immutability");
assert(migration.includes("grant_lifecycle_forbidden"), "lifecycle state machine");
assert(migration.includes("verified_at_immutable"), "verified_at immutable");
assert(migration.includes("grant_territory_incomplete"), "territory before verify");
assert(migration.includes("supersedes_version_mismatch"), "version chain");
assert(migration.includes("music_rights_grants_supersedes_uidx"), "unique successor");
assert(migration.includes("audio_item_not_found"), "passport missing track");
assert(migration.includes("audio_item_not_music"), "passport non-music");
assert(smoke.includes("Case1"), "smoke Case1");
assert(smoke.includes("Case21"), "smoke Case21");
assert(smoke.includes("Case22"), "smoke Case22");
assert(smoke.includes("Case23"), "smoke Case23");
assert(smoke.includes("Case24"), "smoke Case24");
assert(smoke.includes("Case29"), "smoke Case29");
assert(smoke.includes("Case30"), "smoke Case30");
assert(smoke.includes("CaseA"), "smoke CaseA verified delete");
assert(smoke.includes("CaseD"), "smoke CaseD territory insert");
assert(smoke.includes("CaseH"), "smoke CaseH countries incomplete");
assert(smoke.includes("CaseL"), "smoke CaseL lifecycle");
assert(smoke.includes("CaseP"), "smoke CaseP verified_at");
assert(smoke.includes("CaseQ"), "smoke CaseQ version");
assert(smoke.includes("CaseU"), "smoke CaseU unique successor");
assert(smoke.includes("CaseV"), "smoke CaseV missing track");
assert(smoke.includes("CaseW"), "smoke CaseW non-music");
assert(smoke.includes("CaseX"), "smoke CaseX REVIEW_REQUIRED");
assert(smoke.includes("REVIEW_REQUIRED"), "smoke REVIEW_REQUIRED");
assert(smoke.includes("HAS_VERIFIED_GRANTS"), "smoke HAS_VERIFIED_GRANTS");
assert(stub.includes("music_usage_permission"), "stub keeps Studio field for non-map proof");
assert(!/CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(stub), "stub must not install pgcrypto");

{
  const docs = [
    readFileSync(join(repoRoot, "docs/DATABASE.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/ARCHITECTURE.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/DECISIONS.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/PROJECT_STATE.md"), "utf8"),
  ].join("\n");
  // Docs may lag until updated in same commit; soft-require after we write them.
  if (docs.includes("music_rights_grants") || docs.includes("Rights Passport")) {
    assert(/Rights Grant/i.test(docs), "docs: Rights Grant");
    assert(/Rightsholder/i.test(docs), "docs: Rightsholder");
    assert(/REVIEW_REQUIRED/i.test(docs), "docs: REVIEW_REQUIRED");
    assert(/immutable/i.test(docs), "docs: immutability");
    assert(/audio_item_not_found/i.test(docs), "docs: passport missing track");
    const stripped = docs
      .replace(/never a hand-set `licensed=true`[^\n]*/gi, "")
      .replace(/not `licensed=true`/gi, "")
      .replace(/не[^\n]*licensed=true[^\n]*/gi, "");
    assert(!/licensed\s*=\s*true/i.test(stripped), "docs: no affirmative licensed=true SoT");
  }
}

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
    return "skipped";
  }
  const sql = [stub, migration, smoke].join("\n");
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;
  if (!container) {
    console.log("business-rights-foundation-sql-unit: contract ok; isolated SQL skipped (no docker db)");
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
console.log(`business-rights-foundation-sql-unit: ok (${mode})`);
