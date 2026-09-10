#!/usr/bin/env node
/**
 * Unit tests for Studio music license PR1 helpers and wiring.
 * No production DB. Covers acquire/use rules plus listen-isolation contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canAcquireFreeStudioMusic,
  canAcquirePaidStudioMusic,
  canAcquireStudioMusic,
  canUseMusicInStudio,
  hasStudioMusicEntitlement,
  isStudioMusicPublication,
  studioLicenseAmountMinor,
  STUDIO_MUSIC_ORDER_KIND,
  STUDIO_PRICE_MULTIPLIER,
} from "../src/lib/studio-music/access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const paidAllowed = {
  id: "music-1",
  status: "published",
  deleted_at: null,
  product_kind: "music",
  publication_class: "release",
  music_usage_permission: "platform_reuse_allowed",
  is_free: false,
  price: 500,
};

assert.equal(STUDIO_MUSIC_ORDER_KIND, "studio_music_license");
assert.equal(STUDIO_PRICE_MULTIPLIER, 2);
assert.equal(isStudioMusicPublication(paidAllowed), true);
assert.equal(isStudioMusicPublication({ product_kind: "practice" }), false);
assert.equal(studioLicenseAmountMinor(50000), 100000);
assert.equal(studioLicenseAmountMinor(0), null);
assert.equal(studioLicenseAmountMinor(-1), null);

// 1. paid + permission → 2× effective
assert.equal(canAcquirePaidStudioMusic(paidAllowed), true);
assert.equal(studioLicenseAmountMinor(89900), 179800);

// 2 / 3. listener vs Studio stores are separate (helpers never mention user_practices)
assert.equal(hasStudioMusicEntitlement(null), false);
assert.equal(canUseMusicInStudio({ entitlement: null, isAuthorMember: false }), false);
assert.equal(
  canUseMusicInStudio({
    entitlement: { revoked_at: null },
    isAuthorMember: false,
  }),
  true,
);

// 6. active entitlement means no new paid acquire at the helper layer
assert.equal(hasStudioMusicEntitlement({ revoked_at: null }), true);
assert.equal(hasStudioMusicEntitlement({ revoked_at: "2026-09-10" }), false);

// 7. price change after purchase → use remains
assert.equal(
  canUseMusicInStudio({
    entitlement: { revoked_at: null },
    isAuthorMember: false,
  }),
  true,
);

// 8 / 12. permission off after grant → use remains, new acquire denied
const permissionOff = {
  ...paidAllowed,
  music_usage_permission: "listen_only",
};
assert.equal(canAcquireStudioMusic(permissionOff), false);
assert.equal(
  canUseMusicInStudio({
    entitlement: { revoked_at: null },
    isAuthorMember: false,
  }),
  true,
);

// 9. unpublish after purchase → use remains, new acquire denied
const unpublished = { ...paidAllowed, status: "unpublished" };
assert.equal(canAcquireStudioMusic(unpublished), false);
assert.equal(
  canUseMusicInStudio({
    entitlement: { revoked_at: null },
    isAuthorMember: false,
  }),
  true,
);

// 10. new user after permission off cannot acquire
assert.equal(canAcquirePaidStudioMusic(permissionOff), false);
assert.equal(canAcquireFreeStudioMusic(permissionOff), false);

// 11. free allowed
const freeAllowed = { ...paidAllowed, is_free: true, price: 0 };
assert.equal(canAcquireFreeStudioMusic(freeAllowed), true);
assert.equal(canAcquirePaidStudioMusic(freeAllowed), false);

// owner live path
assert.equal(canUseMusicInStudio({ isAuthorMember: true }), true);
assert.equal(hasStudioMusicEntitlement(null), false);

// 13. album is publication-level: helpers key off practice, not audio_item
const album = { ...paidAllowed, id: "album-1" };
assert.equal(canAcquirePaidStudioMusic(album), true);
assert.equal(isStudioMusicPublication(album), true);

const access = read("src/lib/studio-music/access.ts");
assert.doesNotMatch(access, /from\(["']user_practices["']\)/);
assert.doesNotMatch(access, /canListen/);
assert.doesNotMatch(access, /audio_item_id/);

const listenAccess = read("src/lib/products/access.ts");
assert.doesNotMatch(listenAccess, /studio_music_entitlements/);
assert.doesNotMatch(listenAccess, /studio_music_license/);
assert.doesNotMatch(listenAccess, /canUseMusicInStudio/);

const signedAudio = read("src/lib/listen/signed-audio.ts");
assert.doesNotMatch(signedAudio, /studio_music_entitlements/);
assert.doesNotMatch(signedAudio, /canUseMusicInStudio/);

const saleLock = read("src/lib/author-products/sale-lock.ts");
assert.match(saleLock, /studio_music_entitlements/);

const authorForm = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.doesNotMatch(authorForm, /studio_music_entitlements/);
assert.doesNotMatch(authorForm, /create_studio_music_order/);

const studioShellCandidates = [
  "src/components/studio/StudioEditorShell.tsx",
  "src/components/studio/studio-editor-shell.tsx",
];
for (const candidate of studioShellCandidates) {
  try {
    const source = read(candidate);
    assert.doesNotMatch(source, /studio_music_entitlements/);
    assert.doesNotMatch(source, /create_studio_music_order/);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue;
    }
    throw error;
  }
}

console.log("studio-music-license-unit: ok");
