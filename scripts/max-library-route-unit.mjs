#!/usr/bin/env node
/**
 * POST /api/max/library — HMAC linked user only, Stage-1 sources, safe DTO.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_HOSTNAME,
  MAX_LIBRARY_PATH,
  MAX_ORIGIN,
} from "../src/lib/max/host.ts";
import {
  MAX_LIBRARY_CATALOG_KEYS,
  MAX_LIBRARY_PLAYLIST_KEYS,
  selectMaxLibraryItems,
} from "../src/lib/max/library-dto.ts";
import {
  POST,
  setMaxLibraryDepsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/library/route.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICTIONAL_BOT_TOKEN = "test-max-bot-token-not-real-0001";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRACTICE_SAVED = "11111111-1111-4111-8111-111111111111";
const PRACTICE_PURCHASED = "22222222-2222-4222-8222-222222222222";
const PRACTICE_GIFT = "33333333-3333-4333-8333-333333333333";
const PRACTICE_FOREIGN = "44444444-4444-4444-8444-444444444444";
const ENTITLEMENT_PURCHASE = "entitlement-row-do-not-leak";
const ENTITLEMENT_GIFT = "entitlement-gift-do-not-leak";
const ENTITLEMENT_FOREIGN = "entitlement-foreign-do-not-leak";
const PLAYLIST_ID = "playlist-row-do-not-leak";
const PLAYLIST_FOREIGN = "playlist-foreign-do-not-leak";
const AUDIO_SECRET = "raw-audio-do-not-leak.mp3";
const STORAGE_SECRET = "users/secret-storage/master.wav";
const WORKSPACE_SECRET = "workspace-do-not-leak";

const routeSource = readFileSync(
  join(repoRoot, "src/app/api/max/library/route.ts"),
  "utf8",
);
const loaderSource = readFileSync(join(repoRoot, "src/lib/max/library.ts"), "utf8");
const savedSource = readFileSync(
  join(repoRoot, "src/lib/library/saved-playlist-sources.ts"),
  "utf8",
);

assert.equal(MAX_LIBRARY_PATH, "/api/max/library");
assert.match(routeSource, /readMaxAuthenticatedPost\(request, \[\]\)/);
assert.match(routeSource, /authenticated\.userId/);
assert.match(routeSource, /loadMaxStage1Library\(/);
assert.doesNotMatch(routeSource, /body\.userId|body\.user_id|body\.max_user_id|body\.q|body\.filter/);
assert.doesNotMatch(routeSource, /loadUnifiedLibrary|listMyPersonalMaterials|listPrivateAudioItems/);
assert.match(loaderSource, /loadLibraryCollection\(supabase, userId\)/);
assert.match(loaderSource, /loadSavedPlaylistSources\(supabase, userId/);
assert.doesNotMatch(loaderSource, /loadUnifiedLibrary|listMyPersonalMaterials|listPrivateAudioItems|auth\.uid\(/);
assert.match(savedSource, /\.eq\("user_id", userId\)/);
assert.match(savedSource, /listSavedPlaylists\([\s\S]*\{ userId \}/);
assert.doesNotMatch(savedSource, /listMyPersonalMaterials|listPrivateAudioItems|auth\.uid\(/);

function signInitData(fields, token = FICTIONAL_BOT_TOKEN) {
  const entries = Object.entries(fields).filter(([key]) => key !== "hash");
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const launchParams = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(launchParams).digest("hex");
  return `${entries
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")}&hash=${hash}`;
}

function currentInitData(userId = "101") {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "library-route-test",
    user: JSON.stringify({ id: Number(userId), first_name: "Route" }),
  });
}

function maxRequest(body, { host = MAX_HOSTNAME, headers = {} } = {}) {
  return new Request(`${MAX_ORIGIN}${MAX_LIBRARY_PATH}`, {
    method: "POST",
    headers: {
      host,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function practiceRow(input) {
  return {
    id: input.id,
    title: input.title,
    slug: input.slug,
    format: "Медитация",
    duration_minutes: input.durationMinutes,
    price: input.price,
    is_free: input.isFree,
    cover_url: input.coverUrl,
    cover_image: null,
    updated_at: null,
    audio_url: AUDIO_SECRET,
    workspace_id: WORKSPACE_SECRET,
    user_id: input.ownerId,
    author_id: "author-listed",
    status: "published",
    deleted_at: null,
    catalog_visibility: "listed",
    is_catalog_listed: true,
    scheduled_publish_at: null,
    published_at: "2026-01-01T00:00:00.000Z",
    authors: { name: input.authorName, slug: input.authorSlug },
  };
}

const savedPractice = practiceRow({
  id: PRACTICE_SAVED,
  title: "Сохранённая тишина",
  slug: "sohranennaya-tishina",
  durationMinutes: 8,
  price: 700,
  isFree: false,
  coverUrl: STORAGE_SECRET,
  authorName: "Анна Автор",
  authorSlug: "anna",
  ownerId: USER_A,
});

const purchasedPractice = practiceRow({
  id: PRACTICE_PURCHASED,
  title: "Купленный рассвет",
  slug: "kuplennyy-rassvet",
  durationMinutes: 12,
  price: 500,
  isFree: false,
  coverUrl: "https://cdn.example.test/purchased.webp",
  authorName: "Борис Автор",
  authorSlug: "boris",
  ownerId: USER_A,
});

const giftPractice = practiceRow({
  id: PRACTICE_GIFT,
  title: "Подарок утра",
  slug: "podarok-utra",
  durationMinutes: 5,
  price: 0,
  isFree: true,
  coverUrl: "https://cdn.example.test/gift.webp",
  authorName: "Мария Автор",
  authorSlug: "maria",
  ownerId: USER_A,
});

const foreignPractice = practiceRow({
  id: PRACTICE_FOREIGN,
  title: "Чужая покупка",
  slug: "chuzhaya-pokupka",
  durationMinutes: 3,
  price: 100,
  isFree: false,
  coverUrl: "https://cdn.example.test/foreign.webp",
  authorName: "Чужой Автор",
  authorSlug: "foreign",
  ownerId: USER_B,
});

function entitlement(input) {
  return {
    user_id: input.userId,
    id: input.id,
    access_source: input.accessSource,
    granted_at: input.grantedAt,
    expires_at: null,
    practice_id: input.practice.id,
    practices: input.practice,
    audio_url: AUDIO_SECRET,
  };
}

const tables = {
  user_practices: [
    entitlement({
      userId: USER_A,
      id: ENTITLEMENT_PURCHASE,
      accessSource: "purchase",
      grantedAt: "2026-02-01T00:00:00.000Z",
      practice: purchasedPractice,
    }),
    entitlement({
      userId: USER_A,
      id: ENTITLEMENT_GIFT,
      accessSource: "gift",
      grantedAt: "2026-01-01T00:00:00.000Z",
      practice: giftPractice,
    }),
    entitlement({
      userId: USER_B,
      id: ENTITLEMENT_FOREIGN,
      accessSource: "purchase",
      grantedAt: "2026-05-01T00:00:00.000Z",
      practice: foreignPractice,
    }),
  ],
  library_saves: [
    {
      user_id: USER_A,
      practice_id: PRACTICE_SAVED,
      created_at: "2026-04-01T00:00:00.000Z",
    },
    {
      user_id: USER_B,
      practice_id: PRACTICE_FOREIGN,
      created_at: "2026-05-02T00:00:00.000Z",
    },
  ],
  practices: [savedPractice, purchasedPractice, giftPractice, foreignPractice],
  playlist_saves: [
    {
      user_id: USER_A,
      playlist_id: PLAYLIST_ID,
      created_at: "2026-03-01T00:00:00.000Z",
    },
    {
      user_id: USER_B,
      playlist_id: PLAYLIST_FOREIGN,
      created_at: "2020-01-01T00:00:00.000Z",
    },
  ],
};

const queries = [];
const playlistUsers = [];

function createFakeClient() {
  return {
    from(table) {
      const filters = [];
      const api = {
        select() {
          return api;
        },
        eq(column, value) {
          filters.push({ op: "eq", column, value });
          queries.push({ table, column, value });
          return api;
        },
        in(column, value) {
          filters.push({ op: "in", column, value });
          queries.push({ table, column, value });
          return api;
        },
        order() {
          return api;
        },
        not() {
          return api;
        },
        or() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          return api;
        },
        then(onFulfilled, onRejected) {
          const rows = (tables[table] ?? []).filter((row) =>
            filters.every((filter) => {
              if (filter.op === "in") {
                return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
              }
              return row[filter.column] === filter.value;
            }),
          );
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
}

function playlistItem(input) {
  return {
    class: "playlist",
    id: input.id,
    slug: input.slug,
    href: `/p/${input.ownerId}`,
    title: input.title,
    coverUrl: "https://cdn.example.test/playlist.webp",
    creator: input.creator,
    trackCount: 2,
    durationSeconds: 600,
    savesCount: 1,
    topics: [],
    access: "free",
    viewer: { saved: true, playing: false },
    audioUrl: AUDIO_SECRET,
    userId: input.ownerId,
    user_id: input.ownerId,
  };
}

const previousToken = process.env.MAX_BOT_TOKEN;
process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;

setResolveMaxNativeUserForTests(async (_provider, providerUserId) => {
  if (providerUserId === "101") return { ok: true, userId: USER_A };
  if (providerUserId === "202") return { ok: true, userId: USER_B };
  return { ok: true, userId: null };
});

setMaxLibraryDepsForTests({
  createClient: createFakeClient,
  listSavedPlaylists: async (_supabase, _query, options) => {
    playlistUsers.push(options.userId);
    if (options.userId === USER_A) {
      return {
        items: [
          playlistItem({
            id: PLAYLIST_ID,
            slug: "morning-list",
            title: "Утренний плейлист",
            creator: "АудиоЛад",
            ownerId: USER_A,
          }),
        ],
        nextCursor: null,
      };
    }
    if (options.userId === USER_B) {
      return {
        items: [
          playlistItem({
            id: PLAYLIST_FOREIGN,
            slug: "foreign-list",
            title: "Чужой плейлист",
            creator: "Чужой",
            ownerId: USER_B,
          }),
        ],
        nextCursor: null,
      };
    }
    return { items: [], nextCursor: null };
  },
});

function assertSafeDto(items) {
  for (const item of items) {
    const allowed = item.kind === "catalog"
      ? MAX_LIBRARY_CATALOG_KEYS
      : MAX_LIBRARY_PLAYLIST_KEYS;
    assert.deepEqual(Object.keys(item).sort(), [...allowed].sort());
  }
}

try {
  const linked = await POST(
    maxRequest({
      initData: currentInitData("101"),
      userId: USER_B,
      user_id: USER_B,
      max_user_id: "202",
      q: "Чужая",
      filter: "purchased",
      sort: "alpha",
    }),
  );
  assert.equal(linked.status, 200);
  assert.equal(linked.headers.get("cache-control"), "no-store");
  const linkedBody = await linked.json();
  assert.equal(linkedBody.ok, true);
  const titles = linkedBody.items.map((item) => item.title).sort();
  assert.deepEqual(titles, [
    "Купленный рассвет",
    "Подарок утра",
    "Сохранённая тишина",
    "Утренний плейлист",
  ]);
  assertSafeDto(linkedBody.items);

  const saved = linkedBody.items.find((item) => item.title === "Сохранённая тишина");
  const purchased = linkedBody.items.find((item) => item.title === "Купленный рассвет");
  const gift = linkedBody.items.find((item) => item.title === "Подарок утра");
  const playlist = linkedBody.items.find((item) => item.kind === "playlist");
  assert.equal(saved.kind, "catalog");
  assert.equal(saved.isSaved, true);
  assert.equal(saved.canListen, false);
  assert.equal(saved.accessSource, null);
  assert.equal(saved.coverUrl, null);
  assert.equal(saved.authorSlug, "anna");
  assert.equal(saved.productSlug, "sohranennaya-tishina");
  assert.equal(purchased.canListen, true);
  assert.equal(purchased.isSaved, false);
  assert.equal(purchased.accessSource, "purchase");
  assert.equal(purchased.coverUrl, "https://cdn.example.test/purchased.webp");
  assert.equal(gift.accessSource, "gift");
  assert.equal(gift.canListen, true);
  assert.equal(gift.isFree, true);
  assert.equal(playlist.slug, "morning-list");
  assert.equal(playlist.creator, "АудиоЛад");
  assert.equal(playlist.duration.unit, "seconds");
  assert.equal(playlist.duration.value, 600);
  assert.equal(playlist.sortAt, Date.parse("2026-03-01T00:00:00.000Z"));
  assert.equal("canListen" in playlist, false);
  assert.equal("playlistId" in playlist, false);

  const linkedJson = JSON.stringify(linkedBody);
  for (const secret of [
    USER_A,
    USER_B,
    AUDIO_SECRET,
    STORAGE_SECRET,
    WORKSPACE_SECRET,
    ENTITLEMENT_PURCHASE,
    ENTITLEMENT_GIFT,
    ENTITLEMENT_FOREIGN,
    PLAYLIST_ID,
    PLAYLIST_FOREIGN,
    "Чужая покупка",
    "Чужой плейлист",
    "audioUrl",
    "audio_url",
    "user_id",
    "userId",
  ]) {
    assert.equal(linkedJson.includes(secret), false, secret);
  }

  const userFilters = queries.filter((query) => query.column === "user_id");
  assert.ok(userFilters.length >= 3);
  assert.ok(userFilters.every((query) => query.value === USER_A));
  assert.deepEqual(playlistUsers, [USER_A]);
  assert.ok(queries.some((query) => query.table === "user_practices" && query.value === USER_A));
  assert.ok(queries.some((query) => query.table === "library_saves" && query.value === USER_A));
  assert.ok(queries.some((query) => query.table === "playlist_saves" && query.value === USER_A));

  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "purchased",
      query: "",
      sort: "new",
    }).map((entry) => entry.title),
    ["Купленный рассвет"],
  );
  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "gifts",
      query: "",
      sort: "new",
    }).map((entry) => entry.title),
    ["Подарок утра"],
  );
  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "saved",
      query: "",
      sort: "new",
    }).map((entry) => entry.title),
    ["Сохранённая тишина", "Утренний плейлист"],
  );
  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "playlists",
      query: "",
      sort: "new",
    }).map((entry) => entry.title),
    ["Утренний плейлист"],
  );
  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "all",
      query: "Анна",
      sort: "new",
    }).map((entry) => entry.title),
    ["Сохранённая тишина"],
  );
  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "all",
      query: "Рассвет",
      sort: "new",
    }).map((entry) => entry.title),
    ["Купленный рассвет"],
  );
  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "all",
      query: "",
      sort: "new",
    }).map((entry) => entry.title),
    ["Сохранённая тишина", "Утренний плейлист", "Купленный рассвет", "Подарок утра"],
  );
  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "all",
      query: "",
      sort: "old",
    }).map((entry) => entry.title),
    ["Подарок утра", "Купленный рассвет", "Утренний плейлист", "Сохранённая тишина"],
  );
  assert.deepEqual(
    selectMaxLibraryItems(linkedBody.items, {
      filter: "all",
      query: "",
      sort: "alpha",
    }).map((entry) => entry.title),
    ["Купленный рассвет", "Подарок утра", "Сохранённая тишина", "Утренний плейлист"],
  );

  const queriesAfterLinked = queries.length;
  const playlistsAfterLinked = playlistUsers.length;

  const other = await POST(
    maxRequest({
      initData: currentInitData("202"),
      user_id: USER_A,
      userId: USER_A,
    }),
  );
  assert.equal(other.status, 200);
  const otherBody = await other.json();
  assert.deepEqual(
    otherBody.items.map((item) => item.title).sort(),
    ["Чужая покупка", "Чужой плейлист"],
  );
  assert.equal(JSON.stringify(otherBody).includes("Сохранённая тишина"), false);
  assert.equal(JSON.stringify(otherBody).includes(USER_A), false);
  assert.equal(JSON.stringify(otherBody).includes(USER_B), false);
  assert.deepEqual(playlistUsers.slice(playlistsAfterLinked), [USER_B]);
  const otherUserFilters = queries
    .slice(queriesAfterLinked)
    .filter((query) => query.column === "user_id");
  assert.ok(otherUserFilters.length >= 3);
  assert.ok(otherUserFilters.every((query) => query.value === USER_B));
  assert.equal(
    queries.slice(queriesAfterLinked).some((query) => query.value === USER_A),
    false,
  );

  const queriesAfterOther = queries.length;
  const playlistsAfterOther = playlistUsers.length;
  const unlinked = await POST(
    maxRequest({ initData: currentInitData("303"), user_id: USER_A, userId: USER_A }),
  );
  assert.equal(unlinked.status, 403);
  assert.equal((await unlinked.json()).reason, "unlinked");
  assert.equal(queries.length, queriesAfterOther);
  assert.equal(playlistUsers.length, playlistsAfterOther);

  const wrongHost = await POST(
    maxRequest(
      { initData: currentInitData("101"), userId: USER_B },
      { host: "audiolad.ru", headers: { origin: "https://audiolad.ru" } },
    ),
  );
  assert.equal(wrongHost.status, 404);
  assert.equal((await wrongHost.json()).reason, "forbidden_host");

  const badHash = await POST(
    maxRequest({
      initData: currentInitData("101").replace(/hash=[0-9a-f]+/, "hash=ff"),
      userId: USER_B,
    }),
  );
  assert.equal(badHash.status, 401);
  assert.equal((await badHash.json()).reason, "invalid_hash");
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxLibraryDepsForTests(null);
  if (previousToken === undefined) delete process.env.MAX_BOT_TOKEN;
  else process.env.MAX_BOT_TOKEN = previousToken;
}

console.log("max-library-route-unit: ok");
