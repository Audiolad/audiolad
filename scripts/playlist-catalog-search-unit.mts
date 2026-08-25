import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { escapeIlikePattern } from "../src/lib/catalog/search";
import { PLAYLIST_CATALOG_UI_HOMES } from "../src/lib/playlists/catalog-ui-homes";
import { parsePlaylistListingQuery } from "../src/lib/playlists/listing-contract";
import {
  PLAYLIST_CATALOG_PATH,
  PLAYLIST_CATALOG_SEARCH_DEBOUNCE_MS,
  PLAYLIST_CATALOG_SORT_OPTIONS,
  buildPlaylistCatalogHref,
} from "../src/lib/playlists/listing-filters";
import {
  buildPlaylistListingSearchOrFilter,
  listListedPlaylists,
  matchesPlaylistListingSearch,
  resolvePlaylistListingSqlPlan,
  type PlaylistCatalogRow,
} from "../src/lib/playlists/listing";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const listingSource = read("src/lib/playlists/listing.ts");
const pageSource = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx",
);
const searchUiSource = read(
  "src/components/playlists/catalog/PlaylistCatalogSearch.tsx",
);
const sortUiSource = read(
  "src/components/playlists/catalog/PlaylistCatalogSort.tsx",
);
const filtersSource = read("src/lib/playlists/listing-filters.ts");
const listListedPlaylistsSource = listingSource.slice(
  listingSource.indexOf("export async function listListedPlaylists"),
);

function listedRow(
  overrides: Partial<PlaylistCatalogRow> = {},
): PlaylistCatalogRow {
  return {
    id: overrides.id ?? "pl-1",
    title: overrides.title ?? "Утренний фокус",
    slug: overrides.slug ?? "morning-focus",
    visibility: "public",
    published_at: "2026-08-25T00:00:00.000Z",
    listed_at: overrides.listed_at ?? "2026-08-25T00:00:00.000Z",
    is_editorial: true,
    items_count: 2,
    duration_seconds: 120,
    saves_count: overrides.saves_count ?? 1,
    cover_path: null,
  };
}

function createListingSupabase(rows: PlaylistCatalogRow[]) {
  const calls: Array<[string, ...unknown[]]> = [];

  const playlistsBuilder = {
    select() {
      calls.push(["select"]);
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return this;
    },
    not(column: string, operator: string, value: unknown) {
      calls.push(["not", column, operator, value]);
      return this;
    },
    or(filter: string) {
      calls.push(["or", filter]);
      return this;
    },
    order(column: string, options: { ascending: boolean }) {
      calls.push(["order", column, options]);
      return this;
    },
    in(column: string, values: unknown) {
      calls.push(["in", column, values]);
      return this;
    },
    limit(value: number) {
      calls.push(["limit", value]);
      return Promise.resolve({ data: rows.slice(0, value), error: null });
    },
  };

  return {
    calls,
    from(table: string) {
      if (table === "playlists") {
        return playlistsBuilder;
      }

      if (table === "playlist_items" || table === "playlist_topics") {
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

assert.equal(PLAYLIST_CATALOG_PATH, "/playlists/catalog");
assert.equal(PLAYLIST_CATALOG_SEARCH_DEBOUNCE_MS, 300);
assert.deepEqual(
  PLAYLIST_CATALOG_SORT_OPTIONS.map((option) => option.value),
  ["newest", "popular"],
);

assert.equal(buildPlaylistCatalogHref({}), "/playlists/catalog");
assert.equal(buildPlaylistCatalogHref({ q: "music" }), "/playlists/catalog?q=music");
assert.equal(
  buildPlaylistCatalogHref({ sort: "popular" }),
  "/playlists/catalog?sort=popular",
);
assert.equal(
  buildPlaylistCatalogHref({ q: "music", sort: "popular" }),
  "/playlists/catalog?q=music&sort=popular",
);
assert.equal(
  buildPlaylistCatalogHref({ q: "music", sort: "newest" }),
  "/playlists/catalog?q=music",
);
assert.equal(
  buildPlaylistCatalogHref({ q: "sleep", sort: "popular", topic: "calm" }),
  "/playlists/catalog?q=sleep&sort=popular&topic=calm",
);
assert.equal(
  buildPlaylistCatalogHref({ q: "sleep", sort: "popular", topic: null }),
  "/playlists/catalog?q=sleep&sort=popular",
);
assert.doesNotMatch(buildPlaylistCatalogHref({ q: "music" }), /topic|access|cursor/);

assert.equal(
  matchesPlaylistListingSearch(
    { title: "Утренний фокус", description: "Короткий старт" },
    "фокус",
  ),
  true,
  "q matches title",
);
assert.equal(
  matchesPlaylistListingSearch(
    { title: "Утренний старт", description: "Практика для фокуса" },
    "фокуса",
  ),
  true,
  "q matches description",
);
assert.equal(
  matchesPlaylistListingSearch(
    { title: "Утренний старт", description: "Короткий день", creator: "АудиоЛад" },
    "аудиолад",
  ),
  false,
  "q does not search creator",
);

const titleNeedle = "утренний фокус";
const expectedPattern = `%${escapeIlikePattern(titleNeedle)}%`;
assert.equal(
  buildPlaylistListingSearchOrFilter(titleNeedle),
  `title.ilike."${expectedPattern}",description.ilike."${expectedPattern}"`,
);
const musicSearchFilter = buildPlaylistListingSearchOrFilter("music");
assert.ok(musicSearchFilter);
assert.doesNotMatch(musicSearchFilter, /creator|author|topic|playlist_topics/);
assert.match(listingSource, /escapeIlikePattern/);
assert.match(listingSource, /buildPlaylistListingSearchOrFilter/);
assert.match(listingSource, /\.or\(plan\.searchFilter\)/);
assert.match(listingSource, /resolvePlaylistListingSqlPlan/);
assert.doesNotMatch(listListedPlaylistsSource, /matchesPlaylistListingSearch/);
assert.doesNotMatch(listListedPlaylistsSource, /PLAYLIST_LISTING_FETCH_LIMIT/);
assert.doesNotMatch(listingSource, /PLAYLIST_LISTING_FETCH_LIMIT/);
assert.doesNotMatch(listingSource, /\.limit\(PLAYLIST_LISTING_FETCH_LIMIT\)/);
assert.doesNotMatch(listingSource, /slice\(0, PLAYLIST_LISTING_FETCH_LIMIT\)/);

const newestSearchPlan = resolvePlaylistListingSqlPlan({
  q: "music",
  sort: "newest",
  access: "all",
  topic: null,
  cursor: null,
  limit: 12,
});
assert.equal(
  newestSearchPlan.searchFilter,
  buildPlaylistListingSearchOrFilter("music"),
);
assert.equal(newestSearchPlan.pageLimit, 13);
assert.deepEqual(
  newestSearchPlan.order.map((entry) => `${entry.column}:${entry.ascending}`),
  ["listed_at:false", "id:false"],
);

const popularSearchPlan = resolvePlaylistListingSqlPlan({
  q: "music",
  sort: "popular",
  access: "all",
  topic: null,
  cursor: null,
  limit: 12,
});
assert.equal(
  popularSearchPlan.searchFilter,
  buildPlaylistListingSearchOrFilter("music"),
);
assert.deepEqual(
  popularSearchPlan.order.map((entry) => `${entry.column}:${entry.ascending}`),
  ["saves_count:false", "listed_at:false", "id:false"],
);

const searchQuery = parsePlaylistListingQuery({
  q: "music",
  sort: "popular",
  limit: 12,
});
const manyRows = Array.from({ length: 250 }, (_, index) =>
  listedRow({
    id: `pl-${String(index + 1).padStart(3, "0")}`,
    slug: `music-${index + 1}`,
    title: `Music mix ${index + 1}`,
    listed_at: new Date(Date.UTC(2026, 7, 25, 0, 0, index)).toISOString(),
    saves_count: index,
  }),
);
const supabase = createListingSupabase(manyRows);
const result = await listListedPlaylists(
  supabase as never,
  searchQuery,
);

const orFilters = supabase.calls
  .filter((call) => call[0] === "or")
  .map((call) => String(call[1]));
const orderCalls = supabase.calls.filter((call) => call[0] === "order");
const limitCalls = supabase.calls.filter((call) => call[0] === "limit");

assert.deepEqual(orFilters, [buildPlaylistListingSearchOrFilter("music")]);
assert.equal(orFilters[0]?.includes("title.ilike."), true);
assert.equal(orFilters[0]?.includes("description.ilike."), true);
assert.equal(
  supabase.calls.findIndex((call) => call[0] === "or") <
    supabase.calls.findIndex((call) => call[0] === "order"),
  true,
  "SQL search runs before order",
);
assert.equal(
  supabase.calls.findIndex((call) => call[0] === "order") <
    supabase.calls.findIndex((call) => call[0] === "limit"),
  true,
  "order runs before limit",
);
assert.deepEqual(
  orderCalls.map((call) => `${call[1]}:${(call[2] as { ascending: boolean }).ascending}`),
  ["saves_count:false", "listed_at:false", "id:false"],
);
assert.deepEqual(limitCalls, [["limit", 13]]);
assert.equal(limitCalls[0]?.[1], 13);
assert.equal(result.items.length, 12);
assert.equal(typeof result.nextCursor, "string");

assert.match(pageSource, /PlaylistCatalogSearch/);
assert.match(pageSource, /PlaylistCatalogSort/);
assert.match(pageSource, /PlaylistCatalogTopicFilter/);
assert.match(pageSource, /Ничего не нашлось/);
assert.match(pageSource, /Пока нет плейлистов в витрине/);
assert.match(pageSource, /В этой теме пока нет плейлистов/);
assert.match(pageSource, /loadPlaylistCatalogPage\(params\)/);
assert.doesNotMatch(pageSource, /PlaylistCatalogFilters/);
assert.doesNotMatch(pageSource, /CatalogProductGrid/);
assert.doesNotMatch(pageSource, /MobileCatalogSearch/);
assert.doesNotMatch(pageSource, /PlatformCatalogInlineSearch/);
assert.doesNotMatch(pageSource, /playlist_topics/);
assert.doesNotMatch(pageSource, /\?topic=/);

assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.searchUi)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.sortUi)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.filters)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.filterUi)), false);

assert.match(searchUiSource, /debounce/i);
assert.match(searchUiSource, /buildPlaylistCatalogHref/);
assert.match(searchUiSource, /PLAYLIST_CATALOG_SEARCH_DEBOUNCE_MS/);
assert.doesNotMatch(
  searchUiSource,
  /from ["']@\/components\/catalog\/MobileCatalogSearch["']/,
);
assert.doesNotMatch(
  searchUiSource,
  /from ["']@\/components\/platform\/PlatformCatalogInlineSearch["']/,
);
assert.doesNotMatch(searchUiSource, /useSearchParams/);
assert.doesNotMatch(searchUiSource, /playlist_topics|access=/);
assert.match(searchUiSource, /topic/);

assert.match(sortUiSource, /PLAYLIST_CATALOG_SORT_OPTIONS/);
assert.match(sortUiSource, /option\.label/);
assert.match(sortUiSource, /buildPlaylistCatalogHref/);
assert.doesNotMatch(sortUiSource, /<select|<option|dropdown|sheet/i);
assert.doesNotMatch(sortUiSource, /playlist_topics/);
assert.match(sortUiSource, /topic/);

assert.match(filtersSource, /Новые/);
assert.match(filtersSource, /Популярные/);
assert.match(filtersSource, /value: "newest"/);
assert.match(filtersSource, /value: "popular"/);
assert.match(filtersSource, /params\.set\("topic"/);
assert.doesNotMatch(filtersSource, /params\.set\("access"/);
assert.doesNotMatch(filtersSource, /duration|recommend/);

console.log("playlist-catalog-search-unit: ok");
