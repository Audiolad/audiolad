import assert from "node:assert/strict";

import {
  createProductAudioNormalizeWorker,
  parseClaimedProductNormalizeJob,
  type ClaimedProductNormalizeJob,
  type ProductNormalizeCleanupDecision,
  type ProductNormalizeExecuteResult,
  type ProductNormalizeWorkerPort,
} from "../src/lib/product-audio-normalize/worker";

function baseJob(overrides: Partial<ClaimedProductNormalizeJob> = {}): ClaimedProductNormalizeJob {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    practice_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    audio_item_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    source_storage_path:
      "practices/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/audio-sources/cccccccc-cccc-4ccc-8ccc-cccccccccccc-dddddddd-dddd-4ddd-8ddd-dddddddddddd.m4a",
    source_format: "m4a",
    source_original_filename: "track.m4a",
    source_file_size_bytes: 1024,
    target_storage_path:
      "practices/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/audio/cccccccc-cccc-4ccc-8ccc-cccccccccccc-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.mp3",
    previous_audio_path:
      "practices/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/audio/cccccccc-cccc-4ccc-8ccc-cccccccccccc-ffffffff-ffff-4fff-8fff-ffffffffffff.mp3",
    lease_token: "11111111-1111-4111-8111-111111111111",
    attempt_count: 1,
    ...overrides,
  };
}

function pathsFor(
  job: ClaimedProductNormalizeJob,
  decision: ProductNormalizeCleanupDecision,
): string[] {
  const paths: string[] = [];
  if (decision.cleanupSource) paths.push(job.source_storage_path);
  if (decision.cleanupTarget) paths.push(job.target_storage_path);
  return paths;
}

assert.equal(parseClaimedProductNormalizeJob(null), null);

// Success: applied cleanup excludes live target, includes source+previous via completeJob.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  let claimed = true;
  const port: ProductNormalizeWorkerPort = {
    async recoverStaleJobs() {},
    async claimJob() {
      if (!claimed) return null;
      claimed = false;
      return job;
    },
    async renewLease() {
      return true;
    },
    async executeJob() {
      return {
        targetStoragePath: job.target_storage_path,
        sizeBytes: 2048,
        durationSeconds: 10,
        originalFileName: job.source_original_filename,
        productStatus: "draft",
        cleanupPaths: [],
      } satisfies ProductNormalizeExecuteResult;
    },
    async completeJob() {
      return {
        applied: true,
        cleanupPaths: [job.source_storage_path, job.previous_audio_path!],
      };
    },
    async failJob() {
      throw new Error("unexpected fail");
    },
    async resolveInterrupt() {
      throw new Error("unexpected interrupt");
    },
    pathsForCleanupDecision: pathsFor,
    async cleanupPaths(paths) {
      cleaned.push([...paths]);
    },
  };
  await createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    logger: { info() {}, error() {} },
  }).run();
  assert.deepEqual(cleaned[0].sort(), [job.source_storage_path, job.previous_audio_path!].sort());
}

// Transient fail → queued: SOURCE retained, target cleaned.
{
  const cleaned: string[][] = [];
  const job = baseJob({ attempt_count: 1 });
  let claimed = true;
  const port: ProductNormalizeWorkerPort = {
    async recoverStaleJobs() {},
    async claimJob() {
      if (!claimed) return null;
      claimed = false;
      return job;
    },
    async renewLease() {
      return true;
    },
    async executeJob() {
      throw new Error("normalize_failed");
    },
    async completeJob() {
      throw new Error("no complete");
    },
    async failJob() {
      return {
        outcome: "queued",
        finalStatus: "queued",
        cleanupSource: false,
        cleanupTarget: true,
      };
    },
    async resolveInterrupt() {
      throw new Error("unexpected interrupt");
    },
    pathsForCleanupDecision: pathsFor,
    async cleanupPaths(paths) {
      cleaned.push([...paths]);
    },
  };
  await createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    logger: { info() {}, error() {} },
  }).run();
  assert.deepEqual(cleaned[0], [job.target_storage_path]);
  assert.equal(cleaned[0].includes(job.source_storage_path), false);
}

// Terminal fail: source + target cleaned; previous delivery not in fail cleanup.
{
  const cleaned: string[][] = [];
  const job = baseJob({ attempt_count: 3 });
  let claimed = true;
  const port: ProductNormalizeWorkerPort = {
    async recoverStaleJobs() {},
    async claimJob() {
      if (!claimed) return null;
      claimed = false;
      return job;
    },
    async renewLease() {
      return true;
    },
    async executeJob() {
      throw new Error("normalize_failed");
    },
    async completeJob() {
      throw new Error("no complete");
    },
    async failJob() {
      return {
        outcome: "failed",
        finalStatus: "failed",
        cleanupSource: true,
        cleanupTarget: true,
      };
    },
    async resolveInterrupt() {
      throw new Error("unexpected interrupt");
    },
    pathsForCleanupDecision: pathsFor,
    async cleanupPaths(paths) {
      cleaned.push([...paths]);
    },
  };
  await createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    logger: { info() {}, error() {} },
  }).run();
  assert.deepEqual(
    cleaned[0].sort(),
    [job.source_storage_path, job.target_storage_path].sort(),
  );
  assert.equal(cleaned[0].includes(job.previous_audio_path!), false);
}

// Lease lost / superseded interrupt: cleanup A source+target, not previous delivery.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  let claimed = true;
  const port: ProductNormalizeWorkerPort = {
    async recoverStaleJobs() {},
    async claimJob() {
      if (!claimed) return null;
      claimed = false;
      return job;
    },
    async renewLease() {
      return false;
    },
    async executeJob(_job, signal) {
      // Simulate lease heartbeat abort before work finishes.
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (signal.aborted) {
        const { ProductNormalizeAbortedError } = await import(
          "../src/lib/product-audio-normalize/ffmpeg"
        );
        throw new ProductNormalizeAbortedError();
      }
      return {
        targetStoragePath: job.target_storage_path,
        sizeBytes: 1,
        durationSeconds: 1,
        originalFileName: "x.m4a",
        productStatus: "draft",
        cleanupPaths: [],
      };
    },
    async completeJob() {
      throw new Error("no complete");
    },
    async failJob() {
      throw new Error("no fail");
    },
    async resolveInterrupt() {
      return {
        outcome: "superseded",
        finalStatus: "superseded",
        cleanupSource: true,
        cleanupTarget: true,
      };
    },
    pathsForCleanupDecision: pathsFor,
    async cleanupPaths(paths) {
      cleaned.push([...paths]);
    },
  };
  await createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    heartbeatIntervalMs: 5,
    leaseHoldMs: 1,
    logger: { info() {}, error() {} },
  }).run();
  assert.ok(cleaned.length >= 1);
  const last = cleaned[cleaned.length - 1];
  assert.deepEqual(last.sort(), [job.source_storage_path, job.target_storage_path].sort());
  assert.equal(last.includes(job.previous_audio_path!), false);
}

// Transient lease loss / requeue: SOURCE not deleted.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  let claimed = true;
  const port: ProductNormalizeWorkerPort = {
    async recoverStaleJobs() {},
    async claimJob() {
      if (!claimed) return null;
      claimed = false;
      return job;
    },
    async renewLease() {
      return false;
    },
    async executeJob(_job, signal) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (signal.aborted) {
        const { ProductNormalizeAbortedError } = await import(
          "../src/lib/product-audio-normalize/ffmpeg"
        );
        throw new ProductNormalizeAbortedError();
      }
      throw new Error("unreachable");
    },
    async completeJob() {
      throw new Error("no");
    },
    async failJob() {
      throw new Error("no");
    },
    async resolveInterrupt() {
      return {
        outcome: "requeued",
        finalStatus: "queued",
        cleanupSource: false,
        cleanupTarget: true,
      };
    },
    pathsForCleanupDecision: pathsFor,
    async cleanupPaths(paths) {
      cleaned.push([...paths]);
    },
  };
  await createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    heartbeatIntervalMs: 5,
    leaseHoldMs: 1,
    logger: { info() {}, error() {} },
  }).run();
  const last = cleaned[cleaned.length - 1];
  assert.deepEqual(last, [job.target_storage_path]);
}

// Foreign lease: delete nothing.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  let claimed = true;
  const port: ProductNormalizeWorkerPort = {
    async recoverStaleJobs() {},
    async claimJob() {
      if (!claimed) return null;
      claimed = false;
      return job;
    },
    async renewLease() {
      return false;
    },
    async executeJob(_job, signal) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (signal.aborted) {
        const { ProductNormalizeAbortedError } = await import(
          "../src/lib/product-audio-normalize/ffmpeg"
        );
        throw new ProductNormalizeAbortedError();
      }
      throw new Error("unreachable");
    },
    async completeJob() {
      throw new Error("no");
    },
    async failJob() {
      throw new Error("no");
    },
    async resolveInterrupt() {
      return {
        outcome: "foreign_lease",
        finalStatus: "processing",
        cleanupSource: false,
        cleanupTarget: false,
      };
    },
    pathsForCleanupDecision: pathsFor,
    async cleanupPaths(paths) {
      cleaned.push([...paths]);
    },
  };
  await createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    heartbeatIntervalMs: 5,
    leaseHoldMs: 1,
    logger: { info() {}, error() {} },
  }).run();
  assert.deepEqual(cleaned[cleaned.length - 1], []);
}

console.log("product-audio-normalize-worker-unit: ok");
