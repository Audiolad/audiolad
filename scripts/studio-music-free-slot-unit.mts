import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRACTICES_ONE_FREE_STUDIO_MUSIC_PER_AUTHOR_INDEX,
  STUDIO_FREE_SLOT_TAKEN,
  STUDIO_FREE_SLOT_TAKEN_MESSAGE,
  isStudioFreeSlotUniqueViolation,
  practiceOccupiesStudioFreeSlot,
  wouldOccupyStudioFreeSlotAfterNormalizedSave,
} from "../src/lib/studio-music/free-slot.ts";
import {
  classifyProductSaveError,
  getProductSaveErrorMessage,
} from "../src/lib/author-products/save-errors.ts";
import { normalizeStudioMusicPricingForSave } from "../src/lib/studio-music/pricing.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const migration = readFileSync(
  join(
    repoRoot,
    "supabase/migrations/20261008120300_studio_one_free_music_per_author.sql",
  ),
  "utf8",
);
const route = readFileSync(
  join(repoRoot, "src/app/api/author/products/[id]/route.ts"),
  "utf8",
);
const form = readFileSync(
  join(repoRoot, "src/components/author-dashboard/AuthorProductForm.tsx"),
  "utf8",
);
const restoreRoute = readFileSync(
  join(
    repoRoot,
    "src/app/api/author/products/[id]/restore-from-archive/route.ts",
  ),
  "utf8",
);
const archiveMig = readFileSync(
  join(
    repoRoot,
    "supabase/migrations/20260731180000_practice_moderation_mvp_schema.sql",
  ),
  "utf8",
);

assert.match(migration, /CREATE UNIQUE INDEX practices_one_free_studio_music_per_author_uidx/);
assert.match(migration, /music_usage_permission = 'platform_reuse_allowed'/);
assert.match(migration, /studio_music_pricing_mode = 'free'/);
assert.match(migration, /studio_music_pricing_mode IS NULL/);
assert.match(migration, /deleted_at IS NULL/);
const migrationSqlBody = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
assert.doesNotMatch(migrationSqlBody, /audio_items|items_count|track_count/);
assert.doesNotMatch(migrationSqlBody, /UPDATE\s+public\.practices/i);
assert.doesNotMatch(migrationSqlBody, /studio_music_entitlements/);
assert.match(migration, /intentionally NOT part of the predicate/);

assert.equal(
  practiceOccupiesStudioFreeSlot({
    deleted_at: null,
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: "free",
  }),
  true,
);
assert.equal(
  practiceOccupiesStudioFreeSlot({
    deleted_at: null,
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: "fixed",
    studio_music_price_minor: 49900,
  } as never),
  false,
);
assert.equal(
  practiceOccupiesStudioFreeSlot({
    deleted_at: null,
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: null,
    is_free: true,
    price: 0,
  }),
  true,
  "legacy NULL + listener-free occupies slot",
);
assert.equal(
  practiceOccupiesStudioFreeSlot({
    deleted_at: null,
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: null,
    is_free: false,
    price: 199,
  }),
  false,
  "legacy NULL + listener-paid does not occupy as FREE",
);
assert.equal(
  practiceOccupiesStudioFreeSlot({
    deleted_at: "2026-09-15T00:00:00Z",
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: "free",
  }),
  false,
  "soft-delete releases slot",
);
assert.equal(
  practiceOccupiesStudioFreeSlot({
    deleted_at: null,
    music_usage_permission: "listen_only",
    studio_music_pricing_mode: "free",
  }),
  false,
);

assert.equal(
  wouldOccupyStudioFreeSlotAfterNormalizedSave({
    musicUsagePermission: "platform_reuse_allowed",
    studioMusicPricingMode: "free",
  }),
  true,
);
assert.equal(
  wouldOccupyStudioFreeSlotAfterNormalizedSave({
    musicUsagePermission: "platform_reuse_allowed",
    studioMusicPricingMode: null,
  }),
  false,
  "normalized saves must not leave NULL FREE occupancy",
);

const normalized = normalizeStudioMusicPricingForSave({
  productKind: "music",
  musicUsagePermission: "platform_reuse_allowed",
  listenerIsFree: false,
  mode: "free",
});
assert.equal(normalized.ok, true);
if (normalized.ok) {
  assert.equal(normalized.mode, "free");
}

assert.equal(
  isStudioFreeSlotUniqueViolation({
    code: "23505",
    message: `duplicate key value violates unique constraint "${PRACTICES_ONE_FREE_STUDIO_MUSIC_PER_AUTHOR_INDEX}"`,
  }),
  true,
);
assert.equal(
  isStudioFreeSlotUniqueViolation({
    code: "23505",
    message: "duplicate key value violates unique constraint \"practices_author_id_slug_uidx\"",
  }),
  false,
);
assert.equal(
  isStudioFreeSlotUniqueViolation({ code: "42501", message: "x" }),
  false,
);

assert.equal(
  classifyProductSaveError({
    error: STUDIO_FREE_SLOT_TAKEN,
    status: 409,
  }),
  "conflict",
);
assert.equal(
  getProductSaveErrorMessage({
    error: STUDIO_FREE_SLOT_TAKEN,
    status: 409,
  }),
  STUDIO_FREE_SLOT_TAKEN_MESSAGE,
);
assert.match(STUDIO_FREE_SLOT_TAKEN_MESSAGE, /один продукт/);
assert.doesNotMatch(STUDIO_FREE_SLOT_TAKEN_MESSAGE, /бесплатный трек/);

assert.match(route, /studio_free_slot_taken|STUDIO_FREE_SLOT_TAKEN|studioFreeSlotTakenResponseBody/);
assert.match(route, /isStudioFreeSlotUniqueViolation/);
assert.match(route, /mustCheckSlot/);
assert.match(route, /status: 409/);

assert.match(
  form,
  /У каждого автора может быть один бесплатный продукт для Студии/,
);
assert.match(form, /Остальные лицензии — от 499/);
assert.doesNotMatch(form, /один бесплатный трек/);

assert.match(archiveMig, /archive_retired/);
assert.match(restoreRoute, /restorePracticeFromArchive/);

console.log("studio-music-free-slot-unit: ok");
