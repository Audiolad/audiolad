import { cafeUniqueAhead } from "./cafe-queue/order";

/**
 * Owner mirror of the hall device (Sergey 2026-11-08, t1283u): what the paired hall device
 * plays is the truth for the owner's «Музыка» tab and for the owner-phone hall view – the same
 * track, play / pause, position and «Дальше в очереди». The owner phone never starts a second
 * copy of the stream to look in sync: while a hall device is live, the owner screens show the
 * hall and their play / pause / next buttons send the hall commands.
 *
 * Without a live hall device (none paired, offline for longer than HALL_MIRROR_FRESH_SECONDS,
 * or nothing reported yet) the owner keeps the local preview player as before.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hall heartbeat is every 30 s; two missed beats and a bit end the mirror. */
export const HALL_MIRROR_FRESH_SECONDS = 75;
/** Upcoming tracks the hall reports (the owner list shows fewer). */
export const HALL_QUEUE_REPORT_MAX = 12;
/** Owner poll of the hall snapshot. */
export const HALL_MIRROR_POLL_MS = 5_000;
/** After an owner command the button shows the asked state until the hall reports or this passes. */
export const HALL_MIRROR_PENDING_MS = 12_000;

export type HallNowPlayingReport = {
  positionMs: number;
  durationMs: number | null;
  queue: string[];
  aheadCount?: number;
  /** t1331u: next tracks the hall holds on the device for an outage (omitted: no buffer here). */
  bufferedCount?: number;
};

/** Largest buffered count a hall may report (the buffer keeps 10). */
export const HALL_BUFFERED_MAX = 50;

function bufferedCountOk(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= HALL_BUFFERED_MAX;
}

/** Owner side: a buffered count from the server, or null (none reported / not migrated). */
export function hallBufferedCount(value: unknown): number | null {
  return bufferedCountOk(value) ? Number(value) : null;
}

/** Report body part from the hall device (route validation). */
export function isHallNowPlayingReport(value: unknown): value is HallNowPlayingReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return Number.isSafeInteger(r.positionMs) && Number(r.positionMs) >= 0 && Number(r.positionMs) <= 86_400_000
    && (r.durationMs === null || (Number.isSafeInteger(r.durationMs) && Number(r.durationMs) > 0 && Number(r.durationMs) <= 86_400_000))
    && Array.isArray(r.queue) && r.queue.length <= 20
    && r.queue.every((id) => typeof id === "string" && UUID_RE.test(id))
    && (r.aheadCount === undefined || (Number.isSafeInteger(r.aheadCount)
      && Number(r.aheadCount) >= r.queue.length && Number(r.aheadCount) <= 100_000))
    && (r.bufferedCount === undefined || bufferedCountOk(r.bufferedCount));
}

/** Preview ids and total from the same no-repeat, no-wrap list as the hall UI. */
export function hallUpcomingSnapshot(
  tracks: readonly { audioItemId: string }[],
  order: readonly number[] | null,
  currentIndex: number,
  max = HALL_QUEUE_REPORT_MAX,
): { ids: string[]; aheadCount: number } {
  const play = order && order.length > 0 ? order : tracks.map((_, index) => index);
  const ahead = cafeUniqueAhead(tracks, play, currentIndex);
  const limit = Math.max(0, Math.min(HALL_QUEUE_REPORT_MAX, Math.floor(max)));
  return { ids: ahead.slice(0, limit).map((index) => tracks[index].audioItemId), aheadCount: ahead.length };
}

export function hallUpcomingIds(
  tracks: readonly { audioItemId: string }[],
  order: readonly number[] | null,
  currentIndex: number,
  max = HALL_QUEUE_REPORT_MAX,
): string[] {
  return hallUpcomingSnapshot(tracks, order, currentIndex, max).ids;
}

/** Old clients / rows may only have preview ids; never report fewer than that preview. */
export function hallQueueAheadCount(value: unknown, queueLength: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= queueLength && value <= 100_000
    ? value : queueLength;
}

export type HallNowPlaying = {
  state: "playing" | "paused" | "stopped" | "error";
  audioItemId: string | null;
  positionSec: number;
  durationSec: number | null;
  queue: string[];
  aheadCount: number;
  /** t1331u: next tracks kept on the hall device for an outage; null / omitted when unknown. */
  bufferedCount?: number | null;
  /** Seconds since the hall reported this position (server clock). */
  ageSec: number;
};

/** Owner side: the `hall-now` answer, or null when there is no live hall device. */
export function parseHallNowPlaying(value: unknown): HallNowPlaying | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  if (root.ok !== true || !root.hall || typeof root.hall !== "object") return null;
  const h = root.hall as Record<string, unknown>;
  const state = h.state;
  if (state !== "playing" && state !== "paused" && state !== "stopped" && state !== "error") return null;
  const audioItemId = typeof h.audioItemId === "string" && UUID_RE.test(h.audioItemId) ? h.audioItemId : null;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);
  const duration = typeof h.durationSec === "number" && Number.isFinite(h.durationSec) && h.durationSec > 0 ? h.durationSec : null;
  const queue = Array.isArray(h.queue) ? h.queue.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)) : [];
  return { state, audioItemId, positionSec: num(h.positionSec, 0), durationSec: duration, queue, aheadCount: hallQueueAheadCount(h.aheadCount, queue.length), bufferedCount: hallBufferedCount(h.bufferedCount), ageSec: num(h.ageSec, 0) };
}

export type HallMirrorView = {
  status: "playing" | "paused";
  index: number;
  currentTime: number;
  duration: number;
  /** Catalog indices in hall play order: the hall's current track first, then its queue. */
  queueOrder: number[];
  aheadCount: number;
  bufferedCount: number | null;
};

/**
 * What the owner screens render for the hall. Null when the hall track is not in this
 * catalog (the owner keeps the local player then instead of showing a wrong track).
 * `elapsedSec`: time since the snapshot arrived; a playing hall moves on meanwhile.
 */
export function hallMirrorView(
  hall: HallNowPlaying | null,
  tracks: readonly { audioItemId: string; durationSeconds: number | null }[],
  elapsedSec = 0,
): HallMirrorView | null {
  if (!hall || !hall.audioItemId) return null;
  const index = tracks.findIndex((track) => track.audioItemId === hall.audioItemId);
  if (index < 0) return null;
  const playing = hall.state === "playing";
  const duration = hall.durationSec ?? tracks[index]?.durationSeconds ?? 0;
  const moved = playing ? hall.ageSec + Math.max(0, elapsedSec) : 0;
  const raw = hall.positionSec + moved;
  const currentTime = duration > 0 ? Math.min(duration, raw) : raw;
  const byId = new Map(tracks.map((track, i) => [track.audioItemId, i]));
  const queueOrder = [index];
  for (const id of hall.queue) {
    const i = byId.get(id);
    if (i !== undefined && !queueOrder.includes(i)) queueOrder.push(i);
  }
  return { status: playing ? "playing" : "paused", index, currentTime, duration, queueOrder, aheadCount: hall.aheadCount, bufferedCount: hall.bufferedCount ?? null };
}

export type HallPending = { status: "playing" | "paused"; until: number; from: string };

/**
 * The player view the owner screens get: the hall's while mirrored (an owner command shows
 * the asked play / pause until the hall reports or HALL_MIRROR_PENDING_MS passes), otherwise
 * the local preview view unchanged.
 */
export function hallShownView<V extends { status: string; message: string | null; needsGesture: boolean; index: number; currentTime: number; duration: number }>(
  local: V,
  mirror: HallMirrorView | null,
  pending: HallPending | null,
  nowMs: number,
): V {
  if (!mirror) return local;
  const status = pending && pending.until > nowMs ? pending.status : mirror.status;
  return { ...local, status, message: null, needsGesture: false, index: mirror.index, currentTime: mirror.currentTime, duration: mirror.duration };
}
