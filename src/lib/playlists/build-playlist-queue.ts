import type { PlaylistDetailItemView } from "@/lib/playlists/detail";
import type { PublicPlaylistItemView } from "@/lib/playlists/public-detail";
import {
  isSafeInternalListenHref,
  type BuildPlaylistQueueResult,
  type PlaylistQueue,
  type PlaylistQueueEntry,
  type PlaylistQueueSource,
} from "@/lib/playlists/player-queue-types";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";
import { buildListenPath } from "@/lib/products/paths";

function makeQueueId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}`;
}

function toProductEntry(input: {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  title: string;
  listenHref: string;
}): PlaylistQueueEntry {
  return {
    kind: "product",
    practiceId: input.practiceId,
    authorSlug: input.authorSlug,
    productSlug: input.productSlug,
    title: input.title,
    listenHref: input.listenHref,
  };
}

function isSafeInternalReturnHref(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) {
    return false;
  }

  if (href.includes("://")) {
    return false;
  }

  return href.startsWith("/playlists/") || href.startsWith("/p/");
}

function normalizeListenHref(href: string): string | null {
  const path = (href.split("?")[0] ?? href).trim();

  if (!isSafeInternalListenHref(path)) {
    return null;
  }

  return path;
}

function finalizeQueue(input: {
  title: string;
  source: PlaylistQueueSource;
  entries: PlaylistQueueEntry[];
  skippedCount: number;
}): BuildPlaylistQueueResult {
  if (!isSafeInternalReturnHref(input.source.returnHref)) {
    return { ok: false, reason: "invalid", skippedCount: input.skippedCount };
  }

  if (input.entries.length === 0) {
    return { ok: false, reason: "empty", skippedCount: input.skippedCount };
  }

  const queue: PlaylistQueue = {
    id: makeQueueId("pq"),
    title: input.title.trim() || "Плейлист",
    source: input.source,
    entries: input.entries,
    currentIndex: 0,
    skippedCount: input.skippedCount,
    runtimeSkippedCount: 0,
  };

  return { ok: true, queue };
}

/**
 * Build Play All queue for an owned playlist detail view.
 * Uses already-computed `available` + listenHref (access + audio readiness).
 */
export function buildOwnerPlaylistQueue(input: {
  playlistId: string;
  title: string;
  items: PlaylistDetailItemView[];
}): BuildPlaylistQueueResult {
  const playlistId = input.playlistId.trim();
  if (!playlistId) {
    return { ok: false, reason: "invalid", skippedCount: 0 };
  }

  const entries: PlaylistQueueEntry[] = [];
  let skippedCount = 0;

  for (const item of input.items) {
    const authorSlug = item.authorSlug?.trim() || null;
    const listenHref = item.listenHref
      ? normalizeListenHref(item.listenHref)
      : null;
    const productSlug = listenHref
      ? extractProductSlugFromListenHref(listenHref)
      : null;

    if (
      item.available &&
      listenHref &&
      authorSlug &&
      productSlug &&
      item.practiceId
    ) {
      entries.push(
        toProductEntry({
          practiceId: item.practiceId,
          authorSlug,
          productSlug,
          title: item.title,
          listenHref:
            normalizeListenHref(buildListenPath(authorSlug, productSlug)) ??
            listenHref,
        }),
      );
      continue;
    }

    skippedCount += 1;
  }

  return finalizeQueue({
    title: input.title,
    source: {
      kind: "owner_playlist",
      playlistId,
      returnHref: `/playlists/${playlistId}`,
    },
    entries,
    skippedCount,
  });
}

/**
 * Build Play All queue for a public playlist page.
 * Only items already marked available (public-content + audio ready + listen href).
 */
export function buildPublicPlaylistQueue(input: {
  playlistSlug: string;
  title: string;
  items: PublicPlaylistItemView[];
}): BuildPlaylistQueueResult {
  const playlistSlug = input.playlistSlug.trim();
  if (!playlistSlug) {
    return { ok: false, reason: "invalid", skippedCount: 0 };
  }

  const entries: PlaylistQueueEntry[] = [];
  let skippedCount = 0;

  for (const item of input.items) {
    const authorSlug = item.authorSlug?.trim() || null;
    const listenHref = item.href ? normalizeListenHref(item.href) : null;
    const productSlug = listenHref
      ? extractProductSlugFromListenHref(listenHref)
      : null;

    if (
      item.available &&
      listenHref &&
      authorSlug &&
      productSlug &&
      item.practiceId
    ) {
      entries.push(
        toProductEntry({
          practiceId: item.practiceId,
          authorSlug,
          productSlug,
          title: item.title,
          listenHref:
            normalizeListenHref(buildListenPath(authorSlug, productSlug)) ??
            listenHref,
        }),
      );
      continue;
    }

    skippedCount += 1;
  }

  return finalizeQueue({
    title: input.title,
    source: {
      kind: "public_playlist",
      playlistSlug,
      returnHref: buildPublicPlaylistPath(playlistSlug),
    },
    entries,
    skippedCount,
  });
}

export function formatQueueSkipMessage(skippedCount: number): string | null {
  if (skippedCount <= 0) {
    return null;
  }

  if (skippedCount === 1) {
    return "Один материал пропущен, потому что сейчас недоступен.";
  }

  return "Некоторые материалы пропущены, потому что сейчас недоступны.";
}

export function formatQueueWillSkipMessage(skippedCount: number): string | null {
  if (skippedCount <= 0) {
    return null;
  }

  return "Некоторые материалы будут пропущены.";
}

function extractProductSlugFromListenHref(href: string): string | null {
  const path = href.split("?")[0] ?? href;
  const parts = path.split("/").filter(Boolean);

  if (parts[0] !== "listen" || parts.length < 3) {
    return null;
  }

  const productSlug = parts[2]?.trim();
  return productSlug || null;
}
