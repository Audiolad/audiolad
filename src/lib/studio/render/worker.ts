/**
 * Long-lived Studio render queue consumer.
 * One in-flight job, idle poll (not a busy-loop), lease heartbeat, graceful drain.
 */

import type { StudioRenderSnapshot } from "./types";

/** Same default as claim_studio_render_job. Dead workers recover within this window. */
export const STUDIO_RENDER_LEASE_SECONDS = 1800;
/**
 * Renew every 5 minutes while a job is active. With a 30-minute lease that is
 * six ticks per window: several missed heartbeats still leave margin, and a
 * 3-hour FFmpeg run never relies on a one-shot 1800s/5400s lease bump.
 */
export const STUDIO_RENDER_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
/** Idle poll after an empty claim. Faster than the former 2-minute cron, not a spin loop. */
export const STUDIO_RENDER_IDLE_INTERVAL_MS = 5_000;
/** After a transient renew error, retry well before the next 5-minute tick. */
export const STUDIO_RENDER_HEARTBEAT_RETRY_MS = 15_000;
/**
 * Stop treating the lease as safely held this long before the 1800s expiry.
 * recover_stale uses `lease_expires_at < now()`, so we abandon with a minute of
 * margin instead of racing a reclaim.
 */
export const STUDIO_RENDER_LEASE_HOLD_SAFETY_MS = 60_000;
/**
 * After SIGTERM/SIGINT, finish the current job if it ends within this window.
 * Waiting hours on deploy is unsafe; past this the worker releases the lease
 * and exits. PM2 kill_timeout must be slightly larger (120s).
 */
export const STUDIO_RENDER_SHUTDOWN_DRAIN_MS = 90_000;

export type ClaimedStudioRenderJob = {
  id: string;
  project_id: string;
  guest_session_id: string | null;
  lease_token: string;
  project_snapshot: StudioRenderSnapshot;
};

export type StudioRenderExecuteResult = {
  sizeBytes: number;
};

export type StudioRenderWorkerLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type StudioRenderWorkerPort = {
  recoverStaleJobs: () => Promise<void>;
  claimJob: () => Promise<ClaimedStudioRenderJob | null>;
  renewLease: (job: ClaimedStudioRenderJob) => Promise<boolean>;
  executeJob: (
    job: ClaimedStudioRenderJob,
    signal: AbortSignal,
  ) => Promise<StudioRenderExecuteResult>;
  completeJob: (
    job: ClaimedStudioRenderJob,
    result: StudioRenderExecuteResult,
  ) => Promise<boolean>;
  failJob: (job: ClaimedStudioRenderJob, error: unknown) => Promise<boolean>;
  releaseJob: (job: ClaimedStudioRenderJob) => Promise<boolean>;
};

export type StudioRenderWorkerOptions = {
  idleIntervalMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatRetryMs?: number;
  leaseHoldMs?: number;
  shutdownDrainMs?: number;
  now?: () => number;
  logger?: StudioRenderWorkerLogger;
};

export class StudioRenderAbandonedError extends Error {
  readonly code = "studio_render_abandoned";

  constructor() {
    super("studio_render_abandoned");
    this.name = "StudioRenderAbandonedError";
  }
}

export function isStudioRenderAbort(error: unknown): boolean {
  if (error instanceof StudioRenderAbandonedError) return true;
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return error.name === "StudioRenderChildAbortedError"
    || code === "studio_render_aborted"
    || code === "studio_render_abandoned";
}

export type StudioRenderWorker = {
  run: () => Promise<void>;
  requestShutdown: () => void;
  isStopping: () => boolean;
};

export function parseClaimedStudioRenderJob(claimed: unknown): ClaimedStudioRenderJob | null {
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (
    !job ||
    typeof job !== "object" ||
    typeof (job as { id?: unknown }).id !== "string" ||
    typeof (job as { project_id?: unknown }).project_id !== "string" ||
    typeof (job as { lease_token?: unknown }).lease_token !== "string" ||
    !(job as { lease_token: string }).lease_token ||
    !(job as { project_snapshot?: unknown }).project_snapshot ||
    typeof (job as { project_snapshot?: unknown }).project_snapshot !== "object"
  ) {
    return null;
  }
  const row = job as {
    id: string;
    project_id: string;
    guest_session_id?: unknown;
    lease_token: string;
    project_snapshot: StudioRenderSnapshot;
  };
  return {
    id: row.id,
    project_id: row.project_id,
    guest_session_id: typeof row.guest_session_id === "string" ? row.guest_session_id : null,
    lease_token: row.lease_token,
    project_snapshot: row.project_snapshot,
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(settle, ms);
    const onAbort = () => settle();
    signal?.addEventListener("abort", onAbort);
  });
}

export function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<{ status: "ok"; value: T } | { status: "aborted" }> {
  if (signal.aborted) return Promise.resolve({ status: "aborted" });
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => finish({ status: "aborted" });
    const finish = (result: { status: "ok"; value: T } | { status: "aborted" }) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    signal.addEventListener("abort", onAbort);
    promise.then(
      (value) => finish({ status: "ok", value }),
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Pre-upload ownership gate. Confirmed loss (`false` or aborted signal) skips
 * the write. A transient assertOwns error does not skip: another worker cannot
 * claim while this lease is still valid.
 */
export async function allowStudioRenderOutputUpload(
  signal: AbortSignal,
  assertOwns: () => Promise<boolean>,
): Promise<boolean> {
  if (signal.aborted) return false;
  try {
    const owned = await assertOwns();
    if (signal.aborted) return false;
    return owned === true;
  } catch {
    return !signal.aborted;
  }
}

function startLeaseHeartbeat(
  job: ClaimedStudioRenderJob,
  port: StudioRenderWorkerPort,
  options: {
    intervalMs: number;
    retryMs: number;
    leaseHoldMs: number;
    now: () => number;
    logger: StudioRenderWorkerLogger;
    onLost: () => void;
  },
): () => void {
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSuccessAt = options.now();

  const schedule = (delayMs: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  };

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const owned = await port.renewLease(job);
      if (stopped) return;
      if (owned === false) {
        options.onLost();
        return;
      }
      lastSuccessAt = options.now();
      schedule(options.intervalMs);
    } catch (error) {
      if (stopped) return;
      options.logger.error(
        JSON.stringify({
          event: "studio_render_lease_renew_retry",
          jobId: job.id,
          error: error instanceof Error ? error.message : "unknown_error",
        }),
      );
      if (options.now() - lastSuccessAt >= options.leaseHoldMs) {
        options.onLost();
        return;
      }
      schedule(options.retryMs);
    } finally {
      inFlight = false;
    }
  };

  schedule(options.intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export function createStudioRenderWorker(
  port: StudioRenderWorkerPort,
  options: StudioRenderWorkerOptions = {},
): StudioRenderWorker {
  const idleIntervalMs = options.idleIntervalMs ?? STUDIO_RENDER_IDLE_INTERVAL_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? STUDIO_RENDER_HEARTBEAT_INTERVAL_MS;
  const heartbeatRetryMs = options.heartbeatRetryMs ?? STUDIO_RENDER_HEARTBEAT_RETRY_MS;
  const leaseHoldMs = options.leaseHoldMs
    ?? (STUDIO_RENDER_LEASE_SECONDS * 1000 - STUDIO_RENDER_LEASE_HOLD_SAFETY_MS);
  const shutdownDrainMs = options.shutdownDrainMs ?? STUDIO_RENDER_SHUTDOWN_DRAIN_MS;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? {
    info: (message: string) => console.log(message),
    error: (message: string) => console.error(message),
  };

  let stopping = false;
  const shutdown = new AbortController();

  const requestShutdown = () => {
    if (stopping) return;
    stopping = true;
    shutdown.abort();
  };

  async function handleJob(
    job: ClaimedStudioRenderJob,
    abandon: { current: boolean },
    jobAbort: AbortController,
  ): Promise<void> {
    let lostOwnership = false;
    const markLost = () => {
      lostOwnership = true;
      if (!jobAbort.signal.aborted) jobAbort.abort();
    };
    const stopHeartbeat = startLeaseHeartbeat(job, port, {
      intervalMs: heartbeatIntervalMs,
      retryMs: heartbeatRetryMs,
      leaseHoldMs,
      now,
      logger,
      onLost: markLost,
    });
    try {
      let result: StudioRenderExecuteResult;
      try {
        result = await port.executeJob(job, jobAbort.signal);
      } catch (error) {
        if (
          isStudioRenderAbort(error)
          || abandon.current
          || lostOwnership
        ) {
          logger.error(
            JSON.stringify({
              event: "studio_render_abandoned",
              jobId: job.id,
              reason: loseReason(abandon.current, lostOwnership),
            }),
          );
          return;
        }
        const persisted = await port.failJob(job, error);
        if (!persisted) {
          logger.error(
            JSON.stringify({
              event: "studio_render_failed",
              jobId: job.id,
              reason: "ownership_lost_on_fail",
            }),
          );
        }
        return;
      }
      if (abandon.current || lostOwnership || jobAbort.signal.aborted) {
        logger.info(
          JSON.stringify({
            event: "studio_render_abandoned",
            jobId: job.id,
            reason: loseReason(abandon.current, lostOwnership),
          }),
        );
        return;
      }
      const completed = await port.completeJob(job, result);
      if (!completed) {
        logger.error(
          JSON.stringify({
            event: "studio_render_completed_skipped",
            jobId: job.id,
            reason: "ownership_lost_on_complete",
          }),
        );
      }
    } finally {
      stopHeartbeat();
    }
  }

  async function run(): Promise<void> {
    while (!stopping) {
      try {
        await port.recoverStaleJobs();
        if (stopping) break;
        const job = await port.claimJob();
        if (stopping) {
          if (job) await port.releaseJob(job);
          break;
        }
        if (!job) {
          await sleep(idleIntervalMs, shutdown.signal);
          continue;
        }
        const abandon = { current: false };
        const jobAbort = new AbortController();
        const jobRun = handleJob(job, abandon, jobAbort);
        const outcome = await raceWithAbort(jobRun, shutdown.signal);
        if (outcome.status === "ok") continue;
        const drained = await Promise.race([
          jobRun.then(() => "finished" as const),
          sleep(shutdownDrainMs).then(() => "timeout" as const),
        ]);
        if (drained === "timeout") {
          abandon.current = true;
          if (!jobAbort.signal.aborted) jobAbort.abort();
          await jobRun;
          await port.releaseJob(job);
          logger.info(
            JSON.stringify({
              event: "studio_render_shutdown_released",
              jobId: job.id,
              drainMs: shutdownDrainMs,
            }),
          );
        }
        break;
      } catch (error) {
        logger.error(
          `studio-render-worker: ${error instanceof Error ? error.message : "unknown_error"}`,
        );
        await sleep(idleIntervalMs, shutdown.signal);
      }
    }
  }

  return {
    run,
    requestShutdown,
    isStopping: () => stopping,
  };
}

function loseReason(abandoned: boolean, lostOwnership: boolean): string {
  if (abandoned) return "shutdown_drain";
  if (lostOwnership) return "lease_lost";
  return "unknown";
}
