import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPlaylistListingPopularCursorFilter,
  listListedPlaylists,
  resolvePlaylistListingSqlPlan,
  type PlaylistCatalogRow,
} from "../src/lib/playlists/listing";
import {
  decodePlaylistListingCursor,
  decodePlaylistListingPopularCursor,
  encodePlaylistListingCursor,
  encodePlaylistListingPopularCursor,
  parsePlaylistListingQuery,
  resolvePlaylistListingCursor,
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
const migrationName = "20260825165000_playlist_catalog_popular_index.sql";

assert.equal(
  existsSync(join(repoRoot, "supabase/migrations", migrationName)),
  true,
);
assert.match(listListedPlaylistsSource, /resolvePlaylistListingCursor/);
assert.match(listListedPlaylistsSource, /encodePlaylistListingPopularCursor/);
assert.match(listListedPlaylistsSource, /buildPlaylistListingPopularCursorFilter/);
assert.doesNotMatch(listListedPlaylistsSource, /loadPlaylistListingCursorAnchor/);
assert.doesNotMatch(listListedPlaylistsSource, /sortPlaylistListingItems/);
assert.doesNotMatch(listListedPlaylistsSource, /paginatePlaylistListingItems/);
assert.match(contractSource, /\$\{savesCount\}:\$\{listedAtMs\}:\$\{id\}/);

const SAMPLE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SAMPLE_MS = 1_724_572_800_000;

assert.equal(
  encodePlaylistListingPopularCursor(12, SAMPLE_MS, SAMPLE_ID),
  `12:${SAMPLE_MS}:${SAMPLE_ID}`,
);
assert.deepEqual(decodePlaylistListingPopularCursor(`12:${SAMPLE_MS}:${SAMPLE_ID}`), {
  savesCount: 12,
  listedAtMs: SAMPLE_MS,
  id: SAMPLE_ID,
});
assert.equal(
  decodePlaylistListingPopularCursor(encodePlaylistListingCursor(SAMPLE_MS, SAMPLE_ID)),
  null,
  "newest cursor is not a popular cursor",
);
assert.equal(decodePlaylistListingPopularCursor(`12:${SAMPLE_MS}:pl-1`), null);
assert.equal(decodePlaylistListingPopularCursor(`12.5:${SAMPLE_MS}:${SAMPLE_ID}`), null);
assert.equal(decodePlaylistListingPopularCursor(`-1:${SAMPLE_MS}:${SAMPLE_ID}`), null);
assert.equal(
  decodePlaylistListingPopularCursor(`12:${SAMPLE_MS}:${SAMPLE_ID}:extra`),
  null,
);

assert.equal(
  resolvePlaylistListingCursor(`12:${SAMPLE_MS}:${SAMPLE_ID}`, "newest"),
  null,
  "popular cursor is dropped on newest",
);
assert.equal(
  resolvePlaylistListingCursor(encodePlaylistListingCursor(SAMPLE_MS, SAMPLE_ID), "popular"),
  null,
  "newest cursor is dropped on popular",
);
assert.deepEqual(
  resolvePlaylistListingCursor(`12:${SAMPLE_MS}:${SAMPLE_ID}`, "popular"),
  { sort: "popular", savesCount: 12, listedAtMs: SAMPLE_MS, id: SAMPLE_ID },
);
assert.deepEqual(
  resolvePlaylistListingCursor(encodePlaylistListingCursor(SAMPLE_MS, "pl-1"), "newest"),
  { sort: "newest", listedAtMs: SAMPLE_MS, id: "pl-1" },
);

const popularPlan = resolvePlaylistListingSqlPlan(
  parsePlaylistListingQuery({ sort: "popular", limit: 20 }),
);
assert.deepEqual(
  popularPlan.order.map((entry) => `${entry.column}:${entry.ascending}`),
  ["saves_count:false", "listed_at:false", "id:false"],
);
assert.equal(popularPlan.pageLimit, 21);

type CatalogRow = PlaylistCatalogRow & { description?: string | null };

function listedRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: overrides.id ?? SAMPLE_ID,
    title: overrides.title ?? "Микс",
    slug: overrides.slug ?? "mix",
    visibility: "public",
    published_at: "2026-08-25T00:00:00.000Z",
    listed_at: overrides.listed_at ?? "2026-08-25T00:00:00.000Z",
    is_editorial: true,
    items_count: 2,
    duration_seconds: 120,
    saves_count: overrides.saves_count ?? 7,
    cover_path: overrides.cover_path ?? null,
    description: overrides.description ?? null,
  };
}

function uuidFromIndex(index: number): string {
  return `11111111-1111-4111-8111-${index.toString(16).padStart(12, "0")}`;
}

function popularDesc(rows: CatalogRow[]) {
  return [...rows].sort((left, right) => {
    const leftSaves = left.saves_count ?? 0;
    const rightSaves = right.saves_count ?? 0;

    if (leftSaves !== rightSaves) {
      return rightSaves - leftSaves;
    }

    const leftMs = Date.parse(left.listed_at ?? "");
    const rightMs = Date.parse(right.listed_at ?? "");

    if (leftMs !== rightMs) {
      return rightMs - leftMs;
    }

    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
  });
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

function parseSearchNeedle(orFilter: string) {
  if (!orFilter.includes("title.ilike.")) {
    return null;
  }

  const raw = orFilter.match(/title\.ilike\."%([^%"]+)%"/)?.[1];
  return raw ? raw.replace(/""/g, '"').toLowerCase() : null;
}

function parsePopularCursor(orFilter: string) {
  if (!orFilter.includes("saves_count.lt.")) {
    return null;
  }

  const savesCount = Number(orFilter.match(/saves_count\.lt\.(\d+)/)?.[1]);
  const listedAt = orFilter.match(/listed_at\.lt\."([^"]+)"/)?.[1];
  const id = orFilter.match(/id\.lt\.([^),]+)/)?.[1];

  if (!Number.isInteger(savesCount) || !listedAt || !id) {
    return null;
  }

  return { savesCount, listedAtMs: Date.parse(listedAt), id };
}

function parseNewestCursor(orFilter: string) {
  if (orFilter.includes("saves_count.lt.") || !orFilter.includes("listed_at.lt.")) {
    return null;
  }

  const listedAt = orFilter.match(/listed_at\.lt\."([^"]+)"/)?.[1];
  const id = orFilter.match(/id\.lt\.([^),]+)/)?.[1];

  if (!listedAt || !id) {
    return null;
  }

  return { listedAtMs: Date.parse(listedAt), id };
}

function createPopularListingSupabase(
  rows: CatalogRow[],
  topicAssignments: Record<string, string[]> = {},
) {
  const calls: Array<[string, ...unknown[]]> = [];
  const accessIds: string[][] = [];
  let topicKey: string | null = null;
  const orFilters: string[] = [];
  let sortPopular = false;

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

      if (column === "saves_count") {
        sortPopular = true;
      }

      return this;
    },
    in() {
      return this;
    },
    limit(value: number) {
      calls.push(["playlists.limit", value]);

      let next = sortPopular ? popularDesc(rows) : newestDesc(rows);

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

        const popularCursor = parsePopularCursor(filter);

        if (popularCursor) {
          next = next.filter((row) => {
            const saves = row.saves_count ?? 0;
            const listedAtMs = Date.parse(row.listed_at ?? "");

            if (saves < popularCursor.savesCount) {
              return true;
            }

            if (saves > popularCursor.savesCount) {
              return false;
            }

            if (listedAtMs < popularCursor.listedAtMs) {
              return true;
            }

            if (listedAtMs > popularCursor.listedAtMs) {
              return false;
            }

            return row.id < popularCursor.id;
          });
        }

        const newestCursor = parseNewestCursor(filter);

        if (newestCursor) {
          next = next.filter((row) => {
            const listedAtMs = Date.parse(row.listed_at ?? "");

            if (listedAtMs < newestCursor.listedAtMs) {
              return true;
            }

            if (listedAtMs > newestCursor.listedAtMs) {
              return false;
            }

            return row.id < newestCursor.id;
          });
        }
      }

      return Promise.resolve({ data: next.slice(0, value), error: null });
    },
  };

  return {
    calls,
    accessIds,
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
            const ids = Array.isArray(values) ? values.map(String) : [];
            return Promise.resolve({
              data: ids.flatMap((playlistId) =>
                (topicAssignments[playlistId] ?? []).map((key) => ({
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

const catalog = Array.from({ length: 250 }, (_, index) => {
  const id = uuidFromIndex(index + 1);
  return listedRow({
    id,
    slug: `mix-${index + 1}`,
    title: index === 11 ? "Сонный плейлист" : `Микс ${index + 1}`,
    description: index === 11 ? "Практика для глубокого сна" : "Короткий день",
    listed_at: new Date(Date.UTC(2026, 7, 25, 0, 0, index)).toISOString(),
    saves_count: 7,
    cover_path: `covers/${id}.webp`,
  });
});
const topicAssignments = Object.fromEntries(
  catalog.map((row, index) => [row.id, index % 5 === 0 ? ["calm"] : []]),
);

const expectedPopular = popularDesc(catalog);
const pageQuery = parsePlaylistListingQuery({ sort: "popular", limit: 20 });
const page1Client = createPopularListingSupabase(catalog, topicAssignments);
const page1 = await listListedPlaylists(page1Client as never, pageQuery);

assert.equal(page1.items.length, 20);
assert.deepEqual(
  page1.items.map((item) => item.id),
  expectedPopular.slice(0, 20).map((row) => row.id),
);
assert.equal(
  page1.items.every((item) => item.savesCount === 7),
  true,
  "identical saves_count still paginates by listed_at/id",
);
assert.equal(
  page1.nextCursor,
  encodePlaylistListingPopularCursor(
    7,
    Date.parse(expectedPopular[19]?.listed_at ?? ""),
    expectedPopular[19]?.id ?? "",
  ),
);
assert.deepEqual(
  decodePlaylistListingPopularCursor(page1.nextCursor),
  {
    savesCount: 7,
    listedAtMs: Date.parse(expectedPopular[19]?.listed_at ?? ""),
    id: expectedPopular[19]?.id ?? "",
  },
);
assert.deepEqual(page1Client.accessIds, [page1.items.map((item) => item.id)]);
assert.equal(page1Client.accessIds[0]?.length, 20);
assert.match(
  String(
    page1Client.calls.find((call) => call[0] === "playlists.or" && String(call[1]).includes("saves_count"))
      ?? "",
  ),
  /^$/,
);

const page2Client = createPopularListingSupabase(catalog, topicAssignments);
const page2 = await listListedPlaylists(page2Client as never, {
  ...pageQuery,
  cursor: page1.nextCursor,
});

assert.equal(page2.items.length, 20);
assert.deepEqual(
  page2.items.map((item) => item.id),
  expectedPopular.slice(20, 40).map((row) => row.id),
);
assert.deepEqual(
  page2.items.filter((item) => page1.items.some((first) => first.id === item.id)),
  [],
  "popular pages must not duplicate",
);
assert.match(
  String(page2Client.calls.find((call) => call[0] === "playlists.or")?.[1]),
  /saves_count\.lt\.7/,
);
assert.equal(
  String(page2Client.calls.find((call) => call[0] === "playlists.or")?.[1]),
  buildPlaylistListingPopularCursorFilter({
    savesCount: 7,
    listedAtMs: Date.parse(expectedPopular[19]?.listed_at ?? ""),
    id: expectedPopular[19]?.id ?? "",
  }),
);
assert.equal(page2Client.accessIds[0]?.length, 20);

const searchClient = createPopularListingSupabase(catalog, topicAssignments);
const searchResult = await listListedPlaylists(
  searchClient as never,
  parsePlaylistListingQuery({ q: "глубокого", sort: "popular", limit: 20 }),
);
assert.deepEqual(searchResult.items.map((item) => item.id), [uuidFromIndex(12)]);
assert.match(
  String(searchClient.calls.find((call) => call[0] === "playlists.or")?.[1]),
  /description\.ilike/,
);
assert.deepEqual(
  searchClient.calls
    .filter((call) => call[0] === "playlists.order")
    .map((call) => `${call[1]}:${(call[2] as { ascending: boolean }).ascending}`),
  ["saves_count:false", "listed_at:false", "id:false"],
);

const topicClient = createPopularListingSupabase(catalog, topicAssignments);
const topicResult = await listListedPlaylists(
  topicClient as never,
  parsePlaylistListingQuery({ topic: "calm", sort: "popular", limit: 20 }),
);
const expectedTopic = expectedPopular
  .filter((row) => topicAssignments[row.id]?.includes("calm"))
  .slice(0, 20)
  .map((row) => row.id);
assert.deepEqual(topicResult.items.map((item) => item.id), expectedTopic);
assert.match(
  String(topicClient.calls.find((call) => call[0] === "playlists.select")?.[1]),
  /playlist_topics!inner/,
);

const mismatchedClient = createPopularListingSupabase(catalog, topicAssignments);
const newestCursor = encodePlaylistListingCursor(
  Date.parse(expectedPopular[19]?.listed_at ?? ""),
  expectedPopular[19]?.id ?? "",
);
const mismatched = await listListedPlaylists(mismatchedClient as never, {
  ...pageQuery,
  cursor: newestCursor,
});
assert.deepEqual(
  mismatched.items.map((item) => item.id),
  expectedPopular.slice(0, 20).map((row) => row.id),
  "newest cursor on popular resets to first page",
);
assert.equal(
  mismatchedClient.calls.some(
    (call) => call[0] === "playlists.or" && String(call[1]).includes("saves_count.lt."),
  ),
  false,
);
assert.equal(decodePlaylistListingCursor(newestCursor)?.id, expectedPopular[19]?.id);

const newestClient = createPopularListingSupabase(catalog, topicAssignments);
const newestPage1 = await listListedPlaylists(
  newestClient as never,
  parsePlaylistListingQuery({ sort: "newest", limit: 20 }),
);
const expectedNewest = newestDesc(catalog);
assert.deepEqual(
  newestPage1.items.map((item) => item.id),
  expectedNewest.slice(0, 20).map((row) => row.id),
);
assert.equal(
  newestPage1.nextCursor,
  encodePlaylistListingCursor(
    Date.parse(expectedNewest[19]?.listed_at ?? ""),
    expectedNewest[19]?.id ?? "",
  ),
);
assert.doesNotMatch(newestPage1.nextCursor ?? "", /^7:/);

const newestPage2 = await listListedPlaylists(
  createPopularListingSupabase(catalog, topicAssignments) as never,
  {
    ...parsePlaylistListingQuery({ sort: "newest", limit: 20 }),
    cursor: newestPage1.nextCursor,
  },
);
assert.deepEqual(
  newestPage2.items.map((item) => item.id),
  expectedNewest.slice(20, 40).map((row) => row.id),
);
assert.doesNotMatch(listingSource, /item\.topics\.includes/);

console.log("playlist-catalog-popular-keyset-unit: ok");
