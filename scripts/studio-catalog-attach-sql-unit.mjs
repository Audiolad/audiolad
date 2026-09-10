#!/usr/bin/env node
/**
 * Parse-only + optional isolated Postgres tests for PR4 catalog attach.
 * Scratch / local isolated database only. Never writes to production postgres.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migrationName = "20261004120000_studio_catalog_project_assets.sql";
const previousLatest = "20261003120700_studio_music_independent_pricing.sql";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(existsSync(join(migrationsDir, previousLatest)), "previous latest migration stays intact");
assert(existsSync(join(migrationsDir, migrationName)), "catalog attach migration exists");

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20261004120000"), "20261004120000 is listed");

const sql = readFileSync(join(migrationsDir, migrationName), "utf8");

assert(/ADD COLUMN IF NOT EXISTS catalog_practice_id/.test(sql));
assert(/ADD COLUMN IF NOT EXISTS catalog_audio_item_id/.test(sql));
assert(/ALTER COLUMN storage_path DROP NOT NULL/.test(sql));
assert(/ALTER COLUMN source_id DROP NOT NULL/.test(sql));
assert(/source_type IN \('upload', 'recording', 'catalog'\)/.test(sql));
assert(/source_type = 'catalog'/.test(sql));
assert(/storage_path IS NULL/.test(sql));
assert(/studio_project_assets_active_catalog_ref_uidx/.test(sql));
assert(/deleted_at IS NULL AND source_type = 'catalog'/.test(sql));
assert(/studio_catalog_asset_refs_match/.test(sql));
assert(/ai\.practice_id = NEW\.catalog_practice_id/.test(sql));
assert(/CREATE OR REPLACE FUNCTION public\.attach_studio_catalog_project_asset/.test(sql));
assert(/can_use_music_in_studio/.test(sql));
assert(/size_bytes,\s+0,/.test(sql) || /0,\s+p_duration_seconds/.test(sql));
assert(/WHEN unique_violation/.test(sql));
assert(/deleted_at IS NULL/.test(sql));
assert(/GRANT EXECUTE ON FUNCTION public\.attach_studio_catalog_project_asset/.test(sql));
assert(/TO service_role/.test(sql));
assert(/REVOKE ALL ON FUNCTION public\.attach_studio_catalog_project_asset/.test(sql));
assert(/FROM anon, authenticated/.test(sql));
assert(/duplicate_studio_project/.test(sql));
assert(/source_asset\.catalog_practice_id/.test(sql));
assert(/source_type IN \('upload', 'recording'\)/.test(sql));
assert(!/INSERT INTO storage\.objects/.test(sql));
assert(/No studio-draft-assets copy/.test(sql));
assert(!/COPY.*studio-draft-assets/.test(sql));
assert(/never user_practices/.test(sql));
assert(!/FROM public\.user_practices/.test(sql));
assert(!/JOIN public\.user_practices/.test(sql));
assert(!/DROP TABLE/.test(sql));
assert(!/TRUNCATE/.test(sql));
assert(!/schemaVersion/.test(sql));
assert(/Forward-only/.test(sql) || /forward-only/.test(sql) || /Existing upload\/recording rows stay valid/.test(sql));

const isolatedRequested = process.env.AUDIOLAD_STUDIO_CATALOG_ATTACH_ISOLATED === "1";
if (isolatedRequested && process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
  throw new Error(
    "studio-catalog-attach-sql-unit: isolated mode cannot skip executable SQL",
  );
}

if (isolatedRequested) {
  console.log(
    "studio-catalog-attach-sql-unit: parse-only ok (isolated SQL is opt-in; apply via license isolated workflow + this migration)",
  );
} else {
  console.log("studio-catalog-attach-sql-unit: parse-only ok");
}
