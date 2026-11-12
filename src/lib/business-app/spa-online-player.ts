/**
 * Business SPA pilot (0e05333f), stage 1 – ONLINE player (Sergey 2026-10-13 19:16 MSK).
 *
 * Manual switches fade the old source out before pause / load / replacement: cutting
 * an audible waveform there causes a click. Natural advance still starts instantly.
 *
 * Plays the current ELIGIBLE manifest track by track from short-lived signed URLs. The hall
 * device may add a short technical buffer (t1331u, hall-offline-buffer.ts, optional
 * `localSource`): copies of the next tracks, usable for at most 2 hours and never past the
 * access end; a start from a copy is re-checked by the server in the background like a
 * pre-signed one. Without it nothing is stored on the device. The multi-day offline engine
 * (spa-player-engine.ts) stays in the repo with its tests and is not used here.
 *
 * Network recovery (P0-3): transient failures (sign network errors, <audio> errors, a stall
 * that does not recover) never end in a dead state while the hall is meant to play. The
 * player retries with backoff (1, 2, 4 … 30 s, ±25 % jitter), retries at once on `online` /
 * visible, and resumes the same track at its last position when the outage was shorter than
 * RECOVERY_RESUME_WINDOW_MS (otherwise it moves on to the next track). The next track's
 * signed URL is requested shortly before the boundary and used only while fresh. A browser
 * autoplay refusal is NOT retried: `needsGesture` asks the UI for one «Включить музыку» tap.
 */

import type { SpaManifestItem } from "./spa-manifest";

export type OnlineAudio = {
  src: string;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: "src"): void;
  load(): void;
  /**
   * Soft user pause (player-fade.ts): keeps sounding while it fades out, then pauses.
   * Omitted: `pause()` at once. `pause()` itself always stops at once (rights deadline,
   * revoke); manual switches use the separate fade below.
   */
  fadeOut?(): Promise<boolean>;
  /** Manual switch: fade to zero, pause, and hold silence through source replacement. */
  fadeOutForSwitch?(): Promise<boolean>;
  /** Start at full chosen volume, no fade-in (natural advance after a track ended). */
  playInstant?(): Promise<void>;
};

export type OnlineSignResult = { ok: true; data: { url: string } } | { ok: false; reason: string };

export type OnlineStatus = "idle" | "loading" | "playing" | "paused" | "no_access" | "error";

export type OnlineDeps = {
  audio: OnlineAudio;
  sign(audioItemId: string): Promise<OnlineSignResult>;
  onChange(): void;
  /**
   * Catalog index to play after `current`. Omitted: the next row, then the first.
   * Used by the cafe queue so the manifest order can stay the catalog order.
   */
  nextIndex?(current: number, length: number): number;
  /** Catalog index to play before `current`. Omitted: the previous row, then the last. */
  previousIndex?(current: number, length: number): number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  /** Jitter source for retry backoff (tests). Default Math.random. */
  random?: () => number;
  /** Browser connectivity hint (tests). Default navigator.onLine, true when unknown. */
  isOnline?: () => boolean;
  /**
   * t1303u (Sergey 09.11.2026): true while the page is hidden on a browser that cannot be
   * trusted to start the next track after the element has ended (iPhone / iPad with the
   * screen locked). Then the next track is handed over shortly before the end, while the
   * element still plays, and the boundary never waits for the network. Omitted: false.
   */
  backgroundAdvance?: () => boolean;
  /**
   * t1314u (Sergey 09.11.2026, iPhone home-screen app): true while the element has `loop` on, so
   * a track never reaches its natural end. In an iOS home-screen web app the audio session is
   * closed by a natural end and cannot be reopened while the screen is locked (WebKit bug
   * 261858): every switch has to happen while the element still plays. Then the next track is
   * handed over before the end (any visibility) and, as the safety net, on the loop's jump back
   * to the start (`onSeeking` / `onProgress`). Omitted: false ("ended" moves on as before).
   */
  loopAdvance?: () => boolean;
  /**
   * t1331u (hall offline buffer, hall-offline-buffer.ts): blob: URL of a device copy of this track
   * that may still sound for `durationSec`, or null. A copy is preferred over the network at every
   * start (and counts as a ready next track for the early / loop handoff); a start from a copy is
   * re-checked by the server in the background like a pre-signed one. Omitted: streaming only.
   */
  localSource?: (audioItemId: string, durationSec: number | null) => string | null;
  /** The element now sounds this track (`local`: from the device copy). */
  onSource?: (audioItemId: string | null, local: boolean) => void;
  /**
   * t1365u (hall iPhone, 11.11.2026): true where a fresh pre-signed stream should win over the
   * device copy at a normal start, so the element does not load a whole blob: track into the web
   * page's memory at every boundary. The copy still wins when there is no fresh pre-sign (locked
   * screen: never wait for the network), while reconnecting, and when signing fails (offline).
   * Omitted: false (copy first, as before).
   */
  streamFirst?: () => boolean;
  /**
   * t1390u (hall iPhone, 12.11.2026): seconds of the current track to play before the next one is
   * pre-signed (0 / omitted: at once, as before). At a boundary only the access re-check of the
   * started track goes out; the next link follows later, never in parallel with it. A locked
   * screen (`backgroundAdvance`) and a loop wrap waiting for a link still sign at once.
   */
  presignDelaySec?: () => number;
  /**
   * t1390u: lazy device copies (hall iPhone) – ask the buffer to load the copy of this track into
   * memory now, because a reconnect is about to need it. Omitted: copies are already warm.
   */
  prepareLocal?: (audioItemId: string) => void;
  /**
   * t1390u: the real element (not the fader): paused / ended. Enables the self-resume after a
   * pause nobody asked for and the 10 s «position does not move» watchdog. Omitted: both off.
   */
  element?: () => { paused: boolean; ended: boolean; currentTime: number };
  /** t1390u: device journal hook (hall-device-journal.ts). Best effort, never throws into the player. */
  onEvent?: (kind: string, data?: Record<string, string | number | boolean | null>) => void;
};

export const RECOVERY_BASE_MS = 1_000;
export const RECOVERY_MAX_MS = 30_000;
/** "waiting"/"stalled" without progress for this long is treated as a failure. */
export const RECOVERY_STALL_MS = 10_000;
/** Outage shorter than this: resume the same track at its position; longer: next track. */
export const RECOVERY_RESUME_WINDOW_MS = 3 * 60_000;
/**
 * Legacy lead (s). The next track is now pre-signed as soon as the current one plays
 * (t1285u: a locked iPhone may suspend JS, so a sign in the last 45 s may never run). A
 * pre-signed start is re-checked by the server in the background (stops on no_access).
 */
export const PRESIGN_LEAD_SEC = 45;
/** Pre-signed URLs are used only while younger than this (server TTL is 1 hour). */
export const PRESIGN_MAX_AGE_MS = 30 * 60_000;
/** A pre-signed URL older than this is signed again while the current track plays. */
export const PRESIGN_REFRESH_AGE_MS = 20 * 60_000;
/** After a failed pre-sign, try again no sooner than this (progress events come ~4/s). */
export const PRESIGN_RETRY_MS = 10_000;
/**
 * Locked iPhone (t1303u): the next track takes over this many seconds before the current one
 * ends, while the element is still playing (no silent gap after "ended" in which iOS may
 * refuse to start a new source). Only with `backgroundAdvance()` and a ready pre-sign.
 */
export const EARLY_HANDOFF_SEC = 0.75;
/** No early handoff before this much of a track has played (bogus early durations). */
export const EARLY_HANDOFF_MIN_PLAYED_SEC = 5;
/** Element duration further than this from the catalog length: no early handoff ("ended" only). */
export const EARLY_HANDOFF_DURATION_TOLERANCE_SEC = 2;
/** Audio errors on one track while the browser is online before the track is skipped. */
export const RECOVERY_SKIP_AFTER_ERRORS = 4;
/** Loop wrap: the element was at least this far into the track before the jump back. */
export const LOOP_WRAP_FROM_MIN_SEC = 3;
/**
 * Loop wrap: the jump lands before this position. Generous: the first timeupdate after the wrap
 * may come late in the background (manual seeks are excluded by noteManualSeek, not by this).
 */
export const LOOP_WRAP_TO_MAX_SEC = 5;
/**
 * Loop wrap: the jump starts no earlier than this before the end. The end is the SHORTER of the
 * element and catalog lengths (a VBR MP3 may report a duration far longer than the audio); without
 * a catalog length there is no end check at all – one track repeating forever is worse.
 */
export const LOOP_WRAP_END_SLACK_SEC = 5;
/** A seek made by the user / the player itself is never taken for a loop wrap for this long. */
export const LOOP_MANUAL_SEEK_GUARD_MS = 1_500;
export const RECONNECTING_MESSAGE = "Связь восстанавливается…";
/** A stream that stalls while a device copy of the same track exists: switch to the copy this soon. */
export const LOCAL_STALL_MS = 3_000;
/**
 * t1390u: the element paused by itself while the hall plays (iOS audio interruption, a route
 * change, a browser hiccup): play() on the same element again after this, doubling up to
 * SELF_RESUME_MAX_MS. Never a message, never a button.
 */
export const SELF_RESUME_BASE_MS = 750;
export const SELF_RESUME_MAX_MS = 30_000;
/** t1390u watchdog: status "playing" but the position has not moved for this long. */
export const WATCHDOG_STUCK_MS = 10_000;
/** Healthy play this long after a self-resume resets its backoff. */
const SELF_RESUME_HEALTHY_SEC = 5;

/** Browser autoplay policy refusal: only a user gesture helps, retries would loop. */
export function isAutoplayRefusal(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown };
  return e.name === "NotAllowedError" || (typeof e.message === "string" && /NotAllowedError/.test(e.message));
}

/** Sign errors after which the track is skipped (removed / expired), not retried. */
const SKIP_REASONS = new Set(["not_in_manifest", "expired", "invalid_request"]);
/** Sign failures worth a reconnect: no answer, or a storage hiccup on the server. */
const TRANSIENT_SIGN_REASONS = new Set(["network", "sign_failed"]);
/** Healthy playback this long since the last (re)start forgives earlier errors on the track. */
const RECOVERY_HEALTHY_SEC = 30;

export class SpaOnlinePlayer {
  items: SpaManifestItem[];
  index = -1;
  status: OnlineStatus = "idle";
  message: string | null = null;
  /** Bumped on every user/automatic transition; stale async results are ignored. */
  private op = 0;
  private failures = 0;
  /** Mid-stream error retries of the current track; reset only when another track starts or a track ends. */
  private errorRetries = 0;
  private retryTrackId: string | null = null;
  private deadlineTimer: unknown = null;
  private disposed = false;
  /** Source still sounding, which may differ from the immediately selected UI row. */
  private soundingId: string | null = null;
  private switching = false;
  /**
   * The loaded source is on its way out (manual switch fade, kept through a pause pressed
   * meanwhile) and must never be resumed – even when the chosen track is the same one.
   */
  private leaving = false;
  /** Track under the soft-fade rights guard (armFadeGuard); null when none is armed. */
  private fadeGuardId: string | null = null;
  /** Keep the interrupted selection/intent until access is explicitly verified again. */
  private deniedPlayback: { audioItemId: string | null; resume: boolean } | null = null;
  /** Autoplay refused: the UI shows «Включить музыку»; a tap calls toggle() in the gesture. */
  /** t1390u: access re-checks in flight (a delayed next link waits for them). */
  private verifying = 0;
  needsGesture = false;
  private retryTimer: unknown = null;
  private retryAttempt = 0;
  /** Where to continue after a transient failure (same track, position, outage start). */
  private resumePoint: { audioItemId: string; positionSec: number; since: number } | null = null;
  private stallTimer: unknown = null;
  private stallAt = 0;
  private lastPosition = 0;
  /** Position where the current track last (re)started; errors are forgiven after healthy play. */
  private healthyFrom = 0;
  /** Next track whose pre-sign is in flight (null when none); a failure clears it for a retry. */
  private presigning: string | null = null;
  private presignRetryAt = 0;
  private presigned: { audioItemId: string; url: string; at: number } | null = null;
  /** `op` of the track already handed over early (one handoff per started track). */
  private handoffOp = -1;
  /** Loop mode: last position of the current source seen by onProgress (-1: none yet). */
  private loopFrom = -1;
  private manualSeekAt = -Infinity;
  /**
   * `op` whose loop wrapped while the next link was not ready: the old track keeps sounding (and
   * the UI keeps its title) until the link arrives, then the switch happens at once.
   */
  private wrapPendingOp = -1;
  /** Autoplay refusal happened while the page was hidden: retried once when it is visible. */
  private refusedHidden = false;
  /** The loaded source is a device copy (hall offline buffer), not the network stream. */
  private sourceLocal = false;
  /** t1390u: self-resume after a pause nobody asked for (same element, backoff). */
  private resumeTimer: unknown = null;
  private resumeAttempt = 0;
  private resumeFrom = -1;
  /** t1390u watchdog: last position seen and since when it has not moved. */
  private wdPos = Number.NaN;
  private wdSince = 0;
  private wdStrikes = 0;

  constructor(
    private readonly d: OnlineDeps,
    items: SpaManifestItem[],
  ) {
    this.items = items;
  }

  get current(): SpaManifestItem | null {
    return this.index >= 0 ? (this.items[this.index] ?? null) : null;
  }

  /**
   * Skip fade-out: the element still sounds the previous track while `current` already is
   * the chosen one. Its time updates belong to the previous track (no evidence / position).
   */
  get fadingOutPrevious(): boolean {
    return this.leaving && this.soundingId !== null;
  }

  /** Track the element is actually producing (the previous one during a skip fade-out). */
  get audibleItemId(): string | null {
    return this.fadingOutPrevious ? this.soundingId : (this.current?.audioItemId ?? null);
  }

  private set(status: OnlineStatus, message: string | null = null) {
    this.status = status;
    this.message = message;
    this.d.onChange();
  }

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  private timer(fn: () => void, ms: number): unknown {
    return (this.d.setTimer ?? ((f, t) => setTimeout(f, t)))(fn, ms);
  }

  private cancel(t: unknown) {
    (this.d.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(t);
  }

  private clearRetry() {
    if (this.retryTimer !== null) this.cancel(this.retryTimer);
    this.retryTimer = null;
    this.clearSelfResume();
  }

  private clearSelfResume() {
    if (this.resumeTimer !== null) this.cancel(this.resumeTimer);
    this.resumeTimer = null;
  }

  private emit(kind: string, data?: Record<string, string | number | boolean | null>) {
    try {
      this.d.onEvent?.(kind, data);
    } catch {
      /* telemetry never breaks playback */
    }
  }

  private elementState(): { paused: boolean; ended: boolean; currentTime: number } | null {
    try {
      return this.d.element?.() ?? null;
    } catch {
      return null;
    }
  }

  /**
   * t1390u: the element paused while the hall plays and nobody asked for it (a tap, the owner,
   * the lock screen and the rights stop all change the status first). Play the same element
   * again with backoff; never a message, never «press to continue».
   */
  onElementPause(): void {
    if (this.disposed || this.status !== "playing" || this.switching || this.leaving) return;
    const el = this.elementState();
    if (!el || !el.paused || el.ended || !this.d.audio.src) return;
    this.emit("unexpected_pause", { pos: Math.round(el.currentTime) });
    this.scheduleSelfResume("pause");
  }

  /** A self-resume is waiting (status stays "playing": the hall still means to play). */
  get selfResuming(): boolean {
    return this.resumeTimer !== null;
  }

  private scheduleSelfResume(reason: string): void {
    if (this.disposed || this.resumeTimer !== null) return;
    const n = this.resumeAttempt++;
    const delay = Math.min(SELF_RESUME_BASE_MS * 2 ** Math.min(n, 8), SELF_RESUME_MAX_MS);
    const op = this.op;
    this.resumeTimer = this.timer(() => {
      this.resumeTimer = null;
      void this.selfResumeNow(op, reason, n + 1);
    }, delay);
  }

  private async selfResumeNow(op: number, reason: string, attempt: number): Promise<void> {
    if (op !== this.op || this.disposed || this.status !== "playing") return;
    const el = this.elementState();
    if (el && !el.paused && !el.ended) return;
    if (el?.ended) {
      this.emit("self_resume_ended", { reason, attempt });
      return this.onEnded();
    }
    this.resumeFrom = Number.isFinite(this.lastPosition) ? this.lastPosition : 0;
    try {
      await this.d.audio.play();
      if (op !== this.op || this.disposed) return;
      this.emit("self_resume_ok", { reason, attempt });
    } catch (error) {
      if (op !== this.op || this.disposed || this.status !== "playing") return;
      const blocked = isAutoplayRefusal(error);
      this.emit("self_resume_failed", { reason, attempt, blocked });
      // A broken source (not a refusal) after a few tries: reconnect at the same position.
      if (!blocked && attempt >= 3) {
        this.resumeAttempt = 0;
        return this.recover();
      }
      this.scheduleSelfResume(reason);
    }
  }

  /**
   * t1390u watchdog, called every few seconds by the page: status "playing" but the position has
   * not moved for WATCHDOG_STUCK_MS. A paused element is played again (self-resume); an ended one
   * moves on; one that claims to play but does not move is reconnected at its position.
   */
  watchdog(): void {
    const el = this.elementState();
    if (!el || this.disposed || this.status !== "playing" || this.switching || this.leaving
      || this.retryTimer !== null || this.stallTimer !== null || this.resumeTimer !== null) {
      this.wdPos = Number.NaN;
      return;
    }
    const pos = el.currentTime;
    const now = this.now();
    if (!Number.isFinite(pos)) return;
    if (!Number.isFinite(this.wdPos) || Math.abs(pos - this.wdPos) > 0.05) {
      this.wdPos = pos;
      this.wdSince = now;
      this.wdStrikes = 0;
      return;
    }
    if (now - this.wdSince < WATCHDOG_STUCK_MS) return;
    this.wdSince = now;
    this.emit("watchdog_stuck", { pos: Math.round(pos), paused: el.paused, ended: el.ended, strike: this.wdStrikes + 1 });
    if (el.ended) {
      this.wdStrikes = 0;
      void this.onEnded();
      return;
    }
    if (el.paused) {
      this.scheduleSelfResume("stuck");
      return;
    }
    this.wdStrikes++;
    if (this.wdStrikes >= 2) {
      this.wdStrikes = 0;
      this.recover();
      return;
    }
    try {
      void this.d.audio.play().catch(() => {});
    } catch {
      /* the next check reconnects */
    }
  }

  private clearStall() {
    if (this.stallTimer !== null) this.cancel(this.stallTimer);
    this.stallTimer = null;
  }

  private online(): boolean {
    if (this.d.isOnline) return this.d.isOnline();
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  /** A reconnect is scheduled (status "loading" with the neutral reconnect line). */
  get recovering(): boolean {
    return this.retryTimer !== null;
  }

  /** restoreVerifiedAccess is between its interim "paused" and the automatic resume. */
  private restoringAccess = false;

  /**
   * t1346u: the hall is about to play on its own (access restored with a resume pending).
   * A "paused" status seen meanwhile is not a deliberate pause – never reload for a build.
   */
  get resumePending(): boolean {
    return this.restoringAccess;
  }

  private clearDeadline() {
    if (this.deadlineTimer !== null) (this.d.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>)))(this.deadlineTimer);
    this.deadlineTimer = null;
    this.fadeGuardId = null;
  }

  /** Track's playable_until has passed (rights window over). */
  private expired(item: SpaManifestItem | null): boolean {
    return !!item?.playableUntil && item.playableUntil.getTime() <= this.now();
  }

  /** Latest manifest entry for a track (windows can change while we await). */
  private fresh(id: string): SpaManifestItem | null {
    return this.items.find((i) => i.audioItemId === id) ?? null;
  }

  /**
   * Hard stop at playable_until: audio already buffered by the browser must not keep
   * sounding. Always reads the CURRENT manifest entry, so a window shortened during an
   * await is honoured.
   */
  private armDeadline(id: string, op: number) {
    this.clearDeadline();
    const item = this.fresh(id);
    if (!item) return void this.onDeadline(true);
    if (!item.playableUntil) return;
    const ms = Math.max(0, item.playableUntil.getTime() - this.now());
    const set = this.d.setTimer ?? ((fn, t) => setTimeout(fn, t));
    // setTimeout caps at ~24.8 days; re-arm in steps.
    this.deadlineTimer = set(() => {
      this.deadlineTimer = null;
      if (op !== this.op || this.disposed) return;
      const cur = this.fresh(id);
      if (cur && !this.expired(cur)) return this.armDeadline(id, op);
      void this.onDeadline(true);
    }, Math.min(ms, 2 ** 31 - 1));
  }

  /**
   * Soft pause keeps sounding for the fade-out: if playable_until passes meanwhile, stop
   * the audio at once (hard pause, no auto-advance – the user paused). Re-reads the
   * current manifest entry like armDeadline. A play / track switch bumps `op` and
   * clears the timer.
   */
  private armFadeGuard(id: string, op: number) {
    this.clearDeadline();
    this.fadeGuardId = id;
    const item = this.fresh(id);
    if (!item?.playableUntil) return;
    const ms = Math.max(0, item.playableUntil.getTime() - this.now());
    const set = this.d.setTimer ?? ((fn, t) => setTimeout(fn, t));
    this.deadlineTimer = set(() => {
      this.deadlineTimer = null;
      if (op !== this.op || this.disposed) return;
      const cur = this.fresh(id);
      if (cur && !this.expired(cur)) return this.armFadeGuard(id, op);
      this.fadeGuardId = null;
      this.d.audio.pause();
    }, Math.min(ms, 2 ** 31 - 1));
  }

  /** `resume`: continue with another track only if playback was active (never override a pause). */
  private async onDeadline(resume: boolean): Promise<void> {
    this.op++;
    this.stopAudio();
    const left = this.items.filter((i) => !this.expired(i));
    this.items = left;
    this.index = -1;
    if (left.length === 0 || !resume) return this.set(left.length === 0 ? "idle" : "paused");
    // Continue with the next still-allowed track (server re-checks on signing).
    return this.playIndex(0);
  }

  /** After play() resolved: re-read the window, stop if it ended meanwhile, else arm the stop. */
  private afterPlay(id: string, op: number): Promise<void> | void {
    const cur = this.fresh(id);
    if (!cur || this.expired(cur)) return this.onDeadline(true);
    this.needsGesture = false;
    this.retryAttempt = 0;
    const resume = this.resumePoint;
    this.resumePoint = null;
    if (resume?.audioItemId === id && resume.positionSec > 0.5 &&
      Math.abs(this.d.audio.currentTime - resume.positionSec) > 2) {
      this.noteManualSeek();
      try { this.d.audio.currentTime = resume.positionSec; } catch { /* not seekable yet */ }
    }
    this.healthyFrom = Number.isFinite(this.d.audio.currentTime) ? this.d.audio.currentTime : 0;
    this.armDeadline(id, op);
    this.set("playing");
    // Sign the next track now, while the page is awake: on a locked screen "ended" must be
    // able to switch the source without waiting for the network. t1390u: on the hall iPhone a
    // visible page signs it a little later (presignDelaySec), never together with the re-check.
    this.wdPos = Number.NaN;
    this.prefetchNext();
  }

  /**
   * Transient failure while the hall is meant to play: stop the broken source, remember the
   * position and retry with backoff. Never a dead "error" state; access is re-checked by the
   * server on every re-sign.
   */
  private recover(): void {
    if (this.disposed) return;
    const item = this.current;
    if (!item) {
      this.op++;
      this.stopAudio();
      return this.set("error", "Не удалось получить трек. Проверьте интернет и нажмите «Играть».");
    }
    if (this.resumePoint?.audioItemId !== item.audioItemId) {
      const sounding = this.soundingId === item.audioItemId ? this.d.audio.currentTime : 0;
      this.resumePoint = {
        audioItemId: item.audioItemId,
        positionSec: Math.max(Number.isFinite(sounding) ? sounding : 0, this.lastPosition),
        since: this.now(),
      };
    }
    // t1390u: lazy copies (hall iPhone) – load this track's copy now; the retry below finds it.
    try { this.d.prepareLocal?.(item.audioItemId); } catch { /* best effort */ }
    this.emit("recover", { attempt: this.retryAttempt + 1, local: this.sourceLocal });
    // The stream failed but this device holds a copy of the same track: continue from the copy at
    // the same position at once (no backoff). A failing copy itself waits like any other source.
    const copy = !this.sourceLocal && this.local(item) !== null;
    const op = ++this.op;
    this.stopAudio();
    const n = copy ? 0 : this.retryAttempt++;
    const base = Math.min(RECOVERY_BASE_MS * 2 ** Math.min(n, 10), RECOVERY_MAX_MS);
    const delay = copy ? 0 : Math.round(base * (0.75 + 0.5 * (this.d.random ?? Math.random)()));
    this.retryTimer = this.timer(() => {
      this.retryTimer = null;
      if (op !== this.op || this.disposed) return;
      void this.retryNow();
    }, delay);
    this.set("loading", RECONNECTING_MESSAGE);
  }

  /** Continue after an outage: same track at its position, or the next one after a long gap. */
  private retryNow(): Promise<void> {
    this.clearRetry();
    const resume = this.resumePoint;
    const i = resume ? this.items.findIndex((x) => x.audioItemId === resume.audioItemId) : -1;
    // Offline, this track has no device copy but the next one has: move on to it now instead of
    // waiting out the resume window in silence (t1331u).
    if (resume && i >= 0 && !this.online() && this.d.localSource && this.local(this.items[i]) === null) {
      this.index = i;
      const target = this.nextTarget();
      const next = target >= 0 ? this.items[target] : null;
      if (next && next.audioItemId !== resume.audioItemId && this.local(next) !== null) {
        this.resumePoint = null;
        return this.playIndex(target);
      }
    }
    if (resume && i >= 0 && this.now() - resume.since <= RECOVERY_RESUME_WINDOW_MS) {
      return this.playIndex(i);
    }
    this.resumePoint = null;
    if (this.items.length === 0) return Promise.resolve();
    if (i >= 0) this.index = i;
    return this.advance(false);
  }

  /** `online` / page visible again: retry a pending reconnect now (backoff reset). */
  onOnline(): Promise<void> {
    if (this.disposed || this.status === "no_access") return Promise.resolve();
    if (this.retryTimer !== null) {
      this.retryAttempt = 0;
      return this.retryNow();
    }
    if (this.status === "playing" && this.stallTimer !== null) {
      this.clearStall();
      this.retryAttempt = 0;
      this.recover();
      return this.retryNow();
    }
    return Promise.resolve();
  }

  /** <audio> "waiting"/"stalled" while playing: give it RECOVERY_STALL_MS to continue. */
  onWaiting(): void {
    if (this.disposed || this.status !== "playing" || this.stallTimer !== null) return;
    const op = this.op;
    this.stallAt = this.d.audio.currentTime;
    const cur = this.current;
    const copy = !this.sourceLocal && !!cur && this.local(cur) !== null;
    this.stallTimer = this.timer(() => {
      this.stallTimer = null;
      if (op !== this.op || this.disposed || this.status !== "playing") return;
      this.recover();
    }, copy ? LOCAL_STALL_MS : RECOVERY_STALL_MS);
  }

  /**
   * <audio> "timeupdate"/"playing": remembers the position, ends a stall watch when the
   * playhead moves, and keeps a fresh pre-signed URL for the next track.
   */
  onProgress(positionSec: number, durationSec: number): void {
    if (this.disposed || this.status !== "playing" || this.fadingOutPrevious) return;
    if (Number.isFinite(positionSec)) this.lastPosition = positionSec;
    if (this.errorRetries > 0 && positionSec - this.healthyFrom >= RECOVERY_HEALTHY_SEC) this.errorRetries = 0;
    if (this.stallTimer !== null && positionSec > this.stallAt + 0.25) this.clearStall();
    if (this.resumeAttempt > 0 && this.resumeTimer === null && positionSec - this.resumeFrom >= SELF_RESUME_HEALTHY_SEC) {
      this.resumeAttempt = 0;
    }
    if (this.loopWrap(positionSec, durationSec)) return;
    if (this.loopMode() && Number.isFinite(positionSec)) this.loopFrom = positionSec;
    this.prefetchNext();
    this.maybeHandoff(positionSec, durationSec);
  }

  /** <audio> "seeking": in loop mode the jump back to 0:00 at the end of a track. */
  onSeeking(positionSec: number, durationSec: number): void {
    if (this.disposed || this.status !== "playing" || this.fadingOutPrevious) return;
    this.loopWrap(positionSec, durationSec);
  }

  /** The user (progress bar) or the player moved the playhead: not a loop wrap. */
  noteManualSeek(): void {
    this.manualSeekAt = this.now();
    this.loopFrom = -1;
  }

  /**
   * Page visible again: an autoplay refusal that happened while it was hidden (locked iPhone)
   * is retried once without waiting for a tap. A refusal on a visible page still waits for one.
   */
  onForeground(): Promise<void> {
    if (this.disposed || !this.needsGesture || !this.refusedHidden || this.status !== "paused") return Promise.resolve();
    this.refusedHidden = false;
    return this.toggle();
  }

  private loopMode(): boolean {
    try {
      return this.d.loopAdvance?.() === true;
    } catch {
      return false;
    }
  }

  /**
   * Loop mode safety net: the element jumped from the end of the track back to its start (it
   * never "ends"). Move on to the next track now, while the element still plays: the iOS audio
   * session stays open. Without a ready link the old track keeps sounding until the sign answers.
   */
  private loopWrap(to: number, durationSec: number): boolean {
    if (!this.loopMode() || this.switching || this.leaving || this.handoffOp === this.op) return false;
    const from = this.loopFrom;
    if (!Number.isFinite(to) || from < LOOP_WRAP_FROM_MIN_SEC || to >= LOOP_WRAP_TO_MAX_SEC || from - to <= 2) return false;
    const cur = this.current;
    const end = this.wrapEnd(durationSec, cur?.durationSeconds);
    if (end !== null && from < end - LOOP_WRAP_END_SLACK_SEC) return false;
    if (this.now() - this.manualSeekAt < LOOP_MANUAL_SEEK_GUARD_MS) return false;
    const target = this.nextTarget();
    const next = target >= 0 ? this.items[target] : null;
    this.loopFrom = -1;
    // One-track program: the loop itself is the right thing to do.
    if (!cur || !next || next.audioItemId === cur.audioItemId) return true;
    this.handoffOp = this.op;
    this.retryTrackId = null;
    if (this.readyFor(next.audioItemId) || this.expired(next)) {
      void this.playIndex(target, true);
      return true;
    }
    // No ready link: keep the old track (and its title) sounding through the loop, sign the
    // next one now and switch the moment it arrives (prefetchNext).
    this.wrapPendingOp = this.op;
    this.presignRetryAt = 0;
    this.prefetchNext(true);
    return true;
  }

  /**
   * End used by the wrap check: the shorter of the element and catalog lengths. Without a catalog
   * length the element's own duration is not trusted (a VBR MP3 may over-report it by far): no end
   * check then, so a track can never repeat forever.
   */
  private wrapEnd(elementSec: number, catalogSec: number | null | undefined): number | null {
    if (typeof catalogSec !== "number" || !Number.isFinite(catalogSec) || catalogSec <= 0) return null;
    return Number.isFinite(elementSec) && elementSec > 0 ? Math.min(elementSec, catalogSec) : catalogSec;
  }

  /**
   * A loop wrap waited for the next link: it arrived (playIndex takes it, no network) or the sign
   * failed (playIndex signs again and handles no_access / skip / reconnect as at any boundary).
   */
  private settleWrapPending(): void {
    if (this.wrapPendingOp !== this.op || this.disposed || this.status !== "playing") return;
    this.wrapPendingOp = -1;
    if (!this.nextTargetId()) {
      // No distinct next track any more (queue shrank): the current one keeps looping and the
      // next wrap / handoff of this same track must be able to fire again.
      this.handoffOp = -1;
      return;
    }
    void this.playIndex(this.nextTarget(), true);
  }

  /**
   * Review F6: the queue or the manifest changed while a loop wrap waits for the next link.
   * No distinct next track: clear the wait (and the one-handoff mark) so the track is not stuck
   * looping once the queue grows again. A ready link: switch now. Otherwise sign the new next
   * track; its answer (or failure) settles the wait.
   */
  private recheckWrapPending(): void {
    if (this.wrapPendingOp !== this.op || this.disposed || this.status !== "playing") return;
    const id = this.nextTargetId();
    if (!id) {
      this.wrapPendingOp = -1;
      this.handoffOp = -1;
      return;
    }
    if (this.readyFor(id)) return this.settleWrapPending();
    this.presignRetryAt = 0;
    this.prefetchNext(true);
  }

  /**
   * The queue changed (sound / daypart rebuild, staff «Больше / Меньше», owner order): sign
   * the new next track at once instead of waiting for the next progress event.
   */
  queueChanged(): void {
    // A link signed for the old next track must never stand in for the new one (a track
    // removed by «Меньше такой музыки» would play, then the kept one would repeat).
    const p = this.presigned;
    if (p && p.audioItemId !== this.nextTargetId()) this.presigned = null;
    this.prefetchNext();
    this.recheckWrapPending();
  }

  /** Track the queue plays after the current one (null: none / same track). */
  private nextTargetId(): string | null {
    const target = this.nextTarget();
    const next = target >= 0 ? this.items[target] : null;
    if (!next || next.audioItemId === this.current?.audioItemId) return null;
    return next.audioItemId;
  }

  private inBackground(): boolean {
    try {
      return this.d.backgroundAdvance?.() === true;
    } catch {
      return false;
    }
  }

  /** Fresh pre-signed URL or a usable device copy for this track, without taking it. */
  private readyFor(id: string): boolean {
    const p = this.presigned;
    if (p && p.audioItemId === id && this.now() - p.at <= PRESIGN_MAX_AGE_MS) return true;
    const item = this.fresh(id);
    return !!item && this.local(item) !== null;
  }

  private streamFirst(): boolean {
    try {
      return this.d.streamFirst?.() === true;
    } catch {
      return false;
    }
  }

  /** Device copy of this track (hall offline buffer) that lasts the whole track, or null. */
  private local(item: SpaManifestItem): string | null {
    if (!this.d.localSource) return null;
    try {
      return this.d.localSource(item.audioItemId, item.durationSeconds ?? null);
    } catch {
      return null;
    }
  }

  /** Track the element plays from the device copy now (null: none / streaming). */
  get localItemId(): string | null {
    return this.sourceLocal ? this.soundingId : null;
  }

  /**
   * The device copy that sounds now may not sound any more (2 h age or access end, buffer sweep).
   * Stop it; the reconnect re-signs the stream at the same position (online) or waits (offline).
   */
  localExpired(audioItemId: string): void {
    if (this.disposed || !this.sourceLocal || this.soundingId !== audioItemId) return;
    if (this.status !== "playing" && this.status !== "loading") {
      this.op++;
      this.stopAudio();
      if (this.status === "paused") this.d.onChange();
      return;
    }
    this.recover();
  }

  /**
   * Locked iPhone (t1303u): switch to the pre-signed next track in the last EARLY_HANDOFF_SEC
   * of the current one, synchronously inside this media event, while the element still plays.
   * Nothing here waits for a timer or the network; "ended" stays the fallback.
   */
  private maybeHandoff(positionSec: number, durationSec: number): void {
    if (this.switching || this.leaving || this.handoffOp === this.op) return;
    if (!Number.isFinite(positionSec) || !Number.isFinite(durationSec) || durationSec <= 0) return;
    if (positionSec < EARLY_HANDOFF_MIN_PLAYED_SEC || durationSec - positionSec > EARLY_HANDOFF_SEC) return;
    if (!this.inBackground() && !this.loopMode()) return;
    const cur = this.current;
    // A misjudged element duration (VBR MP3 without a header) must not cut the track early:
    // where the catalog knows the length, the element has to agree with it.
    const known = cur?.durationSeconds;
    if (typeof known === "number" && Number.isFinite(known) && known > 0 &&
      Math.abs(known - durationSec) > EARLY_HANDOFF_DURATION_TOLERANCE_SEC) return;
    const target = this.nextTarget();
    const next = target >= 0 ? this.items[target] : null;
    if (!cur || !next || next.audioItemId === cur.audioItemId || !this.readyFor(next.audioItemId)) return;
    if (this.expired(next)) return;
    this.handoffOp = this.op;
    this.retryTrackId = null;
    void this.playIndex(target, true);
  }

  /**
   * Pre-sign the next track (once per next track, refreshed when the URL ages). A failed sign
   * is retried after PRESIGN_RETRY_MS; the boundary still signs on its own when none is ready.
   */
  private prefetchNext(force = false): void {
    if (this.disposed || this.status !== "playing") return;
    const cur = this.current;
    if (!cur) return;
    if (!force && !this.presignDue(cur)) return;
    const target = this.nextTarget();
    const next = target >= 0 ? this.items[target] : null;
    if (!next || next.audioItemId === cur.audioItemId) return;
    const id = next.audioItemId;
    const now = this.now();
    const ready = this.presigned;
    if (ready && ready.audioItemId === id && now - ready.at < PRESIGN_REFRESH_AGE_MS) return;
    if (this.presigning === id || now < this.presignRetryAt) return;
    this.presigning = id;
    const failed = () => {
      if (this.presigning === id) this.presigning = null;
      this.presignRetryAt = this.now() + PRESIGN_RETRY_MS;
      this.settleWrapPending();
    };
    let pending: Promise<OnlineSignResult>;
    try {
      pending = this.d.sign(id);
    } catch {
      failed();
      return;
    }
    void pending.then((r) => {
      if (this.disposed) return;
      if (!r.ok) return failed();
      if (this.presigning === id) this.presigning = null;
      this.presignRetryAt = 0;
      // The queue moved on while this was signing: keep the link of the current next track.
      if (id !== this.nextTargetId()) return this.recheckWrapPending();
      this.presigned = { audioItemId: id, url: r.data.url, at: this.now() };
      this.settleWrapPending();
    }, failed);
  }

  /**
   * t1390u: the next link is due once `presignDelaySec` of the track has played (or the end is
   * near), on a locked screen too: the boundary signs only the current track (verify). The early
   * handoff / loop wrap still find the link – it is signed 30 s in or PRESIGN_LEAD_SEC before the
   * end, and a loop wrap forces it.
   */
  private presignDue(cur: SpaManifestItem): boolean {
    let delay = 0;
    try {
      delay = Number(this.d.presignDelaySec?.() ?? 0);
    } catch {
      delay = 0;
    }
    if (!Number.isFinite(delay) || delay <= 0) return true;
    // Never next to the boundary's access re-check (review 2: tracks under 75 s signed at 0:00).
    if (this.verifying > 0) return false;
    const pos = Number.isFinite(this.lastPosition) ? this.lastPosition : 0;
    if (pos >= delay) return true;
    const length = cur.durationSeconds;
    return typeof length === "number" && Number.isFinite(length) && length > 0 && length - pos <= delay + PRESIGN_LEAD_SEC;
  }

  private takePresigned(id: string): { url: string; at: number } | null {
    const p = this.presigned;
    if (!p) return null;
    // A reconnect of the current track keeps the next track's pre-sign; used or stale: dropped.
    if (p.audioItemId !== id && this.now() - p.at <= PRESIGN_MAX_AGE_MS) return null;
    this.presigned = null;
    if (p.audioItemId !== id || this.now() - p.at > PRESIGN_MAX_AGE_MS) return null;
    return { url: p.url, at: p.at };
  }

  /**
   * A pre-signed URL started the track without a fresh access check: ask the server again in
   * the background (the music is already playing, nothing waits for the network) and stop at
   * once when it says the access is gone. Network trouble here changes nothing.
   */
  private verifyAccessAfterPresign(id: string, op: number): void {
    let pending: Promise<OnlineSignResult>;
    try {
      pending = this.d.sign(id);
    } catch {
      return;
    }
    // t1390u: while this re-check runs no other link is signed (one request at a time at the
    // boundary); a next link already due (short track) goes out right after it.
    this.verifying++;
    const settled = () => {
      this.verifying = Math.max(0, this.verifying - 1);
      if (op === this.op && !this.disposed) this.prefetchNext();
    };
    void pending.then((r) => {
      settled();
      if (op !== this.op || this.disposed || r.ok) return;
      if (r.reason === "no_access") this.denied();
    }, () => { settled(); /* network: keep playing, the next boundary checks again */ });
  }

  private stopAudio() {
    this.clearRetry();
    this.clearStall();
    this.clearDeadline();
    this.switching = false;
    this.leaving = false;
    this.soundingId = null;
    if (this.sourceLocal) this.d.onSource?.(null, false);
    this.sourceLocal = false;
    this.d.audio.pause();
    this.d.audio.removeAttribute("src");
    this.d.audio.load();
  }

  /** Revoke playback locally (server already refuses URLs). */
  private denied() {
    if (this.status !== "no_access") {
      this.deniedPlayback = {
        audioItemId: this.current?.audioItemId ?? null,
        resume: this.status === "playing" || this.status === "loading",
      };
    }
    this.op++;
    this.stopAudio();
    this.presigned = null;
    this.resumePoint = null;
    this.needsGesture = false;
    this.items = [];
    this.index = -1;
    this.set("no_access");
  }

  /** Only a fresh access confirmation may clear denial; navigation manifests cannot. */
  async restoreVerifiedAccess(items: SpaManifestItem[]): Promise<void> {
    if (this.disposed) return;
    if (this.status !== "no_access") return this.applyManifest(items);
    const denied = this.deniedPlayback;
    this.deniedPlayback = null;
    this.items = items;
    const index = items.findIndex((item) => item.audioItemId === denied?.audioItemId);
    this.index = items.length > 0 ? Math.max(0, index) : -1;
    this.failures = 0;
    this.errorRetries = 0;
    this.retryTrackId = null;
    const resume = !!denied?.resume && this.index >= 0;
    this.restoringAccess = resume;
    try {
      this.set(items.length > 0 ? "paused" : "idle");
      // A denied sign already selected the next track. Re-sign it, never reuse a URL.
      if (resume) await this.playIndex(this.index, true);
    } finally {
      this.restoringAccess = false;
    }
  }

  /** `instant`: natural advance after "ended" – the next track starts without a fade-in. */
  async playIndex(i: number, instant = false): Promise<void> {
    if (this.disposed || this.status === "no_access") return;
    if (i < 0 || i >= this.items.length) return;
    const op = ++this.op;
    this.clearRetry();
    this.clearStall();
    this.loopFrom = -1;
    this.refusedHidden = false;
    const item = this.items[i];
    if (this.expired(item)) return this.onDeadline(false);
    if (this.resumePoint && this.resumePoint.audioItemId !== item.audioItemId) this.resumePoint = null;
    if (this.index !== i || this.current?.audioItemId !== item.audioItemId) this.lastPosition = 0;
    this.index = i;
    if (this.retryTrackId !== item.audioItemId) {
      this.retryTrackId = item.audioItemId;
      this.errorRetries = 0;
    }
    this.clearDeadline();
    this.set("loading", this.resumePoint ? RECONNECTING_MESSAGE : null);
    if (!instant && this.d.audio.fadeOutForSwitch) {
      this.switching = true;
      this.leaving = true;
      const fade = this.d.audio.fadeOutForSwitch();
      // A deadline hard-stops the old source, settling the fade; the user choice continues.
      if (this.soundingId) this.armFadeGuard(this.soundingId, op);
      await fade;
      if (op !== this.op || this.disposed) return;
    }
    if (instant) {
      // Natural advance after "ended" (t1285u): never pause / drop the source / load() here.
      // Tearing the element down ends the iOS media session; on a locked iPhone the next track
      // then «starts» without sound. The ended element simply gets the next src below.
      this.switching = false;
      this.leaving = false;
      this.soundingId = null;
    } else {
      this.stopAudio();
    }
    const pre = this.takePresigned(item.audioItemId);
    // t1331u: a device copy wins over the network (no request at the boundary, plays offline).
    // t1365u: on a stream-first device a fresh pre-signed stream wins at a normal start; the copy
    // stays the source for a reconnect and for a start without a ready link.
    const reconnecting = this.resumePoint?.audioItemId === item.audioItemId;
    const preferStream = pre !== null && !reconnecting && this.online() && this.streamFirst();
    let copy = preferStream ? null : this.local(item);
    // Every started track is still checked by the server: a pre-signed or copied start re-asks it.
    let recheck = pre !== null || copy !== null;
    let r: OnlineSignResult;
    try {
      r = copy ? { ok: true, data: { url: copy } } : pre ? { ok: true, data: { url: pre.url } } : await this.d.sign(item.audioItemId);
    } catch {
      r = { ok: false, reason: "network" };
    }
    if (op !== this.op || this.disposed) return;
    if (!r.ok && TRANSIENT_SIGN_REASONS.has(r.reason) && copy === null) {
      // The network refused the start, but the device holds the track: play it from the copy.
      const fallback = this.local(item);
      if (fallback) {
        copy = fallback;
        recheck = true;
        r = { ok: true, data: { url: fallback } };
      }
    }
    if (!r.ok) {
      if (r.reason === "no_access") return this.denied();
      if (SKIP_REASONS.has(r.reason)) {
        this.failures++;
        if (this.failures < this.items.length) return this.next();
        return this.set("error", "Не удалось получить трек. Проверьте интернет и нажмите «Играть».");
      }
      if (!TRANSIENT_SIGN_REASONS.has(r.reason)) {
        // Space switched off, audio replaced, forbidden…: not a connection problem, say so.
        return this.set("error", "Не удалось получить трек. Проверьте интернет и нажмите «Играть».");
      }
      if (r.reason === "sign_failed") {
        // The server answered but could not sign this file: after a few tries move on.
        this.errorRetries++;
        if (this.errorRetries >= RECOVERY_SKIP_AFTER_ERRORS && this.items.length > 1) {
          this.errorRetries = 0;
          this.resumePoint = null;
          return this.advance(false);
        }
      }
      // Network / server hiccup: retry the same track with backoff, never a dead stop.
      return this.recover();
    }
    const fresh = this.fresh(item.audioItemId);
    if (!fresh || this.expired(fresh)) return this.onDeadline(false);
    // Loop mode (iPhone home-screen app): the old track is still playing here. Pause, then switch:
    // a pause keeps the iOS audio session open, only a natural end closes it.
    if (instant && this.loopMode()) this.d.audio.pause();
    this.d.audio.src = r.data.url;
    this.soundingId = item.audioItemId;
    this.sourceLocal = copy !== null && r.data.url === copy;
    this.d.onSource?.(item.audioItemId, this.sourceLocal);
    this.presignRetryAt = 0;
    const seek = this.resumePoint?.audioItemId === item.audioItemId ? this.resumePoint.positionSec : 0;
    if (seek > 0.5) {
      this.noteManualSeek();
      try { this.d.audio.currentTime = seek; } catch { /* applied again after play() */ }
    }
    try {
      if (instant && this.d.audio.playInstant) await this.d.audio.playInstant();
      else await this.d.audio.play();
      if (op !== this.op || this.disposed) return;
      this.failures = 0;
      if (recheck) this.verifyAccessAfterPresign(item.audioItemId, op);
      return this.afterPlay(item.audioItemId, op);
    } catch (error) {
      if (op !== this.op || this.disposed) return;
      if (isAutoplayRefusal(error)) return this.askGesture();
      // The source failed to load (offline, expired URL): reconnect with backoff.
      return this.recover();
    }
  }

  /** Autoplay refused: keep the loaded source; one user tap (toggle) resumes it. No retries. */
  private askGesture() {
    this.clearRetry();
    this.retryAttempt = 0;
    this.needsGesture = true;
    this.refusedHidden = this.inBackground();
    this.emit("autoplay_blocked", { hidden: this.refusedHidden });
    this.set("paused");
  }

  async toggle(): Promise<void> {
    if (this.disposed || this.status === "no_access" || this.items.length === 0) return;
    if (this.status === "playing" || this.status === "loading") {
      this.op++;
      this.clearDeadline();
      this.clearRetry();
      this.clearStall();
      if (!this.d.audio.src) {
        // Paused while reconnecting: nothing is sounding; the next Play re-signs.
        this.leaving = false;
        this.switching = false;
        return this.set("paused");
      }
      if (this.switching) {
        // Pause pressed during a skip fade-out: keep fading the old source to silence
        // (no cut, no click), then drop it. The chosen track starts on the next play.
        const op = this.op;
        const old = this.soundingId;
        this.switching = false;
        if (this.d.audio.fadeOut) {
          const fade = this.d.audio.fadeOut();
          if (old) this.armFadeGuard(old, op);
          void fade.then(() => {
            if (op === this.op && !this.disposed) this.stopAudio();
          });
        } else this.stopAudio();
        return this.set("paused");
      }
      // Soft pause where available: the status is "paused" at once (UI, remote commands),
      // the music fades out for PLAYER_FADE_MS and then the element pauses.
      const cur = this.current;
      if (this.d.audio.fadeOut && !this.expired(cur)) {
        void this.d.audio.fadeOut();
        // Rights window: the fade-out is still audible, so playable_until still applies.
        if (cur) this.armFadeGuard(cur.audioItemId, this.op);
      } else this.d.audio.pause();
      return this.set("paused");
    }
    if (
      this.status === "paused" &&
      this.d.audio.src &&
      this.current &&
      !this.leaving &&
      this.soundingId === this.current.audioItemId &&
      !this.expired(this.current)
    ) {
      const op = ++this.op;
      const item = this.current;
      try {
        await this.d.audio.play();
        if (op !== this.op || this.disposed) return;
        return this.afterPlay(item.audioItemId, op);
      } catch (error) {
        if (op !== this.op || this.disposed) return;
        if (isAutoplayRefusal(error)) return this.askGesture();
        // URL may have expired while paused: fetch a fresh one (re-checks access).
        await this.playIndex(Math.max(this.index, 0));
      }
      return;
    }
    return this.playIndex(Math.max(this.index, 0));
  }

  next(): Promise<void> {
    return this.advance(false);
  }

  private nextTarget(): number {
    if (this.items.length === 0) return -1;
    const fallback = this.index < 0 || this.index >= this.items.length - 1 ? 0 : this.index + 1;
    const custom = this.d.nextIndex?.(this.index, this.items.length);
    return typeof custom === "number" && Number.isInteger(custom) && custom >= 0 && custom < this.items.length
      ? custom
      : fallback;
  }

  private advance(instant: boolean): Promise<void> {
    if (this.items.length === 0) return Promise.resolve();
    // Always the queue's own next track (#1190 «Больше / Меньше» stays in force): a link signed
    // for another track is never played instead. Without a ready link the boundary signs.
    return this.playIndex(this.nextTarget(), instant);
  }

  previous(): Promise<void> {
    if (this.items.length === 0) return Promise.resolve();
    const fallback = this.index <= 0 ? this.items.length - 1 : this.index - 1;
    const custom = this.d.previousIndex?.(this.index, this.items.length);
    const target = typeof custom === "number" && Number.isInteger(custom) && custom >= 0 && custom < this.items.length
      ? custom
      : fallback;
    return this.playIndex(target);
  }

  /** <audio> "ended": continue with the next track (program loops). */
  onEnded(): Promise<void> {
    if (this.status !== "playing") return Promise.resolve();
    this.retryTrackId = null;
    return this.advance(true);
  }

  /**
   * <audio> "error" while playing/loading (offline, signed URL expired mid-stream): reconnect
   * with backoff and resume at the position. A track that keeps failing while the browser is
   * online (broken file) is skipped; the hall never ends in a dead state.
   */
  onError(): Promise<void> {
    if (this.disposed || (this.status !== "playing" && this.status !== "loading")) return Promise.resolve();
    // Already waiting for a reconnect, or no source loaded (src removed by a switch).
    if (this.retryTimer !== null || !this.d.audio.src) return Promise.resolve();
    this.errorRetries++;
    if (this.errorRetries >= RECOVERY_SKIP_AFTER_ERRORS && this.online() && this.items.length > 1) {
      this.errorRetries = 0;
      this.resumePoint = null;
      this.op++;
      this.stopAudio();
      return this.advance(false);
    }
    this.recover();
    return Promise.resolve();
  }

  /**
   * New manifest from the server. null = access revoked → stop now. A playing track that
   * left the manifest is stopped and the next allowed one starts.
   */
  async applyManifest(items: SpaManifestItem[] | null): Promise<void> {
    if (this.disposed) return;
    if (items === null) return this.denied();
    const currentId = this.current?.audioItemId ?? null;
    const wasActive = this.status === "playing" || this.status === "loading";
    this.items = items;
    // A soft fade (pause, or the previous track during a skip) is still audible: guard the
    // SOUNDING track, which may differ from the selected one. Removed / expired: stop now.
    const guarded = this.fadeGuardId;
    if (guarded) {
      const old = this.fresh(guarded);
      if (!old || this.expired(old)) {
        this.clearDeadline();
        this.d.audio.pause();
      } else this.armFadeGuard(guarded, this.op);
    }
    const idx = currentId ? items.findIndex((i) => i.audioItemId === currentId) : -1;
    if (idx >= 0) {
      this.index = idx;
      // The window may have changed (e.g. shortened): re-arm the hard stop from the new manifest.
      if (this.expired(items[idx])) return this.onDeadline(wasActive);
      if (this.status === "playing") this.armDeadline(currentId as string, this.op);
      this.recheckWrapPending();
      this.d.onChange();
      return;
    }
    if (currentId === null) {
      this.d.onChange();
      return;
    }
    if (this.switching && items.length > 0) {
      // The chosen track left the manifest during the skip fade-out: switch to the first
      // allowed one and keep the same fade (no hard cut of the previous track).
      this.index = -1;
      return this.playIndex(0);
    }
    this.op++;
    this.stopAudio();
    this.index = -1;
    if (wasActive && items.length > 0) return this.playIndex(0);
    this.set("idle");
  }

  dispose() {
    this.disposed = true;
    this.op++;
    this.clearRetry();
    this.clearStall();
    this.presigned = null;
    this.clearDeadline();
    this.d.audio.pause();
  }
}
