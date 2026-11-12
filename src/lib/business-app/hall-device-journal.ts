/**
 * t1390u (Sergey 12.11.2026): hall device journal. 11.11 and 12.11 the hall iPhone went quiet at
 * 09:42 MSK and the server only knew the LAST state of the device: no history, no page restarts,
 * no autoplay refusals, no element events. This module keeps a small, throttled event log on the
 * hall page and sends it with the point session (POST /api/business/point, kind "events") into
 * business_player_device_events. Never shown to anybody in the hall or to the owner; best effort.
 *
 * Budget: at most HALL_JOURNAL_MAX_PER_HOUR events an hour, one event of a kind per
 * HALL_JOURNAL_KIND_GAP_MS (except the rare ones in URGENT_KINDS), ≤ HALL_JOURNAL_BATCH events per
 * request, ≤ HALL_JOURNAL_DATA_KEYS small values per event.
 */

export const HALL_JOURNAL_KINDS = [
  "page_load",
  "page_hide",
  "snapshot",
  "track",
  "visibility",
  "el_pause",
  "el_waiting",
  "el_stalled",
  "el_error",
  "unexpected_pause",
  "self_resume_ok",
  "self_resume_failed",
  "self_resume_ended",
  "watchdog_stuck",
  "recover",
  "autoplay_blocked",
  "auto_resume",
  "wake_lock",
] as const;
export type HallJournalKind = (typeof HALL_JOURNAL_KINDS)[number];

export type HallJournalValue = string | number | boolean | null;
export type HallJournalData = Record<string, HallJournalValue>;
export type HallJournalEvent = { k: HallJournalKind; at: number; d: HallJournalData };

export const HALL_JOURNAL_BATCH = 12;
export const HALL_JOURNAL_QUEUE_MAX = 60;
export const HALL_JOURNAL_MAX_PER_HOUR = 150;
export const HALL_JOURNAL_KIND_GAP_MS = 10_000;
export const HALL_JOURNAL_FLUSH_MS = 60_000;
export const HALL_JOURNAL_URGENT_FLUSH_MS = 2_000;
export const HALL_JOURNAL_DATA_KEYS = 16;
export const HALL_JOURNAL_STRING_MAX = 64;
/** sessionStorage: this tab's hall page is alive (removed on a normal unload). */
export const HALL_PAGE_ALIVE_KEY = "audiolad.hall.page-alive";

/** Rare and important: never throttled by kind, flushed within seconds. */
const URGENT_KINDS = new Set<HallJournalKind>([
  "page_load",
  "page_hide",
  "unexpected_pause",
  "self_resume_ok",
  "self_resume_failed",
  "self_resume_ended",
  "watchdog_stuck",
  "autoplay_blocked",
  "auto_resume",
  "recover",
]);

export function isHallJournalKind(value: unknown): value is HallJournalKind {
  return typeof value === "string" && (HALL_JOURNAL_KINDS as readonly string[]).includes(value);
}

/** Small, flat, primitive values only; long strings cut, odd values dropped. */
export function cleanHallJournalData(input: unknown): HallJournalData {
  const out: HallJournalData = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  let n = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (n >= HALL_JOURNAL_DATA_KEYS) break;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(key)) continue;
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      out[key] = Math.abs(value) >= 1e12 ? Math.round(value) : Math.round(value * 100) / 100;
    } else if (typeof value === "string") out[key] = value.slice(0, HALL_JOURNAL_STRING_MAX);
    else continue;
    n++;
  }
  return out;
}

/** Server-side check of one posted event (route). */
export function parseHallJournalEvent(value: unknown, nowMs: number): HallJournalEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!isHallJournalKind(v.k)) return null;
  const at = Number(v.at);
  // Client clock: within a week back / a day ahead of the server, else the server time is used.
  const sane = Number.isFinite(at) && at > nowMs - 7 * 86_400_000 && at < nowMs + 86_400_000;
  const d = cleanHallJournalData(v.d);
  if (JSON.stringify(d).length > 1024) return null;
  return { k: v.k, at: sane ? Math.round(at) : nowMs, d };
}

export type HallJournalDeps = {
  send(events: HallJournalEvent[]): Promise<boolean>;
  /** Context merged into every event (status, position, uptime, tracks, buffer, visibility…). */
  context?: () => HallJournalData;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
};

export class HallDeviceJournal {
  private queue: HallJournalEvent[] = [];
  private lastByKind = new Map<HallJournalKind, number>();
  private suppressed = new Map<HallJournalKind, number>();
  private hourStart = 0;
  private hourCount = 0;
  private timer: unknown = null;
  private timerAt = Infinity;
  private sending = false;
  private disposed = false;
  dropped = 0;

  constructor(private readonly d: HallJournalDeps) {}

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  get size(): number {
    return this.queue.length;
  }

  /** Records one event (throttled). Returns false when it was not kept. Never throws. */
  log(kind: HallJournalKind, data?: HallJournalData): boolean {
    try {
      if (this.disposed) return false;
      const now = this.now();
      const urgent = URGENT_KINDS.has(kind);
      if (!urgent) {
        const last = this.lastByKind.get(kind);
        if (last !== undefined && now - last < HALL_JOURNAL_KIND_GAP_MS) {
          this.suppressed.set(kind, (this.suppressed.get(kind) ?? 0) + 1);
          return false;
        }
      }
      if (now - this.hourStart >= 3_600_000) {
        this.hourStart = now;
        this.hourCount = 0;
      }
      if (this.hourCount >= HALL_JOURNAL_MAX_PER_HOUR) {
        this.dropped++;
        return false;
      }
      this.hourCount++;
      this.lastByKind.set(kind, now);
      let ctx: HallJournalData = {};
      try {
        ctx = this.d.context?.() ?? {};
      } catch {
        ctx = {};
      }
      const merged: Record<string, unknown> = { ...ctx, ...(data ?? {}) };
      const skipped = this.suppressed.get(kind);
      if (skipped) {
        merged.skipped = skipped;
        this.suppressed.delete(kind);
      }
      this.queue.push({ k: kind, at: now, d: cleanHallJournalData(merged) });
      while (this.queue.length > HALL_JOURNAL_QUEUE_MAX) {
        this.queue.shift();
        this.dropped++;
      }
      this.schedule(urgent ? HALL_JOURNAL_URGENT_FLUSH_MS : HALL_JOURNAL_FLUSH_MS);
      return true;
    } catch {
      return false;
    }
  }

  private schedule(ms: number): void {
    if (this.disposed) return;
    const at = this.now() + ms;
    if (this.timer !== null && this.timerAt <= at) return;
    if (this.timer !== null) (this.d.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>)))(this.timer);
    this.timerAt = at;
    this.timer = (this.d.setTimer ?? ((fn, t) => setTimeout(fn, t)))(() => {
      this.timer = null;
      this.timerAt = Infinity;
      void this.flush();
    }, ms);
  }

  /** Sends up to HALL_JOURNAL_BATCH events; a failure keeps them for a later try. */
  async flush(): Promise<void> {
    if (this.sending || this.queue.length === 0) return;
    this.sending = true;
    const batch = this.queue.slice(0, HALL_JOURNAL_BATCH);
    let ok = false;
    try {
      ok = await this.d.send(batch);
    } catch {
      ok = false;
    }
    this.sending = false;
    if (ok) this.queue.splice(0, batch.length);
    if (this.disposed) return;
    if (this.queue.length > 0) this.schedule(ok ? HALL_JOURNAL_URGENT_FLUSH_MS : HALL_JOURNAL_FLUSH_MS);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) (this.d.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>)))(this.timer);
    this.timer = null;
  }
}

/** Browser navigation type of this page load ("navigate" | "reload" | "back_forward" | …). */
export function hallNavigationType(perf: { getEntriesByType?: (type: string) => unknown[] } | null | undefined): string {
  try {
    const entry = perf?.getEntriesByType?.("navigation")?.[0] as { type?: unknown } | undefined;
    return typeof entry?.type === "string" ? entry.type.slice(0, 20) : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Marks this tab's hall page alive; returns whether the previous page of this tab never said
 * goodbye (no pagehide) – the sign of a page killed by the browser (crash / memory).
 */
export function markHallPageAlive(storage: Pick<Storage, "getItem" | "setItem"> | null | undefined, id: string): { previousAlive: boolean } {
  try {
    const previous = storage?.getItem(HALL_PAGE_ALIVE_KEY) ?? null;
    storage?.setItem(HALL_PAGE_ALIVE_KEY, id);
    return { previousAlive: !!previous && previous !== id };
  } catch {
    return { previousAlive: false };
  }
}

export function clearHallPageAlive(storage: Pick<Storage, "removeItem"> | null | undefined): void {
  try {
    storage?.removeItem(HALL_PAGE_ALIVE_KEY);
  } catch {
    /* private mode */
  }
}
