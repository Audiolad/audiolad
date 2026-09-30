#!/usr/bin/env node
/**
 * MAX playlist catalog uses the canonical listed-playlist query.
 * Private and unpublished-unlisted rows stay out. Detail drops hidden slots.
 */
import assert from "node:assert/strict";

import { toMaxPlaylistCard, toMaxPlaylistDetail } from "../src/lib/max/playlist-dto.ts";
import {
  advanceMaxPlaylistQueueOnEnded,
  firstMaxPlaylistQueueIndex,
  maxPlaylistPlaybackResource,
  maxPlaylistPlaybackSessionBody,
  narrowMaxPlaybackSession,
  nextMaxPlaylistQueueIndex,
  previousMaxPlaylistQueueIndex,
  selectMaxPlaylistPlaybackTrack,
} from "../src/lib/max/playlist-queue.ts";
import { listMaxPublicPlaylists } from "../src/lib/max/playlists.ts";
import { parsePlaylistListingQuery } from "../src/lib/playlists/listing-contract.ts";
import { loadPublicPlaylistBySlugWithClient } from "../src/lib/playlists/public-detail.ts";

function listedRow(overrides = {}) {
  return {
    id: overrides.id,
    title: overrides.title,
    slug: overrides.slug,
    visibility: overrides.visibility ?? "public",
    published_at: Object.hasOwn(overrides, "published_at")
      ? overrides.published_at
      : "2026-08-25T00:00:00.000Z",
    listed_at: overrides.listed_at,
    is_editorial: true,
    items_count: overrides.items_count ?? 2,
    duration_seconds: overrides.duration_seconds ?? 120,
    saves_count: overrides.saves_count ?? 1,
    cover_path: null,
    description: overrides.description ?? "",
  };
}

const rows = [
  listedRow({
    id: "pl-old",
    slug: "old-set",
    title: "Старый",
    listed_at: "2026-08-25T00:00:01.000Z",
    saves_count: 1,
  }),
  listedRow({
    id: "pl-mid",
    slug: "mid-set",
    title: "Средний сон",
    listed_at: "2026-08-25T00:00:02.000Z",
    saves_count: 5,
    description: "вечер",
  }),
  listedRow({
    id: "pl-new",
    slug: "new-set",
    title: "Новый",
    listed_at: "2026-08-25T00:00:03.000Z",
    saves_count: 2,
  }),
  listedRow({
    id: "pl-paid",
    slug: "paid-set",
    title: "Платный",
    listed_at: "2026-08-25T00:00:04.000Z",
    saves_count: 8,
  }),
  listedRow({
    id: "pl-private",
    slug: "private-set",
    title: "Скрытый приват",
    visibility: "private",
    listed_at: "2026-08-25T00:00:05.000Z",
  }),
  listedRow({
    id: "pl-unlisted",
    slug: "unlisted-set",
    title: "Не в витрине",
    listed_at: null,
    published_at: "2026-08-25T00:00:00.000Z",
  }),
  listedRow({
    id: "pl-draft",
    slug: "draft-set",
    title: "Черновик",
    published_at: null,
    listed_at: "2026-08-25T00:00:06.000Z",
  }),
];

const accessRows = [
  { playlist_id: "pl-old", practices: { is_free: true } },
  { playlist_id: "pl-mid", practices: { is_free: true } },
  { playlist_id: "pl-new", practices: { is_free: true } },
  { playlist_id: "pl-paid", practices: { is_free: false } },
];

function createCatalogClient() {
  const calls = [];
  const tables = [];
  let topicKey = null;
  const orFilters = [];
  const orders = [];

  const playlistsBuilder = {
    select(columns) {
      calls.push(["playlists.select", columns]);
      return this;
    },
    eq(column, value) {
      calls.push(["playlists.eq", column, value]);
      if (column === "playlist_topics.topics.key" && typeof value === "string") {
        topicKey = value;
      }
      return this;
    },
    not(column, operator, value) {
      calls.push(["playlists.not", column, operator, value]);
      return this;
    },
    or(filter) {
      orFilters.push(filter);
      calls.push(["playlists.or", filter]);
      return this;
    },
    in(column, values) {
      calls.push(["playlists.in", column, values]);
      return this;
    },
    order(column, options) {
      orders.push([column, options]);
      calls.push(["playlists.order", column, options]);
      return this;
    },
    limit(value) {
      calls.push(["playlists.limit", value]);
      let next = rows.filter(
        (row) =>
          row.visibility === "public" &&
          typeof row.published_at === "string" &&
          row.published_at.length > 0 &&
          typeof row.listed_at === "string" &&
          row.listed_at.length > 0 &&
          typeof row.slug === "string" &&
          row.slug.length > 0,
      );

      const popular = orders.some(([column]) => column === "saves_count");
      next.sort((left, right) => {
        if (popular && left.saves_count !== right.saves_count) {
          return right.saves_count - left.saves_count;
        }
        const leftMs = Date.parse(left.listed_at);
        const rightMs = Date.parse(right.listed_at);
        if (leftMs !== rightMs) {
          return rightMs - leftMs;
        }
        return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
      });

      if (topicKey) {
        next = next.filter(() => false);
      }

      for (const filter of orFilters) {
        const needle = filter.match(/title\.ilike\."%([^%"]+)%"/)?.[1]?.toLowerCase();
        if (needle) {
          next = next.filter(
            (row) =>
              row.title.toLowerCase().includes(needle) ||
              row.description.toLowerCase().includes(needle),
          );
        }

        const listedAt = filter.match(/listed_at\.lt\."([^"]+)"/)?.[1];
        const id = filter.match(/id\.lt\.([^),]+)/)?.[1];
        if (listedAt && id) {
          const cursorMs = Date.parse(listedAt);
          next = next.filter((row) => {
            const listedAtMs = Date.parse(row.listed_at);
            if (listedAtMs < cursorMs) return true;
            if (listedAtMs > cursorMs) return false;
            return row.id < id;
          });
        }
      }

      return Promise.resolve({ data: next.slice(0, value), error: null });
    },
  };

  return {
    calls,
    tables,
    from(table) {
      tables.push(table);
      if (table === "playlists") {
        topicKey = null;
        orFilters.length = 0;
        orders.length = 0;
        return playlistsBuilder;
      }
      if (table === "playlist_items") {
        return {
          select() {
            return this;
          },
          in(_column, ids) {
            const wanted = new Set(ids);
            return Promise.resolve({
              data: accessRows.filter((row) => wanted.has(row.playlist_id)),
              error: null,
            });
          },
        };
      }
      if (table === "playlist_topics") {
        return {
          select() {
            return this;
          },
          in() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      }
      if (table === "playlist_saves") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  };
}

function slugs(result) {
  return result.items.map((item) => item.slug);
}

const guestClient = createCatalogClient();
const guestPage = await listMaxPublicPlaylists(
  guestClient,
  parsePlaylistListingQuery({ sort: "newest", limit: 2 }),
  null,
);
assert.deepEqual(slugs(guestPage), ["paid-set", "new-set"]);
assert.equal(typeof guestPage.nextCursor, "string");
assert.equal(guestClient.tables.includes("playlist_saves"), false);
assert.equal(
  guestClient.calls.some(
    (call) => call[0] === "playlists.eq" && call[1] === "visibility" && call[2] === "public",
  ),
  true,
);
assert.equal(
  guestClient.calls.some(
    (call) => call[0] === "playlists.not" && call[1] === "listed_at",
  ),
  true,
);
assert.equal(
  guestClient.calls.some(
    (call) => call[0] === "playlists.not" && call[1] === "published_at",
  ),
  true,
);
const guestJson = JSON.stringify(guestPage.items.map(toMaxPlaylistCard));
assert.equal(guestJson.includes("Скрытый приват"), false);
assert.equal(guestJson.includes("Не в витрине"), false);
assert.equal(guestJson.includes("Черновик"), false);
assert.equal(guestJson.includes("private-set"), false);
assert.equal(guestJson.includes("cover_path"), false);
assert.equal(guestJson.includes("user_id"), false);

const nextPage = await listMaxPublicPlaylists(
  createCatalogClient(),
  parsePlaylistListingQuery({
    sort: "newest",
    limit: 2,
    cursor: guestPage.nextCursor,
  }),
  null,
);
assert.deepEqual(slugs(nextPage), ["mid-set", "old-set"]);
assert.equal(nextPage.nextCursor, null);

const search = await listMaxPublicPlaylists(
  createCatalogClient(),
  parsePlaylistListingQuery({ q: "  сон  ", sort: "newest", limit: 20 }),
  null,
);
assert.deepEqual(slugs(search), ["mid-set"]);

const popular = await listMaxPublicPlaylists(
  createCatalogClient(),
  parsePlaylistListingQuery({ sort: "popular", limit: 20 }),
  null,
);
assert.deepEqual(slugs(popular), ["paid-set", "mid-set", "new-set", "old-set"]);

const paid = await listMaxPublicPlaylists(
  createCatalogClient(),
  parsePlaylistListingQuery({ access: "paid", sort: "newest", limit: 20 }),
  null,
);
assert.deepEqual(slugs(paid), ["paid-set"]);

const linkedClient = createCatalogClient();
const linkedPage = await listMaxPublicPlaylists(
  linkedClient,
  parsePlaylistListingQuery({ sort: "newest", limit: 20 }),
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
);
assert.equal(linkedClient.tables.includes("playlist_saves"), true);
assert.equal(slugs(linkedPage).includes("paid-set"), true);
assert.equal(JSON.stringify(linkedPage.items.map(toMaxPlaylistCard)).includes("saved"), false);

function playlistClient(playlist, items) {
  return {
    from(table) {
      if (table === "playlists") {
        const builder = {
          hidden: false,
          select() {
            return builder;
          },
          eq(column, value) {
            if (column === "visibility" && playlist?.visibility !== value) {
              builder.hidden = true;
            }
            if (column === "slug" && playlist?.slug !== value) {
              builder.hidden = true;
            }
            return builder;
          },
          not(column, _operator, value) {
            if (column === "published_at" && value === null && !playlist?.published_at) {
              builder.hidden = true;
            }
            return builder;
          },
          maybeSingle: async () => ({
            data: builder.hidden ? null : playlist,
            error: null,
          }),
        };
        return builder;
      }
      if (table === "playlist_items") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order: async () => ({ data: items, error: null }),
        };
      }
      if (table === "audio_items") {
        return {
          select() {
            return this;
          },
          in() {
            return this;
          },
          eq() {
            return Promise.resolve({
              data: [
                {
                  id: "audio-1",
                  practice_id: "public-practice",
                  title: "Трек утра",
                  position: 1,
                  duration_seconds: 90,
                  cover_url: "https://cdn.example.test/track.webp",
                  cover_image: null,
                  updated_at: null,
                },
              ],
              error: null,
            });
          },
        };
      }
      throw new Error(table);
    },
  };
}

const publicPlaylist = {
  id: "playlist-internal",
  user_id: "user-secret",
  title: "Утро",
  visibility: "public",
  slug: "morning-set",
  published_at: "2026-08-25T00:00:00.000Z",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-02T00:00:00.000Z",
  cover_path: null,
  cover_updated_at: null,
  is_editorial: true,
  owner_type: "platform",
  description: "Спокойное утро",
};

const publicItems = [
  {
    practice_id: "secret-practice",
    audio_item_id: null,
    position: 1,
    practices: null,
  },
  {
    practice_id: "selected-practice",
    audio_item_id: null,
    position: 2,
    practices: {
      id: "selected-practice",
      title: "Только выбранным",
      slug: "selected-slot",
      format: "practice",
      duration_minutes: 5,
      price: 100,
      is_free: false,
      cover_url: null,
      status: "published",
      is_catalog_listed: true,
      catalog_visibility: "selected_users",
      published_at: "2026-08-01T00:00:00.000Z",
      authors: { name: "Скрытый", slug: "hidden-author" },
    },
  },
  {
    practice_id: "public-practice",
    audio_item_id: "audio-1",
    position: 3,
    practices: {
      id: "public-practice",
      title: "Утренний свет",
      slug: "morning-light",
      format: "practice",
      duration_minutes: 8,
      price: null,
      is_free: true,
      cover_url: "https://cdn.example.test/morning.webp",
      status: "published",
      is_catalog_listed: true,
      catalog_visibility: "public",
      published_at: "2026-08-01T00:00:00.000Z",
      authors: { name: "Анна", slug: "anna" },
    },
  },
];

const opened = await loadPublicPlaylistBySlugWithClient(
  playlistClient(publicPlaylist, publicItems),
  "morning-set",
);
assert.equal(opened.ok, true);
const openedJson = JSON.stringify(opened.detail);
assert.equal(openedJson.includes("Только выбранным"), false);
assert.equal(openedJson.includes("secret-practice"), false);
assert.equal(openedJson.includes("selected-practice"), false);
assert.equal(openedJson.includes("hidden-author"), false);
assert.equal(openedJson.includes("user-secret"), false);
assert.equal(openedJson.includes("playlist-internal"), false);
assert.equal(opened.detail.items.length, 1);
assert.equal(opened.detail.items[0].productSlug, "morning-light");
assert.equal(opened.detail.items[0].available, true);

const dto = toMaxPlaylistDetail(opened.detail);
const dtoJson = JSON.stringify(dto);
assert.equal(dto.items[0].authorSlug, "anna");
assert.equal(dto.items[0].productSlug, "morning-light");
assert.equal(dto.items[0].audioItemId, "audio-1");
assert.equal(dto.items[0].practiceId, undefined);
assert.equal(dtoJson.includes("public-practice"), false);
assert.equal(dtoJson.includes("user_id"), false);
assert.equal(dtoJson.includes("cover_path"), false);

const privateLoad = await loadPublicPlaylistBySlugWithClient(
  playlistClient(
    { ...publicPlaylist, visibility: "private", slug: "private-set" },
    publicItems,
  ),
  "private-set",
);
assert.deepEqual(privateLoad, { ok: false, reason: "not_found" });

const unpublishedLoad = await loadPublicPlaylistBySlugWithClient(
  playlistClient(
    { ...publicPlaylist, published_at: null, slug: "draft-playlist" },
    publicItems,
  ),
  "draft-playlist",
);
assert.deepEqual(unpublishedLoad, { ok: false, reason: "not_found" });

const queueItems = [
  {
    key: "hidden",
    available: false,
    authorSlug: "anna",
    productSlug: "hidden",
    audioItemId: null,
  },
  {
    key: "free",
    available: true,
    authorSlug: "anna",
    productSlug: "free-light",
    audioItemId: null,
  },
  {
    key: "gap",
    available: false,
    authorSlug: null,
    productSlug: null,
    audioItemId: null,
  },
  {
    key: "paid",
    available: true,
    authorSlug: "anna",
    productSlug: "paid-light",
    audioItemId: "track-2",
  },
];
assert.equal(firstMaxPlaylistQueueIndex(queueItems), 1);
assert.equal(previousMaxPlaylistQueueIndex(queueItems, 1), null);
assert.equal(previousMaxPlaylistQueueIndex(queueItems, 3), 1);
assert.equal(nextMaxPlaylistQueueIndex(queueItems, 1), 3);
assert.equal(previousMaxPlaylistQueueIndex(queueItems, 3, new Set([1])), null);
assert.equal(
  advanceMaxPlaylistQueueOnEnded({ items: queueItems, currentIndex: 1 }),
  3,
);
assert.deepEqual(maxPlaylistPlaybackSessionBody(queueItems[3]), {
  authorSlug: "anna",
  productSlug: "paid-light",
  audioItemId: "track-2",
});
assert.equal(maxPlaylistPlaybackSessionBody(queueItems[0]), null);
assert.equal(maxPlaylistPlaybackSessionBody(queueItems[2]), null);
assert.equal(
  advanceMaxPlaylistQueueOnEnded({ items: queueItems, currentIndex: 3 }),
  null,
);

const session = {
  authorSlug: "anna",
  productSlug: "paid-light",
  title: "Платный",
  authorName: "Анна",
  formatLabel: "Практика",
  coverUrl: null,
  playbackMode: "preview",
  tracks: [
    { trackId: "track-1", title: "Первый", position: 1, durationSeconds: 30, coverUrl: null },
    { trackId: "track-2", title: "Второй", position: 2, durationSeconds: 40, coverUrl: null },
  ],
};
assert.equal(selectMaxPlaylistPlaybackTrack(session.tracks, null)?.trackId, "track-1");
const picked = narrowMaxPlaybackSession({ ...session, playbackMode: "full" }, "track-2");
assert.equal(picked?.tracks.length, 1);
assert.equal(picked?.tracks[0].trackId, "track-2");
assert.equal(narrowMaxPlaybackSession(session, "missing-track"), null);
assert.equal(maxPlaylistPlaybackResource("full"), "audio");
assert.equal(maxPlaylistPlaybackResource("preview"), "preview");
assert.equal(
  advanceMaxPlaylistQueueOnEnded({
    items: queueItems,
    currentIndex: 1,
    skipped: new Set([3]),
  }),
  null,
);

console.log("max-playlists-listing-unit: ok");
