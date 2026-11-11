export const POINT_COMMAND_TYPES = ["pause", "resume", "next_track"] as const;

export type PointCommandType = (typeof POINT_COMMAND_TYPES)[number];

const COMMAND_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPointCommandType(value: unknown): value is PointCommandType {
  return typeof value === "string" && (POINT_COMMAND_TYPES as readonly string[]).includes(value);
}

export function isPointCommandId(value: unknown): value is string {
  return typeof value === "string" && COMMAND_ID_RE.test(value);
}

/** What the venue device does with one command. Already-correct playback is a no-op. */
export function pointCommandAction(
  status: string,
  type: PointCommandType,
): "toggle" | "next" | "none" {
  if (type === "next_track") return "next";
  const playing = status === "playing" || status === "loading";
  if (type === "pause") return playing ? "toggle" : "none";
  return playing ? "none" : "toggle";
}

/** Resume / next may still be loading (track URL, reconnect) when the apply returns. */
export const POINT_RESUME_SETTLE_MS = 12_000;

/** Wait until the player leaves "loading" (or `maxMs` passes). */
export async function waitWhileLoading(
  status: () => string,
  maxMs: number,
  stepMs = 200,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  for (let waited = 0; status() === "loading" && waited < maxMs; waited += stepMs) await sleep(stepMs);
}

/**
 * The venue device's `applied` check for one owner command (shared by the hall player and tests).
 * A confirmed pause always calls `ownerPaused`, also when the hall was already silent
 * (paused / idle / an iOS autoplay refusal) and `pointCommandAction` did nothing: the owner's
 * pause must still clear «the hall was playing», or a reloaded page would start by itself.
 */
export function pointCommandApplied(deps: {
  status(): string | undefined;
  audio(): { readonly paused: boolean } | null | undefined;
  fade(): { readonly fadingOut: boolean; fadeOut(): Promise<unknown> } | null | undefined;
  /** Confirmed owner pause: latch it, clear the playing marker, re-sync the wake lock. */
  ownerPaused(): void;
  settleMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): (type: PointCommandType) => Promise<boolean> {
  return async (type) => {
    // Soft pause resolves before the fade has actually silenced the element.
    const fade = deps.fade();
    if (type === "pause" && fade?.fadingOut) await fade.fadeOut();
    // Resume / next while a track is still loading (sign, reconnect): wait for it here
    // instead of failing and waiting out the 30 s lease.
    if (type !== "pause") {
      await waitWhileLoading(() => deps.status() ?? "idle", deps.settleMs ?? POINT_RESUME_SETTLE_MS, 200, deps.sleep);
    }
    const status = deps.status();
    const audio = deps.audio();
    const done = !!audio && (type === "pause"
      ? (status === "paused" || status === "idle") && audio.paused
      : status === "playing" && !audio.paused);
    if (type === "pause" && done) deps.ownerPaused();
    return done;
  };
}

export type ClaimedPointCommand = {
  id: string;
  type: PointCommandType;
  claim_id: string;
  claim_until: string;
};

export function isClaimedPointCommand(value: unknown): value is ClaimedPointCommand {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return isPointCommandId(row.id) && isPointCommandType(row.type)
    && isPointCommandId(row.claim_id) && typeof row.claim_until === "string"
    && Number.isFinite(Date.parse(row.claim_until));
}

export type PointCommandRunner = {
  ready(): boolean;
  status(): string;
  toggle(signal: AbortSignal): Promise<void>;
  next(signal: AbortSignal): Promise<void>;
  /** Includes the real audio state: controller errors and soft pauses may resolve early. */
  applied(type: PointCommandType): Promise<boolean>;
  ack(command: ClaimedPointCommand): Promise<void>;
  stopped(): boolean;
};

/** One command at a time; never acknowledge a failed, timed out or interrupted apply. */
export async function runPointCommands(
  commands: readonly unknown[],
  run: PointCommandRunner,
  timeoutMs = 20_000,
): Promise<void> {
  for (const command of commands) {
    if (run.stopped() || !run.ready()) return;
    if (!isClaimedPointCommand(command)) continue;
    // Leave time for the acknowledgement before the server's 30s lease expires.
    const remaining = Date.parse(command.claim_until) - Date.now() - 1_000;
    if (remaining <= 0) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          const action = pointCommandAction(run.status(), command.type);
          if (action === "next") await run.next(abort.signal);
          if (action === "toggle") await run.toggle(abort.signal);
          if (abort.signal.aborted || run.stopped() || !run.ready()) throw new Error("point_command_interrupted");
          if (!(await run.applied(command.type))) throw new Error("point_command_not_applied");
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abort.abort();
            reject(new Error("point_command_timeout"));
          }, Math.min(timeoutMs, remaining));
        }),
      ]);
      if (abort.signal.aborted || run.stopped() || !run.ready()
        || Date.now() >= Date.parse(command.claim_until) - 1_000) return;
      await run.ack(command);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      abort.abort();
    }
  }
}
