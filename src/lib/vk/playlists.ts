import "server-only";

import { loadMaxPlaylistCatalog, loadMaxPlaylistDetail } from "@/lib/max/playlists";
import {
  parsePlaylistListingQuery,
  type PlaylistListingQuery,
} from "@/lib/playlists/listing-contract";
import { isValidPlaylistPublicSlug } from "@/lib/playlists/public-slug";

function optionalString(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  return { ok: true, value };
}

function optionalLimit(
  value: unknown,
): { ok: true; value: string | number | null } | { ok: false } {
  if (value == null) return { ok: true, value: null };
  if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
  if (typeof value === "string") return { ok: true, value };
  return { ok: false };
}

export function parseVkPlaylistCatalogBody(
  body: Record<string, unknown>,
): { ok: true; query: PlaylistListingQuery } | { ok: false } {
  const q = optionalString(body.q);
  const topic = optionalString(body.topic);
  const access = optionalString(body.access);
  const sort = optionalString(body.sort);
  const cursor = optionalString(body.cursor);
  const limit = optionalLimit(body.limit);
  if (!q.ok || !topic.ok || !access.ok || !sort.ok || !cursor.ok || !limit.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    query: parsePlaylistListingQuery({
      q: q.value,
      topic: topic.value,
      access: access.value,
      sort: sort.value,
      cursor: cursor.value,
      limit: limit.value,
    }),
  };
}

export function readVkPlaylistSlug(value: unknown): string | null {
  if (!isValidPlaylistPublicSlug(value)) return null;
  return value.trim();
}

/** Public playlist catalog for an ordinary guest. Saved state is not computed. */
export async function loadVkGuestPlaylistCatalog(query: PlaylistListingQuery) {
  return loadMaxPlaylistCatalog({ query, userId: null });
}

export async function loadVkGuestPlaylistDetail(slug: string) {
  return loadMaxPlaylistDetail(slug);
}
