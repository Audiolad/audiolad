/**
 * Business SPA pilot (0e05333f): pure player logic (unit-tested, no DOM).
 * Queue order, resume state, offline deadline label, and the offline play-log queue.
 */

import { offlineCacheDeadline, type SpaManifest, type SpaManifestItem } from "./spa-manifest";

export type SpaResumeState = { audioItemId: string; positionSec: number; savedAt: number };

export type SpaLogEvent = {
  client_event_id: string;
  audio_item_id: string;
  event: "complete" | "skip" | "error";
  started_at: string;
  ended_at: string;
  played_ms: number;
  offline: boolean;
};

export const SPA_LOG_QUEUE_MAX = 5000;

/** Index of the next track (loops the program). -1 when nothing is playable. */
export function nextIndex(count: number, current: number): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count - 1) return 0;
  return current + 1;
}

/**
 * Where to start after a reload or a manifest change. If the remembered track is
 * still in the program, continue it at the saved position; if it was removed, start
 * the track that now sits at its old place; otherwise the first track.
 */
export function resolveResume(
  items: readonly Pick<SpaManifestItem, "audioItemId" | "durationSeconds">[],
  state: SpaResumeState | null,
  previousOrder: readonly string[] = [],
): { index: number; positionSec: number } {
  if (items.length === 0) return { index: -1, positionSec: 0 };
  if (!state) return { index: 0, positionSec: 0 };
  const idx = items.findIndex((i) => i.audioItemId === state.audioItemId);
  if (idx >= 0) {
    const dur = items[idx].durationSeconds;
    const pos = Number.isFinite(state.positionSec) && state.positionSec > 0 ? state.positionSec : 0;
    // Too close to the end: continue with the next track instead of a 1-second blip.
    if (dur && pos >= dur - 2) return { index: nextIndex(items.length, idx), positionSec: 0 };
    return { index: idx, positionSec: pos };
  }
  const oldPos = previousOrder.indexOf(state.audioItemId);
  if (oldPos >= 0) {
    for (const id of previousOrder.slice(oldPos + 1)) {
      const j = items.findIndex((i) => i.audioItemId === id);
      if (j >= 0) return { index: j, positionSec: 0 };
    }
  }
  return { index: 0, positionSec: 0 };
}

export function parseResume(raw: string | null): SpaResumeState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SpaResumeState>;
    if (typeof v.audioItemId !== "string" || typeof v.positionSec !== "number" || typeof v.savedAt !== "number") return null;
    return { audioItemId: v.audioItemId, positionSec: v.positionSec, savedAt: v.savedAt };
  } catch {
    return null;
  }
}

/**
 * Latest moment the cached program can keep playing without network: the
 * earliest per-track deadline among cached tracks (fail-closed), never beyond 7 days.
 * null = nothing is cached, offline playback impossible.
 */
export function offlineUntil(
  manifest: Pick<SpaManifest, "items">,
  cachedAt: ReadonlyMap<string, Date>,
): Date | null {
  let min: number | null = null;
  for (const item of manifest.items) {
    const at = cachedAt.get(item.audioItemId);
    if (!at) continue;
    const d = offlineCacheDeadline(item, at);
    if (!d) continue;
    if (min === null || d.getTime() < min) min = d.getTime();
  }
  return min === null ? null : new Date(min);
}

export function formatOfflineLabel(until: Date | null): string {
  if (!until) return "офлайн недоступен: треки ещё не сохранены";
  const s = until.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `офлайн до ${s}`;
}

/** Append with dedupe by client_event_id and a hard cap (oldest dropped). */
export function enqueueLog(queue: readonly SpaLogEvent[], ev: SpaLogEvent): SpaLogEvent[] {
  if (queue.some((e) => e.client_event_id === ev.client_event_id)) return [...queue];
  const next = [...queue, ev];
  return next.length > SPA_LOG_QUEUE_MAX ? next.slice(next.length - SPA_LOG_QUEUE_MAX) : next;
}

/** Remove events the server acknowledged. */
export function ackLog(queue: readonly SpaLogEvent[], acked: readonly string[]): SpaLogEvent[] {
  const set = new Set(acked);
  return queue.filter((e) => !set.has(e.client_event_id));
}

export function parseLogQueue(raw: string | null): SpaLogEvent[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isLogEvent) : [];
  } catch {
    return [];
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isLogEvent(v: unknown): v is SpaLogEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.client_event_id === "string" && UUID.test(e.client_event_id) &&
    typeof e.audio_item_id === "string" && UUID.test(e.audio_item_id) &&
    (e.event === "complete" || e.event === "skip" || e.event === "error") &&
    typeof e.started_at === "string" && !Number.isNaN(Date.parse(e.started_at)) &&
    typeof e.ended_at === "string" && Date.parse(e.ended_at) >= Date.parse(e.started_at) &&
    typeof e.played_ms === "number" && Number.isFinite(e.played_ms) && e.played_ms >= 0 &&
    typeof e.offline === "boolean"
  );
}
