/**
 * t1365u / t1366u–t1368u (Sergey 11.11.2026): the hall music has to play all day on its own, the
 * owner must never have to think about it – no messages, no «press in the hall».
 *
 * 11.11 09:42 MSK the hall iPhone (screen on) went quiet at a track change: the page was opened
 * again from scratch (track-url cut off, a fresh GET /music and a new JS session ~3 s later) and
 * the fresh page only restored the place in the queue – it never even tried to play. The build
 * reload (#1200 / #1212) is blocked while music is meant to play, so the most likely author of that
 * reload is the browser itself (Safari re-opens a visible tab whose web process died).
 *
 * This module is the memory of «the hall was playing» that survives such a reload:
 * - while the hall plays, a small localStorage marker `{ scope, at }` is refreshed (throttled);
 * - a deliberate pause (tap in the hall, closed bar, owner's pause), no access or another hall
 *   clears it – such a hall stays silent after any reload, exactly as before;
 * - a fresh page of the same hall that finds a recent marker starts the music by itself
 *   (`shouldAutoResumeHall`), and the build reload never fires while a marker exists
 *   (`hallMeantToPlay`), whatever the controller status says.
 *
 * Nothing here talks to the owner or shows anything. Where the browser refuses a start without a
 * tap (iOS Safari after a full reload), the controller keeps the loaded track and retries on the
 * next foreground / first touch – the hall never ends up in a dead state on purpose.
 */

/** localStorage key (per browser): the hall music was meant to play at `at`. */
export const HALL_PLAYING_MARKER_KEY = "audiolad.hall.playing";
/** The marker is refreshed at most this often while the hall plays. */
export const HALL_PLAYING_MARKER_REFRESH_MS = 5_000;
/**
 * A page opened later than this after the last sounding moment does not start by itself (the
 * phone was put away, the tab closed for the night): only a crash-like reload resumes.
 */
export const HALL_AUTO_RESUME_MAX_AGE_MS = 15 * 60_000;

export type HallPlayingMarker = { scope: string; at: number };

type ReadStorage = Pick<Storage, "getItem"> | null | undefined;
type WriteStorage = Pick<Storage, "setItem" | "removeItem"> | null | undefined;

export function readHallPlayingMarker(storage: ReadStorage): HallPlayingMarker | null {
  try {
    const raw = storage?.getItem(HALL_PLAYING_MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scope?: unknown; at?: unknown };
    if (typeof parsed.scope !== "string" || parsed.scope.length === 0) return null;
    const at = Number(parsed.at);
    if (!Number.isFinite(at) || at <= 0) return null;
    return { scope: parsed.scope, at };
  } catch {
    return null;
  }
}

export function writeHallPlayingMarker(storage: WriteStorage, scope: string, at: number): void {
  if (!scope) return;
  try {
    storage?.setItem(HALL_PLAYING_MARKER_KEY, JSON.stringify({ scope, at }));
  } catch {
    /* private mode / quota: the hall simply does not auto-resume */
  }
}

export function clearHallPlayingMarker(storage: WriteStorage): void {
  try {
    storage?.removeItem(HALL_PLAYING_MARKER_KEY);
  } catch {
    /* private mode */
  }
}

/** A fresh page of this hall should start the music by itself. */
export function shouldAutoResumeHall(input: {
  marker: HallPlayingMarker | null;
  scope: string | null;
  now: number;
  maxAgeMs?: number;
}): boolean {
  const { marker, scope, now } = input;
  if (!marker || !scope || marker.scope !== scope) return false;
  const age = now - marker.at;
  // A clock moved backwards a little still counts as «just now».
  if (age < -60_000) return false;
  return age <= (input.maxAgeMs ?? HALL_AUTO_RESUME_MAX_AGE_MS);
}

/**
 * The hall was playing and nobody paused it on purpose (any age): a build reload must not fire,
 * even when the controller reports "paused" / "idle" for a reason nobody chose.
 */
export function hallMeantToPlay(marker: HallPlayingMarker | null, scope: string | null): boolean {
  return !!marker && !!scope && marker.scope === scope;
}

/**
 * Keeps the marker in step with the controller: refreshed (throttled) while playing, cleared on a
 * deliberate pause / stop / no access. Every other status (loading, recovery, error, an autoplay
 * refusal, an unexplained pause) leaves it as it is – the hall still means to play.
 */
export class HallPlayingMarkerWriter {
  private lastWrite = 0;

  constructor(
    private readonly storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  /** `status`: controller status; `deliberatePause`: the hall / owner chose silence. */
  observe(scope: string | null, status: string, deliberatePause: boolean): void {
    if (!scope) return;
    if (status === "no_access" || (deliberatePause && status !== "playing")) {
      this.clear();
      return;
    }
    if (status !== "playing") return;
    const now = this.now();
    if (now - this.lastWrite < HALL_PLAYING_MARKER_REFRESH_MS) return;
    this.lastWrite = now;
    writeHallPlayingMarker(this.storage, scope, now);
  }

  clear(): void {
    this.lastWrite = 0;
    clearHallPlayingMarker(this.storage);
  }
}

/**
 * Elements whose own click handler already starts / pauses the music: the first-touch resume
 * leaves them alone, so one tap is never a resume and a pause at once.
 */
export const HALL_TOUCH_RESUME_SKIP_SELECTOR = "button, a, input, select, textarea, [role='button'], [role='slider']";
