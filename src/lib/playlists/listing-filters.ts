/**
 * Playlist catalog URL helpers (Stage 4A / 4B.3).
 * Builds q, sort, and a single topic query param.
 */

import { parseCatalogTopicKeyList } from "@/lib/catalog/topic-filter";
import {
  parsePlaylistListingQuery,
  type PlaylistListingSort,
} from "@/lib/playlists/listing-contract";

export const PLAYLIST_CATALOG_PATH = "/playlists/catalog";
export const PLAYLIST_CATALOG_SEARCH_DEBOUNCE_MS = 300;

export const PLAYLIST_CATALOG_SORT_OPTIONS = [
  { value: "newest", label: "Новые" },
  { value: "popular", label: "Популярные" },
] as const satisfies ReadonlyArray<{
  value: PlaylistListingSort;
  label: string;
}>;

export type PlaylistCatalogTopicOption = {
  key: string;
  title: string;
};

export function resolvePlaylistCatalogActiveTopicKey(
  topic: string | null | undefined,
): string | null {
  return parseCatalogTopicKeyList(topic)[0] ?? null;
}

export function buildPlaylistCatalogHref(input: {
  q?: string | null;
  sort?: string | null;
  topic?: string | null;
} = {}): string {
  const query = parsePlaylistListingQuery({
    q: input.q,
    sort: input.sort,
    topic: resolvePlaylistCatalogActiveTopicKey(input.topic),
  });
  const params = new URLSearchParams();

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.sort !== "newest") {
    params.set("sort", query.sort);
  }

  if (query.topic) {
    params.set("topic", query.topic);
  }

  const search = params.toString();
  return search ? `${PLAYLIST_CATALOG_PATH}?${search}` : PLAYLIST_CATALOG_PATH;
}
