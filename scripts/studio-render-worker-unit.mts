import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runStudioRenderChild,
  StudioRenderChildAbortedError,
} from "../src/lib/studio/render/render";
import {
  allowStudioRenderOutputUpload,
  createStudioRenderWorker,
  parseClaimedStudioRenderJob,
  raceWithAbort,
  sleep,
  StudioRenderAbandonedError,
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
    async executeJob(claimed, signal) {
      recorded.executed.push(claimed.id);
      if (overrides.executeJob) return overrides.executeJob(claimed, signal);
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

async function testSleepCleansAbortListener() {
  const warnings: Error[] = [];
  const onWarning = (warning: Error) => {
    warnings.push(warning);
  };
  process.on("warning", onWarning);
  const controller = new AbortController();
  for (let i = 0; i < 40; i += 1) {
    await sleep(2, controller.signal);
  }
  assert.equal(
    getEventListeners(controller.signal, "abort").length,
    0,
    "timeout completion must remove the abort listener",
  );
  const pending = sleep(5_000, controller.signal);
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  controller.abort();
  await pending;
  assert.equal(
    getEventListeners(controller.signal, "abort").length,
    0,
    "abort completion must remove the abort listener",
  );
  const raced = raceWithAbort(delay(2), new AbortController().signal);
  const raceSignal = new AbortController();
  await raceWithAbort(delay(2), raceSignal.signal);
  assert.equal(getEventListeners(raceSignal.signal, "abort").length, 0);
  await raced;
  process.off("warning", onWarning);
  assert.equal(
    warnings.filter((warning) => warning.name === "MaxListenersExceededWarning").length,
    0,
    "sequential sleeps must not accumulate MaxListenersExceededWarning",
  );
}

async function testIdlePollsDoNotAccumulateAbortListeners() {
  const warnings: Error[] = [];
  const onWarning = (warning: Error) => {
    warnings.push(warning);
  };
  process.on("warning", onWarning);
  const times: number[] = [];
  const port = createPort({
    async claimJob() {
      times.push(Date.now());
      return null;
    },
  });
  await runUntil(
    port,
    { idleIntervalMs: 8, heartbeatIntervalMs: 10_000 },
    () => times.length >= 20,
    2000,
  );
  process.off("warning", onWarning);
  assert.ok(times.length >= 20);
  assert.equal(
    warnings.filter((warning) => warning.name === "MaxListenersExceededWarning").length,
    0,
    "idle polls must not leak abort listeners",
  );
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

async function testTransientHeartbeatErrorDoesNotAbandon() {
  const started = createDeferred();
  const finish = createDeferred();
  let renewCalls = 0;
  const port = createPort({
    claimQueue: [job("hiccup")],
    async renewLease() {
      renewCalls += 1;
      if (renewCalls === 1) throw new Error("supabase_temporarily_unavailable");
      return true;
    },
    async executeJob() {
      started.resolve();
      await finish.promise;
      return { sizeBytes: 1 };
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 30,
    heartbeatRetryMs: 20,
    leaseHoldMs: 10_000,
    shutdownDrainMs: 500,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  await started.promise;
  await delay(120);
  assert.ok(renewCalls >= 2, `expected a retry after the transient error, got ${renewCalls}`);
  finish.resolve();
  await delay(30);
  worker.requestShutdown();
  await running;
  assert.deepEqual(port.completed, ["hiccup"]);
  assert.deepEqual(port.failed, []);
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

async function testStaleWorkerSkipsOutputUpload() {
  const live = new AbortController();
  const lost = new AbortController();
  lost.abort();
  assert.equal(await allowStudioRenderOutputUpload(lost.signal, async () => true), false);
  assert.equal(await allowStudioRenderOutputUpload(live.signal, async () => false), false);
  assert.equal(await allowStudioRenderOutputUpload(live.signal, async () => true), true);
  assert.equal(
    await allowStudioRenderOutputUpload(live.signal, async () => {
      throw new Error("renew_rpc_timeout");
    }),
    true,
    "transient pre-upload renew error must not skip an owned upload",
  );

  const started = createDeferred();
  const finish = createDeferred();
  let uploaded = false;
  const port = createPort({
    claimQueue: [job("stale")],
    async renewLease() {
      return false;
    },
    async executeJob(_claimed, signal) {
      started.resolve();
      await finish.promise;
      uploaded = await allowStudioRenderOutputUpload(signal, async () => true);
      if (!uploaded) throw new StudioRenderAbandonedError();
      return { sizeBytes: 1 };
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 25,
    heartbeatRetryMs: 20,
    leaseHoldMs: 10_000,
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
  assert.equal(uploaded, false, "stale worker must not upload after confirmed lease loss");
  assert.deepEqual(port.completed, []);
  assert.deepEqual(port.failed, []);
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
    async executeJob(_claimed, signal) {
      started.resolve();
      await sleep(400, signal);
      if (signal.aborted) throw new StudioRenderAbandonedError();
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

async function testAbortStopsSpawnedFfmpegChild() {
  const workspace = await mkdtemp(join(tmpdir(), "audiolad-ffmpeg-abort-"));
  const output = join(workspace, "long.mp3");
  const controller = new AbortController();
  const started = Date.now();
  const running = runStudioRenderChild("ffmpeg", [
    "-hide_banner", "-nostdin",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-t", "120",
    "-c:a", "libmp3lame", "-b:a", "192k",
    "-y", output,
  ], { signal: controller.signal, termGraceMs: 200 });
  await delay(200);
  controller.abort();
  await assert.rejects(running, (error: unknown) => error instanceof StudioRenderChildAbortedError);
  assert.ok(Date.now() - started < 5_000, "aborted FFmpeg must exit without running the full encode");
  await rm(workspace, { recursive: true, force: true });
}

async function testConfirmedLeaseLossCancelsFfmpeg() {
  const started = createDeferred();
  let childClosedAt = 0;
  let uploaded = false;
  const port = createPort({
    claimQueue: [job("lost-ffmpeg")],
    async renewLease() {
      return false;
    },
    async executeJob(_claimed, signal) {
      started.resolve();
      try {
        await runStudioRenderChild("sleep", ["30"], { signal, termGraceMs: 50 });
        uploaded = true;
        return { sizeBytes: 1 };
      } catch (error) {
        childClosedAt = Date.now();
        if (error instanceof StudioRenderChildAbortedError || signal.aborted) {
          throw new StudioRenderAbandonedError();
        }
        throw error;
      }
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 25,
    heartbeatRetryMs: 20,
    leaseHoldMs: 10_000,
    shutdownDrainMs: 2_000,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  await started.promise;
  await delay(120);
  worker.requestShutdown();
  await running;
  assert.ok(childClosedAt > 0, "confirmed lease loss must terminate the child");
  assert.equal(uploaded, false);
  assert.deepEqual(port.completed, []);
  assert.deepEqual(port.failed, []);
}

async function testDrainTerminatesChildBeforeRelease() {
  const started = createDeferred();
  let childClosedAt = 0;
  let releasedAt = 0;
  const port = createPort({
    claimQueue: [job("drain-ffmpeg")],
    async executeJob(_claimed, signal) {
      started.resolve();
      try {
        await runStudioRenderChild("sleep", ["30"], { signal, termGraceMs: 50 });
        return { sizeBytes: 1 };
      } catch (error) {
        childClosedAt = Date.now();
        if (error instanceof StudioRenderChildAbortedError || signal.aborted) {
          throw new StudioRenderAbandonedError();
        }
        throw error;
      }
    },
    async releaseJob() {
      releasedAt = Date.now();
      return true;
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
  assert.ok(childClosedAt > 0, "drain abort must stop the child");
  assert.ok(releasedAt >= childClosedAt, "release must wait until the child has exited");
  assert.deepEqual(port.released, ["drain-ffmpeg"]);
  assert.deepEqual(port.completed, []);
  assert.deepEqual(port.failed, []);
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
  assert.match(runtime, /allowStudioRenderOutputUpload/);
  assert.match(runtime, /StudioRenderAbandonedError/);
  assert.match(runtime, /signal/);
  const render = readFileSync(
    new URL("../src/lib/studio/render/render.ts", import.meta.url),
    "utf8",
  );
  assert.match(render, /runStudioRenderChild/);
  assert.match(render, /SIGTERM/);
  assert.match(render, /SIGKILL/);
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
  await testSleepCleansAbortListener();
  await testQueuedClaimedCompletedAndLoopContinues();
  await testFailedJobWorkerStaysAlive();
  await testIdleWorkerNotBusyLoop();
  await testIdlePollsDoNotAccumulateAbortListeners();
  await testHeartbeatRenewDuringLongRender();
  await testTransientHeartbeatErrorDoesNotAbandon();
  await testLostOwnershipDoesNotComplete();
  await testStaleWorkerSkipsOutputUpload();
  await testGracefulShutdownDoesNotClaimNewJob();
  await testDrainTimeoutReleasesLease();
  await testAbortStopsSpawnedFfmpegChild();
  await testConfirmedLeaseLossCancelsFfmpeg();
  await testDrainTerminatesChildBeforeRelease();
  testPm2ConfigHasNoCronRestart();
  testStreamingUploadAndLeaseTokenComplete();
  console.log("studio-render-worker-unit: PASS");
}

await main();
