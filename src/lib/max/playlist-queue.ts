import type { MaxPlaybackMode, MaxPlaybackSession, MaxPlaybackTrack } from "@/lib/max/playback-types";
import type { MaxPlaylistDetailItem } from "@/lib/max/playlist-types";

export type MaxPlaylistQueueItem = {
  key: string;
  available: boolean;
  authorSlug: string | null;
  productSlug: string | null;
  audioItemId: string | null;
};

export function toMaxPlaylistQueueItem(item: MaxPlaylistDetailItem): MaxPlaylistQueueItem {
  return {
    key: item.key,
    available: item.available,
    authorSlug: item.authorSlug,
    productSlug: item.productSlug,
    audioItemId: item.audioItemId,
  };
}

/** A row can start MAX playback only when the public loader marked it available. */
export function isMaxPlaylistItemPlayable(item: MaxPlaylistQueueItem): boolean {
  return Boolean(item.available && item.authorSlug && item.productSlug);
}

export function nextMaxPlaylistQueueIndex(
  items: readonly MaxPlaylistQueueItem[],
  fromIndex: number,
  skipped: ReadonlySet<number> = new Set(),
): number | null {
  for (let index = fromIndex + 1; index < items.length; index += 1) {
    if (skipped.has(index)) {
      continue;
    }

    if (isMaxPlaylistItemPlayable(items[index])) {
      return index;
    }
  }

  return null;
}

export function firstMaxPlaylistQueueIndex(
  items: readonly MaxPlaylistQueueItem[],
  skipped: ReadonlySet<number> = new Set(),
): number | null {
  return nextMaxPlaylistQueueIndex(items, -1, skipped);
}

/**
 * Pick the playlist row's track from an already-authorized MAX session.
 * audioItemId must match that session; a missing id uses the first track.
 */
export function selectMaxPlaylistPlaybackTrack(
  tracks: readonly MaxPlaybackTrack[],
  audioItemId: string | null,
): MaxPlaybackTrack | null {
  if (tracks.length === 0) {
    return null;
  }

  if (audioItemId) {
    return tracks.find((track) => track.trackId === audioItemId) ?? null;
  }

  return tracks[0] ?? null;
}

/** One playlist row is one track. The product player must not walk sibling tracks. */
export function narrowMaxPlaybackSession(
  session: MaxPlaybackSession,
  audioItemId: string | null,
): MaxPlaybackSession | null {
  const track = selectMaxPlaylistPlaybackTrack(session.tracks, audioItemId);
  if (!track) {
    return null;
  }

  return {
    ...session,
    tracks: [track],
  };
}

/** Full audio stays on the entitled MAX audio route. Preview never uses it. */
export function maxPlaylistPlaybackResource(
  mode: MaxPlaybackMode,
): "audio" | "preview" {
  return mode === "preview" ? "preview" : "audio";
}

export function advanceMaxPlaylistQueueOnEnded(input: {
  items: readonly MaxPlaylistQueueItem[];
  currentIndex: number;
  skipped?: ReadonlySet<number>;
}): number | null {
  return nextMaxPlaylistQueueIndex(
    input.items,
    input.currentIndex,
    input.skipped ?? new Set(),
  );
}
