/**
 * Business SPA pilot (0e05333f): pure aggregation for the admin panel.
 * Turns raw business_playback_log rows into per-track online/offline minutes.
 * played_ms is untrusted telemetry (see table comment); this is an operational
 * view, not accepted Proof of Play and not a royalty input.
 */

export type SpaPlaybackLogRow = {
  audio_item_id: string;
  played_ms: number | string | null;
  offline: boolean;
  event: string;
  received_at: string | null;
};

export type SpaTrackMinutes = {
  audioItemId: string;
  onlineMinutes: number;
  offlineMinutes: number;
  events: number;
  lastReceivedAt: string | null;
};

export type SpaMinutesSummary = {
  byTrack: Map<string, SpaTrackMinutes>;
  totalOnlineMinutes: number;
  totalOfflineMinutes: number;
};

/** Clamp a single event to [0, 6h] so a bad client clock cannot inflate totals. */
export const SPA_MAX_EVENT_MS = 6 * 60 * 60 * 1000;

function toMs(value: SpaPlaybackLogRow["played_ms"]): number {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, SPA_MAX_EVENT_MS);
}

function round1(ms: number): number {
  return Math.round(ms / 6000) / 10;
}

export function summarizeSpaPlayback(rows: readonly SpaPlaybackLogRow[]): SpaMinutesSummary {
  const acc = new Map<string, { on: number; off: number; events: number; last: string | null }>();
  let on = 0;
  let off = 0;
  for (const row of rows) {
    const ms = row.event === "start" ? 0 : toMs(row.played_ms);
    const cur = acc.get(row.audio_item_id) ?? { on: 0, off: 0, events: 0, last: null };
    if (row.offline) {
      cur.off += ms;
      off += ms;
    } else {
      cur.on += ms;
      on += ms;
    }
    cur.events += 1;
    if (row.received_at && (!cur.last || row.received_at > cur.last)) cur.last = row.received_at;
    acc.set(row.audio_item_id, cur);
  }
  const byTrack = new Map<string, SpaTrackMinutes>();
  for (const [id, v] of acc) {
    byTrack.set(id, {
      audioItemId: id,
      onlineMinutes: round1(v.on),
      offlineMinutes: round1(v.off),
      events: v.events,
      lastReceivedAt: v.last,
    });
  }
  return { byTrack, totalOnlineMinutes: round1(on), totalOfflineMinutes: round1(off) };
}
