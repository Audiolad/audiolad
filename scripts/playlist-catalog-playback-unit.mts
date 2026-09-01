import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPublicPlaylistQueue } from "../src/lib/playlists/build-playlist-queue";
import {
  buildPlaylistCatalogQueue,
  buildPublicPlaylistDetailApiUrl,
  pressPlaylistCatalogPlayback,
  resolvePlaylistCatalogPlaybackState,
  shouldReloadPlaylistCatalogQueue,
  startPlaylistCatalogPlayback,
  toPublicPlaylistDetailHttpResult,
} from "../src/lib/playlists/catalog-playback";
import type { PublicPlaylistItemView } from "../src/lib/playlists/public-detail";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const publicItems = [
  {
    practiceId: "11111111-1111-4111-8111-111111111111",
    audioItemId: null,
    position: 1,
    title: "Free",
    authorName: "A",
    authorSlug: "a",
    formatLabel: null,
    metaLabel: null,
    durationLabel: null,
    durationSeconds: 60,
    productSlug: "free-one",
    productHref: "/practice/a/free-one",
    available: true,
    href: "/listen/a/free-one",
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
  },
  {
    practiceId: "22222222-2222-4222-8222-222222222222",
    audioItemId: null,
    position: 2,
    title: "Paid",
    authorName: "A",
    authorSlug: "a",
    formatLabel: null,
    metaLabel: null,
    durationLabel: null,
    durationSeconds: 60,
    productSlug: "paid-one",
    productHref: "/practice/a/paid-one",
    available: true,
    href: "/listen/a/paid-one",
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
  },
  {
    practiceId: "33333333-3333-4333-8333-333333333333",
    audioItemId: null,
    position: 3,
    title: "Missing audio",
    authorName: "A",
    authorSlug: "a",
    formatLabel: null,
    metaLabel: null,
    durationLabel: null,
    durationSeconds: null,
    productSlug: "gone",
    productHref: "/practice/a/gone",
    available: false,
    href: "/practice/a/gone",
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
  },
] as PublicPlaylistItemView[];

function testPlaybackStates() {
  assert.equal(
    resolvePlaylistCatalogPlaybackState({
      slug: "morning",
      activeQueue: null,
      isPlaying: false,
    }),
    "idle",
  );
  assert.equal(
    resolvePlaylistCatalogPlaybackState({
      slug: "morning",
      activeQueue: {
        source: {
          kind: "public_playlist",
          playlistSlug: "morning",
          returnHref: "/playlists/catalog",
        },
      },
      isPlaying: true,
    }),
    "playing",
  );
  assert.equal(
    resolvePlaylistCatalogPlaybackState({
      slug: "morning",
      activeQueue: {
        source: {
          kind: "public_playlist",
          playlistSlug: "morning",
          returnHref: "/playlists/catalog",
        },
      },
      isPlaying: false,
    }),
    "paused",
  );
  assert.equal(
    resolvePlaylistCatalogPlaybackState({
      slug: "morning",
      activeQueue: {
        source: {
          kind: "public_playlist",
          playlistSlug: "evening",
          returnHref: "/p/evening",
        },
      },
      isPlaying: true,
    }),
    "different",
    "another playlist replaces as different",
  );
  assert.equal(
    resolvePlaylistCatalogPlaybackState({
      slug: "morning",
      activeQueue: {
        source: {
          kind: "owner_playlist",
          playlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          returnHref: "/playlists/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      },
      isPlaying: true,
    }),
    "different",
    "owner_playlist is different",
  );
  assert.equal(
    resolvePlaylistCatalogPlaybackState({
      slug: "morning",
      activeQueue: null,
      isPlaying: true,
    }),
    "different",
    "product session without playlist queue is different",
  );

  assert.equal(shouldReloadPlaylistCatalogQueue("idle"), true);
  assert.equal(shouldReloadPlaylistCatalogQueue("different"), true);
  assert.equal(shouldReloadPlaylistCatalogQueue("playing"), false);
  assert.equal(shouldReloadPlaylistCatalogQueue("paused"), false);
}

function testSameQueueAsPublicPlayAll() {
  const catalog = buildPlaylistCatalogQueue({
    playlistSlug: "morning",
    title: "Утро",
    items: publicItems,
  });
  const page = buildPublicPlaylistQueue({
    playlistSlug: "morning",
    title: "Утро",
    items: publicItems,
  });

  assert.equal(catalog.ok, true);
  assert.equal(page.ok, true);
  if (!catalog.ok || !page.ok) {
    return;
  }

  assert.deepEqual(catalog.queue.entries, page.queue.entries);
  assert.equal(catalog.queue.source.kind, "public_playlist");
  assert.equal(page.queue.source.kind, "public_playlist");
  assert.equal(catalog.queue.source.playlistSlug, "morning");
  assert.equal(catalog.queue.source.returnHref, "/playlists/catalog");
  assert.equal(catalog.queue.navigationPolicy, "stay_on_source");
  assert.equal(page.queue.source.returnHref, "/p/morning");
  assert.equal(catalog.queue.entries.length, 2);
  assert.equal(catalog.queue.skippedCount, 1, "true unavailable items stay out");
  assert.equal(catalog.queue.entries[1].productSlug, "paid-one");
}

async function testRepeatPressTogglesWithoutReload() {
  let pauseCalls = 0;
  let startCalls = 0;

  const first = await pressPlaylistCatalogPlayback({
    state: "playing",
    handlePlayPause: async () => {
      pauseCalls += 1;
    },
    startPlayback: async () => {
      startCalls += 1;
    },
  });
  const second = await pressPlaylistCatalogPlayback({
    state: "paused",
    handlePlayPause: async () => {
      pauseCalls += 1;
    },
    startPlayback: async () => {
      startCalls += 1;
    },
  });

  assert.equal(first, "toggled");
  assert.equal(second, "toggled");
  assert.equal(pauseCalls, 2);
  assert.equal(startCalls, 0, "repeat play does not rebuild the queue");
}

async function testIdlePressLoadsOnce() {
  let fetches = 0;
  let loadedQueues = 0;

  const result = await startPlaylistCatalogPlayback({
    slug: "morning",
    title: "Утро",
    fetchImpl: async (url) => {
      fetches += 1;
      assert.equal(url, "/api/playlists/public/morning");
      return {
        ok: true,
        json: async () => ({
          ok: true,
          detail: {
            playlist: { title: "Утро", slug: "morning" },
            items: publicItems,
          },
        }),
      };
    },
    loadPlaylistQueue: async (queue) => {
      loadedQueues += 1;
      assert.equal(queue.source.kind, "public_playlist");
      assert.equal(queue.source.playlistSlug, "morning");
      assert.equal(queue.source.returnHref, "/playlists/catalog");
      assert.equal(queue.navigationPolicy, "stay_on_source");
      assert.equal(queue.entries.length, 2);
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(fetches, 1);
  assert.equal(loadedQueues, 1);

  await pressPlaylistCatalogPlayback({
    state: "playing",
    handlePlayPause: async () => {},
    startPlayback: async () => {
      fetches += 1;
    },
  });
  assert.equal(fetches, 1, "second GET is not performed while this playlist plays");
}

function testPublicDetailHttpWrapper() {
  assert.deepEqual(
    toPublicPlaylistDetailHttpResult({ ok: false, reason: "not_found" }),
    { status: 404, body: { ok: false } },
  );
  assert.equal(buildPublicPlaylistDetailApiUrl("morning"), "/api/playlists/public/morning");

  const route = read("src/app/api/playlists/public/[slug]/route.ts");
  assert.match(route, /loadPublicPlaylistBySlug/);
  assert.match(route, /toPublicPlaylistDetailHttpResult/);
  assert.doesNotMatch(route, /entitlement|playlist_saves|library_saves|progress/);
  assert.doesNotMatch(route, /catalog\/play|loadCatalogPlaySession/);
}

function testNoViewerPlayingInApi() {
  const catalogApi = read("src/app/api/playlists/catalog/route.ts");
  const contract = read("src/lib/playlists/listing-contract.ts");
  const publicRoute = read("src/app/api/playlists/public/[slug]/route.ts");
  const playback = read("src/lib/playlists/catalog-playback.ts");

  assert.doesNotMatch(catalogApi, /viewer\.playing/);
  assert.doesNotMatch(publicRoute, /viewer\.playing/);
  assert.doesNotMatch(playback, /viewer\.playing/);
  assert.match(contract, /playing: boolean/);
  assert.doesNotMatch(playback, /loadCatalogPlaySession/);
  assert.doesNotMatch(playback, /\/api\/catalog\/play/);
}

testPlaybackStates();
testSameQueueAsPublicPlayAll();
await testRepeatPressTogglesWithoutReload();
await testIdlePressLoadsOnce();
testPublicDetailHttpWrapper();
testNoViewerPlayingInApi();

console.log("playlist-catalog-playback-unit: ok");
