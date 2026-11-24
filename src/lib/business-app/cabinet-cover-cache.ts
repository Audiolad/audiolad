/**
 * t1654u: cabinet covers for the current track and the next three only.
 * A full-pool preload (t1647u) opened ~25 /api/business/workspace/cover requests at once
 * and froze the cabinet. The tab-lifetime blob cache remains, so a remount of «Музыка»
 * still paints immediately, but it is capped (LRU) and fetches are limited to 4 at a time.
 */

import { cabinetAlbumCoverUrl } from "@/lib/business-app/album-cover";
import { CAFE_QUEUE_PREVIEW, cafeQueuePreviewIndices } from "@/lib/business-app/cafe-queue/order";

export const CABINET_COVER_PRELOAD_LIMIT = 4;
/**
 * t1674u: the guest «Собрать атмосферу» list shows at most 12 rows, all visible at once, so
 * every row's album cover is allowed (current track first, then the rest in list order).
 * Fetches still go 4 at a time; the signed-in cabinet queue keeps the 4-cover window.
 */
export const GUEST_ATMOSPHERE_COVER_LIMIT = 12;
/**
 * t1677u: the owner/hall «Музыка» screen – the playing track, the CAFE_QUEUE_PREVIEW rows of
 * «Дальше в очереди» (exactly the rows on screen) and two rows of lookahead for the next move.
 * t1654u froze the cabinet with ~25 simultaneous /api/business/workspace/cover requests (each
 * rebuilt the catalog): the set stays small and fetches stay CABINET_COVER_MAX_CONCURRENT at a time.
 */
export const CABINET_QUEUE_COVER_LOOKAHEAD = 2;
export const CABINET_QUEUE_COVER_LIMIT = 1 + CAFE_QUEUE_PREVIEW + CABINET_QUEUE_COVER_LOOKAHEAD;
export const CABINET_COVER_MAX_CONCURRENT = 4;
export const CABINET_COVER_CACHE_LIMIT = 30;
export const CABINET_COVER_IDLE_TIMEOUT_MS = 800;

const blobs = new Map<string, string>();
const inflight = new Map<string, { promise: Promise<void>; abort: AbortController }>();
const queue: string[] = [];
const listeners = new Set<(src: string) => void>();
/** The only covers we keep fetching after a queue move; stale inflight is aborted. */
let desired = new Set<string>();

export function resolveCabinetCoverSrc(src: string | null | undefined): string | null {
  const url = src?.trim() ?? "";
  if (!url) return null;
  const cached = blobs.get(url);
  if (cached) {
    blobs.delete(url);
    blobs.set(url, cached);
    return cached;
  }
  return url;
}

export function isCabinetCoverCached(src: string | null | undefined): boolean {
  const url = src?.trim() ?? "";
  return Boolean(url) && blobs.has(url);
}

export function subscribeCabinetCoverCache(listener: (src: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function selectCabinetCoverPreloadUrls(
  tracks: readonly { coverUrl?: string | null }[],
  currentIndex: number,
  queueOrder: readonly number[] | null,
  limit = CABINET_COVER_PRELOAD_LIMIT,
): string[] {
  const order = queueOrder && queueOrder.length > 0 ? queueOrder : tracks.map((_, index) => index);
  const start = Math.max(0, order.indexOf(currentIndex));
  const windowSize = Math.min(limit, order.length);
  const urls: string[] = [];
  const seen = new Set<string>();
  for (let step = 0; step < windowSize; step += 1) {
    const index = order[(start + step) % order.length];
    const src = cabinetAlbumCoverUrl({ coverUrl: tracks[index]?.coverUrl });
    if (!src || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
  }
  return urls;
}

/**
 * t1677u: covers for the owner/hall queue screen, in the order they matter: the playing track,
 * then the listed «Дальше в очереди» rows (same indices as the list), then the lookahead.
 * Rows that share an album cover are fetched once.
 */
export function selectCabinetQueueCoverUrls(
  tracks: readonly { audioItemId: string; coverUrl?: string | null }[],
  currentIndex: number,
  queueOrder: readonly number[] | null,
): string[] {
  if (tracks.length === 0) return [];
  const order = queueOrder && queueOrder.length > 0 ? queueOrder : tracks.map((_, index) => index);
  const current = tracks[currentIndex] ? currentIndex : 0;
  const rows = [current, ...cafeQueuePreviewIndices(tracks, order, currentIndex).slice(0, CAFE_QUEUE_PREVIEW + CABINET_QUEUE_COVER_LOOKAHEAD)];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const index of rows) {
    const src = cabinetAlbumCoverUrl({ coverUrl: tracks[index]?.coverUrl });
    if (!src || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
    if (urls.length >= CABINET_QUEUE_COVER_LIMIT) break;
  }
  return urls;
}

function evictIfNeeded() {
  while (blobs.size > CABINET_COVER_CACHE_LIMIT) {
    const oldest = blobs.keys().next().value as string | undefined;
    if (oldest == null) break;
    const objectUrl = blobs.get(oldest);
    blobs.delete(oldest);
    if (objectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function" && objectUrl.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function remember(url: string, blob: Blob) {
  const previous = blobs.get(url);
  if (previous && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function" && previous.startsWith("blob:")) {
    URL.revokeObjectURL(previous);
  }
  blobs.delete(url);
  blobs.set(url, URL.createObjectURL(blob));
  evictIfNeeded();
  for (const listener of listeners) listener(url);
}

function pump() {
  while (inflight.size < CABINET_COVER_MAX_CONCURRENT && queue.length > 0) {
    const url = queue.shift();
    if (!url || blobs.has(url) || inflight.has(url) || !desired.has(url)) continue;
    startFetch(url);
  }
}

function startFetch(url: string) {
  if (typeof window === "undefined" || typeof fetch !== "function" || typeof URL.createObjectURL !== "function") {
    return;
  }
  const abort = new AbortController();
  const request = fetch(url, {
    credentials: "same-origin",
    cache: "force-cache",
    signal: abort.signal,
    priority: "low",
  } as RequestInit & { priority: "low" })
    .then((response) => {
      if (!response.ok) throw new Error("cabinet_cover_unavailable");
      return response.blob();
    })
    .then((blob) => {
      if (abort.signal.aborted) return;
      remember(url, blob);
    })
    .catch(() => {
      /* Leave the original src; the img onError path still hides a broken cover. */
    })
    .finally(() => {
      inflight.delete(url);
      pump();
    });
  inflight.set(url, { promise: request, abort });
}

function enqueue(url: string) {
  if (!url || blobs.has(url) || inflight.has(url) || queue.includes(url) || !desired.has(url)) return;
  queue.push(url);
  pump();
}

export function preloadCabinetCover(src: string | null | undefined): Promise<void> {
  const url = src?.trim() ?? "";
  if (!url || blobs.has(url) || !desired.has(url)) return Promise.resolve();
  const pending = inflight.get(url);
  if (pending) return pending.promise;
  if (typeof window === "undefined" || typeof fetch !== "function" || typeof URL.createObjectURL !== "function") {
    return Promise.resolve();
  }
  enqueue(url);
  return inflight.get(url)?.promise ?? new Promise((resolve) => {
    const tick = () => {
      const now = inflight.get(url);
      if (now) {
        now.promise.then(resolve, resolve);
        return;
      }
      if (blobs.has(url) || !desired.has(url) || (!queue.includes(url) && !inflight.has(url))) {
        resolve();
        return;
      }
      setTimeout(tick, 0);
    };
    tick();
  });
}

/**
 * Replace the only set of covers we may fetch: the playing track and the next three.
 * Anything in flight that is no longer in this set is aborted.
 */
export function setCabinetCoverPreloadSet(
  urls: readonly (string | null | undefined)[],
  limit = CABINET_COVER_PRELOAD_LIMIT,
): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of urls) {
    const url = value?.trim() ?? "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    next.push(url);
    if (next.length >= limit) break;
  }
  desired = new Set(next);
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (!desired.has(queue[i]!)) queue.splice(i, 1);
  }
  for (const [url, entry] of inflight) {
    if (!desired.has(url)) entry.abort.abort();
  }
  for (const url of next) enqueue(url);
  return next;
}

export function cabinetCoverInflightCountForTests(): number {
  return inflight.size;
}

export function cabinetCoverQueuedCountForTests(): number {
  return queue.length;
}

export function cabinetCoverCacheSizeForTests(): number {
  return blobs.size;
}

export function scheduleCabinetCoverPreload(run: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout: CABINET_COVER_IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(id);
  }
  const timer = setTimeout(run, CABINET_COVER_IDLE_TIMEOUT_MS);
  return () => clearTimeout(timer);
}

/** Test helper: drop cached blob URLs so cases stay isolated. */
export function resetCabinetCoverCacheForTests(): void {
  for (const [, entry] of inflight) entry.abort.abort();
  inflight.clear();
  queue.length = 0;
  desired = new Set();
  for (const objectUrl of blobs.values()) {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function" && objectUrl.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrl);
    }
  }
  blobs.clear();
  listeners.clear();
}
