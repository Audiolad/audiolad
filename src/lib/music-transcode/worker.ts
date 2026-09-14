import {
  MUSIC_TRANSCODE_HEARTBEAT_INTERVAL_MS,
  MUSIC_TRANSCODE_HEARTBEAT_RETRY_MS,
  MUSIC_TRANSCODE_IDLE_INTERVAL_MS,
  MUSIC_TRANSCODE_LEASE_HOLD_SAFETY_MS,
  MUSIC_TRANSCODE_LEASE_SECONDS,
  MUSIC_TRANSCODE_SHUTDOWN_DRAIN_MS,
} from "./contract";
import { MusicTranscodeAbortedError } from "./ffmpeg";
import {
  formatMusicTranscodeReleaseMismatchLog,
  formatMusicTranscodeReleaseUnavailableLog,
  type MusicTranscodeReleaseComparison,
} from "./worker-release";

export type ClaimedMusicTranscodeJob = {
  id: string;
  source_asset_id: string;
  lease_token: string;
  attempt_count: number;
};

export type MusicTranscodeExecuteResult = {
  outputAssetId: string;
  sizeBytes: number;
  durationSeconds: number;
};

export type MusicTranscodeWorkerLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type MusicTranscodeWorkerPort = {
  recoverStaleJobs: () => Promise<void>;
  claimJob: () => Promise<ClaimedMusicTranscodeJob | null>;
  renewLease: (job: ClaimedMusicTranscodeJob) => Promise<boolean>;
  executeJob: (
    job: ClaimedMusicTranscodeJob,
    signal: AbortSignal,
  ) => Promise<MusicTranscodeExecuteResult>;
  completeJob: (
    job: ClaimedMusicTranscodeJob,
    result: MusicTranscodeExecuteResult,
  ) => Promise<boolean>;
  failJob: (job: ClaimedMusicTranscodeJob, error: unknown) => Promise<boolean>;
  releaseJob: (job: ClaimedMusicTranscodeJob) => Promise<boolean>;
};

export type MusicTranscodeReleaseCheck = () =>
  | MusicTranscodeReleaseComparison
  | Promise<MusicTranscodeReleaseComparison>;

export type MusicTranscodeWorkerOptions = {
  idleIntervalMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatRetryMs?: number;
  leaseHoldMs?: number;
  shutdownDrainMs?: number;
  now?: () => number;
  logger?: MusicTranscodeWorkerLogger;
  checkRelease?: MusicTranscodeReleaseCheck;
};

export type MusicTranscodeWorker = {
  run: () => Promise<void>;
  requestShutdown: () => void;
  isStopping: () => boolean;
};

export function parseClaimedMusicTranscodeJob(claimed: unknown): ClaimedMusicTranscodeJob | null {
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (
    !job
    || typeof job !== "object"
    || typeof (job as { id?: unknown }).id !== "string"
    || typeof (job as { source_asset_id?: unknown }).source_asset_id !== "string"
    || typeof (job as { lease_token?: unknown }).lease_token !== "string"
    || !(job as { lease_token: string }).lease_token
  ) {
    return null;
  }
  const row = job as {
    id: string;
    source_asset_id: string;
    lease_token: string;
    attempt_count?: unknown;
  };
  return {
    id: row.id,
    source_asset_id: row.source_asset_id,
    lease_token: row.lease_token,
    attempt_count: typeof row.attempt_count === "number" ? row.attempt_count : 0,
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

function startLeaseHeartbeat(
  job: ClaimedMusicTranscodeJob,
  port: MusicTranscodeWorkerPort,
  options: {
    intervalMs: number;
    retryMs: number;
    leaseHoldMs: number;
    now: () => number;
    logger: MusicTranscodeWorkerLogger;
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
      options.logger.error(JSON.stringify({
        event: "music_transcode_lease_renew_retry",
        jobId: job.id,
        error: error instanceof Error ? error.message : "unknown_error",
      }));
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

export function createMusicTranscodeWorker(
  port: MusicTranscodeWorkerPort,
  options: MusicTranscodeWorkerOptions = {},
): MusicTranscodeWorker {
  const idleIntervalMs = options.idleIntervalMs ?? MUSIC_TRANSCODE_IDLE_INTERVAL_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? MUSIC_TRANSCODE_HEARTBEAT_INTERVAL_MS;
  const heartbeatRetryMs = options.heartbeatRetryMs ?? MUSIC_TRANSCODE_HEARTBEAT_RETRY_MS;
  const leaseHoldMs = options.leaseHoldMs
    ?? (MUSIC_TRANSCODE_LEASE_SECONDS * 1000 - MUSIC_TRANSCODE_LEASE_HOLD_SAFETY_MS);
  const shutdownDrainMs = options.shutdownDrainMs ?? MUSIC_TRANSCODE_SHUTDOWN_DRAIN_MS;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? {
    info: (message: string) => console.log(message),
    error: (message: string) => console.error(message),
  };

  let stopping = false;
  let refreshExit = false;
  const shutdown = new AbortController();

  const requestShutdown = () => {
    if (stopping) return;
    stopping = true;
    shutdown.abort();
  };

  async function inspectRelease(): Promise<MusicTranscodeReleaseComparison> {
    if (!options.checkRelease) {
      return {
        state: "CURRENT",
        bootReleasePath: null,
        bootSha: null,
        currentReleasePath: null,
        currentSha: null,
      };
    }
    try {
      return await options.checkRelease();
    } catch (error) {
      return {
        state: "UNKNOWN",
        bootReleasePath: null,
        bootSha: null,
        currentReleasePath: null,
        currentSha: null,
        reason: error instanceof Error ? error.message : "release_check_failed",
      };
    }
  }

  function applyReleaseGate(
    comparison: MusicTranscodeReleaseComparison,
  ): "ok" | "retry" | "exit" {
    if (comparison.state === "CURRENT") return "ok";
    if (comparison.state === "STALE") {
      logger.info(formatMusicTranscodeReleaseMismatchLog(comparison));
      refreshExit = true;
      return "exit";
    }
    logger.info(formatMusicTranscodeReleaseUnavailableLog(
      comparison.reason ?? "current_identity_unreadable",
    ));
    return "retry";
  }

  async function handleJob(
    job: ClaimedMusicTranscodeJob,
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
      let result: MusicTranscodeExecuteResult;
      try {
        result = await port.executeJob(job, jobAbort.signal);
      } catch (error) {
        if (error instanceof MusicTranscodeAbortedError || abandon.current || lostOwnership) {
          logger.error(JSON.stringify({
            event: "music_transcode_abandoned",
            jobId: job.id,
            reason: loseReason(abandon.current, lostOwnership),
          }));
          return;
        }
        const persisted = await port.failJob(job, error);
        if (!persisted) {
          logger.error(JSON.stringify({
            event: "music_transcode_failed",
            jobId: job.id,
            reason: "ownership_lost_on_fail",
          }));
        }
        return;
      }
      if (abandon.current || lostOwnership || jobAbort.signal.aborted) {
        logger.info(JSON.stringify({
          event: "music_transcode_abandoned",
          jobId: job.id,
          reason: loseReason(abandon.current, lostOwnership),
        }));
        return;
      }
      const completed = await port.completeJob(job, result);
      if (!completed) {
        logger.error(JSON.stringify({
          event: "music_transcode_completed_skipped",
          jobId: job.id,
          reason: "ownership_lost_on_complete",
        }));
      }
    } finally {
      stopHeartbeat();
    }
  }

  async function run(): Promise<void> {
    while (!stopping && !refreshExit) {
      try {
        await port.recoverStaleJobs();
        if (stopping || refreshExit) break;
        const preGate = applyReleaseGate(await inspectRelease());
        if (preGate === "exit") break;
        if (preGate === "retry") {
          await sleep(idleIntervalMs, shutdown.signal);
          continue;
        }
        const job = await port.claimJob();
        if (stopping) {
          if (job) await port.releaseJob(job);
          break;
        }
        if (!job) {
          await sleep(idleIntervalMs, shutdown.signal);
          continue;
        }
        const postGate = applyReleaseGate(await inspectRelease());
        if (postGate !== "ok") {
          await port.releaseJob(job);
          if (postGate === "exit") break;
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
          logger.info(JSON.stringify({
            event: "music_transcode_shutdown_released",
            jobId: job.id,
            drainMs: shutdownDrainMs,
          }));
        }
        break;
      } catch (error) {
        logger.error(
          `music-transcode-worker: ${error instanceof Error ? error.message : "unknown_error"}`,
        );
        await sleep(idleIntervalMs, shutdown.signal);
      }
    }
  }

  return { run, requestShutdown, isStopping: () => stopping };
}

function loseReason(abandoned: boolean, lostOwnership: boolean): string {
  if (abandoned) return "shutdown_drain";
  if (lostOwnership) return "lease_lost";
  return "unknown";
}
