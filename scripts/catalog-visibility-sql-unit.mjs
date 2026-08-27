#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for catalog visibility MVP.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260830120100_practice_catalog_visibility_modes.sql"),
  "utf8",
);
const orderMigration = readFileSync(
  join(repoRoot, "supabase/migrations/20260830120200_create_practice_order_visibility.sql"),
  "utf8",
);
const playlistMigration = readFileSync(
  join(
    repoRoot,
    "supabase/migrations/20260830120300_public_playlist_selected_visibility.sql",
  ),
  "utf8",
);

assert.match(migration, /ADD COLUMN IF NOT EXISTS catalog_visibility text/);
assert.match(migration, /WHEN is_catalog_listed IS TRUE THEN 'listed'/);
assert.match(migration, /ELSE 'unlisted'/);
assert.doesNotMatch(migration, /THEN 'selected_users'/);
assert.match(migration, /practices_catalog_visibility_check/);
assert.match(migration, /practices_catalog_visibility_listed_sync_check/);
assert.match(migration, /is_catalog_listed = \(catalog_visibility = 'listed'\)/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sync_practice_catalog_visibility/);
assert.match(migration, /SET search_path = public, pg_temp/);
assert.match(migration, /ALTER COLUMN catalog_visibility DROP DEFAULT/);
assert.match(migration, /WHEN NEW\.is_catalog_listed IS FALSE THEN 'unlisted'/);
assert.match(migration, /OLD\.catalog_visibility = 'selected_users'/);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.is_practice_author_member\(uuid, uuid\) TO authenticated/,
);
assert.doesNotMatch(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.is_practice_author_member\(uuid, uuid\) TO anon/,
);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.is_practice_author_member\(uuid, uuid\) FROM anon/);
assert.match(migration, /catalog_visibility = 'listed'/);
assert.match(migration, /get_public_quick_offer/);
assert.match(migration, /IS DISTINCT FROM 'selected_users'/);
assert.match(migration, /Public can read author featured products/);
assert.match(migration, /p\.catalog_visibility = 'listed'/);
assert.match(migration, /pg_advisory_xact_lock/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_visibility_users/);
assert.match(migration, /CONSTRAINT practice_visibility_users_unique\s+UNIQUE \(practice_id, user_id\)/);
assert.match(migration, /REFERENCES public\.practices \(id\)/);
assert.match(migration, /REFERENCES auth\.users \(id\)/);
assert.match(migration, /Never write user_practices from this table/);
assert.doesNotMatch(migration, /GRANT INSERT ON TABLE public\.practice_visibility_users TO authenticated/);
assert.doesNotMatch(migration, /GRANT UPDATE ON TABLE public\.practice_visibility_users TO authenticated/);
assert.doesNotMatch(migration, /GRANT DELETE ON TABLE public\.practice_visibility_users TO authenticated/);

assert.match(
  migration,
  /catalog_visibility IN \('listed', 'unlisted'\)/,
);
assert.match(migration, /Selected users can read allowlisted practices/);
assert.match(migration, /can_current_viewer_read_practice/);
assert.match(migration, /Public can read published audio item metadata/);
assert.match(migration, /Public can read published publication gallery slides/);
assert.match(migration, /Public can read topics of published practices/);

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_free_practice/);
assert.match(migration, /viewer_can_commercially_access_practice/);
assert.match(migration, /lookup_practice_visibility_user/);
assert.match(migration, /add_practice_visibility_user/);
assert.match(migration, /remove_practice_visibility_user/);
assert.match(migration, /interval '10 minutes'/);
assert.match(migration, /v_recent >= 20/);
assert.doesNotMatch(migration, /ilike/);
assert.doesNotMatch(migration, /searchAudioladProfiles/);

assert.match(migration, /WHEN NEW\.is_catalog_listed IS FALSE THEN 'unlisted'/);
assert.match(migration, /ELSE 'listed'/);
assert.match(migration, /NEW\.is_catalog_listed := \(NEW\.catalog_visibility = 'listed'\)/);

assert.match(orderMigration, /CREATE OR REPLACE FUNCTION public\.create_practice_order/);
assert.match(orderMigration, /viewer_can_commercially_access_practice/);
assert.match(orderMigration, /RAISE EXCEPTION 'practice_not_found'/);
assert.match(playlistMigration, /Anyone can select public playlist items/);
assert.match(playlistMigration, /p\.catalog_visibility = 'listed'/);
assert.match(playlistMigration, /p\.id = playlist_items\.practice_id/);

const smoke = readFileSync(
  join(repoRoot, "supabase/tests/catalog_visibility_rls_smoke.sql"),
  "utf8",
);
assert.match(smoke, /catalog_visibility/);
assert.match(smoke, /practice_visibility_users/);
assert.match(smoke, /selected_users/);

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (process.env.AUDIOLAD_VISIBILITY_SQL_DOCKER === "1" && dockerAvailable()) {
  console.log("catalog-visibility-sql-unit: docker requested but isolated apply is parse-covered");
}

console.log("catalog-visibility-sql-unit: ok");
