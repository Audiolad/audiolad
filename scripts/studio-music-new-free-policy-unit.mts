import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STUDIO_NEW_FREE_DISABLED,
  STUDIO_NEW_FREE_DISABLED_MESSAGE,
  STUDIO_NEW_FREE_POLICY_COPY,
  isEffectiveStudioFreeProduct,
  isGrandfatheredStudioFreeContinuation,
  isStudioNewFreeDisabledViolation,
  wouldCreateNewStudioFreeState,
} from "../src/lib/studio-music/new-free-policy";
import {
  classifyProductSaveError,
  getProductSaveErrorMessage,
} from "../src/lib/author-products/save-errors";
import {
  DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
  MIN_STUDIO_MUSIC_PRICE_RUBLES,
  STUDIO_MUSIC_PRICING_MODE,
  defaultStudioMusicPricingModeForForm,
  studioMusicPricingModeAfterListenerFlip,
} from "../src/lib/studio-music/pricing";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20261009120300_studio_disable_new_free_music.sql"),
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
const pricing = readFileSync(
  join(repoRoot, "src/lib/studio-music/pricing.ts"),
  "utf8",
);

assert.match(migration, /guard_practices_no_new_studio_free/);
assert.match(migration, /practice_is_effective_studio_free/);
assert.match(migration, /studio_new_free_disabled/);
assert.doesNotMatch(
  migration.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"),
  /UNIQUE|author_id\)|COUNT\(|advisory/i,
);
assert.doesNotMatch(
  migration.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"),
  /UPDATE\s+public\.practices/i,
);

assert.equal(
  isEffectiveStudioFreeProduct({
    deleted_at: null,
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: "free",
  }),
  true,
);
assert.equal(
  isEffectiveStudioFreeProduct({
    deleted_at: null,
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: null,
    is_free: true,
    price: 0,
  }),
  true,
);
assert.equal(
  isEffectiveStudioFreeProduct({
    deleted_at: null,
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: null,
    is_free: false,
    price: 199,
  }),
  false,
);
assert.equal(
  isEffectiveStudioFreeProduct({
    deleted_at: "2026-09-18T00:00:00Z",
    music_usage_permission: "platform_reuse_allowed",
    studio_music_pricing_mode: "free",
  }),
  false,
);

const authorA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const authorB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const freeRow = {
  deleted_at: null,
  author_id: authorA,
  music_usage_permission: "platform_reuse_allowed",
  studio_music_pricing_mode: "free",
  is_free: true,
  price: 0,
};

assert.equal(
  isGrandfatheredStudioFreeContinuation({
    oldRow: freeRow,
    newRow: { ...freeRow, title: "x" } as typeof freeRow,
  }),
  true,
);
assert.equal(
  wouldCreateNewStudioFreeState({
    oldRow: null,
    newRow: freeRow,
  }),
  true,
  "INSERT FREE forbidden",
);
assert.equal(
  wouldCreateNewStudioFreeState({
    oldRow: {
      ...freeRow,
      studio_music_pricing_mode: "fixed",
      is_free: false,
      price: 499,
    },
    newRow: freeRow,
  }),
  true,
  "PAID→FREE forbidden",
);
assert.equal(
  wouldCreateNewStudioFreeState({
    oldRow: freeRow,
    newRow: freeRow,
  }),
  false,
  "grandfathered FREE continue allowed",
);
assert.equal(
  wouldCreateNewStudioFreeState({
    oldRow: freeRow,
    newRow: { ...freeRow, author_id: authorB },
  }),
  true,
  "FREE author transfer forbidden",
);
assert.equal(
  wouldCreateNewStudioFreeState({
    oldRow: {
      ...freeRow,
      deleted_at: "2026-09-18T00:00:00Z",
    },
    newRow: freeRow,
  }),
  true,
  "restore deleted FREE forbidden",
);
assert.equal(
  wouldCreateNewStudioFreeState({
    oldRow: freeRow,
    newRow: {
      ...freeRow,
      studio_music_pricing_mode: "fixed",
      is_free: false,
      price: 499,
    },
  }),
  false,
  "FREE→PAID allowed",
);

assert.equal(
  defaultStudioMusicPricingModeForForm({
    reuseAllowed: true,
    listenerIsFree: true,
  }),
  STUDIO_MUSIC_PRICING_MODE.FIXED,
);
assert.equal(
  defaultStudioMusicPricingModeForForm({
    reuseAllowed: true,
    listenerIsFree: false,
  }),
  STUDIO_MUSIC_PRICING_MODE.FIXED,
);
assert.equal(DEFAULT_STUDIO_MUSIC_FIXED_RUBLES, MIN_STUDIO_MUSIC_PRICE_RUBLES);
assert.equal(MIN_STUDIO_MUSIC_PRICE_RUBLES, 499);
assert.equal(
  studioMusicPricingModeAfterListenerFlip({
    reuseAllowed: true,
    listenerIsFree: true,
    currentMode: STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER,
  }),
  STUDIO_MUSIC_PRICING_MODE.FIXED,
);
assert.equal(
  studioMusicPricingModeAfterListenerFlip({
    reuseAllowed: true,
    listenerIsFree: true,
    currentMode: STUDIO_MUSIC_PRICING_MODE.FREE,
  }),
  STUDIO_MUSIC_PRICING_MODE.FREE,
);

assert.equal(
  isStudioNewFreeDisabledViolation({
    code: "P0001",
    message: "studio_new_free_disabled",
  }),
  true,
);
assert.equal(
  classifyProductSaveError({
    error: STUDIO_NEW_FREE_DISABLED,
    status: 409,
  }),
  "conflict",
);
assert.equal(
  getProductSaveErrorMessage({
    error: STUDIO_NEW_FREE_DISABLED,
    status: 409,
  }),
  STUDIO_NEW_FREE_DISABLED_MESSAGE,
);

assert.match(route, /studio_new_free_disabled|studioNewFreeDisabledResponseBody/);
assert.match(route, /wouldCreateNewStudioFreeState/);
assert.match(route, /isStudioNewFreeDisabledViolation/);
assert.doesNotMatch(route, /studio_free_slot_taken|FreeSlot|free-slot/);

assert.match(form, /STUDIO_NEW_FREE_POLICY_COPY\.newProductsPaidOnly/);
assert.match(form, /STUDIO_NEW_FREE_POLICY_COPY\.grandfatheredKept/);
assert.match(form, /Бесплатно — сохранено ранее/);
assert.doesNotMatch(form, /один бесплатный продукт/);
assert.match(
  form,
  /studioMusicPricingMode ===\s*\n?\s*STUDIO_MUSIC_PRICING_MODE\.FREE/,
);

assert.match(pricing, /return STUDIO_MUSIC_PRICING_MODE.FIXED/);
assert.doesNotMatch(
  pricing.split("defaultStudioMusicPricingModeForForm")[1].split("studioMusicPricingModeAfterListenerFlip")[0],
  /STUDIO_MUSIC_PRICING_MODE\.FREE/,
);

assert.equal(
  STUDIO_NEW_FREE_POLICY_COPY.newProductsPaidOnly.includes("499"),
  true,
);

const policySrc = readFileSync(
  join(repoRoot, "src/lib/studio-music/new-free-policy.ts"),
  "utf8",
);
assert.doesNotMatch(policySrc, /assertNoNewStudioFreeRequired|SupabaseClient/);

console.log("studio-music-new-free-policy-unit: ok");
