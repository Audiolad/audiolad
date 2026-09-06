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
  executeJob: (job: ClaimedStudioRenderJob) => Promise<StudioRenderExecuteResult>;
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
  shutdownDrainMs?: number;
  logger?: StudioRenderWorkerLogger;
};

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
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function startLeaseHeartbeat(
  job: ClaimedStudioRenderJob,
  port: StudioRenderWorkerPort,
  intervalMs: number,
  onLost: () => void,
): () => void {
  let renewing = false;
  let stopped = false;
  const tick = () => {
    if (stopped || renewing) return;
    renewing = true;
    void port
      .renewLease(job)
      .then((owned) => {
        if (!owned && !stopped) onLost();
      })
      .catch(() => {
        if (!stopped) onLost();
      })
      .finally(() => {
        renewing = false;
      });
  };
  const timer = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export function createStudioRenderWorker(
  port: StudioRenderWorkerPort,
  options: StudioRenderWorkerOptions = {},
): StudioRenderWorker {
  const idleIntervalMs = options.idleIntervalMs ?? STUDIO_RENDER_IDLE_INTERVAL_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? STUDIO_RENDER_HEARTBEAT_INTERVAL_MS;
  const shutdownDrainMs = options.shutdownDrainMs ?? STUDIO_RENDER_SHUTDOWN_DRAIN_MS;
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

  async function handleJob(job: ClaimedStudioRenderJob, abandon: { current: boolean }): Promise<void> {
    let lostOwnership = false;
    const stopHeartbeat = startLeaseHeartbeat(
      job,
      port,
      heartbeatIntervalMs,
      () => {
        lostOwnership = true;
      },
    );
    try {
      let result: StudioRenderExecuteResult;
      try {
        result = await port.executeJob(job);
      } catch (error) {
        if (abandon.current || lostOwnership) {
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
      if (abandon.current || lostOwnership) {
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
        const jobRun = handleJob(job, abandon);
        const outcome = await Promise.race([
          jobRun.then(() => "finished" as const),
          waitForAbort(shutdown.signal).then(() => "stopping" as const),
        ]);
        if (outcome === "finished") continue;
        const drained = await Promise.race([
          jobRun.then(() => "finished" as const),
          sleep(shutdownDrainMs).then(() => "timeout" as const),
        ]);
        if (drained === "timeout") {
          abandon.current = true;
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
