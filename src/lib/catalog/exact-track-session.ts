import type { CatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";

export type ExactTrackOptions = {
  /** Play exactly this one track of the product. */
  audioItemId?: string | null;
  /** Drop the artist name from the session (mini / full player then show none). */
  hideAuthor?: boolean;
};

type SessionLike = {
  practiceId?: string | null;
  authorSlug?: string | null;
  productSlug?: string | null;
  authorName?: string | null;
  tracks?: readonly { id: string }[] | null;
};

/**
 * Pure: may a play button for (product, options) toggle the session that is already loaded?
 * Without options this is the plain «same product» check. With `audioItemId` only the
 * single-track session of exactly that track counts – another track (or the whole album)
 * of the same product is never resumed instead. With `hideAuthor` a session that still
 * carries the artist does not count either.
 */
export function isExactTrackSessionActive(
  session: SessionLike | null | undefined,
  product: { practiceId: string; authorSlug: string; productSlug: string },
  options: ExactTrackOptions = {},
): boolean {
  if (!session) return false;
  const sameProduct =
    session.practiceId === product.practiceId ||
    (session.authorSlug === product.authorSlug && session.productSlug === product.productSlug);
  if (!sameProduct) return false;
  if (options.audioItemId) {
    const tracks = session.tracks ?? [];
    if (tracks.length !== 1 || tracks[0]?.id !== options.audioItemId) return false;
  }
  if (options.hideAuthor && session.authorName) return false;
  return true;
}

/**
 * Pure: narrow a freshly loaded catalogue session to the requested track and/or drop the
 * artist. Returns null when the requested track is not in the session – nothing starts,
 * never another track instead. Without options the session is returned unchanged.
 */
export function applyExactTrackOptions(
  session: CatalogGlobalPlayerSession,
  options: ExactTrackOptions = {},
): CatalogGlobalPlayerSession | null {
  let next = session;
  if (options.hideAuthor) {
    next = { ...next, authorName: "" };
  }
  const audioItemId = options.audioItemId?.trim();
  if (audioItemId) {
    const only = next.tracks.filter((track) => track.id === audioItemId);
    if (only.length === 0) return null;
    next = {
      ...next,
      tracks: only,
      initialProgress: next.initialProgress.filter((entry) => entry.audioItemId === audioItemId),
    };
  }
  return next;
}
