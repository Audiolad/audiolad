/**
 * Client-safe queue geometry. No passport fields.
 * The server returns ids; the player keeps its catalog array and follows this index order.
 */

/** Next catalog index. A null order is the catalog itself: project, album, track. */
export function cafeQueueNextIndex(
  order: readonly number[] | null,
  current: number,
  length: number,
): number {
  const sequential = current < 0 || current >= length - 1 ? 0 : current + 1;
  if (!order || order.length === 0 || length <= 0) return sequential;
  const seen = new Set<number>();
  const valid: number[] = [];
  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= length || seen.has(index)) continue;
    seen.add(index);
    valid.push(index);
  }
  if (valid.length === 0) return sequential;
  const pos = valid.indexOf(current);
  if (pos < 0) return valid[0]!;
  return valid[(pos + 1) % valid.length]!;
}

/**
 * Ids from the server become catalog indices.
 * Unknown ids are ignored. A catalog track the server left out stays out:
 * the admission adapter is the only place that decides who is in the pool.
 */
export function cafeQueueIndices(
  tracks: readonly { audioItemId: string }[],
  orderedIds: readonly unknown[],
): number[] {
  const indexById = new Map(tracks.map((track, index) => [track.audioItemId, index]));
  const seen = new Set<number>();
  const order: number[] = [];
  for (const id of orderedIds) {
    if (typeof id !== "string") continue;
    const index = indexById.get(id);
    if (index === undefined || seen.has(index)) continue;
    seen.add(index);
    order.push(index);
  }
  return order;
}

/** How many upcoming rows the venue player lists before «и ещё N». */
export const CAFE_QUEUE_PREVIEW = 3;

/** 1 трек, 2 трека, 5 треков, 21 трек. */
export function ruTrackWord(count: number): string {
  const n = Math.abs(Math.trunc(count)) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return "треков";
  if (last === 1) return "трек";
  if (last >= 2 && last <= 4) return "трека";
  return "треков";
}

/**
 * How many of `ahead` stay hidden after the preview rows.
 * `ahead` is the unique tracks still in front of the playhead, not the loop back to the start.
 */
export function cafeUpcomingMoreCount(ahead: number, shown = CAFE_QUEUE_PREVIEW): number {
  if (!Number.isInteger(ahead) || ahead <= shown) return 0;
  return ahead - shown;
}

/** «и ещё 1 трек без повторов», «и ещё 3 трека без повторов». Hidden when nothing unique remains. */
export function cafeUpcomingMoreLabel(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  return `и ещё ${count} ${ruTrackWord(count)} без повторов`;
}

/**
 * Catalog indices strictly after the playhead in this pass of the built queue.
 * Indices before the playhead are left out: the player loops, and those tracks would play again.
 */
export function cafeAheadIndices(order: readonly number[], currentIndex: number): number[] {
  if (order.length === 0) return [];
  const pos = order.indexOf(currentIndex);
  const ahead = pos < 0 ? order : order.slice(pos + 1);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const index of ahead) {
    if (!Number.isInteger(index) || index === currentIndex || seen.has(index)) continue;
    seen.add(index);
    out.push(index);
  }
  return out;
}

/**
 * One row per audio id still ahead. A later copy of a track already heard, or already counted, is a repeat.
 */
export function cafeUniqueAhead(
  tracks: readonly { audioItemId: string }[],
  order: readonly number[],
  currentIndex: number,
): number[] {
  const heard = new Set<string>();
  const pos = order.indexOf(currentIndex);
  const prefix = pos < 0 ? [] : order.slice(0, pos + 1);
  for (const index of prefix) {
    const id = tracks[index]?.audioItemId;
    if (id) heard.add(id);
  }
  const seen = new Set<string>();
  const out: number[] = [];
  for (const index of cafeAheadIndices(order, currentIndex)) {
    const id = tracks[index]?.audioItemId;
    if (!id || heard.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(index);
  }
  return out;
}

/** Tracks after the current one, then the earlier ones, following `order`. */
export function cafeUpcomingIndices(order: readonly number[], currentIndex: number): number[] {
  if (order.length <= 1) return [];
  const pos = order.indexOf(currentIndex);
  const rotated = pos < 0 ? [...order] : [...order.slice(pos + 1), ...order.slice(0, pos)];
  return rotated.filter((index) => index !== currentIndex);
}
