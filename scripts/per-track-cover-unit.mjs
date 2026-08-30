#!/usr/bin/env node
/**
 * Per-track cover unit checks — safe to run without database access.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Mirrors listen-player-shared showCoverImage predicate. */
function isCoverVisible(failed, trackId, url) {
  return (
    Boolean(url) &&
    !(failed?.trackId === trackId && failed.url === url)
  );
}

function testMigrationContract() {
  const sql = readSource(
    "supabase/migrations/20260716181000_per_track_covers.sql",
  );

  assert(sql.includes("use_shared_cover"), "practices.use_shared_cover column");
  assert(sql.includes("DEFAULT true"), "use_shared_cover defaults to true");
  assert(
    sql.includes("audio_items") && sql.includes("cover_url"),
    "audio_items.cover_url column",
  );
}

function testStorageHelpers() {
  const source = readSource("src/lib/author-products/utils.ts");

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
  const source = readSource("src/lib/products/cover-display.ts");

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
  const source = readSource("src/lib/listen/types.ts");

  assert(source.includes("coverImageUrl"), "ListenTrack.coverImageUrl field");
}

function testTrackCoverApiRoute() {
  const source = readSource(
    "src/app/api/author/products/[id]/audio/[audioId]/cover/route.ts",
  );

  assert(source.includes("shared_cover_enabled"), "shared cover guard error code");
  assert(
    source.includes("Сначала отключите использование общей обложки"),
    "shared cover guard message",
  );
}

function testAuthorFormToggle() {
  const source = readSource(
    "src/components/author-dashboard/AuthorProductForm.tsx",
  );

  assert(
    source.includes("Использовать общую обложку для всех треков"),
    "shared cover toggle label",
  );
  assert(source.includes("Обложка трека"), "track cover block label");
}

function testCoverUploadPreviewManifest() {
  const hookSource = readSource(
    "src/components/author-dashboard/useCoverUpload.ts",
  );
  const blockSource = readSource(
    "src/components/author-dashboard/CoverUploadBlock.tsx",
  );
  const formSource = readSource(
    "src/components/author-dashboard/AuthorProductForm.tsx",
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
  const source = readSource("src/components/audio/listen-player-shared.tsx");
  const legacy = readSource("src/components/audio/AudioPlayer.tsx");

  assert(source.includes("coverImageFailedTrack"), "track-scoped cover error state");
  assert(
    source.includes("trackId: activeCoverTrackId"),
    "cover error records the active track identity",
  );
  assert(
    source.includes("coverImageFailedTrack?.trackId === activeCoverTrackId"),
    "cover error is isolated to its track",
  );
  assert(
    source.includes("coverImageFailedTrack.url === activeCoverUrl"),
    "cover error resets when that track cover URL changes",
  );
  assert(
    source.includes("currentTrack?.coverImageUrl ?? coverImageUrl"),
    "track cover preferred over product-level cover URL",
  );
  assert(
    !legacy.includes("coverImageFailedTrack") &&
      !legacy.includes("coverImageFailedUrl"),
    "legacy AudioPlayer re-export is not the cover error source",
  );
}

function testPlaylistDetailSelectsUseSharedCover() {
  const detail = readSource("src/lib/playlists/detail.ts");
  const editorial = readSource("src/lib/playlists/editorial-workspace-detail.ts");
  const pub = readSource("src/lib/playlists/public-detail.ts");
  const presentation = readSource("src/lib/playlists/playlist-item-audio.ts");

  for (const [name, source] of [
    ["owned PlaylistDetail", detail],
    ["editorial workspace", editorial],
    ["public playlist", pub],
  ]) {
    assert(
      source.includes("use_shared_cover"),
      `${name} PracticeEmbed/SELECT includes use_shared_cover`,
    );
    assert(
      source.includes("resolvePlaylistItemPresentation"),
      `${name} keeps shared presentation resolver`,
    );
    assert(
      !source.includes("resolvePlaybackCoverUrl"),
      `${name} does not add parallel cover URL logic`,
    );
  }

  assert(
    presentation.includes("use_shared_cover?: boolean | null"),
    "presentation input forwards use_shared_cover",
  );
  assert(
    presentation.includes("resolvePlaybackCoverFields"),
    "playlist items still use resolvePlaybackCoverFields",
  );
}

function testCoverErrorIsolationSemantics() {
  const failedA = { trackId: "track-a", url: "https://cdn.example/a.jpg" };
  const failedB = { trackId: "track-b", url: "https://cdn.example/b.jpg" };
  const productFailed = {
    trackId: null,
    url: "https://cdn.example/product.jpg",
  };

  assert(
    isCoverVisible(failedA, "track-a", "https://cdn.example/a.jpg") === false,
    "failed track hides its own cover",
  );
  assert(
    isCoverVisible(failedA, "track-b", "https://cdn.example/b.jpg") === true,
    "error of one track does not hide another track cover",
  );
  assert(
    isCoverVisible(failedB, "track-a", "https://cdn.example/a.jpg") === true,
    "second track failure does not hide the first track cover",
  );
  assert(
    isCoverVisible(failedA, "track-a", "https://cdn.example/a-v2.jpg") === true,
    "successful cover URL change clears error for that track",
  );
  assert(
    isCoverVisible(null, "track-a", "https://cdn.example/a.jpg") === true,
    "cleared failure state shows cover again",
  );
  assert(
    isCoverVisible(failedA, "track-b", "https://cdn.example/a.jpg") === true,
    "stale failed track id is ignored after track switch",
  );
  assert(
    isCoverVisible(productFailed, "track-a", "https://cdn.example/a.jpg") ===
      true,
    "product-level failure does not hide a track-level cover",
  );
  assert(
    isCoverVisible(
      productFailed,
      null,
      "https://cdn.example/product.jpg",
    ) === false,
    "product-level failure still applies when active cover has no track id",
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
  ["cover error isolation semantics", testCoverErrorIsolationSemantics],
  ["playlist detail use_shared_cover", testPlaylistDetailSelectsUseSharedCover],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok: ${name}`);
}

console.log(`\n${tests.length} per-track cover checks passed.`);
