/**
 * Business player fade (Sergey 2026-11-03): music never starts or stops abruptly.
 *
 * Play / resume / a started track rises from silence to the chosen volume over
 * PLAYER_FADE_MS. Pause keeps sounding for PLAYER_FADE_MS while it fades to silence,
 * then the element really pauses and the chosen volume is restored for the next play.
 *
 * Manual skips fade out over PLAYER_SKIP_FADE_OUT_MS and hold silence through source
 * replacement: pausing / clearing a source at full gain truncates the waveform (click).
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
 *
 * Hall device (Sergey 2026-11-08): a venue device usually runs with the screen off or the
 * tab hidden. There Chrome throttles timers to once a second and, once the page has been
 * silent for a while, to once a MINUTE – and a fade-in starts at volume 0, so the page
 * counts as silent. One late tick then jumps the whole ramp: «Продолжить в зале» stayed
 * silent for about a minute and then started at full volume, pause / next sounded like a
 * cut. The player therefore also calls `nudge()` on the element's own `timeupdate`
 * (media events are not timer-throttled, ~4 per second while it plays), so the ramp
 * advances smoothly in a hidden tab too.
 */

/** Normal fade-in and soft pause fade-out (ms). */
export const PLAYER_FADE_MS = 2000;
/** Manual switch fade-out from full level (ms). */
export const PLAYER_SKIP_FADE_OUT_MS = 1000;
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
 * `play()` fades in, `pause()` is a hard stop (rights deadline, revoke),
 * `fadeOut()` is the soft user pause; `fadeOutForSwitch()` holds silence for a new source.
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
  private outMs: number;
  private silentHeld = false;
  private timer: unknown = null;
  /** Bumped by every play / pause / fade: a play() resolving late must not ramp up. */
  private gen = 0;
  private waiters: ((done: boolean) => void)[] = [];

  constructor(
    private readonly media: FadeMedia,
    options: FadeOptions = {},
  ) {
    this.fadeMs = Math.max(1, options.fadeMs ?? PLAYER_FADE_MS);
    this.outMs = this.fadeMs;
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

  /** Ramping now (fade-in or fade-out in progress). */
  get ramping(): boolean {
    return this.dir !== 0;
  }

  /**
   * Media `timeupdate` / `playing`: advance a running ramp. Timers in a hidden tab may be
   * throttled to one wake-up per minute; media events keep the fade smooth there.
   */
  nudge(): void {
    if (this.dir !== 0) this.tick();
  }

  /** Advance the ramp to `now`. Public for tests; the interval calls it. */
  tick(): void {
    if (this.dir === 0) {
      this.stopTimer();
      return;
    }
    const now = this.nowFn();
    const step = Math.max(0, now - this.last) / (this.dir < 0 ? this.outMs : this.fadeMs);
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
    this.level = 0;
    this.apply();
    this.media.pause();
    if (!this.silentHeld) {
      this.level = 1;
      this.apply();
    }
    this.settle(true);
  }

  /**
   * Start or resume with a fade-in. Paused element: rises from silence. Still audible
   * (pause pressed during the fade-out): rises from where it is, no restart.
   */
  async play(): Promise<void> {
    const gen = ++this.gen;
    this.silentHeld = false;
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
    this.silentHeld = false;
    ++this.gen;
    this.settle(false);
    this.dir = 0;
    this.stopTimer();
    this.level = 1;
    this.apply();
    return this.media.play();
  }

  /** Hard stop now (rights deadline, revoke). A switch hold stays silent until play / dispose. */
  pause(): void {
    ++this.gen;
    this.dir = 0;
    this.stopTimer();
    this.media.pause();
    this.level = this.silentHeld ? 0 : 1;
    this.apply();
    this.settle(false);
  }

  /**
   * Soft pause: keeps sounding while it fades to silence, then pauses. Resolves true when
   * the fade finished and the element paused, false when a play() or a hard pause took
   * over first. Already paused or fade unavailable (iOS): pauses at once.
   */
  fadeOut(): Promise<boolean> {
    // Pause pressed during a skip fade-out: the switch is cancelled (its waiter gets
    // false), the same ramp continues down from the current level.
    if (this.silentHeld) this.settle(false);
    this.silentHeld = false;
    this.outMs = this.fadeMs;
    if (!this.enabled || this.media.paused) {
      this.pause();
      return Promise.resolve(true);
    }
    ++this.gen;
    const done = new Promise<boolean>((resolve) => this.waiters.push(resolve));
    this.ramp(-1);
    return done;
  }

  /** Fade the old source to zero and keep it silent through pause / load / replacement.
   * A repeated switch supersedes its waiter but continues the same ramp from here.
   */
  fadeOutForSwitch(): Promise<boolean> {
    ++this.gen;
    this.settle(false);
    if (!this.enabled || this.media.paused) return Promise.resolve(true);
    this.silentHeld = true;
    this.outMs = PLAYER_SKIP_FADE_OUT_MS;
    const done = new Promise<boolean>((resolve) => this.waiters.push(resolve));
    // Keep the tick origin on repeated skips so rapid presses cannot prolong the fade.
    if (this.dir !== -1) this.ramp(-1);
    return done;
  }

  dispose(): void {
    this.silentHeld = false;
    ++this.gen;
    this.stopTimer();
    this.dir = 0;
    this.level = 1;
    this.apply();
    this.settle(false);
  }
}
