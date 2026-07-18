#!/usr/bin/env node
/**
 * Per-track cover unit checks — safe to run without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testMigrationContract() {
  const sql = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260716180000_per_track_covers.sql",
    "utf8",
  );

  assert(sql.includes("use_shared_cover"), "practices.use_shared_cover column");
  assert(sql.includes("DEFAULT true"), "use_shared_cover defaults to true");
  assert(
    sql.includes("audio_items") && sql.includes("cover_url"),
    "audio_items.cover_url column",
  );
}

function testStorageHelpers() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/author-products/utils.ts",
    "utf8",
  );

  assert(
    source.includes("buildTrackCoverStoragePath"),
    "buildTrackCoverStoragePath helper",
  );
  assert(
    source.includes("track-covers"),
    "track cover storage path segment",
  );
  assert(
    source.includes("removeTrackCoverFiles"),
    "removeTrackCoverFiles helper",
  );
}

function testPlaybackResolver() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/products/cover-display.ts",
    "utf8",
  );

  assert(
    source.includes("resolvePlaybackCoverUrl"),
    "resolvePlaybackCoverUrl helper",
  );
  assert(
    source.includes("use_shared_cover === false"),
    "track override only when shared cover disabled",
  );
}

function testListenTrackType() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/listen/types.ts",
    "utf8",
  );

  assert(source.includes("coverImageUrl"), "ListenTrack.coverImageUrl field");
}

function testTrackCoverApiRoute() {
  const source = readFileSync(
    "/var/www/audiolad/src/app/api/author/products/[id]/audio/[audioId]/cover/route.ts",
    "utf8",
  );

  assert(source.includes("shared_cover_enabled"), "shared cover guard error code");
  assert(
    source.includes("Сначала отключите использование общей обложки"),
    "shared cover guard message",
  );
}

function testAuthorFormToggle() {
  const source = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/AuthorProductForm.tsx",
    "utf8",
  );

  assert(
    source.includes("Использовать общую обложку для всех треков"),
    "shared cover toggle label",
  );
  assert(source.includes("Обложка трека"), "track cover block label");
}

function testCoverUploadPreviewManifest() {
  const hookSource = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/useCoverUpload.ts",
    "utf8",
  );
  const blockSource = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/CoverUploadBlock.tsx",
    "utf8",
  );
  const formSource = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/AuthorProductForm.tsx",
    "utf8",
  );

  assert(hookSource.includes("coverImage"), "useCoverUpload accepts coverImage");
  assert(
    hookSource.includes("buildProductCoverResponsiveProps"),
    "useCoverUpload resolves manifest variants for preview",
  );
  assert(
    hookSource.includes("createObjectURL"),
    "useCoverUpload keeps local object URL before upload completes",
  );
  assert(
    blockSource.includes("ResponsiveCoverImage"),
    "CoverUploadBlock uses responsive manifest preview",
  );
  assert(
    formSource.includes("coverImage={audioItem.cover_image}"),
    "AuthorProductForm passes track coverImage to preview",
  );
  assert(
    formSource.includes("coverImage={form.coverImage}"),
    "AuthorProductForm passes product coverImage to preview",
  );
}

function testPlayerActiveCover() {
  const source = readFileSync(
    "/var/www/audiolad/src/components/audio/AudioPlayer.tsx",
    "utf8",
  );

  assert(source.includes("coverImageFailedUrl"), "track-scoped cover error state");
  assert(
    source.includes("coverImageFailedUrl !== activeCoverUrl"),
    "cover error reset on track/url change",
  );
}

const tests = [
  ["migration contract", testMigrationContract],
  ["storage helpers", testStorageHelpers],
  ["playback resolver", testPlaybackResolver],
  ["listen track type", testListenTrackType],
  ["track cover API route", testTrackCoverApiRoute],
  ["author form toggle", testAuthorFormToggle],
  ["cover upload manifest preview", testCoverUploadPreviewManifest],
  ["player active cover", testPlayerActiveCover],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok: ${name}`);
}

console.log(`\n${tests.length} per-track cover checks passed.`);
