import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { MusicTranscodeAbortedError } from "../src/lib/music-transcode/ffmpeg";
import { MusicTranscodeCodedError } from "../src/lib/music-transcode/worker-runtime";
import {
  createMusicTranscodeWorker,
  parseClaimedMusicTranscodeJob,
  type ClaimedMusicTranscodeJob,
  type MusicTranscodeWorkerPort,
} from "../src/lib/music-transcode/worker";

function job(id: string, token = `token-${id}`): ClaimedMusicTranscodeJob {
  return { id, source_asset_id: "source", lease_token: token, attempt_count: 1 };
}

type RecordedPort = MusicTranscodeWorkerPort & {
  claims: string[];
  completed: string[];
  failed: string[];
  released: string[];
  recovered: number;
};

function createPort(overrides: Partial<MusicTranscodeWorkerPort> & {
  claimQueue?: Array<ClaimedMusicTranscodeJob | null>;
}): RecordedPort {
  const queue = overrides.claimQueue ? [...overrides.claimQueue] : [];
  const recorded: RecordedPort = {
    claims: [],
    completed: [],
    failed: [],
    released: [],
    recovered: 0,
    async recoverStaleJobs() {
      recorded.recovered += 1;
      if (overrides.recoverStaleJobs) return overrides.recoverStaleJobs();
    },
    async claimJob() {
      if (overrides.claimJob) return overrides.claimJob();
      const next = queue.length > 0 ? queue.shift() ?? null : null;
      recorded.claims.push(next ? next.id : "idle");
      return next;
    },
    async renewLease(claimed) {
      if (overrides.renewLease) return overrides.renewLease(claimed);
      return true;
    },
    async executeJob(claimed, signal) {
      if (overrides.executeJob) return overrides.executeJob(claimed, signal);
      return { outputAssetId: `stream-${claimed.id}`, sizeBytes: 32, durationSeconds: 1 };
    },
    async completeJob(claimed, result) {
      recorded.completed.push(claimed.id);
      if (overrides.completeJob) return overrides.completeJob(claimed, result);
      return true;
    },
    async failJob(claimed) {
      recorded.failed.push(claimed.id);
      if (overrides.failJob) return overrides.failJob(claimed, new Error("x"));
      return true;
    },
    async releaseJob(claimed) {
      recorded.released.push(claimed.id);
      if (overrides.releaseJob) return overrides.releaseJob(claimed);
      return true;
    },
  };
  return recorded;
}

async function runUntil(port: RecordedPort, predicate: () => boolean, extra: Parameters<typeof createMusicTranscodeWorker>[1] = {}) {
  const worker = createMusicTranscodeWorker(port, {
    idleIntervalMs: 15,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 80,
    logger: { info() {}, error() {} },
    ...extra,
  });
  const running = worker.run();
  const start = Date.now();
  while (!predicate() && Date.now() - start < 1500) {
    await delay(10);
  }
  worker.requestShutdown();
  await running;
  return worker;
}

assert.equal(parseClaimedMusicTranscodeJob({
  id: "j1",
  source_asset_id: "s1",
  lease_token: "tok",
  attempt_count: 2,
})?.id, "j1");
assert.equal(parseClaimedMusicTranscodeJob({ id: "j1" }), null);

{
  const first = job("a");
  const port = createPort({ claimQueue: [first, null] });
  await runUntil(port, () => port.completed.includes("a"));
  assert.deepEqual(port.completed, ["a"]);
  assert.equal(port.failed.length, 0);
  assert.ok(port.recovered >= 1);
}

{
  const claimed = job("fail");
  const port = createPort({
    claimQueue: [claimed, null],
    async executeJob() {
      throw new MusicTranscodeCodedError("transcode_failed");
    },
  });
  await runUntil(port, () => port.failed.includes("fail"));
  assert.deepEqual(port.failed, ["fail"]);
  assert.equal(port.completed.length, 0);
}

{
  const claimed = job("lost");
  const port = createPort({
    claimQueue: [claimed, null],
    async completeJob() { return false; },
  });
  await runUntil(port, () => port.completed.includes("lost"));
  assert.deepEqual(port.completed, ["lost"]);
}

{
  const claimed = job("reuse");
  const port = createPort({
    claimQueue: [claimed, null],
    async executeJob() {
      return { outputAssetId: "existing-stream", sizeBytes: 16, durationSeconds: 1 };
    },
  });
  await runUntil(port, () => port.completed.includes("reuse"));
  assert.deepEqual(port.completed, ["reuse"]);
}

{
  const claimed = job("lost-hb");
  let started = false;
  let aborted = false;
  const port = createPort({
    claimQueue: [claimed],
    async renewLease() {
      return false;
    },
    async executeJob(_job, signal) {
      started = true;
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          aborted = true;
          resolve();
          return;
        }
        signal.addEventListener("abort", () => {
          aborted = true;
          resolve();
        });
      });
      throw new MusicTranscodeAbortedError();
    },
  });
  const worker = createMusicTranscodeWorker(port, {
    idleIntervalMs: 10,
    heartbeatIntervalMs: 20,
    heartbeatRetryMs: 20,
    leaseHoldMs: 10_000,
    shutdownDrainMs: 200,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  const start = Date.now();
  while (!started && Date.now() - start < 1000) await delay(5);
  while (!aborted && Date.now() - start < 1500) await delay(10);
  worker.requestShutdown();
  await running;
  assert.equal(started, true);
  assert.equal(aborted, true);
  assert.equal(port.completed.length, 0);
  assert.equal(port.failed.length, 0);
}

{
  const claimed = job("drain");
  let started = false;
  const port = createPort({
    claimQueue: [claimed],
    async executeJob(_job, signal) {
      started = true;
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        signal.addEventListener("abort", () => resolve());
      });
      throw new Error("should_not_complete");
    },
  });
  const worker = createMusicTranscodeWorker(port, {
    idleIntervalMs: 10,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 30,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  while (!started) await delay(5);
  worker.requestShutdown();
  await running;
  assert.equal(port.completed.length, 0);
  assert.ok(port.released.includes("drain") || port.failed.length === 0);
}

console.log("music-transcode-worker-unit: ok");
