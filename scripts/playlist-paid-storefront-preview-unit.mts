import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chooseCatalogPreviewAudioRow } from "../src/lib/catalog/catalog-preview-audio-choice";
import { buildCatalogPlaySessionUrl } from "../src/lib/catalog/fetch-catalog-play-session";
import { buildPublicPlaylistQueue } from "../src/lib/playlists/build-playlist-queue";
import { resolveListenSessionFailureReason } from "../src/lib/playlists/fetch-listen-session";
import type { PublicPlaylistItemView } from "../src/lib/playlists/public-detail";
import {
  isPracticeEligibleForPublicPlaylist,
  isPracticePlayableOnPublicStorefront,
} from "../src/lib/playlists/public-content";
import {
  resolvePlaylistQueueEntrySession,
  shouldFallbackListenSessionToCatalogPreview,
} from "../src/lib/playlists/queue-entry-session";
import type { CatalogGlobalPlayerSession } from "../src/lib/listen/global-player-types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function item(
  overrides: Partial<PublicPlaylistItemView> &
    Pick<PublicPlaylistItemView, "practiceId" | "title" | "available" | "href">,
): PublicPlaylistItemView {
  return {
    audioItemId: null,
    position: 1,
    authorName: "Author",
    authorSlug: "author",
    formatLabel: null,
    metaLabel: "12:00",
    durationLabel: "12:00",
    durationSeconds: 720,
    productSlug: "product",
    productHref: "/practice/author/product",
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
    ...overrides,
  };
}

function session(
  overrides: Partial<CatalogGlobalPlayerSession> = {},
): CatalogGlobalPlayerSession {
  return {
    practiceId: "11111111-1111-4111-8111-111111111111",
    authorSlug: "author",
    productSlug: "paid-one",
    practiceTitle: "Paid",
    authorName: "Author",
    format: "Практика",
    tracks: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Track 1",
        description: null,
        position: 1,
        durationSeconds: 180,
        coverImageUrl: null,
      },
    ],
    initialProgress: [],
    coverSymbol: "▶",
    coverGradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
    coverImageUrl: null,
    isAuthorPreview: false,
    ...overrides,
  };
}

function testPredicatesStaySeparate() {
  const paid = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "published" as const,
    is_free: false,
    price: 990,
    is_catalog_listed: true,
  };

  assert.equal(isPracticeEligibleForPublicPlaylist(paid), false);
  assert.equal(isPracticePlayableOnPublicStorefront(paid), true);

  const free = {
    ...paid,
    is_free: true,
    price: 0,
  };
  assert.equal(isPracticeEligibleForPublicPlaylist(free), true);
  assert.equal(isPracticePlayableOnPublicStorefront(free), true);

  const unpublished = { ...paid, status: "unpublished" };
  assert.equal(isPracticePlayableOnPublicStorefront(unpublished), false);
  assert.equal(isPracticeEligibleForPublicPlaylist(unpublished), false);
}

function testMixedQueueIncludesPaid() {
  const built = buildPublicPlaylistQueue({
    playlistSlug: "mix",
    title: "Mix",
    items: [
      item({
        practiceId: "11111111-1111-4111-8111-111111111111",
        title: "Free",
        productSlug: "free-one",
        available: true,
        href: "/listen/author/free-one",
      }),
      item({
        practiceId: "22222222-2222-4222-8222-222222222222",
        title: "Paid",
        productSlug: "paid-one",
        available: true,
        href: "/listen/author/paid-one",
      }),
      item({
        practiceId: "33333333-3333-4333-8333-333333333333",
        title: "Free two",
        productSlug: "free-two",
        available: true,
        href: "/listen/author/free-two",
      }),
      item({
        practiceId: "44444444-4444-4444-8444-444444444444",
        title: "Gone",
        available: false,
        href: null,
        authorSlug: null,
      }),
    ],
  });

  assert.equal(built.ok, true);
  if (!built.ok) {
    return;
  }

  assert.equal(built.queue.entries.length, 3);
  assert.equal(built.queue.skippedCount, 1);
  assert.deepEqual(
    built.queue.entries.map((entry) => entry.productSlug),
    ["free-one", "paid-one", "free-two"],
  );
  assert.equal(
    built.queue.entries.every(
      (entry) => !("audioUrl" in entry) && !("signedUrl" in entry),
    ),
    true,
  );
}

function testListenFailureReasons() {
  assert.equal(resolveListenSessionFailureReason(403, "unavailable"), "unavailable");
  assert.equal(resolveListenSessionFailureReason(404, "not_found"), "not_found");
  assert.equal(resolveListenSessionFailureReason(500, undefined), "error");
  assert.equal(resolveListenSessionFailureReason(200, undefined), "error");
  assert.equal(shouldFallbackListenSessionToCatalogPreview("unavailable"), true);
  assert.equal(shouldFallbackListenSessionToCatalogPreview("error"), false);
  assert.equal(shouldFallbackListenSessionToCatalogPreview("not_found"), false);
  assert.equal(shouldFallbackListenSessionToCatalogPreview("no_audio"), false);
}

async function testQueueSessionListenFirst() {
  const entry = {
    kind: "product" as const,
    practiceId: "11111111-1111-4111-8111-111111111111",
    authorSlug: "author",
    productSlug: "paid-one",
    title: "Paid",
    listenHref: "/listen/author/paid-one",
  };

  let catalogCalls = 0;
  const entitled = await resolvePlaylistQueueEntrySession(entry, {
    fromStart: true,
    fetchListen: async () => ({ ok: true, session: session() }),
    fetchCatalog: async () => {
      catalogCalls += 1;
      return { ok: false, reason: "unavailable" };
    },
  });

  assert.equal(entitled.ok, true);
  assert.equal(catalogCalls, 0, "purchased/free listen session skips catalog fallback");
  if (entitled.ok) {
    assert.notEqual(entitled.session.playbackMode, "preview");
  }

  const preview = await resolvePlaylistQueueEntrySession(entry, {
    fromStart: true,
    fetchListen: async () => ({ ok: false, reason: "unavailable" }),
    fetchCatalog: async (_author, _slug, audioItemId) => {
      assert.equal(audioItemId, null);
      return {
        ok: true,
        session: session({ playbackMode: "preview", previewEndMs: 60_000 }),
      };
    },
  });

  assert.equal(preview.ok, true);
  if (preview.ok) {
    assert.equal(preview.session.playbackMode, "preview");
  }

  const network = await resolvePlaylistQueueEntrySession(entry, {
    fromStart: true,
    fetchListen: async () => ({ ok: false, reason: "error" }),
    fetchCatalog: async () => {
      catalogCalls += 1;
      return {
        ok: true,
        session: session({ playbackMode: "preview" }),
      };
    },
  });

  assert.equal(network.ok, false);
  if (!network.ok) {
    assert.equal(network.reason, "error");
  }
  assert.equal(catalogCalls, 0, "network/error does not become preview");
}

async function testAudioItemPreviewUsesRequestedTrack() {
  const requestedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const otherId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const entry = {
    kind: "audio_item" as const,
    practiceId: "11111111-1111-4111-8111-111111111111",
    audioItemId: requestedId,
    authorSlug: "author",
    productSlug: "album",
    title: "Clip",
    listenHref: "/listen/author/album",
  };

  const preview = await resolvePlaylistQueueEntrySession(entry, {
    fromStart: true,
    fetchListen: async () => ({ ok: false, reason: "unavailable" }),
    fetchCatalog: async (_author, _slug, audioItemId) => {
      assert.equal(audioItemId, requestedId);
      return {
        ok: true,
        session: session({
          playbackMode: "preview",
          tracks: [
            {
              id: requestedId,
              title: "Requested",
              description: null,
              position: 2,
              durationSeconds: 90,
              coverImageUrl: null,
            },
          ],
        }),
      };
    },
  });

  assert.equal(preview.ok, true);
  if (preview.ok) {
    assert.equal(preview.session.tracks[0]?.id, requestedId);
  }

  const mismatch = await resolvePlaylistQueueEntrySession(entry, {
    fromStart: true,
    fetchListen: async () => ({ ok: false, reason: "unavailable" }),
    fetchCatalog: async () => ({
      ok: true,
      session: session({
        playbackMode: "preview",
        tracks: [
          {
            id: otherId,
            title: "Default",
            description: null,
            position: 1,
            durationSeconds: 90,
            coverImageUrl: null,
          },
        ],
      }),
    }),
  });

  assert.equal(mismatch.ok, false, "wrong-product audioItemId fails closed");
}

function testChoosePreviewAudioRow() {
  const first = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    is_preview: true,
    preview_start_ms: null,
    preview_end_ms: null,
  };
  const requested = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    is_preview: false,
    preview_start_ms: 10_000,
    preview_end_ms: 70_000,
  };

  const selected = chooseCatalogPreviewAudioRow([first, requested], {
    isCourse: false,
    audioItemId: requested.id,
  });
  assert.equal(selected.ok, true);
  if (selected.ok) {
    assert.equal(selected.row?.id, requested.id);
  }

  const missing = chooseCatalogPreviewAudioRow([first], {
    isCourse: false,
    audioItemId: requested.id,
  });
  assert.equal(missing.ok, false);

  const fallback = chooseCatalogPreviewAudioRow([first, requested], {
    isCourse: false,
  });
  assert.equal(fallback.ok, true);
  if (fallback.ok) {
    assert.equal(fallback.row?.id, requested.id, "configured window wins default pick");
  }
}

function testSourceContracts() {
  const publicDetail = read("src/lib/playlists/public-detail.ts");
  const membership = read("src/lib/playlists/membership.ts");
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const api = read("src/app/api/playlists/public/[slug]/route.ts");
  const catalogApi = read("src/app/api/catalog/play/route.ts");
  const pageView = read("src/components/playlists/PublicPlaylistPageView.tsx");
  const row = read("src/components/playlists/PlaylistItemRow.tsx");

  assert.match(publicDetail, /isPracticePlayableOnPublicStorefront/);
  assert.doesNotMatch(publicDetail, /isPracticeEligibleForPublicPlaylist/);
  assert.doesNotMatch(publicDetail, /audio_url/);
  assert.doesNotMatch(publicDetail, /user_practices/);
  assert.match(membership, /isPracticeEligibleForPublicPlaylist/);
  assert.doesNotMatch(membership, /isPracticePlayableOnPublicStorefront/);
  assert.match(provider, /resolvePlaylistQueueEntrySession/);
  assert.match(provider, /preview: session\.playbackMode === "preview"/);
  assert.match(player, /hasPreviewWindowRef\.current/);
  assert.match(player, /finishPreview\(\);/);
  assert.match(player, /onTracksExhaustedRef/);
  assert.doesNotMatch(api, /audio_url|signedUrl|createSignedUrl/);
  assert.match(catalogApi, /audioItemId/);
  assert.match(pageView, /Некоторые материалы этой подборки сейчас недоступны/);
  assert.match(row, /Материал сейчас недоступен/);
  assert.equal(
    buildCatalogPlaySessionUrl("a", "p", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb").includes(
      "audioItemId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ),
    true,
  );
}

testPredicatesStaySeparate();
testMixedQueueIncludesPaid();
testListenFailureReasons();
await testQueueSessionListenFirst();
await testAudioItemPreviewUsesRequestedTrack();
testChoosePreviewAudioRow();
testSourceContracts();

console.log("playlist-paid-storefront-preview-unit: ok");
