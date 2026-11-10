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
};

/**
 * True while the hall means to play: playing, loading, error (retries / skips on its own),
 * recovery, an autoplay refusal or a pending resume, and a pause sent from the owner's phone.
 * A local pause, idle and no access release the screen.
 */
export function hallWantsScreenAwake(intent: HallWakeIntent | null | undefined): boolean {
  if (!intent) return false;
  const status = intent.status ?? "idle";
  if (status === "no_access") return false;
  if (status === "playing" || status === "loading" || status === "error") return true;
  if (intent.recovering === true || intent.needsGesture === true || intent.resumePending === true) return true;
  return status === "paused" && intent.remotePaused === true;
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
  private pending: Promise<void> | null = null;
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
    this.pending = this.acquire();
  }

  private async acquire(): Promise<void> {
    let sentinel: Sentinel | null = null;
    try {
      sentinel = await this.nav!.wakeLock!.request("screen");
    } catch {
      sentinel = null;
    }
    this.pending = null;
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
