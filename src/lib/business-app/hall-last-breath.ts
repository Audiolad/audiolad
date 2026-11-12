/**
 * t1390u follow-up (12.11.2026, 14:48:49 MSK): the hall iPhone page died right at a track change
 * (the element had just asked for the next track, two requests in flight were cut off) and Safari
 * opened the page again by itself. The journal of the dead page was lost – it flushes once a minute
 * and a killed page never says goodbye. This module keeps a tiny «last breath» of the hall page in
 * localStorage (every few seconds and on every journal event) so the NEXT page can report how the
 * previous one ended: said goodbye (normal unload) or not (killed), what it was doing, how long
 * after the last track change, what the buffer had in flight. Diagnostics only – never shown.
 */

export const HALL_LAST_BREATH_KEY = "audiolad.hall.last-breath";
/** How often the page writes its state while alive (ms). */
export const HALL_LAST_BREATH_MS = 5_000;
/** An older record says nothing about the page that ran just before this one. */
export const HALL_LAST_BREATH_MAX_AGE_MS = 6 * 60 * 60_000;

export type HallLastBreath = {
  /** Page id (performance.timeOrigin + random), to tell two pages apart. */
  id: string;
  /** Last write (epoch ms). */
  at: number;
  /** The page left normally (pagehide, not persisted). */
  bye: boolean;
  /** Controller status, element position (s), page uptime (s), tracks since load. */
  st: string | null;
  pos: number | null;
  up: number | null;
  n: number | null;
  /** Seconds since the last track change on that page (null: none yet). */
  trackAgeS: number | null;
  /** Buffer: copies on the device, MB, downloads in flight. */
  bufN: number | null;
  bufMb: number | null;
  dl: number | null;
  vis: string | null;
  /** First 8 characters of the build of that page. */
  build: string | null;
  /** Last reading of the origin storage use (MB) and of the hall cache entries. */
  usageMb: number | null;
  cacheN: number | null;
};

type ReadStorage = Pick<Storage, "getItem"> | null | undefined;
type WriteStorage = Pick<Storage, "setItem"> | null | undefined;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 24): string | null => (typeof v === "string" && v ? v.slice(0, max) : null);

export function readHallLastBreath(storage: ReadStorage): HallLastBreath | null {
  try {
    const raw = storage?.getItem(HALL_LAST_BREATH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    const id = str(v.id, 40);
    const at = num(v.at);
    if (!id || at === null) return null;
    return {
      id,
      at,
      bye: v.bye === true,
      st: str(v.st),
      pos: num(v.pos),
      up: num(v.up),
      n: num(v.n),
      trackAgeS: num(v.trackAgeS),
      bufN: num(v.bufN),
      bufMb: num(v.bufMb),
      dl: num(v.dl),
      vis: str(v.vis, 2),
      build: str(v.build, 8),
      usageMb: num(v.usageMb),
      cacheN: num(v.cacheN),
    };
  } catch {
    return null;
  }
}

export function writeHallLastBreath(storage: WriteStorage, breath: HallLastBreath): void {
  try {
    storage?.setItem(HALL_LAST_BREATH_KEY, JSON.stringify(breath));
  } catch {
    /* private mode / quota – diagnostics only */
  }
}

/**
 * Journal data for «prev_page» on this page load, or null (no record, the record is this page's
 * own, or it is too old to belong to the page that ran just before).
 */
export function hallPrevPageReport(
  prev: HallLastBreath | null,
  input: { pageId: string; now: number; maxAgeMs?: number },
): Record<string, string | number | boolean | null> | null {
  if (!prev || prev.id === input.pageId) return null;
  const age = input.now - prev.at;
  if (!(age >= 0) || age > (input.maxAgeMs ?? HALL_LAST_BREATH_MAX_AGE_MS)) return null;
  return {
    bye: prev.bye,
    ageS: Math.round(age / 1000),
    st: prev.st,
    pos: prev.pos,
    up: prev.up,
    n: prev.n,
    trackAgeS: prev.trackAgeS,
    bufN: prev.bufN,
    bufMb: prev.bufMb,
    dl: prev.dl,
    vis: prev.vis,
    build: prev.build,
    usageMb: prev.usageMb,
    cacheN: prev.cacheN,
  };
}

/**
 * Writes the record at most every HALL_LAST_BREATH_MS (force: now, e.g. on a track change or the
 * goodbye). The snapshot is read only when a write happens.
 */
export class HallLastBreathWriter {
  private lastWrite = -Infinity;
  private bye = false;

  constructor(
    private readonly storage: WriteStorage,
    private readonly id: string,
    private readonly snapshot: () => Omit<HallLastBreath, "id" | "at" | "bye">,
    private readonly now: () => number = () => Date.now(),
  ) {}

  tick(force = false): void {
    const now = this.now();
    if (!force && now - this.lastWrite < HALL_LAST_BREATH_MS) return;
    this.lastWrite = now;
    let snap: Omit<HallLastBreath, "id" | "at" | "bye">;
    try {
      snap = this.snapshot();
    } catch {
      return;
    }
    writeHallLastBreath(this.storage, { ...snap, id: this.id, at: now, bye: this.bye });
  }

  /** Normal unload (pagehide, not persisted): the next page knows this one was not killed. */
  goodbye(): void {
    this.bye = true;
    this.tick(true);
  }

  /** Back from the back/forward cache: alive again. */
  alive(): void {
    this.bye = false;
    this.tick(true);
  }
}
