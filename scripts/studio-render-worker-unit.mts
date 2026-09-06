import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import {
  createStudioRenderWorker,
  parseClaimedStudioRenderJob,
  type ClaimedStudioRenderJob,
  type StudioRenderWorkerPort,
} from "../src/lib/studio/render/worker";

const snapshot = {
  project: { id: "project", revision: 1, name: "Test", schemaVersion: 2, studioVersion: 1 },
  tracks: [],
  assets: [],
};

function job(id: string, token = `token-${id}`): ClaimedStudioRenderJob {
  return {
    id,
    project_id: "project",
    guest_session_id: null,
    lease_token: token,
    project_snapshot: snapshot,
  };
}

function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

type RecordedPort = StudioRenderWorkerPort & {
  claims: string[];
  renewals: string[];
  executed: string[];
  completed: string[];
  failed: string[];
  released: string[];
};

function createPort(overrides: Partial<StudioRenderWorkerPort> & {
  claimQueue?: Array<ClaimedStudioRenderJob | null>;
}): RecordedPort {
  const queue = overrides.claimQueue ? [...overrides.claimQueue] : [];
  const recorded: RecordedPort = {
    claims: [],
    renewals: [],
    executed: [],
    completed: [],
    failed: [],
    released: [],
    async recoverStaleJobs() {
      if (overrides.recoverStaleJobs) return overrides.recoverStaleJobs();
    },
    async claimJob() {
      if (overrides.claimJob) return overrides.claimJob();
      const next = queue.length > 0 ? queue.shift() ?? null : null;
      if (next) recorded.claims.push(next.id);
      else recorded.claims.push("idle");
      return next;
    },
    async renewLease(claimed) {
      recorded.renewals.push(claimed.id);
      if (overrides.renewLease) return overrides.renewLease(claimed);
      return true;
    },
    async executeJob(claimed) {
      recorded.executed.push(claimed.id);
      if (overrides.executeJob) return overrides.executeJob(claimed);
      return { sizeBytes: 8 };
    },
    async completeJob(claimed, result) {
      recorded.completed.push(claimed.id);
      if (overrides.completeJob) return overrides.completeJob(claimed, result);
      return true;
    },
    async failJob(claimed, error) {
      recorded.failed.push(claimed.id);
      if (overrides.failJob) return overrides.failJob(claimed, error);
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

async function runUntil(
  port: RecordedPort,
  options: Parameters<typeof createStudioRenderWorker>[1],
  predicate: () => boolean,
  timeoutMs = 1500,
): Promise<ReturnType<typeof createStudioRenderWorker>> {
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 200,
    logger: { info() {}, error() {} },
    ...options,
  });
  const running = worker.run();
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      worker.requestShutdown();
      await running;
      throw new Error("timed out waiting for worker condition");
    }
    await delay(10);
  }
  worker.requestShutdown();
  await running;
  return worker;
}

async function testParseClaimedJob() {
  assert.equal(parseClaimedStudioRenderJob(null), null);
  assert.equal(parseClaimedStudioRenderJob({ id: "x", project_snapshot: {} }), null);
  const parsed = parseClaimedStudioRenderJob({
    id: "job-1",
    project_id: "project",
    lease_token: "lease-1",
    project_snapshot: snapshot,
    guest_session_id: "guest",
  });
  assert.deepEqual(parsed, {
    id: "job-1",
    project_id: "project",
    lease_token: "lease-1",
    guest_session_id: "guest",
    project_snapshot: snapshot,
  });
  const fromArray = parseClaimedStudioRenderJob([{
    id: "job-2",
    project_id: "project",
    lease_token: "lease-2",
    project_snapshot: snapshot,
  }]);
  assert.equal(fromArray?.id, "job-2");
}

async function testQueuedClaimedCompletedAndLoopContinues() {
  const port = createPort({ claimQueue: [job("a"), job("b")] });
  await runUntil(port, {}, () => port.completed.length >= 2);
  assert.deepEqual(port.executed, ["a", "b"]);
  assert.deepEqual(port.completed, ["a", "b"]);
  assert.equal(port.failed.length, 0);
  assert.ok(port.claims.includes("idle"), "after completed jobs the loop keeps polling");
}

async function testFailedJobWorkerStaysAlive() {
  const port = createPort({
    claimQueue: [job("fail"), job("ok")],
    async executeJob(claimed) {
      if (claimed.id === "fail") throw new Error("ffmpeg exited with 1");
      return { sizeBytes: 4 };
    },
  });
  await runUntil(port, {}, () => port.completed.includes("ok") && port.failed.includes("fail"));
  assert.deepEqual(port.executed, ["fail", "ok"]);
  assert.deepEqual(port.failed, ["fail"]);
  assert.deepEqual(port.completed, ["ok"]);
}

async function testIdleWorkerNotBusyLoop() {
  const times: number[] = [];
  const port = createPort({
    async claimJob() {
      times.push(Date.now());
      return null;
    },
  });
  await runUntil(
    port,
    { idleIntervalMs: 80, heartbeatIntervalMs: 10_000 },
    () => times.length >= 3,
  );
  assert.ok(times.length >= 3);
  const gaps = [times[1] - times[0], times[2] - times[1]];
  for (const gap of gaps) {
    assert.ok(gap >= 55, `idle gap was ${gap}ms; worker is busy-looping`);
  }
  assert.ok(times.length < 12, `too many idle claims (${times.length}) for the wait window`);
}

async function testHeartbeatRenewDuringLongRender() {
  const started = createDeferred();
  const finish = createDeferred();
  const port = createPort({
    claimQueue: [job("long")],
    async executeJob() {
      started.resolve();
      await finish.promise;
      return { sizeBytes: 1 };
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 30,
    shutdownDrainMs: 500,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  await started.promise;
  await delay(100);
  assert.ok(port.renewals.length >= 2, `expected heartbeat renewals, got ${port.renewals.length}`);
  finish.resolve();
  await delay(30);
  worker.requestShutdown();
  await running;
  assert.deepEqual(port.completed, ["long"]);
}

async function testLostOwnershipDoesNotComplete() {
  const started = createDeferred();
  const finish = createDeferred();
  const port = createPort({
    claimQueue: [job("lost")],
    async renewLease() {
      return false;
    },
    async executeJob() {
      started.resolve();
      await finish.promise;
      return { sizeBytes: 1 };
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 25,
    shutdownDrainMs: 500,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  await started.promise;
  await delay(80);
  finish.resolve();
  await delay(40);
  worker.requestShutdown();
  await running;
  assert.deepEqual(port.completed, []);
  assert.deepEqual(port.failed, []);
  assert.ok(port.renewals.length >= 1);
}

async function testGracefulShutdownDoesNotClaimNewJob() {
  const started = createDeferred();
  const finish = createDeferred();
  const port = createPort({
    claimQueue: [job("one"), job("two")],
    async executeJob(claimed) {
      if (claimed.id === "one") {
        started.resolve();
        await finish.promise;
      }
      return { sizeBytes: 1 };
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 80,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  await started.promise;
  worker.requestShutdown();
  await delay(40);
  finish.resolve();
  await running;
  assert.equal(port.claims.includes("two"), false, "shutdown must not claim a second job");
  assert.deepEqual(port.claims.filter((id) => id !== "idle"), ["one"]);
}

async function testDrainTimeoutReleasesLease() {
  const started = createDeferred();
  const port = createPort({
    claimQueue: [job("slow")],
    async executeJob() {
      started.resolve();
      await delay(400);
      return { sizeBytes: 1 };
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 40,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  await started.promise;
  worker.requestShutdown();
  await running;
  assert.deepEqual(port.released, ["slow"]);
  assert.deepEqual(port.completed, []);
}

function testPm2ConfigHasNoCronRestart() {
  const config = readFileSync(
    new URL("../deploy/studio-render-worker.ecosystem.config.cjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(config, /cron_restart:\s*"\*\/2 \* \* \* \*"/);
  assert.doesNotMatch(config, /cron_restart/);
  assert.match(config, /autorestart:\s*true/);
  assert.match(config, /kill_timeout:\s*120000/);
  assert.match(config, /treekill:\s*true/);
}

function testStreamingUploadAndLeaseTokenComplete() {
  const runtime = readFileSync(
    new URL("../src/lib/studio/render/worker-runtime.ts", import.meta.url),
    "utf8",
  );
  assert.match(runtime, /createReadStream/);
  assert.doesNotMatch(runtime, /readFile\(result\.outputPath\)/);
  assert.match(runtime, /duplex:\s*"half"/);
  assert.match(runtime, /\.eq\("lease_token", job\.lease_token\)/);
  assert.match(runtime, /renew_studio_render_job_lease/);
  assert.match(runtime, /release_studio_render_job/);
  const script = readFileSync(
    new URL("../scripts/run-studio-render-worker.mts", import.meta.url),
    "utf8",
  );
  assert.match(script, /SIGTERM/);
  assert.match(script, /SIGINT/);
  assert.match(script, /createStudioRenderWorker/);
}

async function main() {
  testParseClaimedJob();
  await testQueuedClaimedCompletedAndLoopContinues();
  await testFailedJobWorkerStaysAlive();
  await testIdleWorkerNotBusyLoop();
  await testHeartbeatRenewDuringLongRender();
  await testLostOwnershipDoesNotComplete();
  await testGracefulShutdownDoesNotClaimNewJob();
  await testDrainTimeoutReleasesLease();
  testPm2ConfigHasNoCronRestart();
  testStreamingUploadAndLeaseTokenComplete();
  console.log("studio-render-worker-unit: PASS");
}

await main();
