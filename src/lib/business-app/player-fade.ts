/**
 * Business player fade (Sergey 2026-11-03): music never starts or stops abruptly.
 *
 * Play / resume / a started track rises from silence to the chosen volume over
 * PLAYER_FADE_MS. Pause keeps sounding for PLAYER_FADE_MS while it fades to silence,
 * then the element really pauses and the chosen volume is restored for the next play.
 *
 * The fade is applied through HTMLMediaElement.volume (volume = chosen × curve(level)).
 * No Web Audio: routing the element through an AudioContext (createMediaElementSource)
 * makes iOS Safari silence the music when the screen locks or the tab goes to the
 * background, and the venue device must never stop. Where `volume` is read-only
 * (iOS / iPadOS Safari, every iOS browser) the fade is skipped and play / pause act at
 * once, exactly as before; the system volume buttons set the loudness there.
 *
 * Rapid toggles reverse the ramp from the current level: no jump, no stuck silence.
 * Ticks are wall-clock based (setInterval, not requestAnimationFrame), so a fade-out
 * in a background tab still completes and pauses even when timers are throttled.
 */

/** One constant for fade-in and fade-out (ms). */
export const PLAYER_FADE_MS = 2000;
/** Ramp step. Background tabs may tick less often; the ramp is time based. */
export const PLAYER_FADE_TICK_MS = 40;

export type FadeMedia = {
  src: string;
  currentTime: number;
  volume: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: "src"): void;
  load(): void;
};

export type FadeOptions = {
  fadeMs?: number;
  tickMs?: number;
  /** Null: detect (writable `volume`). */
  enabled?: boolean | null;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (t: unknown) => void;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/** Level 0–1 to a gain. Squared: closer to an even loudness change than a straight line. */
export function playerFadeGain(level: number): number {
  const l = clamp01(level);
  return l * l;
}

/**
 * True when assigning `volume` sticks. iOS ignores the assignment (always 1), so a fade
 * there would be a no-op; we fall back to instant play / pause.
 */
export function mediaVolumeWritable(media: Pick<FadeMedia, "volume">): boolean {
  try {
    const before = media.volume;
    const probe = before > 0.5 ? 0.25 : 0.75;
    media.volume = probe;
    const ok = Math.abs(media.volume - probe) < 0.01;
    media.volume = before;
    return ok;
  } catch {
    return false;
  }
}

/**
 * Wraps the player's single <audio>. Implements the controller's audio surface:
 * `play()` fades in, `pause()` is a hard stop (track switch, rights deadline, revoke),
 * `fadeOut()` is the soft user pause.
 */
export class FadingAudio {
  readonly enabled: boolean;
  private readonly fadeMs: number;
  private readonly tickMs: number;
  private readonly nowFn: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (t: unknown) => void;
  /** Chosen volume 0–1 (the «Громкость» setting). */
  private target = 1;
  /** Fade position 0–1. */
  private level = 1;
  /** +1 fading in, -1 fading out, 0 still. */
  private dir: -1 | 0 | 1 = 0;
  private last = 0;
  private timer: unknown = null;
  /** Bumped by every play / pause / fadeOut: a play() resolving late must not ramp up. */
  private gen = 0;
  private waiters: ((done: boolean) => void)[] = [];

  constructor(
    private readonly media: FadeMedia,
    options: FadeOptions = {},
  ) {
    this.fadeMs = Math.max(1, options.fadeMs ?? PLAYER_FADE_MS);
    this.tickMs = Math.max(1, options.tickMs ?? PLAYER_FADE_TICK_MS);
    this.nowFn = options.now ?? (() => Date.now());
    this.setTimer = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearTimer = options.clearInterval ?? ((t) => clearInterval(t as ReturnType<typeof setInterval>));
    this.enabled = options.enabled ?? mediaVolumeWritable(media);
    try {
      this.target = clamp01(media.volume);
    } catch {
      this.target = 1;
    }
  }

  get src(): string {
    return this.media.src;
  }
  set src(value: string) {
    this.media.src = value;
  }
  get currentTime(): number {
    return this.media.currentTime;
  }
  set currentTime(value: number) {
    this.media.currentTime = value;
  }
  get paused(): boolean {
    return this.media.paused;
  }
  /** Fading out: the user already pressed pause, the music is still audible. */
  get fadingOut(): boolean {
    return this.dir < 0;
  }
  /** Current fade position 0–1 (tests, diagnostics). */
  get fadeLevel(): number {
    return this.level;
  }
  /** Chosen volume 0–1. */
  get volume(): number {
    return this.target;
  }

  removeAttribute(name: "src"): void {
    this.media.removeAttribute(name);
  }
  load(): void {
    this.media.load();
  }

  /** «Громкость» / «Тише» / «Громче»: change the chosen volume; a running fade keeps its curve. */
  setVolume(value: number): void {
    this.target = clamp01(value);
    this.apply();
  }

  private apply(): void {
    const value = this.enabled ? this.target * playerFadeGain(this.level) : this.target;
    try {
      this.media.volume = clamp01(value);
    } catch {
      /* read-only volume (iOS): nothing to do */
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  private settle(done: boolean): void {
    const list = this.waiters;
    this.waiters = [];
    for (const fn of list) fn(done);
  }

  private ramp(dir: -1 | 1): void {
    this.dir = dir;
    this.last = this.nowFn();
    if (this.timer === null) this.timer = this.setTimer(() => this.tick(), this.tickMs);
  }

  /** Advance the ramp to `now`. Public for tests; the interval calls it. */
  tick(): void {
    if (this.dir === 0) {
      this.stopTimer();
      return;
    }
    const now = this.nowFn();
    const step = Math.max(0, now - this.last) / this.fadeMs;
    this.last = now;
    if (this.dir > 0) {
      this.level = Math.min(1, this.level + step);
      this.apply();
      if (this.level >= 1) {
        this.dir = 0;
        this.stopTimer();
      }
      return;
    }
    this.level = Math.max(0, this.level - step);
    // Paused or ended meanwhile (e.g. the track ran out inside the fade): finish now.
    if (this.level <= 0 || this.media.paused) {
      this.finishFadeOut();
      return;
    }
    this.apply();
  }

  private finishFadeOut(): void {
    this.dir = 0;
    this.stopTimer();
    this.media.pause();
    this.level = 1;
    this.apply();
    this.settle(true);
  }

  /**
   * Start or resume with a fade-in. Paused element: rises from silence. Still audible
   * (pause pressed during the fade-out): rises from where it is, no restart.
   */
  async play(): Promise<void> {
    const gen = ++this.gen;
    this.settle(false);
    if (!this.enabled) {
      this.dir = 0;
      this.stopTimer();
      this.level = 1;
      this.apply();
      return this.media.play();
    }
    this.dir = 0;
    this.stopTimer();
    if (this.media.paused) this.level = 0;
    this.apply();
    try {
      await this.media.play();
    } catch (error) {
      if (gen === this.gen) {
        // Never leave the element silent after a refused play (autoplay, network).
        this.level = 1;
        this.apply();
      }
      throw error;
    }
    if (gen !== this.gen) return;
    if (this.level < 1) this.ramp(1);
  }

  /** Start at the chosen volume at once (natural advance to the next track). */
  async playInstant(): Promise<void> {
    ++this.gen;
    this.settle(false);
    this.dir = 0;
    this.stopTimer();
    this.level = 1;
    this.apply();
    return this.media.play();
  }

  /** Hard stop now (track switch, rights deadline, revoke). Restores the chosen volume. */
  pause(): void {
    ++this.gen;
    this.dir = 0;
    this.stopTimer();
    this.media.pause();
    this.level = 1;
    this.apply();
    this.settle(false);
  }

  /**
   * Soft pause: keeps sounding while it fades to silence, then pauses. Resolves true when
   * the fade finished and the element paused, false when a play() or a hard pause took
   * over first. Already paused or fade unavailable (iOS): pauses at once.
   */
  fadeOut(): Promise<boolean> {
    if (!this.enabled || this.media.paused) {
      this.pause();
      return Promise.resolve(true);
    }
    ++this.gen;
    const done = new Promise<boolean>((resolve) => this.waiters.push(resolve));
    this.ramp(-1);
    return done;
  }

  dispose(): void {
    ++this.gen;
    this.stopTimer();
    this.dir = 0;
    this.level = 1;
    this.apply();
    this.settle(false);
  }
}
