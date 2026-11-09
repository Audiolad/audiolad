/**
 * Business SPA pilot (0e05333f), stage 1 – ONLINE player (Sergey 2026-10-13 19:16 MSK).
 *
 * Manual switches fade the old source out before pause / load / replacement: cutting
 * an audible waveform there causes a click. Natural advance still starts instantly.
 *
 * Plays the current ELIGIBLE manifest track by track from short-lived signed URLs.
 * No offline cache: nothing is downloaded or stored on the device. Every track start
 * asks the server for a fresh signed URL (server re-checks pilot access + manifest), so a
 * user without access never receives audio. The offline engine (spa-player-engine.ts)
 * stays in the repo with its tests for the next stage and is not used here.
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
/** Audio errors on one track while the browser is online before the track is skipped. */
export const RECOVERY_SKIP_AFTER_ERRORS = 4;
export const RECONNECTING_MESSAGE = "Связь восстанавливается…";

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
      try { this.d.audio.currentTime = resume.positionSec; } catch { /* not seekable yet */ }
    }
    this.healthyFrom = Number.isFinite(this.d.audio.currentTime) ? this.d.audio.currentTime : 0;
    this.armDeadline(id, op);
    this.set("playing");
    // Sign the next track now, while the page is awake: on a locked screen "ended" must be
    // able to switch the source without waiting for the network.
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
    const op = ++this.op;
    this.stopAudio();
    const n = this.retryAttempt++;
    const base = Math.min(RECOVERY_BASE_MS * 2 ** Math.min(n, 10), RECOVERY_MAX_MS);
    const delay = Math.round(base * (0.75 + 0.5 * (this.d.random ?? Math.random)()));
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
    this.stallTimer = this.timer(() => {
      this.stallTimer = null;
      if (op !== this.op || this.disposed || this.status !== "playing") return;
      this.recover();
    }, RECOVERY_STALL_MS);
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
    this.prefetchNext();
    this.maybeHandoff(positionSec, durationSec);
  }

  /**
   * The queue changed (sound / daypart rebuild, staff «Больше / Меньше», owner order): sign
   * the new next track at once instead of waiting for the next progress event.
   */
  queueChanged(): void {
    this.prefetchNext();
  }

  private inBackground(): boolean {
    try {
      return this.d.backgroundAdvance?.() === true;
    } catch {
      return false;
    }
  }

  /** Fresh pre-signed URL for this track, without taking it. */
  private readyFor(id: string): boolean {
    const p = this.presigned;
    return !!p && p.audioItemId === id && this.now() - p.at <= PRESIGN_MAX_AGE_MS;
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
    if (!this.inBackground()) return;
    const cur = this.current;
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
  private prefetchNext(): void {
    if (this.disposed || this.status !== "playing") return;
    const cur = this.current;
    if (!cur) return;
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
      this.presigned = { audioItemId: id, url: r.data.url, at: this.now() };
    }, failed);
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
    void pending.then((r) => {
      if (op !== this.op || this.disposed || r.ok) return;
      if (r.reason === "no_access") this.denied();
    }, () => { /* network: keep playing, the next boundary checks again */ });
  }

  private stopAudio() {
    this.clearRetry();
    this.clearStall();
    this.clearDeadline();
    this.switching = false;
    this.leaving = false;
    this.soundingId = null;
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
    this.set(items.length > 0 ? "paused" : "idle");
    // A denied sign already selected the next track. Re-sign it, never reuse a URL.
    if (denied?.resume && this.index >= 0) await this.playIndex(this.index, true);
  }

  /** `instant`: natural advance after "ended" – the next track starts without a fade-in. */
  async playIndex(i: number, instant = false): Promise<void> {
    if (this.disposed || this.status === "no_access") return;
    if (i < 0 || i >= this.items.length) return;
    const op = ++this.op;
    this.clearRetry();
    this.clearStall();
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
    // Every started track is still checked by the server: a pre-signed start re-asks it below.
    const recheck = pre !== null;
    let r: OnlineSignResult;
    try {
      r = pre ? { ok: true, data: { url: pre.url } } : await this.d.sign(item.audioItemId);
    } catch {
      r = { ok: false, reason: "network" };
    }
    if (op !== this.op || this.disposed) return;
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
    this.d.audio.src = r.data.url;
    this.soundingId = item.audioItemId;
    this.presignRetryAt = 0;
    const seek = this.resumePoint?.audioItemId === item.audioItemId ? this.resumePoint.positionSec : 0;
    if (seek > 0.5) {
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
    const target = this.nextTarget();
    if (instant && this.inBackground()) {
      // Locked iPhone (t1303u): a boundary that has to wait for the network never starts the
      // next track there. When the queue changed after the pre-sign, play the track that is
      // ready instead; the server still re-checks it in the background.
      const want = this.items[target];
      const ready = this.presigned;
      if (want && ready && !this.readyFor(want.audioItemId) && this.readyFor(ready.audioItemId)) {
        const j = this.items.findIndex((x) => x.audioItemId === ready.audioItemId);
        if (j >= 0 && j !== this.index && !this.expired(this.items[j])) return this.playIndex(j, true);
      }
    }
    return this.playIndex(target, instant);
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
