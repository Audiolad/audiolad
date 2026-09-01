import { fetchCatalogPlaySession } from "@/lib/catalog/fetch-catalog-play-session";
import type { CatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";
import {
  getQueueEntryListenSlugs,
  type PlaylistQueueEntry,
} from "@/lib/playlists/player-queue-types";

export const LISTEN_ACCESS_UNAVAILABLE_REASON = "unavailable";

export type FetchListenSessionFn = typeof fetchListenSessionPayload;
export type FetchCatalogPlaySessionFn = typeof fetchCatalogPlaySession;

/**
 * Catalog preview fallback is only for listen access-denied.
 * Network / not_found / no_audio / error stay fail-closed.
 */
export function shouldFallbackListenSessionToCatalogPreview(
  reason: string,
): boolean {
  return reason === LISTEN_ACCESS_UNAVAILABLE_REASON;
}

export function applyQueueEntryTrackFilter(
  session: CatalogGlobalPlayerSession,
  entry: PlaylistQueueEntry,
): CatalogGlobalPlayerSession | null {
  if (entry.kind !== "audio_item") {
    return session;
  }

  const track = session.tracks.find((item) => item.id === entry.audioItemId);

  if (!track) {
    return null;
  }

  return {
    ...session,
    tracks: [track],
    initialTrackId: track.id,
  };
}

export async function resolvePlaylistQueueEntrySession(
  entry: PlaylistQueueEntry,
  options: {
    fromStart: boolean;
    fetchListen?: FetchListenSessionFn;
    fetchCatalog?: FetchCatalogPlaySessionFn;
  },
): Promise<
  | { ok: true; session: CatalogGlobalPlayerSession }
  | { ok: false; reason: string }
> {
  const slugs = getQueueEntryListenSlugs(entry);

  if (!slugs || (entry.kind !== "product" && entry.kind !== "audio_item")) {
    return { ok: false, reason: "unavailable" };
  }

  const fetchListen = options.fetchListen ?? fetchListenSessionPayload;
  const fetchCatalog = options.fetchCatalog ?? fetchCatalogPlaySession;
  const listen = await fetchListen(slugs.authorSlug, slugs.productSlug, {
    fromStart: options.fromStart,
  });

  if (listen.ok) {
    const filtered = applyQueueEntryTrackFilter(listen.session, entry);

    if (!filtered) {
      return { ok: false, reason: "unavailable" };
    }

    return { ok: true, session: filtered };
  }

  if (!shouldFallbackListenSessionToCatalogPreview(listen.reason)) {
    return listen;
  }

  const audioItemId = entry.kind === "audio_item" ? entry.audioItemId : null;
  const catalog = await fetchCatalog(
    slugs.authorSlug,
    slugs.productSlug,
    audioItemId,
  );

  if (!catalog.ok) {
    return catalog;
  }

  const filtered = applyQueueEntryTrackFilter(catalog.session, entry);

  if (!filtered) {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, session: filtered };
}
