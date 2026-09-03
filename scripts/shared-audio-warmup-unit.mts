#!/usr/bin/env node
import assert from "node:assert/strict";

import { ensureSharedAudioAudible } from "../src/lib/audio/shared-audio-audibility";
import { createSharedAudioWarmupController } from "../src/lib/audio/shared-audio-warmup";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

function deferred(): Deferred {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

class MockSharedAudio {
  currentSrc = "";
  muted = false;
  volume = 1;
  paused = true;
  pauseCalls = 0;
  private source = "";

  constructor(private readonly warmupPromise: Promise<void>) {}

  getAttribute(name: string) {
    return name === "src" ? this.source || null : null;
  }

  play() {
    if (!this.source && !this.currentSrc) {
      return this.warmupPromise;
    }

    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }

  startRealPlayback() {
    this.source = "https://audio.example/real.mp3";
    this.currentSrc = this.source;
    ensureSharedAudioAudible(this as unknown as HTMLAudioElement);
    this.paused = false;
  }
}

function assertAudiblePlaying(audio: MockSharedAudio, label: string) {
  assert.equal(audio.paused, false, `${label}: real playback remains playing`);
  assert.equal(audio.muted, false, `${label}: real playback is not muted`);
  assert.ok(audio.volume > 0, `${label}: real playback has audible volume`);
}

async function testWarmupSettlementDoesNotTouchRealPlayback(
  name: string,
  settle: (value: Deferred) => void,
) {
  const pending = deferred();
  const controller = createSharedAudioWarmupController();
  const audio = new MockSharedAudio(pending.promise);

  controller.prepare(audio);
  assert.equal(audio.muted, false, `${name}: mute is restored synchronously`);

  audio.startRealPlayback();
  settle(pending);
  await flushPromises();

  assertAudiblePlaying(audio, name);
  assert.equal(audio.pauseCalls, 0, `${name}: stale completion does not pause`);
}

async function testPendingWarmupCannotMutePlayback() {
  const pending = deferred();
  const controller = createSharedAudioWarmupController();
  const audio = new MockSharedAudio(pending.promise);

  controller.prepare(audio);
  audio.startRealPlayback();
  await flushPromises();

  assertAudiblePlaying(audio, "pending");
  assert.equal(audio.pauseCalls, 0);
}

async function testNewSessionInvalidatesOldWarmup() {
  const oldWarmup = deferred();
  const controller = createSharedAudioWarmupController();
  const audio = new MockSharedAudio(oldWarmup.promise);

  controller.prepare(audio);
  controller.invalidate();
  audio.startRealPlayback();
  oldWarmup.resolve();
  await flushPromises();

  assertAudiblePlaying(audio, "new session");
  assert.equal(audio.pauseCalls, 0);
}

async function testSecondGestureInvalidatesFirstWarmup() {
  const firstWarmup = deferred();
  const controller = createSharedAudioWarmupController();
  const audio = new MockSharedAudio(firstWarmup.promise);

  controller.prepare(audio);
  // A second real user gesture starts another warm-up while the first is pending.
  controller.prepare(audio);
  audio.startRealPlayback();
  firstWarmup.resolve();
  await flushPromises();

  assertAudiblePlaying(audio, "second gesture");
  assert.equal(audio.pauseCalls, 0);
}

async function testIdleWarmupMayPauseOnlyIdleAudio() {
  const pending = deferred();
  const controller = createSharedAudioWarmupController();
  const audio = new MockSharedAudio(pending.promise);

  controller.prepare(audio);
  pending.resolve();
  await flushPromises();

  assert.equal(audio.pauseCalls, 1, "settled idle warm-up pauses only idle audio");
  assert.equal(audio.muted, false, "idle completion does not retain mute");
}

function testAudibleGatePreservesNonZeroVolume() {
  const pending = deferred();
  const audio = new MockSharedAudio(pending.promise);
  audio.muted = true;
  audio.volume = 0;
  ensureSharedAudioAudible(audio as unknown as HTMLAudioElement);
  assert.equal(audio.muted, false);
  assert.equal(audio.volume, 1);

  audio.volume = 0.35;
  ensureSharedAudioAudible(audio as unknown as HTMLAudioElement);
  assert.equal(audio.volume, 0.35, "does not overwrite non-zero volume");
}

await testWarmupSettlementDoesNotTouchRealPlayback(
  "immediate resolve",
  ({ resolve }) => resolve(),
);
await testWarmupSettlementDoesNotTouchRealPlayback(
  "immediate reject",
  ({ reject }) => reject(new DOMException("warm-up rejected", "AbortError")),
);
await testWarmupSettlementDoesNotTouchRealPlayback(
  "delayed resolve",
  ({ resolve }) => resolve(),
);
await testWarmupSettlementDoesNotTouchRealPlayback(
  "delayed reject",
  ({ reject }) => reject(new DOMException("warm-up rejected", "AbortError")),
);
await testPendingWarmupCannotMutePlayback();
await testNewSessionInvalidatesOldWarmup();
await testSecondGestureInvalidatesFirstWarmup();
await testIdleWarmupMayPauseOnlyIdleAudio();
testAudibleGatePreservesNonZeroVolume();

console.log("shared-audio-warmup-unit: ok");
