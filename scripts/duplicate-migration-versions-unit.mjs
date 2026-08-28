#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listLocalMigrationFiles } from "../deploy/scripts/lib/database-migrations-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const MAPPING = join(ROOT, "deploy/migration-baseline/DUPLICATE_VERSION_MAPPING.md");

const EXPECTED_RENAMES = [
  ["20260716180000_per_track_covers.sql", "20260716181000_per_track_covers.sql"],
  ["20260716180000_promotion_campaigns.sql", "20260716182000_promotion_campaigns.sql"],
  ["20260716190000_claim_promo_practice_by_id.sql", "20260716191000_claim_promo_practice_by_id.sql"],
  ["20260728120000_practice_content_sale_lock.sql", "20260728121000_practice_content_sale_lock.sql"],
  ["20260830120100_practice_catalog_visibility_modes.sql", "20260901120100_practice_catalog_visibility_modes.sql"],
  ["20260830120200_create_practice_order_visibility.sql", "20260901120200_create_practice_order_visibility.sql"],
  ["20260830120300_public_playlist_selected_visibility.sql", "20260901120300_public_playlist_selected_visibility.sql"],
  ["20260830120400_fix_visibility_allowlist_author_policy.sql", "20260901120400_fix_visibility_allowlist_author_policy.sql"],
  ["20260901130000_author_support_mode.sql", "20260902120200_author_support_mode.sql"],
];

const EXPECTED_KEEP = [
  "20260716180000_author_applications_wants_training.sql",
  "20260716190000_author_applications_interested_in_school.sql",
  "20260728120000_author_payout_profiles.sql",
];

function main() {
  assert.equal(existsSync(MAPPING), true, "DUPLICATE_VERSION_MAPPING.md must exist");
  const mappingText = readFileSync(MAPPING, "utf8");
  for (const [oldName, newName] of EXPECTED_RENAMES) {
    assert.match(mappingText, new RegExp(oldName.replace(/\./g, "\\.")));
    assert.match(mappingText, new RegExp(newName.replace(/\./g, "\\.")));
    assert.equal(existsSync(join(MIGRATIONS, oldName)), false, `old file must be gone: ${oldName}`);
    assert.equal(existsSync(join(MIGRATIONS, newName)), true, `new file must exist: ${newName}`);
  }
  for (const keep of EXPECTED_KEEP) {
    assert.equal(existsSync(join(MIGRATIONS, keep)), true, `kept file missing: ${keep}`);
    assert.match(mappingText, new RegExp(keep.replace(/\./g, "\\.")));
  }

  const listed = listLocalMigrationFiles(MIGRATIONS);
  assert.equal(listed.duplicates.length, 0, `duplicate versions: ${JSON.stringify(listed.duplicates)}`);
  assert.equal(
    listed.files.length,
    listed.versions.length,
    `1 file = 1 version required (files=${listed.files.length} versions=${listed.versions.length})`,
  );

  const names = readdirSync(MIGRATIONS).filter((n) => n.toLowerCase().endsWith(".sql"));
  const byVersion = new Map();
  for (const name of names) {
    const match = name.match(/^(\d{8,})_/);
    assert.ok(match, `migration filename must start with timestamp: ${name}`);
    const version = match[1];
    if (!byVersion.has(version)) byVersion.set(version, []);
    byVersion.get(version).push(name);
  }
  const dups = [...byVersion.entries()].filter(([, files]) => files.length > 1);
  assert.equal(dups.length, 0, `timestamp used by more than one file: ${JSON.stringify(dups)}`);
  assert.equal(names.length, byVersion.size, "1 file = 1 version after rename");

  console.log(
    `duplicate-migration-versions-unit: ok files=${names.length} unique_versions=${byVersion.size} mapping=present`,
  );
}

main();
