import {
  PRODUCT_AUDIO_NORMALIZE_HEARTBEAT_INTERVAL_MS,
  PRODUCT_AUDIO_NORMALIZE_IDLE_INTERVAL_MS,
  PRODUCT_AUDIO_NORMALIZE_LEASE_SECONDS,
  PRODUCT_AUDIO_NORMALIZE_SHUTDOWN_DRAIN_MS,
} from "./contract";
import { ProductNormalizeAbortedError } from "./ffmpeg";

export type ClaimedProductNormalizeJob = {
  id: string;
  practice_id: string;
  audio_item_id: string;
  source_storage_path: string;
  source_format: "m4a" | "aac" | "wav";
  source_original_filename: string;
  source_file_size_bytes: number;
  target_storage_path: string;
  previous_audio_path: string | null;
  lease_token: string;
  attempt_count: number;
};

export type ProductNormalizeExecuteResult = {
  targetStoragePath: string;
  sizeBytes: number;
  durationSeconds: number;
  originalFileName: string;
  productStatus: "draft" | "published";
  cleanupPaths: string[];
};

export type ProductNormalizeWorkerLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type ProductNormalizeCleanupDecision = {
  outcome: string;
  finalStatus: string | null;
  cleanupSource: boolean;
  cleanupTarget: boolean;
  cleanupPrevious: boolean;
  previousAudioPath: string | null;
  sourceStoragePath: string | null;
  targetStoragePath: string | null;
};

export type ProductNormalizeWorkerPort = {
  recoverStaleJobs: () => Promise<void>;
  claimJob: () => Promise<ClaimedProductNormalizeJob | null>;
  renewLease: (job: ClaimedProductNormalizeJob) => Promise<boolean>;
  executeJob: (
    job: ClaimedProductNormalizeJob,
    signal: AbortSignal,
  ) => Promise<ProductNormalizeExecuteResult>;
  completeJob: (
    job: ClaimedProductNormalizeJob,
    result: ProductNormalizeExecuteResult,
  ) => Promise<ProductNormalizeCleanupDecision>;
  failJob: (
    job: ClaimedProductNormalizeJob,
    error: unknown,
  ) => Promise<ProductNormalizeCleanupDecision>;
  /** Server-authoritative interrupt / lease-loss resolution. */
  resolveInterrupt: (
    job: ClaimedProductNormalizeJob,
  ) => Promise<ProductNormalizeCleanupDecision>;
  /**
   * Remove existing job.target_storage_path only while this attempt owns the
   * current lease. Must no-op (and not remove) if lease check is false.
   */
  cleanupStaleTarget: (job: ClaimedProductNormalizeJob) => Promise<void>;
  cleanupPaths: (paths: readonly string[]) => Promise<void>;
  pathsForCleanupDecision: (
    job: ClaimedProductNormalizeJob,
    decision: ProductNormalizeCleanupDecision,
  ) => string[];
};

export type ProductNormalizeReleaseCheck = () => Promise<{
  state: "CURRENT" | "STALE" | "UNKNOWN";
}>;

export type ProductNormalizeWorkerOptions = {
  idleIntervalMs?: number;
  heartbeatIntervalMs?: number;
  leaseHoldMs?: number;
  shutdownDrainMs?: number;
  /** Process at most N jobs then exit (tests / single-run). */
  maxJobs?: number;
  now?: () => number;
  logger?: ProductNormalizeWorkerLogger;
  checkRelease?: ProductNormalizeReleaseCheck;
};

export type ProductNormalizeWorker = {
  run: () => Promise<void>;
  requestShutdown: () => void;
  isStopping: () => boolean;
};

export function parseClaimedProductNormalizeJob(
  claimed: unknown,
): ClaimedProductNormalizeJob | null {
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job || typeof job !== "object") return null;
  const row = job as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.practice_id !== "string" ||
    typeof row.audio_item_id !== "string" ||
    typeof row.source_storage_path !== "string" ||
    (row.source_format !== "m4a" &&
      row.source_format !== "aac" &&
      row.source_format !== "wav") ||
    typeof row.source_original_filename !== "string" ||
    typeof row.target_storage_path !== "string" ||
    typeof row.lease_token !== "string" ||
    !row.lease_token
  ) {
    return null;
  }
  const size = Number(row.source_file_size_bytes);
  return {
    id: row.id,
    practice_id: row.practice_id,
    audio_item_id: row.audio_item_id,
    source_storage_path: row.source_storage_path,
    source_format: row.source_format,
    source_original_filename: row.source_original_filename,
    source_file_size_bytes: Number.isFinite(size) ? size : 0,
    target_storage_path: row.target_storage_path,
    previous_audio_path:
      typeof row.previous_audio_path === "string" ? row.previous_audio_path : null,
    lease_token: row.lease_token,
    attempt_count: typeof row.attempt_count === "number" ? row.attempt_count : 0,
  };
}

function isProductNormalizeAbort(error: unknown, aborted: boolean): boolean {
  if (aborted) return true;
  if (error instanceof ProductNormalizeAbortedError) return true;
  return (
    typeof error === "object" &&
    error != null &&
    "name" in error &&
    (error as { name: string }).name === "ProductNormalizeAbortedError"
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function startLeaseHeartbeat(
  job: ClaimedProductNormalizeJob,
  port: ProductNormalizeWorkerPort,
  options: {
    intervalMs: number;
    leaseHoldMs: number;
    now: () => number;
    logger: ProductNormalizeWorkerLogger;
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
          event: "product_audio_normalize_lease_renew_retry",
          jobId: job.id,
          error: error instanceof Error ? error.message : "unknown_error",
        }),
      );
      if (options.now() - lastSuccessAt >= options.leaseHoldMs) {
        options.onLost();
        return;
      }
      schedule(Math.min(5_000, options.intervalMs));
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

export function createProductAudioNormalizeWorker(
  port: ProductNormalizeWorkerPort,
  options: ProductNormalizeWorkerOptions = {},
): ProductNormalizeWorker {
  const idleIntervalMs =
    options.idleIntervalMs ?? PRODUCT_AUDIO_NORMALIZE_IDLE_INTERVAL_MS;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? PRODUCT_AUDIO_NORMALIZE_HEARTBEAT_INTERVAL_MS;
  const leaseHoldMs =
    options.leaseHoldMs ?? PRODUCT_AUDIO_NORMALIZE_LEASE_SECONDS * 1000;
  const shutdownDrainMs =
    options.shutdownDrainMs ?? PRODUCT_AUDIO_NORMALIZE_SHUTDOWN_DRAIN_MS;
  const maxJobs = options.maxJobs;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? {
    info: (message) => console.log(message),
    error: (message) => console.error(message),
  };

  let stopping = false;
  const shutdownController = new AbortController();

  return {
    requestShutdown() {
      stopping = true;
      shutdownController.abort();
    },
    isStopping() {
      return stopping;
    },
    async run() {
      let processed = 0;
      await port.recoverStaleJobs();
      while (!stopping) {
        if (options.checkRelease) {
          try {
            const comparison = await options.checkRelease();
            if (comparison.state === "STALE") {
              logger.info(
                JSON.stringify({
                  event: "product_audio_normalize_release_mismatch",
                }),
              );
              stopping = true;
              break;
            }
          } catch (error) {
            logger.info(
              JSON.stringify({
                event: "product_audio_normalize_release_guard_unavailable",
                reason:
                  error instanceof Error ? error.message : "release_check_failed",
              }),
            );
          }
        }
        if (maxJobs != null && processed >= maxJobs) break;
        const job = await port.claimJob();
        if (!job) {
          if (maxJobs != null) break;
          await sleep(idleIntervalMs, shutdownController.signal);
          continue;
        }

        logger.info(
          JSON.stringify({
            event: "product_audio_normalize_job_claimed",
            jobId: job.id,
            audioItemId: job.audio_item_id,
            sourceFormat: job.source_format,
            attempt: job.attempt_count,
          }),
        );

        const jobAbort = new AbortController();
        const stopHeartbeat = startLeaseHeartbeat(job, port, {
          intervalMs: heartbeatIntervalMs,
          leaseHoldMs,
          now,
          logger,
          onLost: () => jobAbort.abort(),
        });

        try {
          const applyDecision = async (
            decision: ProductNormalizeCleanupDecision,
          ) => {
            await port.cleanupPaths(port.pathsForCleanupDecision(job, decision));
          };

          const ownedBeforeCleanup = await port.renewLease(job);
          if (!ownedBeforeCleanup || jobAbort.signal.aborted) {
            await applyDecision(await port.resolveInterrupt(job));
            continue;
          }
          try {
            await port.cleanupStaleTarget(job);
          } catch (cleanupError) {
            if (isProductNormalizeAbort(cleanupError, jobAbort.signal.aborted)) {
              await applyDecision(await port.resolveInterrupt(job));
            } else {
              const decision = await port.failJob(job, cleanupError);
              await applyDecision(decision);
              logger.error(
                JSON.stringify({
                  event: "product_audio_normalize_stale_target_cleanup_failed",
                  jobId: job.id,
                  finalStatus: decision.finalStatus,
                  error:
                    cleanupError instanceof Error
                      ? cleanupError.message
                      : "unknown_error",
                }),
              );
            }
            continue;
          }
          const ownedAfterCleanup = await port.renewLease(job);
          if (!ownedAfterCleanup || jobAbort.signal.aborted) {
            await applyDecision(await port.resolveInterrupt(job));
            continue;
          }

          const result = await port.executeJob(job, jobAbort.signal);
          if (jobAbort.signal.aborted) {
            await applyDecision(await port.resolveInterrupt(job));
            continue;
          }
          const completion = await port.completeJob(job, result);
          await applyDecision(completion);
          logger.info(
            JSON.stringify({
              event: "product_audio_normalize_job_finished",
              jobId: job.id,
              outcome: completion.outcome,
              applied: completion.outcome === "applied" || completion.outcome === "already_ready",
            }),
          );
        } catch (error) {
          if (isProductNormalizeAbort(error, jobAbort.signal.aborted)) {
            const decision = await port.resolveInterrupt(job);
            await port.cleanupPaths(port.pathsForCleanupDecision(job, decision));
          } else {
            const decision = await port.failJob(job, error);
            await port.cleanupPaths(port.pathsForCleanupDecision(job, decision));
            logger.error(
              JSON.stringify({
                event: "product_audio_normalize_job_failed",
                jobId: job.id,
                finalStatus: decision.finalStatus,
                error: error instanceof Error ? error.message : "unknown_error",
              }),
            );
          }
        } finally {
          stopHeartbeat();
          processed += 1;
        }
      }

      if (stopping) {
        await sleep(Math.min(100, shutdownDrainMs));
      }
    },
  };
}
