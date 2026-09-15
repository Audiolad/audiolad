import assert from "node:assert/strict";

import {
  createProductAudioNormalizeWorker,
  parseClaimedProductNormalizeJob,
  type ClaimedProductNormalizeJob,
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

assert.equal(parseClaimedProductNormalizeJob(null), null);
assert.equal(
  parseClaimedProductNormalizeJob(baseJob())?.source_format,
  "m4a",
);

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
        cleanupPaths: [job.target_storage_path],
      } satisfies ProductNormalizeExecuteResult;
    },
    async completeJob(_job, result) {
      return {
        applied: true,
        cleanupPaths: [
          job.source_storage_path,
          job.previous_audio_path!,
          result.targetStoragePath,
        ].filter((p) => p !== result.targetStoragePath),
      };
    },
    async failJob() {
      return true;
    },
    async releaseJob() {
      return true;
    },
    async cleanupPaths(paths) {
      cleaned.push([...paths]);
    },
  };

  const worker = createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    idleIntervalMs: 10,
    logger: { info() {}, error() {} },
  });
  await worker.run();
  assert.equal(cleaned.length, 1);
  assert.ok(cleaned[0].includes(job.source_storage_path));
  assert.ok(cleaned[0].includes(job.previous_audio_path!));
  assert.equal(cleaned[0].includes(job.target_storage_path), false);
}

{
  const cleaned: string[][] = [];
  const job = baseJob({ id: "99999999-9999-4999-8999-999999999999" });
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
        sizeBytes: 100,
        durationSeconds: 5,
        originalFileName: "x.m4a",
        productStatus: "draft",
        cleanupPaths: [],
      };
    },
    async completeJob() {
      // Stale: B already desired; A must not swap — cleanup target+source only.
      return {
        applied: false,
        cleanupPaths: [job.target_storage_path, job.source_storage_path],
      };
    },
    async failJob() {
      return true;
    },
    async releaseJob() {
      return true;
    },
    async cleanupPaths(paths) {
      cleaned.push([...paths]);
    },
  };
  const worker = createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    logger: { info() {}, error() {} },
  });
  await worker.run();
  assert.deepEqual(cleaned[0].sort(), [job.source_storage_path, job.target_storage_path].sort());
  assert.equal(cleaned[0].includes(job.previous_audio_path!), false);
}

{
  let failed = false;
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
      throw new Error("normalize_failed");
    },
    async completeJob() {
      throw new Error("should_not_complete");
    },
    async failJob() {
      failed = true;
      return true;
    },
    async releaseJob() {
      return false;
    },
    async cleanupPaths() {},
  };
  const worker = createProductAudioNormalizeWorker(port, {
    maxJobs: 1,
    logger: { info() {}, error() {} },
  });
  await worker.run();
  assert.equal(failed, true);
}

console.log("product-audio-normalize-worker-unit: ok");
