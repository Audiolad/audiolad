/**
 * Playlist catalog listing stream (class=playlist).
 *
 * Separate from product catalog listing. Do not add playlist as a product kind.
 *
 * Stage 3A UI lives in `src/components/playlists/catalog/` and consumes
 * `PlaylistListingItem` only. Stage 3B.1 save lives in
 * `src/lib/playlists/playlist-saves-api.ts` and `/api/playlists/saves`.
 * Stage 3B.2 play lives in `src/lib/playlists/catalog-playback.ts`.
 * Stage 4A search/sort: SQL title+description ILIKE.
 * Stage 4B.1 topics: playlist_topics assignments; listing filter is SQL EXISTS.
 * Stage 5A.1: SQL-first page pipeline. WHERE + q + topic + newest keyset +
 * LIMIT pageSize+1, then hydrate only that page. No FETCH_LIMIT / JS filter.
 * Stage 5A.2: popular SQL keyset cursor `savesCount:listedAtMs:id`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeIlikePattern } from "@/lib/catalog/search";
import { createPlaylistCoverSignedUrlsBatch } from "@/lib/playlists/covers";
import {
  listPlaylistTopicKeysByPlaylistIds,
  normalizePlaylistTopicKeys,
} from "@/lib/playlists/playlist-topics";
import {
  decodePlaylistListingCursor,
  encodePlaylistListingCursor,
  encodePlaylistListingPopularCursor,
  resolvePlaylistListingCreatorName,
  resolvePlaylistListingCursor,
  toPlaylistListingItem,
  type PlaylistListingAccess,
  type PlaylistListingAccessFilter,
  type PlaylistListingItem,
  type PlaylistListingQuery,
  type PlaylistListingResult,
  type PlaylistListingSort,
} from "@/lib/playlists/listing-contract";
import {
  createSupabasePlaylistSavesStore,
  type PlaylistSavesAsyncStore,
} from "@/lib/playlists/playlist-saves";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export {
  PLAYLIST_LISTING_ACCESS,
  PLAYLIST_LISTING_ACCESS_FILTERS,
  PLAYLIST_LISTING_MAX_LIMIT,
  PLAYLIST_LISTING_PAGE_SIZE,
  PLAYLIST_LISTING_SORTS,
  buildPlaylistListingApiUrl,
  decodePlaylistListingCursor,
  decodePlaylistListingPopularCursor,
  encodePlaylistListingCursor,
  encodePlaylistListingPopularCursor,
  resolvePlaylistListingCursor,
  parsePlaylistListingAccessFilter,
  parsePlaylistListingLimit,
  parsePlaylistListingQuery,
  parsePlaylistListingSort,
  toPlaylistListingItem,
} from "@/lib/playlists/listing-contract";
export type {
  PlaylistListingAccess,
  PlaylistListingAccessFilter,
  PlaylistListingItem,
  PlaylistListingQuery,
  PlaylistListingResult,
  PlaylistListingSort,
} from "@/lib/playlists/listing-contract";

export const PLAYLIST_CATALOG_LISTING_SELECT = [
  "id",
  "title",
  "slug",
  "visibility",
  "published_at",
  "listed_at",
  "is_editorial",
  "items_count",
  "duration_seconds",
  "saves_count",
  "cover_path",
].join(", ");

export const PLAYLIST_CATALOG_TOPIC_EXISTS_EMBED =
  "playlist_topics!inner(topics!inner(key, is_active))";

export function buildPlaylistCatalogListingSelect(
  topicKey: string | null | undefined,
): string {
  if (!normalizePlaylistTopicKeys(topicKey)[0]) {
    return PLAYLIST_CATALOG_LISTING_SELECT;
  }

  return `${PLAYLIST_CATALOG_LISTING_SELECT}, ${PLAYLIST_CATALOG_TOPIC_EXISTS_EMBED}`;
}

export type PlaylistCatalogRow = {
  id: string;
  title: string;
  slug: string | null;
  visibility: string | null;
  published_at: string | null;
  listed_at: string | null;
  is_editorial?: boolean | null;
  items_count?: number | null;
  duration_seconds?: number | null;
  saves_count?: number | null;
  cover_path?: string | null;
};

export type PlaylistListingCandidate = PlaylistListingItem & {
  listedAtMs: number;
};

export function isPlaylistListedForCatalog(
  row: Pick<
    PlaylistCatalogRow,
    "visibility" | "published_at" | "listed_at" | "slug"
  >,
): boolean {
  const slug = row.slug?.trim() ?? "";

  return (
    row.visibility === "public" &&
    typeof row.published_at === "string" &&
    row.published_at.length > 0 &&
    typeof row.listed_at === "string" &&
    row.listed_at.length > 0 &&
    slug.length > 0
  );
}

export function listedAtToMs(listedAt: string): number | null {
  const ms = Date.parse(listedAt);

  if (!Number.isFinite(ms)) {
    return null;
  }

  return ms;
}

export function matchesPlaylistListingSearch(
  item: Pick<PlaylistListingItem, "title"> & {
    description?: string | null;
    creator?: string | null;
  },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  return (
    item.title.toLowerCase().includes(needle) ||
    (item.description ?? "").toLowerCase().includes(needle)
  );
}

export function buildPlaylistListingSearchOrFilter(query: string): string | null {
  const needle = query.trim();

  if (!needle) {
    return null;
  }

  const escaped = escapeIlikePattern(needle);
  const quotedPattern = `"%${escaped.replace(/"/g, '""')}%"`;

  return `title.ilike.${quotedPattern},description.ilike.${quotedPattern}`;
}

function quoteListingFilterValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildPlaylistListingNewestCursorFilter(cursor: {
  listedAtMs: number;
  id: string;
}): string {
  const iso = quoteListingFilterValue(new Date(cursor.listedAtMs).toISOString());

  return `listed_at.lt.${iso},and(listed_at.eq.${iso},id.lt.${cursor.id})`;
}

export function buildPlaylistListingPopularCursorFilter(anchor: {
  savesCount: number;
  listedAtMs: number;
  id: string;
}): string {
  const iso = quoteListingFilterValue(new Date(anchor.listedAtMs).toISOString());

  return [
    `saves_count.lt.${anchor.savesCount}`,
    `and(saves_count.eq.${anchor.savesCount},listed_at.lt.${iso})`,
    `and(saves_count.eq.${anchor.savesCount},listed_at.eq.${iso},id.lt.${anchor.id})`,
  ].join(",");
}

export function resolvePlaylistListingSqlPlan(query: PlaylistListingQuery): {
  searchFilter: string | null;
  topicKeys: string[];
  select: string;
  order: Array<{ column: "listed_at" | "saves_count" | "id"; ascending: boolean }>;
  pageLimit: number;
} {
  const topicKeys = normalizePlaylistTopicKeys(query.topic);

  return {
    searchFilter: buildPlaylistListingSearchOrFilter(query.q),
    topicKeys,
    select: buildPlaylistCatalogListingSelect(query.topic),
    order:
      query.sort === "newest"
        ? [
            { column: "listed_at", ascending: false },
            { column: "id", ascending: false },
          ]
        : [
            { column: "saves_count", ascending: false },
            { column: "listed_at", ascending: false },
            { column: "id", ascending: false },
          ],
    pageLimit: query.limit + 1,
  };
}

export function matchesPlaylistListingAccessFilter(
  item: Pick<PlaylistListingItem, "access">,
  access: PlaylistListingAccessFilter,
): boolean {
  return access === "all" || item.access === access;
}

export function resolvePlaylistListingAccess(
  itemFlags: readonly boolean[],
): PlaylistListingAccess {
  if (itemFlags.length === 0) {
    return "free";
  }

  const allFree = itemFlags.every((isFree) => isFree);
  const allPaid = itemFlags.every((isFree) => !isFree);

  if (allFree) {
    return "free";
  }

  if (allPaid) {
    return "paid";
  }

  return "mixed";
}

function compareIdsDesc(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left > right ? -1 : 1;
}

export function sortPlaylistListingItems(
  items: PlaylistListingCandidate[],
  sort: PlaylistListingSort,
): PlaylistListingCandidate[] {
  return [...items].sort((left, right) => {
    if (sort === "popular") {
      if (left.savesCount !== right.savesCount) {
        return right.savesCount - left.savesCount;
      }
    }

    if (left.listedAtMs !== right.listedAtMs) {
      return right.listedAtMs - left.listedAtMs;
    }

    return compareIdsDesc(left.id, right.id);
  });
}

function isAfterNewestCursor(
  item: PlaylistListingCandidate,
  cursor: { listedAtMs: number; id: string },
): boolean {
  if (item.listedAtMs < cursor.listedAtMs) {
    return true;
  }

  if (item.listedAtMs > cursor.listedAtMs) {
    return false;
  }

  return item.id < cursor.id;
}

export function applyPlaylistListingCursor(
  items: PlaylistListingCandidate[],
  cursor: string | null,
  sort: PlaylistListingSort,
): PlaylistListingCandidate[] {
  const decoded = decodePlaylistListingCursor(cursor);

  if (!decoded) {
    return items;
  }

  if (sort === "newest") {
    return items.filter((item) => isAfterNewestCursor(item, decoded));
  }

  const cursorIndex = items.findIndex((item) => item.id === decoded.id);

  if (cursorIndex === -1) {
    return items.filter((item) => isAfterNewestCursor(item, decoded));
  }

  return items.slice(cursorIndex + 1);
}

export function paginatePlaylistListingItems(
  items: PlaylistListingCandidate[],
  query: Pick<PlaylistListingQuery, "cursor" | "limit" | "sort">,
): PlaylistListingResult {
  const remaining = applyPlaylistListingCursor(items, query.cursor, query.sort);
  const page = remaining.slice(0, query.limit);
  const lastItem = page[page.length - 1];
  const hasMore = remaining.length > query.limit && Boolean(lastItem);

  return {
    items: page.map(toPublicPlaylistListingItem),
    nextCursor:
      hasMore && lastItem
        ? encodePlaylistListingCursor(lastItem.listedAtMs, lastItem.id)
        : null,
  };
}

export function toPublicPlaylistListingItem(
  item: PlaylistListingCandidate,
): PlaylistListingItem {
  return toPlaylistListingItem({
    source: {
      id: item.id,
      slug: item.slug,
      title: item.title,
      coverUrl: item.coverUrl,
      items_count: item.trackCount,
      duration_seconds: item.durationSeconds,
      saves_count: item.savesCount,
    },
    creator: item.creator,
    topics: item.topics,
    access: item.access,
    viewer: item.viewer,
  });
}

export function applyPlaylistListingSavedState(
  items: PlaylistListingItem[],
  savedIds: ReadonlySet<string> | null,
): PlaylistListingItem[] {
  return items.map((item) => ({
    ...item,
    viewer: {
      saved: savedIds !== null && savedIds.has(item.id),
      playing: false,
    },
  }));
}

export function mapPlaylistCatalogRowToCandidate(
  row: PlaylistCatalogRow,
  extras: {
    coverUrl: string | null;
    access: PlaylistListingAccess;
    topics?: readonly string[];
  },
): PlaylistListingCandidate | null {
  if (!isPlaylistListedForCatalog(row)) {
    return null;
  }

  const listedAtMs = listedAtToMs(row.listed_at ?? "");

  if (listedAtMs === null) {
    return null;
  }

  const item = toPlaylistListingItem({
    source: {
      id: row.id,
      slug: row.slug ?? "",
      title: row.title,
      coverUrl: extras.coverUrl,
      items_count: row.items_count ?? 0,
      duration_seconds: row.duration_seconds ?? 0,
      saves_count: row.saves_count ?? 0,
    },
    creator: resolvePlaylistListingCreatorName(row.is_editorial === true),
    topics: extras.topics ?? [],
    access: extras.access,
  });

  return {
    ...item,
    listedAtMs,
  };
}

async function resolveListingUserId(
  supabase: SupabaseClient,
  explicitUserId?: string | null,
): Promise<string | null> {
  if (explicitUserId !== undefined) {
    return explicitUserId;
  }

  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function signPlaylistListingCovers(
  rows: PlaylistCatalogRow[],
): Promise<Map<string, string | null>> {
  const coverPaths = rows
    .map((row) => row.cover_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  if (coverPaths.length === 0) {
    return new Map();
  }

  try {
    const storage = createServiceRoleClient();
    return await createPlaylistCoverSignedUrlsBatch(storage, coverPaths);
  } catch (error) {
    console.error(
      "playlist_catalog_cover_sign_error",
      error instanceof Error ? error.message : error,
    );
    return new Map();
  }
}

function practiceIsFree(value: unknown): boolean | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = Array.isArray(value) ? value[0] : value;

  if (typeof row !== "object" || row === null) {
    return null;
  }

  const isFree = (row as { is_free?: unknown }).is_free;
  return typeof isFree === "boolean" ? isFree : null;
}

export async function loadPlaylistListingAccessByIds(
  supabase: SupabaseClient,
  playlistIds: string[],
): Promise<Map<string, PlaylistListingAccess>> {
  const accessById = new Map<string, PlaylistListingAccess>();

  if (playlistIds.length === 0) {
    return accessById;
  }

  const { data, error } = await supabase
    .from("playlist_items")
    .select("playlist_id, practices!inner(is_free)")
    .in("playlist_id", playlistIds);

  if (error) {
    console.error("playlist_catalog_access_error", error.message);
    return accessById;
  }

  const flags = new Map<string, boolean[]>();

  for (const row of data ?? []) {
    const playlistId =
      typeof row?.playlist_id === "string" ? row.playlist_id : null;
    const isFree = practiceIsFree(row?.practices);

    if (!playlistId || isFree === null) {
      continue;
    }

    const current = flags.get(playlistId) ?? [];
    current.push(isFree);
    flags.set(playlistId, current);
  }

  for (const playlistId of playlistIds) {
    accessById.set(
      playlistId,
      resolvePlaylistListingAccess(flags.get(playlistId) ?? []),
    );
  }

  return accessById;
}

export async function listListedPlaylists(
  supabase: SupabaseClient,
  query: PlaylistListingQuery,
  options: {
    userId?: string | null;
    savesStore?: PlaylistSavesAsyncStore;
  } = {},
): Promise<PlaylistListingResult> {
  const plan = resolvePlaylistListingSqlPlan(query);
  let request = supabase
    .from("playlists")
    .select(plan.select)
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .not("listed_at", "is", null)
    .not("slug", "is", null);

  if (plan.topicKeys.length === 1) {
    request = request
      .eq("playlist_topics.topics.key", plan.topicKeys[0])
      .eq("playlist_topics.topics.is_active", true);
  } else if (plan.topicKeys.length > 1) {
    request = request
      .in("playlist_topics.topics.key", plan.topicKeys)
      .eq("playlist_topics.topics.is_active", true);
  }

  if (plan.searchFilter) {
    request = request.or(plan.searchFilter);
  }

  for (const rule of plan.order) {
    request = request.order(rule.column, { ascending: rule.ascending });
  }

  const decoded = resolvePlaylistListingCursor(query.cursor, query.sort);

  if (decoded?.sort === "newest") {
    request = request.or(buildPlaylistListingNewestCursorFilter(decoded));
  } else if (decoded?.sort === "popular") {
    request = request.or(buildPlaylistListingPopularCursorFilter(decoded));
  }

  const { data, error } = await request.limit(plan.pageLimit);

  if (error) {
    throw new Error(error.message);
  }

  const fetchedRows = (data as unknown as PlaylistCatalogRow[] | null) ?? [];
  const hasMore = fetchedRows.length > query.limit;
  const pageRows = fetchedRows.slice(0, query.limit);
  const lastPageRow = pageRows[pageRows.length - 1];
  const lastListedAtMs = lastPageRow
    ? listedAtToMs(lastPageRow.listed_at ?? "")
    : null;
  const nextCursor =
    hasMore && lastPageRow && lastListedAtMs !== null
      ? query.sort === "popular"
        ? encodePlaylistListingPopularCursor(
            typeof lastPageRow.saves_count === "number"
              ? lastPageRow.saves_count
              : 0,
            lastListedAtMs,
            lastPageRow.id,
          )
        : encodePlaylistListingCursor(lastListedAtMs, lastPageRow.id)
      : null;

  if (pageRows.length === 0) {
    return {
      items: applyPlaylistListingSavedState([], null),
      nextCursor: null,
    };
  }

  const pageIds = pageRows.map((row) => row.id);
  const [signedByPath, accessById, topicsById] = await Promise.all([
    signPlaylistListingCovers(pageRows),
    loadPlaylistListingAccessByIds(supabase, pageIds),
    listPlaylistTopicKeysByPlaylistIds(supabase, pageIds),
  ]);

  const items = pageRows
    .map((row) =>
      mapPlaylistCatalogRowToCandidate(row, {
        coverUrl: row.cover_path
          ? (signedByPath.get(row.cover_path) ?? null)
          : null,
        access: accessById.get(row.id) ?? "mixed",
        topics: topicsById.get(row.id) ?? [],
      }),
    )
    .filter((item): item is PlaylistListingCandidate => item !== null)
    .map(toPublicPlaylistListingItem);

  const page: PlaylistListingResult = {
    items,
    nextCursor,
  };
  const userId = await resolveListingUserId(supabase, options.userId);

  if (!userId) {
    return {
      ...page,
      items: applyPlaylistListingSavedState(page.items, null),
    };
  }

  const store = options.savesStore ?? createSupabasePlaylistSavesStore(supabase);

  try {
    const savedIds = await store.listSavedPlaylistIds(userId, pageIds);

    return {
      ...page,
      items: applyPlaylistListingSavedState(page.items, new Set(savedIds)),
    };
  } catch (saveError) {
    console.error(
      "playlist_catalog_saves_error",
      saveError instanceof Error ? saveError.message : saveError,
    );

    return {
      ...page,
      items: applyPlaylistListingSavedState(page.items, new Set()),
    };
  }
}
