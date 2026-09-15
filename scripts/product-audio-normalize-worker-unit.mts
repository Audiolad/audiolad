import assert from "node:assert/strict";

import { ProductNormalizeAbortedError } from "../src/lib/product-audio-normalize/ffmpeg";
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

function decision(
  partial: Partial<ProductNormalizeCleanupDecision> & Pick<ProductNormalizeCleanupDecision, "outcome">,
): ProductNormalizeCleanupDecision {
  return {
    finalStatus: null,
    cleanupSource: false,
    cleanupTarget: false,
    cleanupPrevious: false,
    previousAudioPath: null,
    sourceStoragePath: null,
    targetStoragePath: null,
    ...partial,
  };
}

function pathsFor(
  job: ClaimedProductNormalizeJob,
  d: ProductNormalizeCleanupDecision,
): string[] {
  const paths: string[] = [];
  const source = d.sourceStoragePath ?? (d.cleanupSource ? job.source_storage_path : null);
  const target = d.targetStoragePath ?? (d.cleanupTarget ? job.target_storage_path : null);
  if (d.cleanupSource && source) paths.push(source);
  if (d.cleanupTarget && target) paths.push(target);
  if (d.cleanupPrevious && d.previousAudioPath && d.previousAudioPath !== target) {
    paths.push(d.previousAudioPath);
  }
  return paths;
}

assert.equal(parseClaimedProductNormalizeJob(null), null);

function successResult(job: ClaimedProductNormalizeJob): ProductNormalizeExecuteResult {
  return {
    targetStoragePath: job.target_storage_path,
    sizeBytes: 10,
    durationSeconds: 2,
    originalFileName: "t.m4a",
    productStatus: "draft",
    cleanupPaths: [],
  };
}

function claimOnce(job: ClaimedProductNormalizeJob) {
  let claimed = true;
  return async () => {
    if (!claimed) return null;
    claimed = false;
    return job;
  };
}

function makePort(
  job: ClaimedProductNormalizeJob,
  overrides: Partial<ProductNormalizeWorkerPort>,
): ProductNormalizeWorkerPort {
  return {
    async recoverStaleJobs() {},
    claimJob: claimOnce(job),
    async renewLease() {
      return true;
    },
    async cleanupStaleTarget() {},
    async executeJob() {
      return successResult(job);
    },
    async completeJob() {
      throw new Error("no");
    },
    async failJob() {
      throw new Error("no");
    },
    async resolveInterrupt() {
      throw new Error("no");
    },
    pathsForCleanupDecision: pathsFor,
    async cleanupPaths() {},
    ...overrides,
  };
}

async function runOnce(port: ProductNormalizeWorkerPort) {
  await createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    heartbeatIntervalMs: 60_000,
    leaseHoldMs: 60_000,
    logger: { info() {}, error() {} },
  }).run();
}

// 1) Applied success: source+previous cleaned, live target kept.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async completeJob() {
        return decision({
          outcome: "applied",
          finalStatus: "ready",
          cleanupSource: true,
          cleanupTarget: false,
          cleanupPrevious: true,
          previousAudioPath: job.previous_audio_path,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(
    cleaned[0].sort(),
    [job.source_storage_path, job.previous_audio_path!].sort(),
  );
  assert.equal(cleaned[0].includes(job.target_storage_path), false);
}

// 2) Foreign lease complete: delete NOTHING.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async completeJob() {
        return decision({
          outcome: "foreign_lease",
          finalStatus: "processing",
          cleanupSource: false,
          cleanupTarget: false,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(cleaned[0], []);
}

// 3) Superseded complete: source+orphan target cleaned; previous/live kept.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async completeJob() {
        return decision({
          outcome: "superseded",
          finalStatus: "superseded",
          cleanupSource: true,
          cleanupTarget: true,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(
    cleaned[0].sort(),
    [job.source_storage_path, job.target_storage_path].sort(),
  );
  assert.equal(cleaned[0].includes(job.previous_audio_path!), false);
}

// 4) Expired requeue: source AND shared target remain (post-RPC cleanup_target=false).
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async completeJob() {
        return decision({
          outcome: "expired_requeued",
          finalStatus: "queued",
          cleanupSource: false,
          cleanupTarget: false,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(cleaned[0], []);
}

// 5) already_ready / response-lost: live target never deleted; source+previous ok.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async completeJob() {
        return decision({
          outcome: "already_ready",
          finalStatus: "ready",
          cleanupSource: true,
          cleanupTarget: false,
          cleanupPrevious: true,
          previousAudioPath: job.previous_audio_path,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(
    cleaned[0].sort(),
    [job.source_storage_path, job.previous_audio_path!].sort(),
  );
  assert.equal(cleaned[0].includes(job.target_storage_path), false);
}

// 6) Transient fail → queued: source AND target kept for next claim.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async executeJob() {
        throw new Error("normalize_failed");
      },
      async failJob() {
        return decision({
          outcome: "queued",
          finalStatus: "queued",
          cleanupSource: false,
          cleanupTarget: false,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(cleaned[0], []);
}

// 7) Fail after already_ready (response lost then fail): target kept.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async executeJob() {
        throw new Error("network_after_commit");
      },
      async failJob() {
        return decision({
          outcome: "already_ready",
          finalStatus: "ready",
          cleanupSource: true,
          cleanupTarget: false,
          cleanupPrevious: true,
          previousAudioPath: job.previous_audio_path,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.equal(cleaned[0].includes(job.target_storage_path), false);
  assert.ok(cleaned[0].includes(job.source_storage_path));
}

// 8) Missing/invalid → cleanup NOTHING.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async completeJob() {
        return decision({ outcome: "missing" });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(cleaned[0], []);
}

// Released interrupt: no shared-target cleanup.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async executeJob() {
        throw new ProductNormalizeAbortedError();
      },
      async resolveInterrupt() {
        return decision({
          outcome: "released",
          finalStatus: "queued",
          cleanupSource: false,
          cleanupTarget: false,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(cleaned[0], []);
}

// Terminal failed cleanup remains source+target.
{
  const cleaned: string[][] = [];
  const job = baseJob();
  await runOnce(
    makePort(job, {
      async executeJob() {
        throw new Error("normalize_failed");
      },
      async failJob() {
        return decision({
          outcome: "failed",
          finalStatus: "failed",
          cleanupSource: true,
          cleanupTarget: true,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.deepEqual(
    cleaned[0].sort(),
    [job.source_storage_path, job.target_storage_path].sort(),
  );
}

// Next attempt removes stale target only while owning current lease.
{
  const job = baseJob();
  let staleCleanup = 0;
  let uploaded = 0;
  await runOnce(
    makePort(job, {
      async cleanupStaleTarget() {
        staleCleanup += 1;
      },
      async executeJob() {
        uploaded += 1;
        return successResult(job);
      },
      async completeJob() {
        return decision({
          outcome: "applied",
          finalStatus: "ready",
          cleanupSource: true,
          cleanupTarget: false,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
    }),
  );
  assert.equal(staleCleanup, 1);
  assert.equal(uploaded, 1);
}

// Foreign lease during pre-attempt cleanup: remove NOT executed, execute/upload skipped.
{
  const job = baseJob();
  let removed = 0;
  let executed = 0;
  await runOnce(
    makePort(job, {
      async renewLease() {
        return false;
      },
      async cleanupStaleTarget() {
        removed += 1;
      },
      async executeJob() {
        executed += 1;
        return successResult(job);
      },
      async resolveInterrupt() {
        return decision({
          outcome: "foreign_lease",
          finalStatus: "processing",
        });
      },
    }),
  );
  assert.equal(removed, 0);
  assert.equal(executed, 0);
}

// cleanupStaleTarget throws abort: no execute, interrupt resolution, no target delete from retry flags.
{
  const job = baseJob();
  let executed = 0;
  const cleaned: string[][] = [];
  await runOnce(
    makePort(job, {
      async cleanupStaleTarget() {
        throw new ProductNormalizeAbortedError();
      },
      async executeJob() {
        executed += 1;
        return successResult(job);
      },
      async resolveInterrupt() {
        return decision({
          outcome: "foreign_lease",
          finalStatus: "processing",
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.equal(executed, 0);
  assert.deepEqual(cleaned[0], []);
}

// Stale-target Storage error → fail/retry, source kept, execute skipped.
{
  const job = baseJob();
  let executed = 0;
  const cleaned: string[][] = [];
  await runOnce(
    makePort(job, {
      async cleanupStaleTarget() {
        throw new Error("stale_target_cleanup_failed");
      },
      async executeJob() {
        executed += 1;
        return successResult(job);
      },
      async failJob() {
        return decision({
          outcome: "queued",
          finalStatus: "queued",
          cleanupSource: false,
          cleanupTarget: false,
          sourceStoragePath: job.source_storage_path,
          targetStoragePath: job.target_storage_path,
        });
      },
      async cleanupPaths(paths) {
        cleaned.push([...paths]);
      },
    }),
  );
  assert.equal(executed, 0);
  assert.deepEqual(cleaned[0], []);
}

console.log("product-audio-normalize-worker-unit: ok");
