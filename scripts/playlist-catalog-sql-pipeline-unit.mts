import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAYLIST_CATALOG_LISTING_SELECT,
  PLAYLIST_CATALOG_TOPIC_EXISTS_EMBED,
  buildPlaylistCatalogListingSelect,
  buildPlaylistListingSearchOrFilter,
  listListedPlaylists,
  resolvePlaylistListingSqlPlan,
  type PlaylistCatalogRow,
} from "../src/lib/playlists/listing";
import {
  decodePlaylistListingCursor,
  parsePlaylistListingQuery,
} from "../src/lib/playlists/listing-contract";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const listingSource = readFileSync(
  join(repoRoot, "src/lib/playlists/listing.ts"),
  "utf8",
);
const contractSource = readFileSync(
  join(repoRoot, "src/lib/playlists/listing-contract.ts"),
  "utf8",
);
const listListedPlaylistsSource = listingSource.slice(
  listingSource.indexOf("export async function listListedPlaylists"),
);

assert.doesNotMatch(contractSource, /PLAYLIST_LISTING_FETCH_LIMIT/);
assert.doesNotMatch(listingSource, /PLAYLIST_LISTING_FETCH_LIMIT/);
assert.doesNotMatch(listListedPlaylistsSource, /matchesPlaylistListingSearch/);
assert.doesNotMatch(listListedPlaylistsSource, /sortPlaylistListingItems/);
assert.doesNotMatch(listListedPlaylistsSource, /paginatePlaylistListingItems/);
assert.doesNotMatch(listListedPlaylistsSource, /applyPlaylistListingCursor/);
assert.doesNotMatch(listListedPlaylistsSource, /matchesPlaylistListingAccessFilter/);
assert.doesNotMatch(listListedPlaylistsSource, /listListedPlaylistIdsForTopicKeys/);
assert.doesNotMatch(listListedPlaylistsSource, /loadPlaylistListingCursorAnchor/);
assert.match(listListedPlaylistsSource, /encodePlaylistListingPopularCursor/);
assert.match(listListedPlaylistsSource, /signPlaylistListingCovers\(pageRows\)/);
assert.match(listListedPlaylistsSource, /loadPlaylistListingAccessByIds\(\s*supabase,\s*pageIds/);
assert.match(
  listListedPlaylistsSource,
  /listPlaylistTopicKeysByPlaylistIds\(\s*supabase,\s*pageIds/,
);
assert.match(listingSource, /playlist_topics!inner/);
assert.equal(
  PLAYLIST_CATALOG_TOPIC_EXISTS_EMBED,
  "playlist_topics!inner(topics!inner(key, is_active))",
);
assert.match(buildPlaylistCatalogListingSelect("calm"), /playlist_topics!inner/);
assert.equal(buildPlaylistCatalogListingSelect(null), PLAYLIST_CATALOG_LISTING_SELECT);
assert.doesNotMatch(buildPlaylistCatalogListingSelect(null), /playlist_topics/);

type CatalogRow = PlaylistCatalogRow & { description?: string | null };

function listedRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
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
    cover_path: overrides.cover_path ?? `covers/${overrides.id ?? "pl-1"}.webp`,
    description: overrides.description ?? null,
  };
}

function newestDesc(rows: CatalogRow[]) {
  return [...rows].sort((left, right) => {
    const leftMs = Date.parse(left.listed_at ?? "");
    const rightMs = Date.parse(right.listed_at ?? "");

    if (leftMs !== rightMs) {
      return rightMs - leftMs;
    }

    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
  });
}

function parseNewestCursor(orFilter: string) {
  if (!orFilter.includes("listed_at.lt.")) {
    return null;
  }

  const listedAt = orFilter.match(/listed_at\.lt\."([^"]+)"/)?.[1];
  const id = orFilter.match(/id\.lt\.([^),]+)/)?.[1];

  if (!listedAt || !id) {
    return null;
  }

  return { listedAtMs: Date.parse(listedAt), id };
}

function parseSearchNeedle(orFilter: string) {
  if (!orFilter.includes("title.ilike.")) {
    return null;
  }

  const raw = orFilter.match(/title\.ilike\."%([^%"]+)%"/)?.[1];
  return raw ? raw.replace(/""/g, '"').toLowerCase() : null;
}

function createSqlPipelineSupabase(
  rows: CatalogRow[],
  topicAssignments: Record<string, string[]> = {},
) {
  const calls: Array<[string, ...unknown[]]> = [];
  const accessIds: string[][] = [];
  const topicHydrationIds: string[][] = [];
  let topicKey: string | null = null;
  const orFilters: string[] = [];

  const playlistsBuilder = {
    select(columns?: string) {
      calls.push(["playlists.select", columns]);
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push(["playlists.eq", column, value]);

      if (column === "playlist_topics.topics.key" && typeof value === "string") {
        topicKey = value;
      }

      return this;
    },
    not(column: string, operator: string, value: unknown) {
      calls.push(["playlists.not", column, operator, value]);
      return this;
    },
    or(filter: string) {
      orFilters.push(filter);
      calls.push(["playlists.or", filter]);
      return this;
    },
    order(column: string, options: { ascending: boolean }) {
      calls.push(["playlists.order", column, options]);
      return this;
    },
    in(column: string, values: unknown) {
      calls.push(["playlists.in", column, values]);
      return this;
    },
    limit(value: number) {
      calls.push(["playlists.limit", value]);

      let next = newestDesc(rows);

      if (topicKey) {
        next = next.filter((row) =>
          (topicAssignments[row.id] ?? []).includes(topicKey as string),
        );
      }

      for (const filter of orFilters) {
        const needle = parseSearchNeedle(filter);

        if (needle) {
          next = next.filter(
            (row) =>
              row.title.toLowerCase().includes(needle) ||
              (row.description ?? "").toLowerCase().includes(needle),
          );
        }

        const cursor = parseNewestCursor(filter);

        if (cursor) {
          next = next.filter((row) => {
            const listedAtMs = Date.parse(row.listed_at ?? "");

            if (listedAtMs < cursor.listedAtMs) {
              return true;
            }

            if (listedAtMs > cursor.listedAtMs) {
              return false;
            }

            return row.id < cursor.id;
          });
        }
      }

      return Promise.resolve({ data: next.slice(0, value), error: null });
    },
  };

  return {
    calls,
    accessIds,
    topicHydrationIds,
    from(table: string) {
      if (table === "playlists") {
        return playlistsBuilder;
      }

      if (table === "playlist_items") {
        return {
          select() {
            return this;
          },
          in(_column: string, values: unknown) {
            accessIds.push(Array.isArray(values) ? [...values] : []);
            return Promise.resolve({ data: [], error: null });
          },
        };
      }

      if (table === "playlist_topics") {
        return {
          select() {
            return this;
          },
          in(_column: string, values: unknown) {
            const ids = Array.isArray(values) ? [...values] : [];
            topicHydrationIds.push(ids);
            return Promise.resolve({
              data: ids.flatMap((playlistId) =>
                (topicAssignments[String(playlistId)] ?? []).map((key) => ({
                  playlist_id: playlistId,
                  topics: { key, sort_order: 10, is_active: true },
                })),
              ),
              error: null,
            });
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

const newestPlan = resolvePlaylistListingSqlPlan({
  q: "",
  topic: null,
  access: "all",
  sort: "newest",
  cursor: null,
  limit: 20,
});
assert.equal(newestPlan.pageLimit, 21);
assert.deepEqual(
  newestPlan.order.map((entry) => `${entry.column}:${entry.ascending}`),
  ["listed_at:false", "id:false"],
);
assert.equal(newestPlan.searchFilter, null);
assert.deepEqual(newestPlan.topicKeys, []);

const topicPlan = resolvePlaylistListingSqlPlan(
  parsePlaylistListingQuery({ topic: "calm", q: "sleep", sort: "newest" }),
);
assert.deepEqual(topicPlan.topicKeys, ["calm"]);
assert.equal(topicPlan.searchFilter, buildPlaylistListingSearchOrFilter("sleep"));
assert.match(topicPlan.select, /playlist_topics!inner/);

const catalog = Array.from({ length: 250 }, (_, index) => {
  const n = String(index + 1).padStart(3, "0");
  return listedRow({
    id: `pl-${n}`,
    slug: `mix-${n}`,
    title: index === 7 ? "Ночной микс" : `Микс ${n}`,
    description: index === 7 ? "Практика для сна и восстановления" : "Короткий день",
    listed_at: new Date(Date.UTC(2026, 7, 25, 0, 0, index)).toISOString(),
    saves_count: index,
    cover_path: `covers/pl-${n}.webp`,
  });
});
const topicAssignments = Object.fromEntries(
  catalog.map((row, index) => [row.id, index % 4 === 0 ? ["calm"] : []]),
);

const pageQuery = parsePlaylistListingQuery({ sort: "newest", limit: 20 });
const page1Client = createSqlPipelineSupabase(catalog, topicAssignments);
const page1 = await listListedPlaylists(page1Client as never, pageQuery);

assert.equal(page1.items.length, 20);
assert.equal(typeof page1.nextCursor, "string");
assert.deepEqual(
  page1Client.calls.filter((call) => call[0] === "playlists.limit"),
  [["playlists.limit", 21]],
);
assert.deepEqual(page1Client.accessIds, [page1.items.map((item) => item.id)]);
assert.deepEqual(page1Client.topicHydrationIds, [page1.items.map((item) => item.id)]);
assert.equal(page1Client.accessIds[0]?.length, 20);
assert.equal(page1Client.topicHydrationIds[0]?.length, 20);

const expectedNewest = newestDesc(catalog);
assert.deepEqual(
  page1.items.map((item) => item.id),
  expectedNewest.slice(0, 20).map((row) => row.id),
);

const page2Client = createSqlPipelineSupabase(catalog, topicAssignments);
const page2 = await listListedPlaylists(page2Client as never, {
  ...pageQuery,
  cursor: page1.nextCursor,
});

assert.equal(page2.items.length, 20);
assert.equal(typeof page2.nextCursor, "string");
assert.deepEqual(
  page2.items.map((item) => item.id),
  expectedNewest.slice(20, 40).map((row) => row.id),
);

const page1Ids = new Set(page1.items.map((item) => item.id));
const overlap = page2.items.filter((item) => page1Ids.has(item.id));
assert.deepEqual(overlap, [], "cursor pages must not duplicate");
assert.equal(page2.items[0]?.id, expectedNewest[20]?.id, "page 2 has no gaps");

const decoded = decodePlaylistListingCursor(page1.nextCursor);
assert.ok(decoded);
assert.equal(decoded.id, page1.items[19]?.id);

const descriptionClient = createSqlPipelineSupabase(catalog, topicAssignments);
const descriptionResult = await listListedPlaylists(
  descriptionClient as never,
  parsePlaylistListingQuery({ q: "восстановления", sort: "newest", limit: 20 }),
);
assert.deepEqual(
  descriptionResult.items.map((item) => item.id),
  ["pl-008"],
  "q matches description in SQL",
);
assert.match(
  String(descriptionClient.calls.find((call) => call[0] === "playlists.or")?.[1]),
  /description\.ilike/,
);

const topicClient = createSqlPipelineSupabase(catalog, topicAssignments);
const topicResult = await listListedPlaylists(
  topicClient as never,
  parsePlaylistListingQuery({ topic: "calm", sort: "newest", limit: 20 }),
);
const expectedTopicIds = expectedNewest
  .filter((row) => topicAssignments[row.id]?.includes("calm"))
  .slice(0, 20)
  .map((row) => row.id);

assert.deepEqual(topicResult.items.map((item) => item.id), expectedTopicIds);
assert.match(
  String(topicClient.calls.find((call) => call[0] === "playlists.select")?.[1]),
  /playlist_topics!inner/,
);
assert.deepEqual(
  topicClient.calls.filter((call) => call[0] === "playlists.eq" && call[1] === "playlist_topics.topics.key"),
  [["playlists.eq", "playlist_topics.topics.key", "calm"]],
);
assert.equal(topicResult.items.every((item) => item.topics.includes("calm")), true);
assert.equal(topicClient.accessIds[0]?.length, topicResult.items.length);
assert.ok((topicClient.accessIds[0]?.length ?? 0) <= 20);

console.log("playlist-catalog-sql-pipeline-unit: ok");
