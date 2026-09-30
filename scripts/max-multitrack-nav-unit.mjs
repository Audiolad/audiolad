/**
 * Album tracks navigate inside the authorized session.
 * Playlist Previous / Next walk the external queue and request a new session per row.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  decideMaxProductTrackAction,
  formatMaxQueuePositionLabel,
  nextMaxTrackIndex,
  previousMaxTrackIndex,
  resolveMaxAuthorizedTrackIndex,
  visibleMaxQueuePositionLabel,
} from "../src/lib/max/max-audio-playback.ts";
import {
  maxPlaylistPlaybackSessionBody,
  nextMaxPlaylistQueueIndex,
  previousMaxPlaylistQueueIndex,
} from "../src/lib/max/playlist-queue.ts";

const album = Array.from({ length: 10 }, (_, index) => ({
  trackId: `track-${index + 1}`,
}));
assert.equal(album.length, 10);

const fifth = resolveMaxAuthorizedTrackIndex(album, "track-5");
assert.equal(fifth, 4);
assert.deepEqual(
  decideMaxProductTrackAction({
    tracks: album,
    audioItemId: "track-5",
    activeTrackId: null,
    listenArmed: false,
    isPlaying: false,
  }),
  { type: "select", index: 4 },
);
assert.equal(resolveMaxAuthorizedTrackIndex(album, "Трек 5"), null);

let index = fifth;
assert.equal(nextMaxTrackIndex(index, album.length), 5);
index = 5;
assert.equal(previousMaxTrackIndex(index, album.length), 4);
index = 4;
assert.equal(nextMaxTrackIndex(index, album.length), 5);
assert.equal(previousMaxTrackIndex(0, album.length), null);
assert.equal(nextMaxTrackIndex(0, album.length), 1);
assert.equal(nextMaxTrackIndex(9, album.length), null);
assert.equal(previousMaxTrackIndex(9, album.length), 8);
assert.equal(previousMaxTrackIndex(0, 1), null);
assert.equal(nextMaxTrackIndex(0, 1), null);
assert.equal(formatMaxQueuePositionLabel(0, 10), "Трек 1 из 10");
assert.equal(formatMaxQueuePositionLabel(4, 10), "Трек 5 из 10");
assert.equal(formatMaxQueuePositionLabel(9, 10), "Трек 10 из 10");
assert.equal(
  visibleMaxQueuePositionLabel({
    externalIndex: null,
    externalLength: null,
    trackIndex: 4,
    trackCount: 10,
    showInternalNavigation: true,
  }),
  "Трек 5 из 10",
);
assert.equal(
  visibleMaxQueuePositionLabel({
    externalIndex: null,
    externalLength: null,
    trackIndex: 0,
    trackCount: 1,
    showInternalNavigation: true,
  }),
  null,
);
assert.equal(
  visibleMaxQueuePositionLabel({
    externalIndex: null,
    externalLength: null,
    trackIndex: 0,
    trackCount: 1,
    showInternalNavigation: false,
  }),
  null,
);

assert.deepEqual(
  decideMaxProductTrackAction({
    tracks: album,
    audioItemId: "track-5",
    activeTrackId: "track-5",
    listenArmed: true,
    isPlaying: true,
  }),
  { type: "pause" },
);
assert.deepEqual(
  decideMaxProductTrackAction({
    tracks: album,
    audioItemId: "track-5",
    activeTrackId: "track-5",
    listenArmed: true,
    isPlaying: false,
  }),
  { type: "resume" },
);
assert.deepEqual(
  decideMaxProductTrackAction({
    tracks: album,
    audioItemId: "track-6",
    activeTrackId: "track-5",
    listenArmed: true,
    isPlaying: true,
  }),
  { type: "select", index: 5 },
);

const previewSession = [{ trackId: "preview-track" }];
assert.deepEqual(
  decideMaxProductTrackAction({
    tracks: previewSession,
    audioItemId: "track-5",
    activeTrackId: null,
    listenArmed: false,
    isPlaying: false,
  }),
  { type: "ignore" },
);
assert.deepEqual(
  decideMaxProductTrackAction({
    tracks: previewSession,
    audioItemId: "preview-track",
    activeTrackId: null,
    listenArmed: false,
    isPlaying: false,
  }),
  { type: "select", index: 0 },
);
assert.equal(resolveMaxAuthorizedTrackIndex(previewSession, "foreign-track"), null);

function playlistRow(key, available, audioItemId) {
  return {
    key,
    available,
    authorSlug: available ? "anna" : null,
    productSlug: available ? key : null,
    audioItemId,
  };
}

const playlist = [
  playlistRow("one", true, "audio-1"),
  playlistRow("two", true, "audio-2"),
  playlistRow("gap", false, "audio-gap"),
  playlistRow("three", true, "audio-3"),
];
assert.equal(playlist.filter((item) => item.available).length, 3);
assert.equal(previousMaxPlaylistQueueIndex(playlist, 0), null);
assert.equal(nextMaxPlaylistQueueIndex(playlist, 0), 1);
assert.equal(previousMaxPlaylistQueueIndex(playlist, 1), 0);
assert.equal(nextMaxPlaylistQueueIndex(playlist, 1), 3);
assert.equal(previousMaxPlaylistQueueIndex(playlist, 3), 1);
assert.equal(nextMaxPlaylistQueueIndex(playlist, 3), null);
assert.equal(nextMaxPlaylistQueueIndex(playlist, 0, new Set([1])), 3);
assert.equal(previousMaxPlaylistQueueIndex(playlist, 3, new Set([1])), 0);

const sessionBodies = [];
for (let cursor = 0; cursor != null; cursor = nextMaxPlaylistQueueIndex(playlist, cursor)) {
  sessionBodies.push(maxPlaylistPlaybackSessionBody(playlist[cursor]));
}
assert.deepEqual(sessionBodies, [
  { authorSlug: "anna", productSlug: "one", audioItemId: "audio-1" },
  { authorSlug: "anna", productSlug: "two", audioItemId: "audio-2" },
  { authorSlug: "anna", productSlug: "three", audioItemId: "audio-3" },
]);
assert.equal(maxPlaylistPlaybackSessionBody(playlist[2]), null);
assert.equal(
  visibleMaxQueuePositionLabel({
    externalIndex: 2,
    externalLength: 8,
    trackIndex: 0,
    trackCount: 1,
    showInternalNavigation: true,
  }),
  "Трек 3 из 8",
);
assert.equal(
  visibleMaxQueuePositionLabel({
    externalIndex: 1,
    externalLength: playlist.length,
    trackIndex: 0,
    trackCount: 1,
    showInternalNavigation: true,
  }),
  "Трек 2 из 4",
);

const root = process.cwd();
const read = (relative) => readFileSync(join(root, relative), "utf8");
const player = read("src/components/max/MaxAudioPlayer.tsx");
const hook = read("src/components/max/useMaxAudioPlayback.ts");
const home = read("src/components/max/MaxAuthenticatedHome.tsx");
const detail = read("src/components/max/MaxPlaylistDetail.tsx");
const productView = read("src/components/max/MaxProductDetailView.tsx");
const productLoader = read("src/lib/max/product.ts");
const sessionRoute = read("src/app/api/max/playback/session/route.ts");
const storefrontPreview = read("src/lib/max/storefront-preview.ts");

assert.match(hook, /nextMaxTrackIndex\(trackIndex, tracks\.length\)/);
assert.match(hook, /void loadTrack\(next, true\)/);
assert.doesNotMatch(hook, /externalQueue|productKind|product_kind/);
assert.doesNotMatch(player, /productKind|product_kind/);
assert.match(player, /shouldShowMaxTrackNavigation\(session\.playbackMode\)/);
assert.match(player, /externalQueue \? externalQueue\.onPrevious : previousTrack/);
assert.match(player, /externalQueue \? externalQueue\.onNext : nextTrack/);
assert.match(player, /onBindSelectTrack\?\.\(selectTrack\)/);
assert.match(player, /visibleMaxQueuePositionLabel/);
assert.match(player, /!usesExternalQueue && \(showNavigation \|\| session\.tracks\.length > 1\)/);

assert.match(home, /decideMaxProductTrackAction/);
assert.match(home, /onBindSelectTrack=\{bindSelectTrack\}/);
assert.match(home, /PLAY_ACTION_LABEL/);
assert.doesNotMatch(home, /audio_path|practiceId/);
const productSession = home.slice(
  home.indexOf("MAX_PLAYBACK_SESSION_PATH"),
  home.indexOf("function applyGuestHomeSlide"),
);
assert.match(productSession, /authorSlug: selected\.authorSlug/);
assert.match(productSession, /productSlug: selected\.slug/);
assert.doesNotMatch(productSession, /audioItemId/);
const pressTrack = home.slice(
  home.indexOf("function pressProductTrack"),
  home.indexOf("const activeTabLabel"),
);
assert.match(pressTrack, /decideMaxProductTrackAction/);
assert.match(pressTrack, /selectTrackRef\.current\(decision\.index\)/);
assert.doesNotMatch(pressTrack.slice(pressTrack.indexOf("{")), /fetch\(|MAX_PLAYBACK_|audioItemId\s*:/);

assert.match(productView, /onPressTrack\(track\.audioItemId\)/);
assert.doesNotMatch(productView, /onPressTrack\(track\.title\)/);
assert.match(productLoader, /toMaxProductContentTracks\(tracks\)/);
assert.doesNotMatch(productLoader, /audio_path/);

assert.match(detail, /narrowMaxPlaybackSession/);
assert.match(detail, /maxPlaylistPlaybackSessionBody\(item\)/);
assert.match(detail, /previousMaxPlaylistQueueIndex/);
assert.match(detail, /startAt\(queueEnds\.previous, true\)/);
assert.match(detail, /startAt\(queueEnds\.next, true\)/);
assert.match(detail, /externalQueue/);

assert.match(sessionRoute, /readOptionalAudioItemId/);
assert.match(sessionRoute, /invalid_request/);
assert.match(storefrontPreview, /chooseCatalogPreviewAudioRow/);
assert.match(storefrontPreview, /allowedAudioItemIds/);

console.log("max-multitrack-nav-unit: ok");
