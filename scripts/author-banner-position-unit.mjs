#!/usr/bin/env node
import { readFileSync } from "node:fs";

import sharp from "sharp";

import {
  applyBannerPositionDragDelta,
  clampBannerPositionCoordinate,
  computeBannerCoverExcess,
  createManagedObjectUrl,
  DEFAULT_BANNER_POSITION_X,
  DEFAULT_BANNER_POSITION_Y,
  formatBannerObjectPosition,
  normalizeBannerPositionPair,
  normalizeStoredBannerPosition,
  parseBannerPositionCoordinate,
  revokeManagedObjectUrl,
} from "../src/lib/authors/banner-position.ts";
import { processImageForProfile } from "../src/lib/images/process-image.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testDefaults() {
  const defaults = normalizeStoredBannerPosition({});
  assert(defaults.x === 50 && defaults.y === 50, "defaults 50/50");
  assert(formatBannerObjectPosition(defaults) === "50% 50%", "default css");
}

function testSavePosition() {
  const saved = normalizeBannerPositionPair(50, 20);
  assert(saved?.y === 20, "save 50/20");
}

function testRejectInvalid() {
  assert(normalizeBannerPositionPair(-1, 50) === null, "reject x below 0");
  assert(normalizeBannerPositionPair(50, 101) === null, "reject y above 100");
  assert(normalizeBannerPositionPair("50", 20) === null, "reject string x");
  assert(normalizeBannerPositionPair(50, Number.NaN) === null, "reject NaN");
  assert(normalizeBannerPositionPair(Infinity, 50) === null, "reject Infinity");
}

function testResetContract() {
  const route = read("src/app/api/author/profile/[kind]/route.ts");
  assert(route.includes("banner_position_x: DEFAULT_BANNER_POSITION_X"), "reset x");
  assert(route.includes("banner_position_y: DEFAULT_BANNER_POSITION_Y"), "reset y");
}

function testPublicHeader() {
  const header = read("src/components/authors/AuthorPublicHeader.tsx");
  assert(header.includes("objectPosition={bannerObjectPosition}"), "public objectPosition");
  assert(header.includes("AUTHOR_DEFAULT_BANNER_PATH"), "default brand banner");
  assert(header.includes("AUTHOR_DEFAULT_AVATAR_PATH"), "default brand avatar");
  assert(header.includes("resolveAuthorPositioningText"), "positioning text resolver");
  assert(!header.includes("object-center"), "no object-center");
}

function testDashboardPreview() {
  const block = read("src/components/author-dashboard/AuthorBannerUploadBlock.tsx");
  assert(block.includes("style={{ objectPosition }}"), "dashboard objectPosition");
}

function testApiAuth() {
  const route = read("src/app/api/author/profile/banner-position/route.ts");
  assert(route.includes("requireAuthorMembership"), "auth check");
}

function testObjectUrl() {
  const file = new File(["banner"], "banner.jpg", { type: "image/jpeg" });
  const first = createManagedObjectUrl(file, null);
  const second = createManagedObjectUrl(file, first);
  assert(first.startsWith("blob:"), "blob url");
  assert(second !== first, "revoke on replace");
  revokeManagedObjectUrl(second);
}

function testDragBounds() {
  const excess = computeBannerCoverExcess(640, 160, 1200, 400);
  assert(excess.excessY > 0, "vertical excess");
  const dragged = applyBannerPositionDragDelta({ x: 50, y: 50 }, 0, 40, excess);
  assert(dragged.y < 50, "drag down decreases y");
  assert(clampBannerPositionCoordinate(-1) === 0, "clamp low");
}

function testMigration() {
  const migration = read("supabase/migrations/20260718180000_author_banner_position.sql");
  assert(migration.includes("banner_position_x"), "migration x");
  assert(migration.includes("DEFAULT 50"), "default 50");
}

async function testBannerPipelinePreservesVerticalComposition() {
  const source = await sharp({
    create: {
      width: 1774,
      height: 887,
      channels: 3,
      background: { r: 120, g: 80, b: 180 },
    },
  })
    .jpeg()
    .toBuffer();

  const result = await processImageForProfile(source, "image/jpeg", "author-banner", {
    skipOriginalStore: true,
  });

  assert(result.ok, "1774x887 banner processes successfully");
  const md = result.data.variants.find((variant) => variant.key === "md");
  assert(md, "md variant exists");
  assert(md.width === 1280, "md width capped at 1280");
  assert(md.height > 427, "md keeps vertical composition headroom");
  assert(Math.abs(md.width / md.height - 1774 / 887) < 0.02, "md preserves source aspect");

  const excess = computeBannerCoverExcess(640, 160, md.width, md.height);
  assert(excess.excessY > 0, "stored md variant has vertical pan room in editor frame");
}

function testBannerProfileUsesInsideFit() {
  const profiles = read("src/lib/images/image-profiles.ts");
  assert(profiles.includes('fit: "inside"'), "author banner variants use inside fit");
  assert(!profiles.includes("640, height: 213"), "legacy 3:1 cover crop removed");
}

testDefaults();
testSavePosition();
testRejectInvalid();
testResetContract();
testPublicHeader();
testDashboardPreview();
testApiAuth();
testObjectUrl();
testDragBounds();
testMigration();
testBannerProfileUsesInsideFit();
await testBannerPipelinePreservesVerticalComposition();
console.log("author-banner-position-unit: ok");
