import {
  PRODUCT_VIDEO_EXPORT_HEARTBEAT_INTERVAL_MS,
  PRODUCT_VIDEO_EXPORT_IDLE_INTERVAL_MS,
} from "./contract";
import {
  ProductVideoRenderAbortedError,
} from "./ffmpeg";
import type {
  ClaimedProductVideoRenderJob,
  ProductVideoRenderWorkerPort,
} from "./worker-runtime";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createProductVideoRenderWorker(
  port: ProductVideoRenderWorkerPort,
  options: {
    idleIntervalMs?: number;
    heartbeatIntervalMs?: number;
    maxJobs?: number;
  } = {},
) {
  const idleIntervalMs =
    options.idleIntervalMs ?? PRODUCT_VIDEO_EXPORT_IDLE_INTERVAL_MS;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ??
    PRODUCT_VIDEO_EXPORT_HEARTBEAT_INTERVAL_MS;
  let stopping = false;
  let completedJobs = 0;

  async function executeWithHeartbeat(job: ClaimedProductVideoRenderJob) {
    const abort = new AbortController();
    let heartbeatBusy = false;
    const timer = setInterval(() => {
      if (heartbeatBusy || abort.signal.aborted) return;
      heartbeatBusy = true;
      void port
        .renewLease(job)
        .then((owned) => {
          if (!owned && !abort.signal.aborted) abort.abort();
        })
        .catch(() => {
          // A transient heartbeat failure is retried on the next tick.
        })
        .finally(() => {
          heartbeatBusy = false;
        });
    }, heartbeatIntervalMs);

    try {
      const result = await port.executeJob(job, abort.signal);
      if (abort.signal.aborted) throw new ProductVideoRenderAbortedError();
      await port.completeJob(job, result);
    } catch (error) {
      await port.failJob(job, error);
    } finally {
      clearInterval(timer);
    }
  }

  async function run() {
    while (!stopping) {
      await port.recoverStaleJobs();
      const job = await port.claimJob();
      if (!job) {
        await sleep(idleIntervalMs);
        continue;
      }
      await executeWithHeartbeat(job);
      completedJobs += 1;
      if (options.maxJobs && completedJobs >= options.maxJobs) break;
    }
  }

  return {
    run,
    requestShutdown() {
      stopping = true;
    },
    isStopping() {
      return stopping;
    },
  };
}
