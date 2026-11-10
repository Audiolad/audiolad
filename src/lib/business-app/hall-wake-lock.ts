/**
 * Hall device: keep the screen on while the hall music is meant to play (t1350u).
 *
 * Android Chrome (Samsung, 2026-11-10 09:12 / 09:20 / 09:45) froze the hall page at a track
 * change after the screen went dark: battery saving suspends a page whose element is briefly
 * silent between two tracks, and the next track never starts. A screen wake lock keeps the
 * screen (and the page) awake on any phone, without staff changing battery settings.
 *
 * Screen Wake Lock API: Chrome / Samsung Internet 84+, Safari 16.4+ (home-screen web app
 * from iOS 18.4). Unsupported browsers keep today's behaviour – no fallback video, no error.
 * The browser releases the lock itself whenever the page is hidden (screen locked with the
 * button, another app); it is requested again when the page is visible.
 *
 * The lock never touches the audio element, the build reload (#1212), the iPhone handoff
 * (#1196) or the fades: it is screen-only.
 */

/** Calm hall hint (Russian, en dash). */
export const HALL_WAKE_LOCK_HINT =
  "Держите телефон на зарядке – экран не гаснет, пока играет музыка.";

export type HallWakeIntent = {
  /** Controller status: "playing" | "loading" | "paused" | "idle" | "no_access" | "error". */
  status: string | null | undefined;
  /** Controller is auto-recovering (stall / network retry): music is still meant to play. */
  recovering?: boolean;
  /** Autoplay refused (locked iPhone): waiting for a foreground retry or a tap. */
  needsGesture?: boolean;
  /** Access restored, automatic resume pending. */
  resumePending?: boolean;
  /**
   * Paused from the owner's phone: the owner resumes remotely, which needs a live hall page
   * (a dark Android screen freezes it and the command never arrives).
   */
  remotePaused?: boolean;
  /**
   * The hall paused on purpose (local tap on pause, bar closed, owner pause): stale controller
   * flags (needsGesture / resumePending) no longer keep the screen on. Cleared on the next start.
   */
  localPaused?: boolean;
  /** A start (play / next / previous) is in flight: `audio.play()` may wait without "loading". */
  resuming?: boolean;
};

/**
 * True while the hall means to play: playing, loading, a start in flight, a pause sent from the
 * owner's phone, and – unless the hall paused on purpose – error (retries / skips on its own),
 * recovery, an autoplay refusal or a pending resume. Idle, no access and a deliberate local
 * pause release the screen.
 */
export function hallWantsScreenAwake(intent: HallWakeIntent | null | undefined): boolean {
  if (!intent) return false;
  const status = intent.status ?? "idle";
  if (status === "no_access" || status === "idle") return false;
  if (status === "playing" || status === "loading") return true;
  if (status === "paused" && intent.remotePaused === true) return true;
  if (intent.resuming === true) return true;
  if (intent.localPaused === true) return false;
  if (status === "error") return true;
  return intent.recovering === true || intent.needsGesture === true || intent.resumePending === true;
}

/** Controller-shaped view (SpaOnlinePlayer) for the wake intent. */
export type HallWakeController = {
  status: string;
  recovering: boolean;
  needsGesture: boolean;
  resumePending: boolean;
};

/**
 * Provider-side intent the controller does not know (independent review of the wake lock PR):
 * - a deliberate pause – stale needsGesture / resumePending must not keep the screen on;
 * - a deliberate local stop (bar closed) – supersedes an earlier owner pause latch;
 * - a start in flight – `audio.play()` may wait without a "loading" notification. A later
 *   deliberate pause supersedes it at once; a start that never reached the controller
 *   (aborted) leaves the earlier pause in place.
 */
export class HallWakeIntentTracker {
  private localPaused = false;
  private localStopped = false;
  private readonly starts = new Set<object>();
  private lastStatus = "idle";

  /** Controller onChange: a fresh start into "playing" ends a deliberate pause. */
  observe(status: string): void {
    if (status === "playing" && this.lastStatus !== "playing") {
      this.localPaused = false;
      this.localStopped = false;
    }
    this.lastStatus = status;
  }

  /**
   * Local pause, bar closed (`stop`) or a pause from the owner's phone. Supersedes starts in
   * flight; `stop` also overrides the owner pause latch (the hall chose to stop here).
   */
  markPaused(opts: { stop?: boolean } = {}): void {
    this.localPaused = true;
    if (opts.stop) this.localStopped = true;
    this.starts.clear();
  }

  /**
   * Wrap a start (play / next / previous); `sync` re-evaluates the lock before and after.
   * `run` returns false when it gave up before reaching the controller (aborted command):
   * the earlier deliberate pause then stays in force.
   */
  async whileStarting(run: () => Promise<boolean | void>, sync: () => void): Promise<void> {
    const before = { paused: this.localPaused, stopped: this.localStopped };
    const token = {};
    this.starts.add(token);
    sync();
    let started = true;
    try {
      started = (await run()) !== false;
    } finally {
      const current = this.starts.delete(token);
      // Superseded by a deliberate pause meanwhile: that pause wins.
      if (current) {
        if (started) {
          this.localPaused = false;
          this.localStopped = false;
        } else {
          this.localPaused = before.paused;
          this.localStopped = before.stopped;
        }
      }
      sync();
    }
  }

  wanted(ctl: HallWakeController | null | undefined, remotePaused: boolean): boolean {
    if (!ctl) return false;
    return hallWantsScreenAwake({
      status: ctl.status,
      recovering: ctl.recovering,
      needsGesture: ctl.needsGesture,
      resumePending: ctl.resumePending,
      remotePaused: remotePaused && !this.localStopped,
      localPaused: this.localPaused,
      resuming: this.starts.size > 0,
    });
  }
}

type Sentinel = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", fn: () => void) => void;
};

export type WakeLockNavigator = {
  wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
};

export type WakeLockDocument = {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", fn: () => void) => void;
  removeEventListener: (type: "visibilitychange", fn: () => void) => void;
};

export function hallWakeLockSupported(nav: WakeLockNavigator | null | undefined): boolean {
  return !!nav && typeof nav.wakeLock?.request === "function";
}

/**
 * Holds at most one screen wake lock while `setWanted(true)`. Every failure is silent
 * (unsupported, permission policy, battery saver, hidden page): the hall plays as before.
 */
export class HallWakeLock {
  private wanted = false;
  private sentinel: Sentinel | null = null;
  private pending: object | null = null;
  private disposed = false;
  private readonly onVisibility = () => {
    if (this.doc.visibilityState === "visible") this.sync();
  };

  constructor(
    private readonly nav: WakeLockNavigator | null | undefined,
    private readonly doc: WakeLockDocument,
  ) {
    if (hallWakeLockSupported(nav)) doc.addEventListener("visibilitychange", this.onVisibility);
  }

  get held(): boolean {
    return !!this.sentinel && this.sentinel.released !== true;
  }

  setWanted(wanted: boolean): void {
    if (this.disposed) return;
    this.wanted = wanted;
    this.sync();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.wanted = false;
    this.doc.removeEventListener("visibilitychange", this.onVisibility);
    this.drop();
  }

  private sync(): void {
    if (this.disposed || !hallWakeLockSupported(this.nav)) return;
    if (!this.wanted) {
      this.drop();
      return;
    }
    if (this.held || this.pending) return;
    // Requests from a hidden page are refused; the visibilitychange listener retries.
    if (this.doc.visibilityState !== "visible") return;
    const token = {};
    this.pending = token;
    void this.acquire().finally(() => {
      if (this.pending === token) this.pending = null;
    });
  }

  private async acquire(): Promise<void> {
    let sentinel: Sentinel | null = null;
    try {
      sentinel = await this.nav!.wakeLock!.request("screen");
    } catch {
      sentinel = null;
    }
    if (!sentinel) return;
    if (this.disposed || !this.wanted) {
      void sentinel.release().catch(() => {});
      return;
    }
    this.sentinel = sentinel;
    try {
      sentinel.addEventListener?.("release", () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch {
      /* older shapes */
    }
  }

  private drop(): void {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (!sentinel) return;
    try {
      void sentinel.release().catch(() => {});
    } catch {
      /* already released */
    }
  }
}
