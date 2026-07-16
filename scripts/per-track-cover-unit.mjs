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
  ["player active cover", testPlayerActiveCover],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok: ${name}`);
}

console.log(`\n${tests.length} per-track cover checks passed.`);
