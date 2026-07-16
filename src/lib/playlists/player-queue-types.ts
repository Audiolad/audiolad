/**
 * Playlist Play All queue model.
 * MVP uses only kind: "product". kind: "audio_item" is reserved for later.
 */

export type PlaylistQueueEntry =
  | {
      kind: "product";
      practiceId: string;
      authorSlug: string | null;
      productSlug: string;
      title: string;
      listenHref: string;
    }
  | {
      kind: "audio_item";
      practiceId: string;
      audioItemId: string;
      authorSlug: string | null;
      productSlug: string;
      title: string;
      listenHref: string;
    };

export type PlaylistQueueSource =
  | {
      kind: "owner_playlist";
      playlistId: string;
      returnHref: string;
    }
  | {
      kind: "public_playlist";
      playlistSlug: string;
      returnHref: string;
    };

export type PlaylistQueue = {
  id: string;
  title: string;
  source: PlaylistQueueSource;
  entries: PlaylistQueueEntry[];
  currentIndex: number;
  /** Items skipped when the queue was built (unavailable at start). */
  skippedCount: number;
  /** Additional skips during runtime access re-check. */
  runtimeSkippedCount: number;
};

export type BuildPlaylistQueueResult =
  | {
      ok: true;
      queue: PlaylistQueue;
    }
  | {
      ok: false;
      reason: "empty" | "invalid";
      skippedCount: number;
    };

export function isProductQueueEntry(
  entry: PlaylistQueueEntry,
): entry is Extract<PlaylistQueueEntry, { kind: "product" }> {
  return entry.kind === "product";
}

export function getQueueEntryPracticeId(entry: PlaylistQueueEntry): string {
  return entry.practiceId;
}

export function getQueueEntryListenSlugs(
  entry: PlaylistQueueEntry,
): { authorSlug: string; productSlug: string } | null {
  const authorSlug = entry.authorSlug?.trim();
  const productSlug = entry.productSlug?.trim();

  if (!authorSlug || !productSlug) {
    return null;
  }

  return { authorSlug, productSlug };
}

export function isSafeInternalListenHref(href: string): boolean {
  if (!href.startsWith("/listen/")) {
    return false;
  }

  if (href.startsWith("//") || href.includes("\\") || href.includes("://")) {
    return false;
  }

  const path = href.split("?")[0] ?? href;
  const parts = path.split("/").filter(Boolean);
  return parts.length >= 3 && parts[0] === "listen";
}
