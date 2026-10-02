import {
  MUSIC_ANALYZER_HEARTBEAT_INTERVAL_MS,
  MUSIC_ANALYZER_HEARTBEAT_RETRY_MS,
  MUSIC_ANALYZER_IDLE_INTERVAL_MS,
  MUSIC_ANALYZER_LEASE_HOLD_SAFETY_MS,
  MUSIC_ANALYZER_LEASE_SECONDS,
  MUSIC_ANALYZER_SHUTDOWN_DRAIN_MS,
} from "./constants";
import {
  formatMusicAnalyzerReleaseMismatchLog,
  formatMusicAnalyzerReleaseUnavailableLog,
  type MusicAnalyzerReleaseComparison,
} from "./worker-release";

export type ClaimedMusicAnalyzerRun = {
  id: string;
  lease_token: string;
  storage_bucket: string;
  storage_path: string;
  source_filename: string;
  mime_type: string;
  sha256: string;
  attempt_count: number;
};

export type MusicAnalyzerExecuteResult = {
  analyzerVersion: string;
  analyzerGitCommit: string;
  analyzerContentCommit: string;
  modelCheckpoint: string;
  taxonomyVersion: string | null;
  promptVersion: string | null;
  device: "cpu";
  rawJson: Record<string, unknown>;
  normalizedJson: Record<string, unknown>;
  provenance: Record<string, unknown>;
};

export type MusicAnalyzerWorkerPort = {
  recoverStaleJobs: () => Promise<void>;
  claimJob: () => Promise<ClaimedMusicAnalyzerRun | null>;
  renewLease: (job: ClaimedMusicAnalyzerRun) => Promise<boolean>;
  executeJob: (
    job: ClaimedMusicAnalyzerRun,
    signal: AbortSignal,
  ) => Promise<MusicAnalyzerExecuteResult>;
  completeJob: (
    job: ClaimedMusicAnalyzerRun,
    result: MusicAnalyzerExecuteResult,
  ) => Promise<boolean>;
  failJob: (job: ClaimedMusicAnalyzerRun, error: unknown) => Promise<boolean>;
  releaseJob: (job: ClaimedMusicAnalyzerRun) => Promise<boolean>;
};

export type MusicAnalyzerWorkerLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type MusicAnalyzerReleaseCheck = () =>
  | MusicAnalyzerReleaseComparison
  | Promise<MusicAnalyzerReleaseComparison>;

export type MusicAnalyzerWorkerOptions = {
  idleIntervalMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatRetryMs?: number;
  leaseHoldMs?: number;
  shutdownDrainMs?: number;
  now?: () => number;
  logger?: MusicAnalyzerWorkerLogger;
  checkRelease?: MusicAnalyzerReleaseCheck;
};

export function parseClaimedMusicAnalyzerRun(claimed: unknown): ClaimedMusicAnalyzerRun | null {
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job || typeof job !== "object") return null;
  const row = job as Partial<ClaimedMusicAnalyzerRun>;
  if (!row.id || !row.lease_token || !row.storage_path || !row.sha256 || !row.source_filename) {
    return null;
  }
  return {
    id: row.id,
    lease_token: row.lease_token,
    storage_bucket: row.storage_bucket || "music-analyzer-runs",
    storage_path: row.storage_path,
    source_filename: row.source_filename,
    mime_type: row.mime_type || "audio/wav",
    sha256: row.sha256,
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

function raceWithAbort<T>(
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
  job: ClaimedMusicAnalyzerRun,
  port: MusicAnalyzerWorkerPort,
  options: {
    intervalMs: number;
    retryMs: number;
    leaseHoldMs: number;
    now: () => number;
    logger: MusicAnalyzerWorkerLogger;
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
        event: "music_analyzer_lease_renew_retry",
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

export function createMusicAnalyzerWorker(
  port: MusicAnalyzerWorkerPort,
  options: MusicAnalyzerWorkerOptions = {},
): {
  run: () => Promise<void>;
  requestShutdown: () => void;
  isStopping: () => boolean;
} {
  const idleIntervalMs = options.idleIntervalMs ?? MUSIC_ANALYZER_IDLE_INTERVAL_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? MUSIC_ANALYZER_HEARTBEAT_INTERVAL_MS;
  const heartbeatRetryMs = options.heartbeatRetryMs ?? MUSIC_ANALYZER_HEARTBEAT_RETRY_MS;
  const leaseHoldMs = options.leaseHoldMs
    ?? (MUSIC_ANALYZER_LEASE_SECONDS * 1000 - MUSIC_ANALYZER_LEASE_HOLD_SAFETY_MS);
  const shutdownDrainMs = options.shutdownDrainMs ?? MUSIC_ANALYZER_SHUTDOWN_DRAIN_MS;
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

  async function inspectRelease(): Promise<MusicAnalyzerReleaseComparison> {
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

  function applyReleaseGate(comparison: MusicAnalyzerReleaseComparison): "ok" | "retry" | "exit" {
    if (comparison.state === "CURRENT") return "ok";
    if (comparison.state === "STALE") {
      logger.info(formatMusicAnalyzerReleaseMismatchLog(comparison));
      refreshExit = true;
      return "exit";
    }
    logger.info(formatMusicAnalyzerReleaseUnavailableLog(comparison.reason ?? "current_identity_unreadable"));
    return "retry";
  }

  async function handleJob(job: ClaimedMusicAnalyzerRun, abandon: { current: boolean }, jobAbort: AbortController) {
    let lostOwnership = false;
    const stopHeartbeat = startLeaseHeartbeat(job, port, {
      intervalMs: heartbeatIntervalMs,
      retryMs: heartbeatRetryMs,
      leaseHoldMs,
      now,
      logger,
      onLost: () => {
        lostOwnership = true;
        if (!jobAbort.signal.aborted) jobAbort.abort();
      },
    });
    try {
      let result: MusicAnalyzerExecuteResult;
      try {
        result = await port.executeJob(job, jobAbort.signal);
      } catch (error) {
        if (abandon.current || lostOwnership || (error instanceof Error && error.name === "MusicAnalyzerAbortedError")) {
          logger.info(JSON.stringify({ event: "music_analyzer_abandoned", jobId: job.id }));
          return;
        }
        const persisted = await port.failJob(job, error);
        logger.error(JSON.stringify({
          event: "music_analyzer_run_failed",
          jobId: job.id,
          persisted,
          code: error instanceof Error ? error.message : "analyze_failed",
        }));
        return;
      }
      if (abandon.current || lostOwnership || jobAbort.signal.aborted) {
        logger.info(JSON.stringify({ event: "music_analyzer_abandoned", jobId: job.id }));
        return;
      }
      try {
        const completed = await port.completeJob(job, result);
        logger.info(JSON.stringify({
          event: completed ? "music_analyzer_run_sealed" : "music_analyzer_seal_skipped",
          jobId: job.id,
        }));
      } catch (error) {
        await port.failJob(job, error);
        logger.error(JSON.stringify({
          event: "music_analyzer_seal_failed",
          jobId: job.id,
          error: error instanceof Error ? error.message : "unknown_error",
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
          logger.info(JSON.stringify({ event: "music_analyzer_shutdown_released", jobId: job.id }));
        }
        break;
      } catch (error) {
        logger.error(JSON.stringify({
          event: "music_analyzer_worker_loop_error",
          error: error instanceof Error ? error.message : "unknown_error",
        }));
        await sleep(idleIntervalMs, shutdown.signal);
      }
    }
  }

  return { run, requestShutdown, isStopping: () => stopping };
}
