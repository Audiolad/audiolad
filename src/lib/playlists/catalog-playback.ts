/**
 * Playlist catalog Play (Stage 3B.2).
 *
 * Reuses the public playlist queue builder and GlobalAudioPlayerProvider.
 * Does not create a player, queue, or catalog/play session.
 */

import { buildPublicPlaylistQueue } from "@/lib/playlists/build-playlist-queue";
import { PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH } from "@/lib/playlists/catalog-save";
import type {
  BuildPlaylistQueueResult,
  PlaylistQueue,
  PlaylistQueueSource,
} from "@/lib/playlists/player-queue-types";
import type {
  PublicPlaylistItemView,
  PublicPlaylistView,
} from "@/lib/playlists/public-detail";

export const PLAYLIST_CATALOG_PLAY_RETURN_HREF = PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH;
export const PLAYLIST_CATALOG_PLAY_NAVIGATION_POLICY = "stay_on_source" as const;
export const PLAYLIST_PUBLIC_DETAIL_API_PREFIX = "/api/playlists/public";

export type PlaylistCatalogPlaybackState =
  | "idle"
  | "playing"
  | "paused"
  | "different";

export type PlaylistCatalogActiveQueue = {
  source: PlaylistQueueSource;
} | null;

export function resolvePlaylistCatalogPlaybackState(input: {
  slug: string;
  activeQueue: PlaylistCatalogActiveQueue;
  isPlaying: boolean;
}): PlaylistCatalogPlaybackState {
  const slug = input.slug.trim();
  const source = input.activeQueue?.source ?? null;

  if (source?.kind === "public_playlist" && source.playlistSlug === slug) {
    return input.isPlaying ? "playing" : "paused";
  }

  if (source) {
    return "different";
  }

  if (input.isPlaying) {
    return "different";
  }

  return "idle";
}

export function shouldReloadPlaylistCatalogQueue(
  state: PlaylistCatalogPlaybackState,
): boolean {
  return state === "idle" || state === "different";
}

export function buildPlaylistCatalogQueue(input: {
  playlistSlug: string;
  title: string;
  items: PublicPlaylistItemView[];
}): BuildPlaylistQueueResult {
  return buildPublicPlaylistQueue({
    playlistSlug: input.playlistSlug,
    title: input.title,
    items: input.items,
    returnHref: PLAYLIST_CATALOG_PLAY_RETURN_HREF,
    navigationPolicy: PLAYLIST_CATALOG_PLAY_NAVIGATION_POLICY,
  });
}

export function buildPublicPlaylistDetailApiUrl(slug: string): string {
  return `${PLAYLIST_PUBLIC_DETAIL_API_PREFIX}/${encodeURIComponent(slug.trim())}`;
}

export function toPublicPlaylistDetailHttpResult(
  loaded:
    | { ok: true; detail: PublicPlaylistView }
    | { ok: false; reason: string },
): { status: number; body: { ok: true; detail: PublicPlaylistView } | { ok: false } } {
  if (!loaded.ok) {
    return { status: 404, body: { ok: false } };
  }

  return { status: 200, body: { ok: true, detail: loaded.detail } };
}

export function isPublicPlaylistDetailSuccess(
  body: unknown,
): body is { ok: true; detail: PublicPlaylistView } {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const record = body as { ok?: unknown; detail?: { items?: unknown } };

  return (
    record.ok === true &&
    typeof record.detail === "object" &&
    record.detail !== null &&
    Array.isArray(record.detail.items)
  );
}

export type PlaylistCatalogDetailFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "json">>;

export async function fetchPublicPlaylistDetail(
  slug: string,
  fetchImpl: PlaylistCatalogDetailFetch = fetch,
): Promise<{ ok: true; detail: PublicPlaylistView } | { ok: false }> {
  try {
    const response = await fetchImpl(buildPublicPlaylistDetailApiUrl(slug), {
      headers: { Accept: "application/json" },
    });
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok || !isPublicPlaylistDetailSuccess(body)) {
      return { ok: false };
    }

    return { ok: true, detail: body.detail };
  } catch {
    return { ok: false };
  }
}

export async function startPlaylistCatalogPlayback(input: {
  slug: string;
  title: string;
  fetchImpl?: PlaylistCatalogDetailFetch;
  loadPlaylistQueue: (queue: PlaylistQueue) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await fetchPublicPlaylistDetail(input.slug, input.fetchImpl);

  if (!loaded.ok) {
    return { ok: false, error: "Не удалось запустить плейлист. Попробуйте ещё раз." };
  }

  const built = buildPlaylistCatalogQueue({
    playlistSlug: loaded.detail.playlist.slug || input.slug,
    title: input.title.trim() || loaded.detail.playlist.title,
    items: loaded.detail.items,
  });

  if (!built.ok) {
    return { ok: false, error: "Не удалось запустить плейлист. Попробуйте ещё раз." };
  }

  const result = await input.loadPlaylistQueue(built.queue);

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Не удалось запустить плейлист. Попробуйте ещё раз.",
    };
  }

  return { ok: true };
}

export async function pressPlaylistCatalogPlayback(input: {
  state: PlaylistCatalogPlaybackState;
  handlePlayPause: () => Promise<void>;
  startPlayback: () => Promise<void>;
}): Promise<"toggled" | "loaded"> {
  if (!shouldReloadPlaylistCatalogQueue(input.state)) {
    await input.handlePlayPause();
    return "toggled";
  }

  await input.startPlayback();
  return "loaded";
}
