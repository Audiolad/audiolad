import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isPrivateRoute, isPublicPlaylistCatalogPath } from "../src/lib/auth/routes";
import { LISTENER_PRIMARY_NAV_ITEMS, LISTENER_SIDEBAR_NAV_ITEMS } from "../src/lib/navigation/listener-nav";
import {
  applyPlaylistListingSavedState,
  isPlaylistListedForCatalog,
  type PlaylistCatalogRow,
} from "../src/lib/playlists/listing";
import {
  PLAYLIST_LISTING_PAGE_SIZE,
  toPlaylistListingItem,
} from "../src/lib/playlists/listing-contract";
import {
  buildPlaylistSavedListingApiUrl,
  buildPlaylistSavedListingCursorFilter,
  decodePlaylistSavedListingCursor,
  encodePlaylistSavedListingCursor,
  listSavedPlaylists,
  mapPlaylistSavedJoinRow,
  parsePlaylistSavedListingQuery,
  PLAYLIST_SAVED_LISTING_PATH,
  PLAYLIST_SAVED_LISTING_SELECT,
  PLAYLIST_SAVED_PAGE_PATH,
  PLAYLIST_SAVED_SIGN_IN_RETURN_PATH,
} from "../src/lib/playlists/saved-listing";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "11111111-1111-4111-8111-111111111111";

function listedPlaylist(
  overrides: Partial<PlaylistCatalogRow> = {},
): PlaylistCatalogRow {
  return {
    id: overrides.id ?? ID_A,
    title: overrides.title ?? "Утро",
    slug: overrides.slug ?? "morning",
    visibility: overrides.visibility ?? "public",
    published_at:
      overrides.published_at !== undefined
        ? overrides.published_at
        : "2026-08-25T00:00:00.000Z",
    listed_at:
      overrides.listed_at !== undefined
        ? overrides.listed_at
        : "2026-08-25T00:00:00.000Z",
    is_editorial: true,
    items_count: 2,
    duration_seconds: 120,
    saves_count: 1,
    cover_path: overrides.cover_path ?? null,
  };
}

assert.equal(PLAYLIST_SAVED_PAGE_PATH, "/playlists/saved");
assert.equal(PLAYLIST_SAVED_LISTING_PATH, "/api/playlists/saved");
assert.equal(PLAYLIST_SAVED_SIGN_IN_RETURN_PATH, "/playlists/saved");
assert.equal(isPrivateRoute("/playlists/saved"), true);
assert.equal(isPublicPlaylistCatalogPath("/playlists/saved"), false);
assert.equal(isPrivateRoute("/playlists/catalog"), false);

assert.deepEqual(parsePlaylistSavedListingQuery({}), {
  cursor: null,
  limit: PLAYLIST_LISTING_PAGE_SIZE,
});
assert.equal(parsePlaylistSavedListingQuery({ cursor: "  abc  " }).cursor, "abc");
assert.equal(parsePlaylistSavedListingQuery({ limit: "7" }).limit, 7);

const createdAt = "2026-08-25T12:00:00.000Z";
const createdAtMs = Date.parse(createdAt);
const cursor = encodePlaylistSavedListingCursor(createdAtMs, ID_A);
assert.equal(cursor, `${createdAtMs}:${ID_A}`);
assert.deepEqual(decodePlaylistSavedListingCursor(cursor), {
  createdAtMs,
  id: ID_A,
});
assert.equal(decodePlaylistSavedListingCursor("not-a-cursor"), null);
assert.equal(decodePlaylistSavedListingCursor(`${createdAtMs}:not-uuid`), null);
assert.equal(
  decodePlaylistSavedListingCursor(`1:${createdAtMs}:${ID_A}`),
  null,
  "popular catalog cursor is not a saved cursor",
);

assert.match(
  buildPlaylistSavedListingCursorFilter({ createdAtMs, id: ID_A }),
  /created_at\.lt\./,
);
assert.match(
  buildPlaylistSavedListingCursorFilter({ createdAtMs, id: ID_A }),
  /playlist_id\.lt\./,
);
assert.equal(buildPlaylistSavedListingApiUrl({}), "/api/playlists/saved");
assert.equal(
  buildPlaylistSavedListingApiUrl({ cursor, limit: 7 }),
  `/api/playlists/saved?cursor=${encodeURIComponent(cursor)}&limit=7`,
);

const listed = listedPlaylist({ id: ID_A });
assert.equal(isPlaylistListedForCatalog(listed), true);
assert.deepEqual(
  mapPlaylistSavedJoinRow({
    created_at: createdAt,
    playlist_id: ID_A,
    playlists: listed,
  })?.playlist.id,
  ID_A,
);
assert.equal(
  mapPlaylistSavedJoinRow({
    created_at: createdAt,
    playlist_id: ID_B,
    playlists: listedPlaylist({
      id: ID_B,
      visibility: "public",
      published_at: "2026-08-25T00:00:00.000Z",
      listed_at: null,
      slug: "hidden",
    }),
  }),
  null,
  "unlisted public playlists stay out of saved library",
);
assert.equal(
  mapPlaylistSavedJoinRow({
    created_at: createdAt,
    playlist_id: ID_C,
    playlists: listedPlaylist({
      id: ID_C,
      visibility: "private",
      slug: "private",
    }),
  }),
  null,
  "private playlists stay out of saved library",
);

const viewerSaved = applyPlaylistListingSavedState(
  [
    toPlaylistListingItem({
      source: {
        id: ID_A,
        slug: "morning",
        title: "Утро",
        coverUrl: null,
        items_count: 1,
        duration_seconds: 60,
        saves_count: 2,
      },
      creator: "АудиоЛад",
      access: "free",
    }),
  ],
  new Set([ID_A]),
);
assert.equal(viewerSaved[0]?.viewer.saved, true);

type SavedJoinFixture = {
  created_at: string;
  playlist_id: string;
  user_id: string;
  playlists: PlaylistCatalogRow;
};

function createSavedListingSupabase(rows: SavedJoinFixture[]) {
  const calls: Array<[string, ...unknown[]]> = [];
  const accessIds: string[][] = [];
  const topicHydrationIds: string[][] = [];
  let userId: string | null = null;
  let visibility: string | null = null;
  const requiredPresent = new Set<string>();
  const orFilters: string[] = [];

  const builder = {
    select(columns?: string) {
      calls.push(["playlist_saves.select", columns]);
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push(["playlist_saves.eq", column, value]);
      if (column === "user_id" && typeof value === "string") {
        userId = value;
      }
      if (column === "playlists.visibility" && typeof value === "string") {
        visibility = value;
      }
      return this;
    },
    not(column: string, operator: string, value: unknown) {
      calls.push(["playlist_saves.not", column, operator, value]);
      if (operator === "is" && value === null) {
        requiredPresent.add(column);
      }
      return this;
    },
    order(column: string, options: { ascending: boolean }) {
      calls.push(["playlist_saves.order", column, options]);
      return this;
    },
    or(filter: string) {
      orFilters.push(filter);
      calls.push(["playlist_saves.or", filter]);
      return this;
    },
    limit(value: number) {
      calls.push(["playlist_saves.limit", value]);

      let next = rows.filter((row) => row.user_id === userId);

      if (visibility === "public") {
        next = next.filter((row) => row.playlists.visibility === "public");
      }

      if (requiredPresent.has("playlists.published_at")) {
        next = next.filter((row) => Boolean(row.playlists.published_at));
      }

      if (requiredPresent.has("playlists.listed_at")) {
        next = next.filter((row) => Boolean(row.playlists.listed_at));
      }

      if (requiredPresent.has("playlists.slug")) {
        next = next.filter((row) => Boolean(row.playlists.slug));
      }

      next = [...next].sort((left, right) => {
        const leftMs = Date.parse(left.created_at);
        const rightMs = Date.parse(right.created_at);

        if (leftMs !== rightMs) {
          return rightMs - leftMs;
        }

        return left.playlist_id < right.playlist_id
          ? 1
          : left.playlist_id > right.playlist_id
            ? -1
            : 0;
      });

      for (const filter of orFilters) {
        const createdAtLt = filter.match(/created_at\.lt\."([^"]+)"/)?.[1];
        const playlistIdLt = filter.match(/playlist_id\.lt\.([^),]+)/)?.[1];

        if (!createdAtLt || !playlistIdLt) {
          continue;
        }

        const cursorMs = Date.parse(createdAtLt);
        next = next.filter((row) => {
          const rowMs = Date.parse(row.created_at);

          if (rowMs < cursorMs) {
            return true;
          }

          if (rowMs > cursorMs) {
            return false;
          }

          return row.playlist_id < playlistIdLt;
        });
      }

      return Promise.resolve({
        data: next.slice(0, value),
        error: null,
      });
    },
  };

  return {
    calls,
    accessIds,
    topicHydrationIds,
    from(table: string) {
      if (table === "playlist_saves") {
        return builder;
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
            topicHydrationIds.push(Array.isArray(values) ? [...values] : []);
            return Promise.resolve({ data: [], error: null });
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      getUser: async () => ({ data: { user: { id: USER } } }),
    },
  };
}

const fixtures: SavedJoinFixture[] = [
  {
    user_id: USER,
    created_at: "2026-08-25T12:00:00.000Z",
    playlist_id: ID_A,
    playlists: listedPlaylist({ id: ID_A, slug: "morning", title: "Утро" }),
  },
  {
    user_id: USER,
    created_at: "2026-08-25T11:00:00.000Z",
    playlist_id: ID_B,
    playlists: listedPlaylist({
      id: ID_B,
      slug: "hidden",
      title: "Скрытый",
      listed_at: null,
    }),
  },
  {
    user_id: USER,
    created_at: "2026-08-25T10:00:00.000Z",
    playlist_id: ID_C,
    playlists: listedPlaylist({ id: ID_C, slug: "night", title: "Ночь" }),
  },
];

const client = createSavedListingSupabase(fixtures);
const page = await listSavedPlaylists(
  client as never,
  parsePlaylistSavedListingQuery({ limit: 20 }),
  { userId: USER },
);

assert.deepEqual(
  page.items.map((item) => item.id),
  [ID_A, ID_C],
  "saved listing hides unlisted playlists in SQL",
);
assert.equal(page.items.every((item) => item.viewer.saved === true), true);
assert.equal(page.nextCursor, null);
assert.match(PLAYLIST_SAVED_LISTING_SELECT, /playlists!inner/);
assert.deepEqual(
  client.calls.filter((call) => call[0] === "playlist_saves.eq" && call[1] === "user_id"),
  [["playlist_saves.eq", "user_id", USER]],
);
assert.deepEqual(
  client.calls.filter(
    (call) => call[0] === "playlist_saves.eq" && call[1] === "playlists.visibility",
  ),
  [["playlist_saves.eq", "playlists.visibility", "public"]],
);
assert.ok(
  client.calls.some(
    (call) => call[0] === "playlist_saves.not" && call[1] === "playlists.listed_at",
  ),
);
assert.deepEqual(
  client.calls.filter((call) => call[0] === "playlist_saves.order"),
  [
    ["playlist_saves.order", "created_at", { ascending: false }],
    ["playlist_saves.order", "playlist_id", { ascending: false }],
  ],
);
assert.deepEqual(client.accessIds, [[ID_A, ID_C]]);
assert.deepEqual(client.topicHydrationIds, [[ID_A, ID_C]]);

const pagedFixtures: SavedJoinFixture[] = Array.from({ length: 3 }, (_, index) => {
  const id = [ID_A, ID_B, ID_C][index] as string;
  return {
    user_id: USER,
    created_at: new Date(Date.UTC(2026, 7, 25, 12, index, 0)).toISOString(),
    playlist_id: id,
    playlists: listedPlaylist({
      id,
      slug: `mix-${index}`,
      title: `Микс ${index}`,
    }),
  };
});
const page1Client = createSavedListingSupabase(pagedFixtures);
const page1 = await listSavedPlaylists(
  page1Client as never,
  parsePlaylistSavedListingQuery({ limit: 2 }),
  { userId: USER },
);
assert.equal(page1.items.length, 2);
assert.equal(typeof page1.nextCursor, "string");
assert.match(page1.nextCursor ?? "", /:/);
assert.equal(page1.items.every((item) => item.viewer.saved), true);

const page2Client = createSavedListingSupabase(pagedFixtures);
const page2 = await listSavedPlaylists(
  page2Client as never,
  parsePlaylistSavedListingQuery({ cursor: page1.nextCursor, limit: 2 }),
  { userId: USER },
);
assert.equal(page2.items.length, 1);
assert.equal(page2.nextCursor, null);
assert.equal(
  page2.items.some((item) => page1.items.some((first) => first.id === item.id)),
  false,
);

const api = read("src/app/api/playlists/saved/route.ts");
const savedPage = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/saved/page.tsx",
);
const savedListing = read("src/lib/playlists/saved-listing.ts");
const catalogPage = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx",
);
const personalPage = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/page.tsx",
);
const playlistsClient = read("src/components/playlists/PlaylistsClient.tsx");
const libraryNav = read("src/components/playlists/PlaylistLibraryNav.tsx");
const playlistsLayout = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/layout.tsx",
);
const grid = read("src/components/playlists/catalog/PlaylistGrid.tsx");
const card = read("src/components/playlists/catalog/PlaylistCard.tsx");
const listenerNav = read("src/lib/navigation/listener-nav.ts");
const playback = read("src/lib/playlists/catalog-playback.ts");
const myPractices = read("src/components/my-practices/MyPracticesLibrary.tsx");
const librarySaves = read("src/lib/library/saves.ts");

assert.match(api, /listSavedPlaylists/);
assert.match(api, /createClientFromRequest/);
assert.match(api, /401/);
assert.doesNotMatch(api, /library_saves/);
assert.doesNotMatch(api, /listListedPlaylists/);
assert.doesNotMatch(api, /listForUser/);

assert.match(savedPage, /PlaylistGrid/);
assert.match(savedPage, /PlaylistCard|PlaylistGrid/);
assert.match(savedPage, /buildPlaylistSavedListingApiUrl/);
assert.match(savedPage, /removeUnsaved/);
assert.match(savedPage, /PlaylistLibraryNav/);
assert.match(savedPage, /Пока нет сохранённых плейлистов|SavedPlaylistsEmpty/);
assert.match(savedPage, /\/playlists\/catalog/);
assert.doesNotMatch(savedPage, /SavedPlaylistCard/);
assert.doesNotMatch(savedPage, /library_saves/);
assert.doesNotMatch(savedPage, /CatalogProductGrid/);
assert.doesNotMatch(savedPage, /\/my-practices/);
assert.doesNotMatch(savedPage, /listListedPlaylists/);

assert.match(savedListing, /playlist_saves/);
assert.match(savedListing, /playlists!inner/);
assert.match(savedListing, /created_at/);
assert.match(savedListing, /viewer\.saved|applyPlaylistListingSavedState/);
assert.doesNotMatch(savedListing, /from\(["']library_saves["']\)/);
assert.doesNotMatch(savedListing, /\/my-practices/);
assert.doesNotMatch(savedListing, /listForUser/);

assert.match(playlistsClient, /PlaylistLibraryNav/);
assert.match(playlistsClient, /Сохранённые|PlaylistLibraryNav/);
assert.match(libraryNav, /\/playlists\/saved/);
assert.match(libraryNav, /Сохранённые/);
assert.match(libraryNav, /aria-current/);
assert.doesNotMatch(playlistsLayout, /Сохранённые/);
assert.doesNotMatch(catalogPage, /PlaylistLibraryNav/);
assert.doesNotMatch(personalPage, /listListedPlaylists|listSavedPlaylists/);

assert.match(grid, /buildApiUrl/);
assert.match(grid, /removeUnsaved/);
assert.match(grid, /buildPlaylistListingApiUrl/);
assert.match(grid, /PlaylistCard/);
assert.match(grid, /PlaylistSaveButton|onViewerSavedChange/);
assert.match(card, /PlaylistSaveButton/);
assert.match(card, /PlaylistPlayButton/);
assert.doesNotMatch(card, /SavedPlaylistCard/);

assert.equal(
  existsSync(join(repoRoot, "src/components/playlists/catalog/SavedPlaylistCard.tsx")),
  false,
);
assert.equal(
  LISTENER_PRIMARY_NAV_ITEMS.filter((item) => item.key === "playlists").length,
  1,
);
assert.equal(
  LISTENER_PRIMARY_NAV_ITEMS.find((item) => item.key === "playlists")?.href,
  "/playlists",
);
assert.equal(
  LISTENER_SIDEBAR_NAV_ITEMS.find((item) => item.key === "playlists")?.href,
  "/playlists",
);
assert.doesNotMatch(listenerNav, /\/playlists\/saved/);
assert.doesNotMatch(listenerNav, /Сохранённые/);

assert.match(playback, /public_playlist/);
assert.match(card, /PlaylistPlayButton/);
assert.doesNotMatch(savedPage, /new player|buildPlaylistQueue/);
assert.doesNotMatch(myPractices, /listSavedPlaylists|\/api\/playlists\/saved/);
assert.doesNotMatch(librarySaves, /playlist_saves|listSavedPlaylists/);

console.log("playlist-saved-listing-unit: ok");
