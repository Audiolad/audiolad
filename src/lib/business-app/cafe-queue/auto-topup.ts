/**
 * Hall / owner local queue auto top-up (t1327u).
 * When unique tracks still ahead drop to the threshold, rebuild a fresh seeded mix
 * without cutting the current track. Recently played ids go to the back so
 * «без повторов» stays honest. Wrap via cafeQueueNextIndex remains the fallback.
 */

import { cafeUniqueAhead } from "./order";
import { CAFE_QUEUE_EXCLUDE_LIMIT } from "./prefs";
export { CAFE_QUEUE_EXCLUDE_LIMIT };
import { pointKeepCurrentOrder } from "@/lib/business-app/point-sound";

/** Rebuild when this many unique tracks (or fewer) remain ahead. ~1–1.5 h at cafe length. */
export const CAFE_QUEUE_TOPUP_THRESHOLD = 25;

/** Device ring of recently played audio ids pushed to the back of a new mix. */
export const CAFE_QUEUE_RECENT_RING = 180;

/** Calm owner note near the remaining-count (Russian, en dash only in product copy). */
export const CAFE_QUEUE_TOPUP_NOTE = "Очередь обновляется сама";

/** Backoff after a failed top-up attempt (ms). */
export const CAFE_QUEUE_TOPUP_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000] as const;

export function shouldTopUpQueue(
  uniqueAhead: number,
  threshold: number = CAFE_QUEUE_TOPUP_THRESHOLD,
): boolean {
  return Number.isFinite(uniqueAhead) && uniqueAhead >= 0 && uniqueAhead <= threshold;
}

/**
 * Hall device always tops up its own queue.
 * Owner tops up only while playing locally (not mirroring a live hall).
 */
export function queueTopUpOwnsPlayback(input: {
  pointDevice: boolean;
  hallMirror: boolean;
}): boolean {
  if (input.pointDevice) return true;
  return !input.hallMirror;
}

/** Append a played id to the front of the ring; drop older duplicates and trim. */
export function rememberPlayedId(
  ring: readonly string[],
  audioItemId: string,
  max: number = CAFE_QUEUE_RECENT_RING,
): string[] {
  if (!audioItemId || max <= 0) return [...ring];
  const next = [audioItemId, ...ring.filter((id) => id !== audioItemId)];
  return next.slice(0, max);
}

/**
 * Keep `currentIndex` first, then the rest of `order`, but move any index whose
 * audio id is in `recentIds` (except the current track) to the end, preserving
 * relative order within each group.
 */
export function pushRecentIdsToBack(
  order: readonly number[],
  tracks: readonly { audioItemId: string }[],
  recentIds: readonly string[],
  currentIndex: number,
): number[] {
  if (order.length === 0) return [];
  const recent = new Set(recentIds);
  const head: number[] = [];
  const tail: number[] = [];
  const seen = new Set<number>();
  for (const index of order) {
    if (!Number.isInteger(index) || seen.has(index)) continue;
    seen.add(index);
    if (index === currentIndex) {
      head.push(index);
      continue;
    }
    const id = tracks[index]?.audioItemId;
    if (id && recent.has(id)) tail.push(index);
    else head.push(index);
  }
  if (!seen.has(currentIndex) && Number.isInteger(currentIndex) && currentIndex >= 0) {
    return [currentIndex, ...head, ...tail];
  }
  return [...head, ...tail];
}

/**
 * Apply a freshly ranked catalog order: keep the playing track at the boundary,
 * then push the recent ring (and this pass) to the back.
 */
export function spliceTopUpOrder(
  rankedIndices: readonly number[],
  currentIndex: number,
  tracks: readonly { audioItemId: string }[],
  recentIds: readonly string[],
): number[] {
  const kept = pointKeepCurrentOrder(rankedIndices, currentIndex);
  return pushRecentIdsToBack(kept, tracks, recentIds, currentIndex);
}

export function uniqueAheadCount(
  tracks: readonly { audioItemId: string }[],
  order: readonly number[] | null,
  currentIndex: number,
): number {
  if (!order || order.length === 0) return 0;
  return cafeUniqueAhead(tracks, order, currentIndex).length;
}

export function nextTopUpBackoffMs(
  failCount: number,
  table: readonly number[] = CAFE_QUEUE_TOPUP_BACKOFF_MS,
): number {
  if (table.length === 0) return 5_000;
  const idx = Math.max(0, Math.min(table.length - 1, Math.floor(failCount) - 1));
  if (failCount <= 0) return table[0]!;
  return table[idx]!;
}

export type QueueTopUpGuard = {
  /** True when a top-up may start now (not in flight, backoff elapsed). */
  canStart: (nowMs?: number) => boolean;
  begin: () => boolean;
  succeed: () => void;
  fail: (nowMs?: number) => void;
  inFlight: () => boolean;
  failCount: () => number;
};

/** One top-up in flight; failures back off. Success resets the fail counter. */
export function createQueueTopUpGuard(): QueueTopUpGuard {
  let inFlight = false;
  let fails = 0;
  let nextAllowedAt = 0;
  return {
    canStart(nowMs = Date.now()) {
      if (inFlight) return false;
      return nowMs >= nextAllowedAt;
    },
    begin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    succeed() {
      inFlight = false;
      fails = 0;
      nextAllowedAt = 0;
    },
    fail(nowMs = Date.now()) {
      inFlight = false;
      fails += 1;
      nextAllowedAt = nowMs + nextTopUpBackoffMs(fails);
    },
    inFlight: () => inFlight,
    failCount: () => fails,
  };
}

/**
 * Drop excluded ids from the ranked head and append the ones that still belong
 * to the pool (so the catalog stays complete, just deferred).
 */
export function appendExcludedIds(
  orderedIds: readonly string[],
  excludeIds: readonly string[],
  poolIds: readonly string[],
): string[] {
  if (excludeIds.length === 0) return [...orderedIds];
  const exclude = new Set(excludeIds);
  const pool = new Set(poolIds);
  const head = orderedIds.filter((id) => !exclude.has(id));
  const seen = new Set(head);
  const tail: string[] = [];
  for (const id of excludeIds) {
    if (!pool.has(id) || seen.has(id)) continue;
    seen.add(id);
    tail.push(id);
  }
  return [...head, ...tail];
}
