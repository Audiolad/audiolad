import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { listListedPlaylists, type PlaylistCatalogRow } from "../src/lib/playlists/listing";
import { parsePlaylistListingQuery } from "../src/lib/playlists/listing-contract";
import {
  PLAYLIST_TOPIC_LIMIT,
  PLAYLIST_TOPICS_TABLE,
  SET_PLAYLIST_TOPICS_RPC,
  getActiveTopicIdsByKeys,
  getPlaylistTopicKeys,
  isSetPlaylistTopicsResult,
  listListedPlaylistIdsForTopicKeys,
  listPlaylistTopicKeysByPlaylistIds,
  mapPlaylistTopicKeys,
  normalizePlaylistTopicKeys,
} from "../src/lib/playlists/playlist-topics";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20260825161000_playlist_topics.sql";
const migration = readFileSync(
  join(repoRoot, "supabase/migrations", migrationName),
  "utf8",
);
const listingSource = readFileSync(
  join(repoRoot, "src/lib/playlists/listing.ts"),
  "utf8",
);
const pageSource = readFileSync(
  join(
    repoRoot,
    "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx",
  ),
  "utf8",
);
const cardSource = readFileSync(
  join(repoRoot, "src/components/playlists/catalog/PlaylistCard.tsx"),
  "utf8",
);

assert.equal(existsSync(join(repoRoot, "supabase/migrations", migrationName)), true);
assert.equal(PLAYLIST_TOPICS_TABLE, "playlist_topics");
assert.equal(PLAYLIST_TOPIC_LIMIT, 3);
assert.equal(SET_PLAYLIST_TOPICS_RPC, "set_playlist_topics");

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.playlist_topics/);
assert.match(migration, /playlist_id uuid NOT NULL/);
assert.match(migration, /topic_id uuid NOT NULL/);
assert.match(migration, /REFERENCES public\.playlists \(id\) ON DELETE CASCADE/);
assert.match(migration, /REFERENCES public\.topics \(id\) ON DELETE CASCADE/);
assert.match(migration, /PRIMARY KEY \(playlist_id, topic_id\)/);
assert.match(migration, /playlist_topics_topic_id_idx/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_playlist_topics/);
assert.match(migration, /topic_limit_exceeded/);
assert.match(migration, /duplicate_topic_keys/);
assert.match(migration, /topic_not_found/);
assert.match(migration, /t\.is_active = true/);
assert.match(migration, /cardinality\(v_keys\) > v_limit/);
assert.match(migration, /v_limit integer := 3/);
assert.match(migration, /DELETE FROM public\.playlist_topics/);
assert.match(migration, /GRANT SELECT ON TABLE public\.playlist_topics TO anon, authenticated/);
assert.doesNotMatch(migration, /GRANT INSERT ON TABLE public\.playlist_topics/);
assert.doesNotMatch(migration, /FOR INSERT/);
assert.doesNotMatch(migration, /ADD COLUMN.*direction_id|playlists\.direction_id/);
assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS public\.topics/);
assert.doesNotMatch(migration, /ALTER TABLE public\.practice_topics/);

assert.deepEqual(normalizePlaylistTopicKeys("Money"), ["money"]);
assert.deepEqual(normalizePlaylistTopicKeys(["purpose", "money", "purpose"]), [
  "purpose",
  "money",
]);
assert.deepEqual(
  mapPlaylistTopicKeys([
    { key: "money", title: "Деньги" },
    { key: "purpose", slug: "purpose" },
    { key: "money" },
  ]),
  ["money", "purpose"],
);
assert.equal(
  isSetPlaylistTopicsResult({
    playlist_id: "pl-1",
    topic_keys: ["money"],
    topic_count: 1,
    topic_limit: 3,
  }),
  true,
);

const MONEY = "11111111-1111-4111-8111-111111111111";
const WITH_MONEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WITH_PURPOSE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WITHOUT_TOPIC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function listedRow(
  overrides: Partial<PlaylistCatalogRow> = {},
): PlaylistCatalogRow {
  return {
    id: overrides.id ?? WITH_MONEY,
    title: overrides.title ?? "Деньги",
    slug: overrides.slug ?? "money-mix",
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

function createTopicsSupabase(options: {
  topicRows?: Array<{ id: string; key: string }>;
  assignmentRows?: Array<{ playlist_id: string; topic_id?: string }>;
  playlistTopicRows?: Array<{
    playlist_id: string;
    topics: { key: string; sort_order: number; is_active: boolean };
  }>;
  playlistRows?: PlaylistCatalogRow[];
}) {
  const calls: Array<[string, ...unknown[]]> = [];

  function tableBuilder(table: string, result: unknown) {
    return {
      select() {
        calls.push([`${table}.select`]);
        return this;
      },
      eq(column: string, value: unknown) {
        calls.push([`${table}.eq`, column, value]);
        return this;
      },
      not(column: string, operator: string, value: unknown) {
        calls.push([`${table}.not`, column, operator, value]);
        return this;
      },
      or(filter: string) {
        calls.push([`${table}.or`, filter]);
        return this;
      },
      order(column: string, opts: { ascending: boolean }) {
        calls.push([`${table}.order`, column, opts]);
        return this;
      },
      in(column: string, values: unknown) {
        calls.push([`${table}.in`, column, values]);
        return table === "playlists" ? this : Promise.resolve({ data: result, error: null });
      },
      limit(value: number) {
        calls.push([`${table}.limit`, value]);
        return Promise.resolve({ data: result, error: null });
      },
    };
  }

  return {
    calls,
    from(table: string) {
      if (table === "topics") {
        return tableBuilder(table, options.topicRows ?? []);
      }

      if (table === "playlist_topics") {
        return tableBuilder(
          table,
          options.playlistTopicRows ?? options.assignmentRows ?? [],
        );
      }

      if (table === "playlists") {
        return tableBuilder(table, options.playlistRows ?? []);
      }

      if (table === "playlist_items") {
        return tableBuilder(table, []);
      }

      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  };
}

const topicIds = await getActiveTopicIdsByKeys(
  createTopicsSupabase({
    topicRows: [{ id: MONEY, key: "money" }],
  }) as never,
  "money",
);
assert.deepEqual([...topicIds.entries()], [["money", MONEY]]);

const filteredIds = await listListedPlaylistIdsForTopicKeys(
  createTopicsSupabase({
    topicRows: [{ id: MONEY, key: "money" }],
    assignmentRows: [{ playlist_id: WITH_MONEY, topic_id: MONEY }],
  }) as never,
  "money",
);
assert.deepEqual(filteredIds, [WITH_MONEY]);

const unknownTopicIds = await listListedPlaylistIdsForTopicKeys(
  createTopicsSupabase({ topicRows: [] }) as never,
  "missing-topic",
);
assert.deepEqual(unknownTopicIds, []);

const keysById = await listPlaylistTopicKeysByPlaylistIds(
  createTopicsSupabase({
    playlistTopicRows: [
      {
        playlist_id: WITH_MONEY,
        topics: { key: "money", sort_order: 10, is_active: true },
      },
      {
        playlist_id: WITH_MONEY,
        topics: { key: "purpose", sort_order: 70, is_active: true },
      },
      {
        playlist_id: WITH_MONEY,
        topics: { key: "hidden", sort_order: 1, is_active: false },
      },
    ],
  }) as never,
  [WITH_MONEY],
);
assert.deepEqual(keysById.get(WITH_MONEY), ["money", "purpose"]);

const singleKeys = await getPlaylistTopicKeys(
  createTopicsSupabase({
    playlistTopicRows: [
      {
        playlist_id: WITH_MONEY,
        topics: { key: "money", sort_order: 10, is_active: true },
      },
    ],
  }) as never,
  WITH_MONEY,
);
assert.deepEqual(singleKeys, ["money"]);

const catalogRows = [
  listedRow({
    id: WITH_MONEY,
    title: "Деньги",
    slug: "money-mix",
    listed_at: "2026-08-25T00:02:00.000Z",
    saves_count: 2,
  }),
  listedRow({
    id: WITH_PURPOSE,
    title: "Предназначение",
    slug: "purpose-mix",
    listed_at: "2026-08-25T00:01:00.000Z",
    saves_count: 9,
  }),
  listedRow({
    id: WITHOUT_TOPIC,
    title: "Без темы",
    slug: "no-topic",
    listed_at: "2026-08-25T00:00:00.000Z",
    saves_count: 1,
  }),
];

const moneyListing = await listListedPlaylists(
  createTopicsSupabase({
    topicRows: [{ id: MONEY, key: "money" }],
    assignmentRows: [{ playlist_id: WITH_MONEY, topic_id: MONEY }],
    playlistTopicRows: [
      {
        playlist_id: WITH_MONEY,
        topics: { key: "money", sort_order: 10, is_active: true },
      },
    ],
    playlistRows: catalogRows.filter((row) => row.id === WITH_MONEY),
  }) as never,
  parsePlaylistListingQuery({ topic: "money", limit: 12 }),
);

assert.deepEqual(
  moneyListing.items.map((item) => item.id),
  [WITH_MONEY],
);
assert.deepEqual(moneyListing.items[0]?.topics, ["money"]);
assert.equal(
  moneyListing.items[0]?.topics.some((value) => value === "Деньги"),
  false,
);

const unfiltered = await listListedPlaylists(
  createTopicsSupabase({
    playlistTopicRows: [
      {
        playlist_id: WITH_MONEY,
        topics: { key: "money", sort_order: 10, is_active: true },
      },
      {
        playlist_id: WITH_PURPOSE,
        topics: { key: "purpose", sort_order: 70, is_active: true },
      },
    ],
    playlistRows: catalogRows,
  }) as never,
  parsePlaylistListingQuery({ limit: 12 }),
);

assert.deepEqual(
  unfiltered.items.map((item) => item.id).sort(),
  [WITH_MONEY, WITH_PURPOSE, WITHOUT_TOPIC].sort(),
);
assert.deepEqual(
  unfiltered.items.find((item) => item.id === WITHOUT_TOPIC)?.topics,
  [],
);

const popularWithQuery = await listListedPlaylists(
  createTopicsSupabase({
    topicRows: [{ id: MONEY, key: "money" }],
    assignmentRows: [{ playlist_id: WITH_MONEY, topic_id: MONEY }],
    playlistTopicRows: [
      {
        playlist_id: WITH_MONEY,
        topics: { key: "money", sort_order: 10, is_active: true },
      },
    ],
    playlistRows: catalogRows.filter((row) => row.id === WITH_MONEY),
  }) as never,
  parsePlaylistListingQuery({ q: "деньги", topic: "money", sort: "popular", limit: 12 }),
);
assert.deepEqual(
  popularWithQuery.items.map((item) => item.id),
  [WITH_MONEY],
);

assert.match(listingSource, /playlist_topics!inner/);
assert.match(listingSource, /listPlaylistTopicKeysByPlaylistIds/);
assert.match(listingSource, /playlist_topics\.topics\.key/);
assert.doesNotMatch(listingSource, /listListedPlaylistIdsForTopicKeys/);
assert.doesNotMatch(listingSource, /request = request\.in\("id", playlistIds\)/);
assert.doesNotMatch(listingSource, /item\.topics\.includes/);
assert.doesNotMatch(listingSource, /filter\(\(item\).*topic/);
assert.doesNotMatch(pageSource, /PlaylistCatalogFilters|TopicFilterBar/);
assert.doesNotMatch(cardSource, /item\.topics/);

console.log("playlist-topics-unit: ok");
