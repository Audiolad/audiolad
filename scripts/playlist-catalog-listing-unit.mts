import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LISTING_ENTITY_CLASS } from "../src/lib/listing/entity-class";
import { EDITORIAL_PLAYLIST_LABEL } from "../src/lib/playlists/editorial-content";
import { PLAYLIST_CATALOG_UI_HOMES } from "../src/lib/playlists/catalog-ui-homes";
import {
  applyPlaylistListingCursor,
  applyPlaylistListingSavedState,
  isPlaylistListedForCatalog,
  listedAtToMs,
  mapPlaylistCatalogRowToCandidate,
  matchesPlaylistListingAccessFilter,
  matchesPlaylistListingSearch,
  paginatePlaylistListingItems,
  resolvePlaylistListingAccess,
  sortPlaylistListingItems,
  type PlaylistListingCandidate,
} from "../src/lib/playlists/listing";
import {
  buildPlaylistListingApiUrl,
  parsePlaylistListingQuery,
  PLAYLIST_LISTING_FORBIDDEN_FIELDS,
  PLAYLIST_LISTING_PAGE_SIZE,
  playlistListingItemHasForbiddenField,
  toPlaylistListingItem,
} from "../src/lib/playlists/listing-contract";
import { USER_PLAYLIST_OWNER_LABEL } from "../src/lib/playlists/listing-labels";
import {
  isPrivateRoute,
  isPublicPlaylistCatalogPath,
} from "../src/lib/auth/routes";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function candidate(
  overrides: Partial<PlaylistListingCandidate> = {},
): PlaylistListingCandidate {
  const item = toPlaylistListingItem({
    source: {
      id: overrides.id ?? "pl-1",
      slug: overrides.slug ?? "morning",
      title: overrides.title ?? "Утро",
      coverUrl: overrides.coverUrl ?? null,
      items_count: overrides.trackCount ?? 2,
      duration_seconds: overrides.durationSeconds ?? 120,
      saves_count: overrides.savesCount ?? 0,
    },
    creator: overrides.creator ?? EDITORIAL_PLAYLIST_LABEL,
    topics: overrides.topics,
    access: overrides.access ?? "free",
    viewer: overrides.viewer,
  });

  return {
    ...item,
    listedAtMs: overrides.listedAtMs ?? 1_700_000_000_000,
  };
}

const parsed = parsePlaylistListingQuery({
  q: "  деньги  ",
  topic: "Money",
  access: "free",
  sort: "popular",
  cursor: "abc",
  limit: "20",
});
assert.equal(parsed.q, "деньги");
assert.equal(parsed.topic, "money");
assert.equal(parsed.access, "free");
assert.equal(parsed.sort, "popular");
assert.equal(parsed.cursor, "abc");
assert.equal(parsed.limit, PLAYLIST_LISTING_PAGE_SIZE);
assert.equal(parsePlaylistListingQuery({ sort: "new" }).sort, "newest");
assert.equal(parsePlaylistListingQuery({ sort: "trending" }).sort, "newest");
assert.equal(parsePlaylistListingQuery({ access: "gift" }).access, "all");
assert.equal(
  buildPlaylistListingApiUrl({ q: "сон", sort: "popular" }),
  "/api/playlists/catalog?q=%D1%81%D0%BE%D0%BD&sort=popular",
);

assert.equal(
  isPlaylistListedForCatalog({
    visibility: "public",
    published_at: "2026-08-25T00:00:00.000Z",
    listed_at: "2026-08-25T00:00:00.000Z",
    slug: "morning",
  }),
  true,
);
assert.equal(
  isPlaylistListedForCatalog({
    visibility: "private",
    published_at: "2026-08-25T00:00:00.000Z",
    listed_at: "2026-08-25T00:00:00.000Z",
    slug: "morning",
  }),
  false,
  "private playlists stay out of the vitrine",
);
assert.equal(
  isPlaylistListedForCatalog({
    visibility: "public",
    published_at: null,
    listed_at: "2026-08-25T00:00:00.000Z",
    slug: "morning",
  }),
  false,
  "unpublished stay out",
);
assert.equal(
  isPlaylistListedForCatalog({
    visibility: "public",
    published_at: "2026-08-25T00:00:00.000Z",
    listed_at: null,
    slug: "morning",
  }),
  false,
  "unlisted public stay out",
);

assert.equal(
  matchesPlaylistListingSearch(
    { title: "Утренний ритуал", description: "Короткий день" },
    "ритуал",
  ),
  true,
);
assert.equal(
  matchesPlaylistListingSearch(
    { title: "Утро", description: "Практика для ритуала" },
    "ритуала",
  ),
  true,
  "description is searchable",
);
assert.equal(
  matchesPlaylistListingSearch(
    { title: "Утро", description: "Короткий день", creator: EDITORIAL_PLAYLIST_LABEL },
    "аудиолада",
  ),
  false,
  "creator label is not part of catalog search",
);
assert.equal(
  matchesPlaylistListingSearch(
    { title: "Утро", creator: USER_PLAYLIST_OWNER_LABEL },
    "ритуал",
  ),
  false,
);

assert.equal(resolvePlaylistListingAccess([true, true]), "free");
assert.equal(resolvePlaylistListingAccess([false, false]), "paid");
assert.equal(resolvePlaylistListingAccess([true, false]), "mixed");
assert.equal(resolvePlaylistListingAccess([]), "free");
assert.equal(
  matchesPlaylistListingAccessFilter({ access: "free" }, "all"),
  true,
);
assert.equal(
  matchesPlaylistListingAccessFilter({ access: "paid" }, "free"),
  false,
);

const mixed = [
  candidate({
    id: "a",
    listedAtMs: 30,
    savesCount: 1,
    title: "Новый",
  }),
  candidate({
    id: "b",
    listedAtMs: 10,
    savesCount: 9,
    title: "Популярный",
  }),
  candidate({
    id: "c",
    listedAtMs: 20,
    savesCount: 9,
    title: "Тоже популярный",
  }),
];

assert.deepEqual(
  sortPlaylistListingItems(mixed, "newest").map((item) => item.id),
  ["a", "c", "b"],
);
assert.deepEqual(
  sortPlaylistListingItems(mixed, "popular").map((item) => item.id),
  ["c", "b", "a"],
);

const newestPage = paginatePlaylistListingItems(
  sortPlaylistListingItems(mixed, "newest"),
  { cursor: null, limit: 2, sort: "newest" },
);
assert.deepEqual(
  newestPage.items.map((item) => item.id),
  ["a", "c"],
);
assert.equal(typeof newestPage.nextCursor, "string");

const newestNext = paginatePlaylistListingItems(
  sortPlaylistListingItems(mixed, "newest"),
  { cursor: newestPage.nextCursor, limit: 2, sort: "newest" },
);
assert.deepEqual(
  newestNext.items.map((item) => item.id),
  ["b"],
);
assert.equal(newestNext.nextCursor, null);

const popularSorted = sortPlaylistListingItems(mixed, "popular");
const afterPopularCursor = applyPlaylistListingCursor(
  popularSorted,
  `${listedAtToMs("2026-01-01T00:00:00.000Z")}:c`,
  "popular",
);
assert.deepEqual(
  afterPopularCursor.map((item) => item.id),
  ["b", "a"],
);

const leaked = mapPlaylistCatalogRowToCandidate(
  {
    id: "pl-secret",
    title: "Секрет",
    slug: "secret",
    visibility: "public",
    published_at: "2026-08-25T00:00:00.000Z",
    listed_at: "2026-08-25T00:00:00.000Z",
    is_editorial: true,
    items_count: 1,
    duration_seconds: 60,
    saves_count: 0,
    cover_path: "owners/pl-secret/cover.webp",
  },
  { coverUrl: "https://cdn.example/cover.jpg", access: "free" },
);

assert.ok(leaked);
assert.equal(leaked.class, LISTING_ENTITY_CLASS.PLAYLIST);
assert.equal(leaked.href, "/p/secret");
assert.equal(leaked.coverUrl, "https://cdn.example/cover.jpg");
assert.deepEqual(leaked.topics, []);
assert.equal(playlistListingItemHasForbiddenField(leaked), false);

const withTopics = mapPlaylistCatalogRowToCandidate(
  {
    id: "pl-money",
    title: "Деньги",
    slug: "money",
    visibility: "public",
    published_at: "2026-08-25T00:00:00.000Z",
    listed_at: "2026-08-25T00:00:00.000Z",
    is_editorial: true,
    items_count: 1,
    duration_seconds: 60,
    saves_count: 0,
    cover_path: null,
  },
  { coverUrl: null, access: "free", topics: ["money", "purpose"] },
);
assert.ok(withTopics);
assert.deepEqual(withTopics.topics, ["money", "purpose"]);

for (const field of PLAYLIST_LISTING_FORBIDDEN_FIELDS) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(leaked, field),
    false,
    `listing must not expose ${field}`,
  );
}

const saved = applyPlaylistListingSavedState([leaked], new Set(["pl-secret"]));
assert.equal(saved[0]?.viewer.saved, true);
assert.equal(saved[0]?.viewer.playing, false);

assert.equal(isPrivateRoute("/playlists"), true);
assert.equal(isPrivateRoute("/playlists/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), true);
assert.equal(isPrivateRoute("/playlists/saved"), true);
assert.equal(isPublicPlaylistCatalogPath("/playlists/saved"), false);
assert.equal(isPublicPlaylistCatalogPath("/playlists/catalog"), true);
assert.equal(isPrivateRoute("/playlists/catalog"), false);
assert.equal(isPrivateRoute("/playlists/catalog/"), false);

assert.equal(
  PLAYLIST_CATALOG_UI_HOMES.card,
  "src/components/playlists/catalog/PlaylistCard.tsx",
);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.card)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.grid)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.searchUi)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.sortUi)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.filters)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.topicFilter)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.filterUi)), false);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.saveAction)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.playAction)), true);

const api = readFileSync(
  join(repoRoot, "src/app/api/playlists/catalog/route.ts"),
  "utf8",
);
const page = readFileSync(
  join(
    repoRoot,
    "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx",
  ),
  "utf8",
);
const personalPage = readFileSync(
  join(
    repoRoot,
    "src/app/(platform)/(listener)/(playlists)/playlists/page.tsx",
  ),
  "utf8",
);
const personalDetail = readFileSync(
  join(repoRoot, "src/app/(platform)/playlists/[id]/page.tsx"),
  "utf8",
);

assert.match(api, /listListedPlaylists/);
assert.doesNotMatch(api, /user_id|owner_type|created_by|cover_path|direction_id/);
assert.match(page, /loadPlaylistCatalogPage/);
assert.match(page, /PlaylistCatalogSearch/);
assert.doesNotMatch(page, /PlaylistCatalogSort/);
assert.doesNotMatch(page, /PlaylistCatalogTopicFilter/);
assert.match(page, /PlaylistGrid/);
assert.doesNotMatch(page, /CatalogProductGrid/);
assert.doesNotMatch(page, /PlaylistCatalogFilters|TopicFilterBar/);
assert.doesNotMatch(page, /MobileCatalogSearch|PlatformCatalogInlineSearch/);
assert.doesNotMatch(page, /трек|материал/);

const listingSource = readFileSync(
  join(repoRoot, "src/lib/playlists/listing.ts"),
  "utf8",
);
assert.match(listingSource, /playlist_topics!inner/);
assert.doesNotMatch(listingSource, /listListedPlaylistIdsForTopicKeys/);
assert.match(listingSource, /listPlaylistTopicKeysByPlaylistIds/);
assert.doesNotMatch(listingSource, /item\.topics\.includes/);
assert.doesNotMatch(personalPage, /listListedPlaylists|PlaylistCatalogPage/);
assert.doesNotMatch(personalDetail, /listListedPlaylists|PlaylistCatalogPage/);

console.log("playlist-catalog-listing-unit: ok");
