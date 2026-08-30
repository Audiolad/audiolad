/**
 * Music playlist items: one concrete audio_item per row, not the album.
 * Run: npx --yes tsx scripts/playlists-music-track-items-unit.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildOwnerPlaylistQueue,
  buildPublicPlaylistQueue,
} from "../src/lib/playlists/build-playlist-queue.ts";
import {
  matchesPlaylistQueueEntry,
  playlistItemKey,
} from "../src/lib/playlists/playlist-item-identity.ts";
import {
  isAudioItemQueueEntry,
  isProductQueueEntry,
} from "../src/lib/playlists/player-queue-types.ts";
import {
  isEditorialPracticeTrackExpandable,
  resolveEditorialPracticeAlreadyAdded,
} from "../src/lib/playlists/editorial-practices.ts";
import { parseEditorialPracticesPostBody } from "../src/lib/playlists/validation.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const albumId = "11111111-1111-4111-8111-111111111111";
const otherAlbumId = "22222222-2222-4222-8222-222222222222";
const track1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const track2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const track5 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const parsed = parseEditorialPracticesPostBody({
  items: [
    { practiceId: albumId, audioItemId: track2 },
    { practiceId: albumId, audioItemId: track1 },
    { practiceId: otherAlbumId, audioItemId: track5 },
  ],
});

assert(parsed.ok === true, "parser accepts multiple tracks of one album");
assert(parsed.items.length === 3, "three independent items");
assert(
  parsed.items[0].practiceId === parsed.items[1].practiceId &&
    parsed.items[0].audioItemId !== parsed.items[1].audioItemId,
  "same album, different track ids",
);
assert(
  parsed.items.every((item) => item.audioItemId),
  "each item stores a track id",
);
assert(
  parseEditorialPracticesPostBody({
    items: [
      { practiceId: albumId, audioItemId: track2 },
      { practiceId: albumId, audioItemId: track2 },
    ],
  }).ok === false,
  "duplicate protection for the same track",
);
assert(
  parseEditorialPracticesPostBody({ practiceIds: [albumId] }).ok === true,
  "legacy practiceIds body still parses as product items",
);

const practiceId = "33333333-3333-4333-8333-333333333333";
const practiceTrackA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const practiceTrackB = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const mixed = parseEditorialPracticesPostBody({
  items: [
    { practiceId, audioItemId: practiceTrackA },
    { practiceId, audioItemId: practiceTrackB },
    { practiceId: albumId, audioItemId: track1 },
  ],
});
assert(mixed.ok === true, "parser accepts practice tracks with a music track");
assert(mixed.items.length === 3, "practice + album tracks stay independent items");
assert(
  mixed.items[0].practiceId === practiceId &&
    mixed.items[2].practiceId === albumId,
  "mixed selection keeps both product ids",
);
assert(
  parseEditorialPracticesPostBody({
    items: [
      { practiceId, audioItemId: practiceTrackA },
      { practiceId, audioItemId: practiceTrackA },
    ],
  }).ok === false,
  "same practice track cannot be queued twice",
);
assert(
  parseEditorialPracticesPostBody({
    items: [{ practiceId, audioItemId: null }],
  }).ok === true,
  "single practice still adds as a whole-product card",
);

assert(
  isEditorialPracticeTrackExpandable("practice", 0) === false,
  "zero-track practice stays flat",
);
assert(
  isEditorialPracticeTrackExpandable("practice", 1) === false,
  "single-track practice stays a flat card",
);
assert(
  isEditorialPracticeTrackExpandable("practice", 2) === true,
  "practice expands only when published audio count > 1",
);
assert(
  isEditorialPracticeTrackExpandable("practice", 10) === true,
  "practice with 10 audios expands",
);
assert(
  isEditorialPracticeTrackExpandable("music", 0) === false,
  "empty music album stays flat",
);
assert(
  isEditorialPracticeTrackExpandable("music", 1) === true,
  "music still expands when tracks.length > 0",
);
assert(
  isEditorialPracticeTrackExpandable("music", 10) === true,
  "music albums with many tracks still expand",
);

assert(
  resolveEditorialPracticeAlreadyAdded({
    productKind: "practice",
    tracks: [{ alreadyAdded: false }],
    productAlreadyAdded: true,
  }) === true,
  "whole-product playlist_item still blocks a flat practice",
);
assert(
  resolveEditorialPracticeAlreadyAdded({
    productKind: "practice",
    tracks: [{ alreadyAdded: true }],
    productAlreadyAdded: false,
  }) === true,
  "already-added single audio still blocks a flat practice",
);
assert(
  resolveEditorialPracticeAlreadyAdded({
    productKind: "practice",
    tracks: [
      { alreadyAdded: true },
      { alreadyAdded: false },
      { alreadyAdded: false },
    ],
    productAlreadyAdded: false,
  }) === false,
  "partially added multi-track practice stays selectable",
);
assert(
  resolveEditorialPracticeAlreadyAdded({
    productKind: "practice",
    tracks: [
      { alreadyAdded: true },
      { alreadyAdded: true },
      { alreadyAdded: true },
    ],
    productAlreadyAdded: false,
  }) === true,
  "all published practice tracks already in playlist_items block add-all",
);
assert(
  resolveEditorialPracticeAlreadyAdded({
    productKind: "music",
    tracks: [{ alreadyAdded: true }, { alreadyAdded: true }],
    productAlreadyAdded: false,
  }) === true,
  "music album alreadyAdded stays track-based",
);
assert(
  resolveEditorialPracticeAlreadyAdded({
    productKind: "music",
    tracks: [],
    productAlreadyAdded: true,
  }) === false,
  "empty music album alreadyAdded stays false even if product row exists",
);

const publicItems = [
  {
    practiceId: albumId,
    audioItemId: track2,
    position: 1,
    title: "Track 2",
    authorName: "Artist",
    authorSlug: "artist",
    formatLabel: "Музыка",
    metaLabel: "03:12",
    coverDisplayUrl: null,
    available: true,
    href: "/listen/artist/album-a",
  },
  {
    practiceId: albumId,
    audioItemId: track1,
    position: 2,
    title: "Track 1",
    authorName: "Artist",
    authorSlug: "artist",
    formatLabel: "Музыка",
    metaLabel: "02:40",
    coverDisplayUrl: null,
    available: true,
    href: "/listen/artist/album-a",
  },
  {
    practiceId: otherAlbumId,
    audioItemId: track5,
    position: 3,
    title: "Track 5",
    authorName: "Other",
    authorSlug: "other",
    formatLabel: "Музыка",
    metaLabel: "04:01",
    coverDisplayUrl: null,
    available: true,
    href: "/listen/other/album-b",
  },
];

const pub = buildPublicPlaylistQueue({
  playlistSlug: "music-mix",
  title: "Music mix",
  items: publicItems,
});

assert(pub.ok, "public queue builds for three tracks");
assert(pub.queue.entries.length === 3, "three independent queue entries");
assert(
  pub.queue.entries.every(isAudioItemQueueEntry),
  "music tracks use audio_item kind",
);
assert(
  new Set(pub.queue.entries.map((entry) => entry.audioItemId)).size === 3,
  "queue keeps three distinct track ids",
);
assert(
  pub.queue.entries[0].practiceId === pub.queue.entries[1].practiceId,
  "first two share the album product",
);
assert(
  pub.queue.entries[0].title === "Track 2" &&
    pub.queue.entries[1].title === "Track 1",
  "titles stay track-level",
);
assert(
  !pub.queue.entries.some((entry) => entry.title.includes("Track 3")),
  "unselected album track is absent",
);

const startAtSecond = buildPublicPlaylistQueue({
  playlistSlug: "music-mix",
  title: "Music mix",
  items: publicItems,
  startIndex: 1,
});
assert(startAtSecond.ok, "startIndex queue builds");
assert(startAtSecond.queue.currentIndex === 1, "row play uses startIndex");
assert(
  matchesPlaylistQueueEntry(startAtSecond.queue.entries[1], publicItems[1]),
  "startIndex lands on that track, not the album",
);
assert(
  !matchesPlaylistQueueEntry(startAtSecond.queue.entries[0], publicItems[1]),
  "same album different track is not current",
);

const keys = publicItems.map((item) =>
  playlistItemKey(item.practiceId, item.audioItemId),
);
assert(new Set(keys).size === 3, "no React key collision for same album");

const owner = buildOwnerPlaylistQueue({
  playlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Owner mix",
  items: publicItems.map((item) => ({
    ...item,
    unavailableReason: null,
    listenHref: item.href,
  })),
});
assert(owner.ok, "owner queue builds");
assert(owner.queue.entries.length === 3, "owner keeps independent tracks");
assert(owner.queue.entries.every(isAudioItemQueueEntry), "owner uses audio_item");

const legacyProduct = buildPublicPlaylistQueue({
  playlistSlug: "old-album",
  title: "Old album playlist",
  items: [
    {
      practiceId: albumId,
      audioItemId: null,
      position: 1,
      title: "Whole album",
      authorName: "Artist",
      authorSlug: "artist",
      formatLabel: "Музыка",
      metaLabel: "3 аудио",
      coverDisplayUrl: null,
      available: true,
      href: "/listen/artist/album-a",
    },
  ],
});
assert(legacyProduct.ok, "legacy product item still queues");
assert(
  isProductQueueEntry(legacyProduct.queue.entries[0]),
  "null audioItemId stays product-level for old playlists",
);

const picker = read("src/components/playlists/EditorialPracticePickerSheet.tsx");
assert(picker.includes("Добавить весь альбом"), "add-all is extra album action");
assert(picker.includes("toggleExpanded"), "album expands to tracks");
assert(picker.includes("track.id"), "each track is independently selectable");
assert(
  picker.includes("isEditorialPracticeTrackExpandable"),
  "picker reuses expand helper instead of a second component",
);
assert(
  picker.includes("items: Array.from(selectedIds).map(parseSelectedKey)"),
  "submit sends track items, not only album ids",
);
assert(
  picker.includes("canUserEditEditorialPlaylist") === false,
  "picker stays on existing editorial access path",
);

const loader = read("src/lib/playlists/editorial-practices.ts");
assert(
  loader.includes("const tracks = (tracksByPractice.get(row.id) ?? []).map"),
  "loader attaches published tracks for every product kind",
);
assert(
  /const tracks = isMusic\s*\?/.test(loader) === false,
  "tracks are no longer gated on isMusicProductKind",
);
assert(
  loader.includes("loadPublishedAudioItemsByPracticeIds"),
  "published audio rows stay the source of track count",
);

const api = read("src/app/api/playlists/[id]/editorial-practices/route.ts");
assert(api.includes("canUserEditEditorialPlaylist"), "Olga path unchanged");
assert(api.includes("p_audio_item_ids"), "API writes audio item ids");

const migration = read(
  "supabase/migrations/20260818180000_playlist_item_audio_track.sql",
);
assert(migration.includes("ADD COLUMN IF NOT EXISTS audio_item_id"), "nullable track column");
assert(
  migration.includes("playlist_items_playlist_product_unique_idx"),
  "legacy product uniqueness kept",
);
assert(
  migration.includes("playlist_items_playlist_audio_item_unique_idx"),
  "track uniqueness is per audio_item_id",
);
assert(
  migration.includes("can_user_edit_playlist"),
  "add RPC keeps direction-editor authority",
);

const player = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
assert(
  player.includes('entry.kind !== "product" && entry.kind !== "audio_item"'),
  "player activates reserved audio_item entries",
);
assert(player.includes("tracks: [track]"), "single track plays alone");

console.log("PLAYLISTS_MUSIC_TRACK_ITEMS_UNIT_PASS");
