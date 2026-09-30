import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { studioRenderFfmpegProgressArgs } from "../src/lib/studio/render/ffmpeg";
import {
  consumeStudioRenderFfmpegProgress,
  createStudioRenderFfmpegProgressState,
  STUDIO_RENDER_FFMPEG_STALLED_CODE,
  STUDIO_RENDER_FFMPEG_STALLED_MESSAGE,
  studioRenderFfmpegProgressAdvanced,
} from "../src/lib/studio/render/ffmpeg-stall";
import {
  runStudioRenderChild,
  StudioRenderChildAbortedError,
  StudioRenderFfmpegStalledError,
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
import type { StudioRenderReleaseComparison } from "../src/lib/studio/render/worker-release";

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

function releaseComparison(
  state: StudioRenderReleaseComparison["state"],
): StudioRenderReleaseComparison {
  return {
    state,
    bootReleasePath: "/releases/boot",
    bootSha: "bootsha",
    currentReleasePath: state === "CURRENT" ? "/releases/boot" : "/releases/other",
    currentSha: state === "CURRENT" ? "bootsha" : "othersha",
    reason: state === "UNKNOWN" ? "release_path_unreadable" : undefined,
  };
}

function createLogger() {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      info(message: string) {
        lines.push(message);
      },
      error(message: string) {
        lines.push(message);
      },
    },
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

async function testCurrentReleaseClaimsAndExecutes() {
  const port = createPort({ claimQueue: [job("fresh")] });
  await runUntil(
    port,
    { checkRelease: () => releaseComparison("CURRENT") },
    () => port.completed.includes("fresh"),
  );
  assert.deepEqual(port.executed, ["fresh"]);
  assert.deepEqual(port.completed, ["fresh"]);
  assert.deepEqual(port.released, []);
}

async function testStaleBeforeClaimDoesNotClaimAndExits() {
  const { lines, logger } = createLogger();
  const port = createPort({ claimQueue: [job("skipped")] });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 200,
    logger,
    checkRelease: () => releaseComparison("STALE"),
  });
  await worker.run();
  assert.deepEqual(port.claims, []);
  assert.deepEqual(port.executed, []);
  assert.equal(worker.isStopping(), false, "STALE must not use requestShutdown()");
  assert.ok(lines.some((line) => line.includes("studio_render_release_mismatch")));
}

async function testUnknownBeforeClaimDoesNotClaimOrExit() {
  const { lines, logger } = createLogger();
  let checks = 0;
  const port = createPort({ claimQueue: [job("blocked")] });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 15,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 200,
    logger,
    checkRelease: () => {
      checks += 1;
      return releaseComparison("UNKNOWN");
    },
  });
  const running = worker.run();
  const started = Date.now();
  while (checks < 3) {
    if (Date.now() - started > 1500) {
      worker.requestShutdown();
      await running;
      throw new Error("timed out waiting for UNKNOWN retries");
    }
    await delay(10);
  }
  assert.equal(worker.isStopping(), false);
  assert.deepEqual(port.claims, []);
  assert.deepEqual(port.executed, []);
  assert.ok(lines.some((line) => line.includes("studio_render_release_guard_unavailable")));
  worker.requestShutdown();
  await running;
}

async function testPostClaimStaleReleasesWithoutExecuteAndExits() {
  const { lines, logger } = createLogger();
  let checks = 0;
  const port = createPort({ claimQueue: [job("raced")] });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 200,
    logger,
    checkRelease: () => {
      checks += 1;
      return releaseComparison(checks === 1 ? "CURRENT" : "STALE");
    },
  });
  await worker.run();
  assert.deepEqual(port.claims, ["raced"]);
  assert.deepEqual(port.released, ["raced"]);
  assert.deepEqual(port.executed, []);
  assert.equal(worker.isStopping(), false);
  assert.ok(lines.some((line) => line.includes("studio_render_release_mismatch")));
}

async function testPostClaimUnknownReleasesWithoutExecuteAndRetries() {
  const { lines, logger } = createLogger();
  let checks = 0;
  const port = createPort({ claimQueue: [job("maybe"), job("later")] });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 15,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 200,
    logger,
    checkRelease: () => {
      checks += 1;
      if (checks === 1) return releaseComparison("CURRENT");
      return releaseComparison("UNKNOWN");
    },
  });
  const running = worker.run();
  const started = Date.now();
  while (checks < 4) {
    if (Date.now() - started > 1500) {
      worker.requestShutdown();
      await running;
      throw new Error("timed out waiting for post-claim UNKNOWN retry");
    }
    await delay(10);
  }
  assert.deepEqual(port.claims, ["maybe"]);
  assert.deepEqual(port.released, ["maybe"]);
  assert.deepEqual(port.executed, []);
  assert.equal(worker.isStopping(), false);
  assert.ok(lines.some((line) => line.includes("studio_render_release_guard_unavailable")));
  worker.requestShutdown();
  await running;
}

async function testInFlightJobFinishesAfterCutoverThenExits() {
  const started = createDeferred();
  const finish = createDeferred();
  let state: StudioRenderReleaseComparison["state"] = "CURRENT";
  const port = createPort({
    claimQueue: [job("long"), job("next")],
    async executeJob(_claimed, signal) {
      started.resolve();
      await finish.promise;
      if (signal.aborted) throw new StudioRenderAbandonedError();
      return { sizeBytes: 1 };
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 500,
    logger: { info() {}, error() {} },
    checkRelease: () => releaseComparison(state),
  });
  const running = worker.run();
  await started.promise;
  state = "STALE";
  finish.resolve();
  await running;
  assert.deepEqual(port.executed, ["long"]);
  assert.deepEqual(port.completed, ["long"]);
  assert.deepEqual(port.failed, []);
  assert.equal(port.claims.includes("next"), false, "must not claim after finishing on a stale release");
  assert.equal(worker.isStopping(), false, "cutover during execute must not requestShutdown()");
}

async function testSigtermHardDrainUnchangedWithReleaseGate() {
  const started = createDeferred();
  const port = createPort({
    claimQueue: [job("drain-gated")],
    async executeJob(_claimed, signal) {
      started.resolve();
      await sleep(400, signal);
      if (signal.aborted) throw new StudioRenderAbandonedError();
      return { sizeBytes: 1 };
    },
  });
  let state: StudioRenderReleaseComparison["state"] = "CURRENT";
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 10_000,
    shutdownDrainMs: 40,
    logger: { info() {}, error() {} },
    checkRelease: () => releaseComparison(state),
  });
  const running = worker.run();
  await started.promise;
  state = "STALE";
  worker.requestShutdown();
  await running;
  assert.equal(worker.isStopping(), true);
  assert.deepEqual(port.released, ["drain-gated"]);
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
  assert.match(script, /requireStudioRenderWorkerEnv/);
  assert.match(script, /redactStudioRenderWorkerSecrets/);
  assert.match(script, /formatStudioRenderWorkerBootLog/);
  assert.match(script, /checkRelease/);
  const releaseHelper = readFileSync(
    new URL("../src/lib/studio/render/worker-release.ts", import.meta.url),
    "utf8",
  );
  assert.match(releaseHelper, /studio_render_worker_boot/);
  const loop = readFileSync(
    new URL("../src/lib/studio/render/worker.ts", import.meta.url),
    "utf8",
  );
  assert.match(loop, /checkRelease/);
  assert.match(loop, /refreshExit/);
  assert.match(loop, /formatStudioRenderReleaseMismatchLog/);
  assert.match(loop, /formatStudioRenderReleaseUnavailableLog/);
}

const ADVANCING_FFMPEG = `
let us = 0;
const step = () => {
  us += 1000000;
  const seconds = String(us / 1000000).padStart(2, "0");
  process.stdout.write(
    "out_time_us=" + us + "\\n" +
    "out_time_ms=" + us + "\\n" +
    "out_time=00:00:" + seconds + ".000000\\n" +
    "progress=continue\\n"
  );
  if (us >= 6000000) {
    process.stdout.write("progress=end\\n");
    process.exit(0);
  }
  setTimeout(step, 30);
};
step();
`;

const STALLED_FFMPEG = `
const line = "out_time_us=250000\\nout_time_ms=250000\\nout_time=00:00:00.250000\\nprogress=continue\\n";
process.stdout.write(line);
setInterval(() => process.stdout.write(line), 15);
`;

function ignoreTermScript(logPath: string): string {
  return `
const fs = require("node:fs");
process.on("SIGTERM", () => {
  fs.appendFileSync(${JSON.stringify(logPath)}, "SIGTERM\\n");
});
process.stdout.write("out_time_us=1000\\nout_time=00:00:00.001000\\nprogress=continue\\n");
setInterval(() => {}, 1000);
`;
}

function trackTimers() {
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
    let timer!: ReturnType<typeof setTimeout>;
    timer = originalSet(() => {
      pending.delete(timer);
      if (typeof fn === "function") fn(...args);
    }, ms);
    pending.add(timer);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((timer?: ReturnType<typeof setTimeout>) => {
    if (timer !== undefined) pending.delete(timer);
    return originalClear(timer as never);
  }) as typeof clearTimeout;
  return {
    pending,
    restore() {
      globalThis.setTimeout = originalSet;
      globalThis.clearTimeout = originalClear;
    },
  };
}

function testFfmpegProgressParser() {
  assert.deepEqual(studioRenderFfmpegProgressArgs(), ["-progress", "pipe:1"]);
  assert.equal(studioRenderFfmpegProgressAdvanced(null, 0), false);
  assert.equal(studioRenderFfmpegProgressAdvanced(null, 1_000), true);
  assert.equal(studioRenderFfmpegProgressAdvanced(1_000, 1_000), false);
  assert.equal(studioRenderFfmpegProgressAdvanced(1_000, 2_000), true);
  const state = createStudioRenderFfmpegProgressState();
  assert.deepEqual(consumeStudioRenderFfmpegProgress(state, "out_time_us=10"), []);
  const samples = consumeStudioRenderFfmpegProgress(
    state,
    "00\nout_time=00:00:00.001000\nprogress=continue\n",
  );
  assert.equal(samples[0]?.positionUs, 1_000);
  assert.equal(samples[0]?.outTime, "00:00:00.001000");
  const clockOnly = createStudioRenderFfmpegProgressState();
  const fromClock = consumeStudioRenderFfmpegProgress(
    clockOnly,
    "out_time=01:02:03.500000\nprogress=continue\n",
  );
  assert.equal(fromClock[0]?.positionUs, Math.round((3600 + 120 + 3.5) * 1_000_000));
  assert.equal(studioRenderFfmpegProgressAdvanced(fromClock[0]?.positionUs ?? null, fromClock[0]?.positionUs ?? null), false);
}

async function assertTimersCleared(pending: Set<ReturnType<typeof setTimeout>>) {
  await delay(0);
  assert.equal(pending.size, 0, "watchdog and grace timers must be cleared");
}

async function testAdvancingFfmpegIsNotAborted() {
  const tracker = trackTimers();
  const started = Date.now();
  try {
    const stderr = await runStudioRenderChild(process.execPath, ["-e", ADVANCING_FFMPEG], {
      progress: { stallMs: 70, expectedDurationSeconds: 3 * 60 * 60 },
      termGraceMs: 40,
    });
    assert.equal(stderr, "");
    assert.ok(Date.now() - started >= 70, "advancing render must outlive one stall window");
    await assertTimersCleared(tracker.pending);
  } finally {
    tracker.restore();
  }
}

async function testRepeatedProgressStillStalls() {
  const tracker = trackTimers();
  try {
    await assert.rejects(
      () => runStudioRenderChild(process.execPath, ["-e", STALLED_FFMPEG], {
        progress: { stallMs: 80, expectedDurationSeconds: 90 },
        termGraceMs: 40,
      }),
      (error: unknown) => {
        assert.ok(error instanceof StudioRenderFfmpegStalledError);
        assert.equal(error.code, STUDIO_RENDER_FFMPEG_STALLED_CODE);
        assert.equal(error.stage, "ffmpeg");
        assert.equal(error.safeMessage, STUDIO_RENDER_FFMPEG_STALLED_MESSAGE);
        assert.equal(error.details.lastProgressUs, 250_000);
        assert.equal(error.details.lastOutTime, "00:00:00.250000");
        assert.equal(error.details.expectedDurationSeconds, 90);
        assert.ok(error.details.elapsedMs >= 80);
        return true;
      },
    );
    await assertTimersCleared(tracker.pending);
  } finally {
    tracker.restore();
  }
}

async function testZeroProgressStillStalls() {
  const source = `
process.stdout.write("out_time_us=0\\nout_time=00:00:00.000000\\nprogress=continue\\n");
setInterval(() => {
  process.stdout.write("out_time_us=0\\nout_time=00:00:00.000000\\nprogress=continue\\n");
}, 10);
`;
  await assert.rejects(
    () => runStudioRenderChild(process.execPath, ["-e", source], {
      progress: { stallMs: 80, expectedDurationSeconds: 5 },
      termGraceMs: 30,
    }),
    (error: unknown) => {
      assert.ok(error instanceof StudioRenderFfmpegStalledError);
      assert.equal(error.details.lastProgressUs, 0);
      return true;
    },
  );
}

async function testHungChildAfterSigtermGetsSigkill() {
  const workspace = await mkdtemp(join(tmpdir(), "audiolad-ffmpeg-stall-"));
  const logPath = join(workspace, "signals.log");
  const tracker = trackTimers();
  try {
    await assert.rejects(
      () => runStudioRenderChild(process.execPath, ["-e", ignoreTermScript(logPath)], {
        progress: { stallMs: 60, expectedDurationSeconds: 30 },
        termGraceMs: 50,
      }),
      (error: unknown) => {
        assert.ok(error instanceof StudioRenderFfmpegStalledError);
        assert.equal(error.details.closeSignal, "SIGKILL");
        return true;
      },
    );
    assert.match(await readFile(logPath, "utf8"), /SIGTERM/);
    await assertTimersCleared(tracker.pending);
  } finally {
    tracker.restore();
    await rm(workspace, { recursive: true, force: true });
  }
}

async function testWatchdogClearedOnAbortAndSpawnFailure() {
  const tracker = trackTimers();
  try {
    const controller = new AbortController();
    const pending = runStudioRenderChild(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      signal: controller.signal,
      termGraceMs: 40,
      progress: { stallMs: 5_000, expectedDurationSeconds: 10 },
    });
    await delay(20);
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof StudioRenderChildAbortedError);
    await assert.rejects(
      () => runStudioRenderChild(process.execPath, ["-e", "process.stderr.write('boom'); process.exit(1)"], {
        progress: { stallMs: 5_000, expectedDurationSeconds: 4 },
        termGraceMs: 40,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error instanceof StudioRenderFfmpegStalledError, false);
        assert.match(error.message, /exited with 1/);
        return true;
      },
    );
    const fast = await runStudioRenderChild(process.execPath, ["-e", "process.exit(0)"], {
      progress: { stallMs: 5_000, expectedDurationSeconds: 1 },
    });
    assert.equal(fast, "");
    await assertTimersCleared(tracker.pending);
  } finally {
    tracker.restore();
  }
}

async function testHeartbeatContinuesDuringAdvancingFfmpeg() {
  const port = createPort({
    claimQueue: [job("advancing")],
    async executeJob(_claimed, signal) {
      await runStudioRenderChild(process.execPath, ["-e", ADVANCING_FFMPEG], {
        signal,
        progress: { stallMs: 70, expectedDurationSeconds: 7_200 },
        termGraceMs: 40,
      });
      return { sizeBytes: 4 };
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 30,
    shutdownDrainMs: 500,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  const started = Date.now();
  while (!port.completed.includes("advancing")) {
    if (Date.now() - started > 2_000) {
      worker.requestShutdown();
      await running;
      throw new Error("advancing render did not complete");
    }
    await delay(10);
  }
  assert.ok(
    port.renewals.length >= 2,
    `expected heartbeat during advancing ffmpeg, got ${port.renewals.length}`,
  );
  assert.deepEqual(port.failed, []);
  worker.requestShutdown();
  await running;
}

async function testHeartbeatContinuesWhileFfmpegHasNoProgress() {
  const started = createDeferred();
  const port = createPort({
    claimQueue: [job("silent")],
    async executeJob(_claimed, signal) {
      started.resolve();
      try {
        await runStudioRenderChild(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
          signal,
          progress: { stallMs: 10_000, expectedDurationSeconds: 3_600 },
          termGraceMs: 40,
        });
        return { sizeBytes: 1 };
      } catch (error) {
        if (error instanceof StudioRenderChildAbortedError || signal.aborted) {
          throw new StudioRenderAbandonedError();
        }
        throw error;
      }
    },
  });
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: 20,
    heartbeatIntervalMs: 30,
    shutdownDrainMs: 40,
    logger: { info() {}, error() {} },
  });
  const running = worker.run();
  await started.promise;
  await delay(120);
  assert.ok(
    port.renewals.length >= 2,
    `heartbeat must continue without ffmpeg progress, got ${port.renewals.length}`,
  );
  assert.deepEqual(port.failed, []);
  worker.requestShutdown();
  await running;
  assert.deepEqual(port.failed, []);
  assert.deepEqual(port.completed, []);
  assert.deepEqual(port.released, ["silent"]);
}

async function testStallFailsJobInsteadOfRequeue() {
  let seen: unknown;
  const port = createPort({
    claimQueue: [job("stalled-job")],
    async executeJob() {
      await runStudioRenderChild(process.execPath, ["-e", STALLED_FFMPEG], {
        progress: { stallMs: 70, expectedDurationSeconds: 120 },
        termGraceMs: 30,
      });
      return { sizeBytes: 1 };
    },
    async failJob(_claimed, error) {
      seen = error;
      return true;
    },
  });
  await runUntil(
    port,
    { heartbeatIntervalMs: 10_000 },
    () => port.failed.includes("stalled-job"),
    2_000,
  );
  assert.ok(seen instanceof StudioRenderFfmpegStalledError);
  assert.equal(seen.code, STUDIO_RENDER_FFMPEG_STALLED_CODE);
  assert.deepEqual(port.completed, []);
  assert.deepEqual(port.released, []);
}

async function main() {
  testFfmpegProgressParser();
  testParseClaimedJob();
  await testSleepCleansAbortListener();
  await testQueuedClaimedCompletedAndLoopContinues();
  await testFailedJobWorkerStaysAlive();
  await testIdleWorkerNotBusyLoop();
  await testIdlePollsDoNotAccumulateAbortListeners();
  await testHeartbeatRenewDuringLongRender();
  await testHeartbeatContinuesDuringAdvancingFfmpeg();
  await testHeartbeatContinuesWhileFfmpegHasNoProgress();
  await testAdvancingFfmpegIsNotAborted();
  await testRepeatedProgressStillStalls();
  await testZeroProgressStillStalls();
  await testHungChildAfterSigtermGetsSigkill();
  await testWatchdogClearedOnAbortAndSpawnFailure();
  await testStallFailsJobInsteadOfRequeue();
  await testTransientHeartbeatErrorDoesNotAbandon();
  await testLostOwnershipDoesNotComplete();
  await testStaleWorkerSkipsOutputUpload();
  await testGracefulShutdownDoesNotClaimNewJob();
  await testDrainTimeoutReleasesLease();
  await testAbortStopsSpawnedFfmpegChild();
  await testConfirmedLeaseLossCancelsFfmpeg();
  await testDrainTerminatesChildBeforeRelease();
  await testCurrentReleaseClaimsAndExecutes();
  await testStaleBeforeClaimDoesNotClaimAndExits();
  await testUnknownBeforeClaimDoesNotClaimOrExit();
  await testPostClaimStaleReleasesWithoutExecuteAndExits();
  await testPostClaimUnknownReleasesWithoutExecuteAndRetries();
  await testInFlightJobFinishesAfterCutoverThenExits();
  await testSigtermHardDrainUnchangedWithReleaseGate();
  testPm2ConfigHasNoCronRestart();
  testStreamingUploadAndLeaseTokenComplete();
  console.log("studio-render-worker-unit: PASS");
}

await main();
