#!/usr/bin/env node
/**
 * Guest progress interval regression tests.
 * Reproduces the bug where currentTime in effect deps reset the 12s timer.
 */
import { readFileSync } from "node:fs";

import {
  shouldSkipIntervalProgressSave,
  simulateBuggyProgressInterval,
  simulateIntervalCleanup,
  simulateStableProgressInterval,
} from "../src/lib/promo/progress-interval.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testUseSequentialPlayerDoesNotDependIntervalOnCurrentTime() {
  const source = readFileSync(
    "/var/www/audiolad/src/components/audio/useSequentialPlayer.ts",
    "utf8",
  );

  const intervalEffect = source.match(
    /runIntervalProgressSave[\s\S]*?useEffect\(\(\) => \{[\s\S]*?PROGRESS_SAVE_INTERVAL_MS[\s\S]*?\}, \[([^\]]+)\]\);/,
  );

  assert(intervalEffect, "interval effect block exists");

  const dependencies = intervalEffect[1];

  assert(
    !dependencies.includes("currentTime"),
    "interval effect must not depend on currentTime",
  );
  assert(
    dependencies.includes("currentTrack?.id"),
    "interval effect should depend on currentTrack?.id",
  );
  assert(
    source.includes("currentTimeRef"),
    "currentTimeRef should store live playback position",
  );
  assert(
    source.includes("flushProgressRef"),
    "pagehide flush should use stable flushProgressRef",
  );
}

function testShouldSkipIntervalGuards() {
  assert(
    shouldSkipIntervalProgressSave(
      {
        practiceId: "",
        trackId: "track-1",
        positionSeconds: 12,
        durationSeconds: 600,
        isPlaying: true,
      },
      -1,
    ),
    "missing practiceId skips save",
  );

  assert(
    shouldSkipIntervalProgressSave(
      {
        practiceId: "practice-1",
        trackId: "",
        positionSeconds: 12,
        durationSeconds: 600,
        isPlaying: true,
      },
      -1,
    ),
    "missing trackId skips save",
  );

  assert(
    shouldSkipIntervalProgressSave(
      {
        practiceId: "practice-1",
        trackId: "track-1",
        positionSeconds: 0,
        durationSeconds: 600,
        isPlaying: true,
      },
      -1,
    ),
    "zero position skips save",
  );

  assert(
    shouldSkipIntervalProgressSave(
      {
        practiceId: "practice-1",
        trackId: "track-1",
        positionSeconds: 12,
        durationSeconds: 0,
        isPlaying: true,
      },
      -1,
    ),
    "invalid duration skips save",
  );

  assert(
    shouldSkipIntervalProgressSave(
      {
        practiceId: "practice-1",
        trackId: "track-1",
        positionSeconds: 12.2,
        durationSeconds: 600,
        isPlaying: true,
      },
      12,
    ),
    "insignificant position delta skips save",
  );

  assert(
    !shouldSkipIntervalProgressSave(
      {
        practiceId: "practice-1",
        trackId: "track-1",
        positionSeconds: 13,
        durationSeconds: 600,
        isPlaying: true,
      },
      -1,
    ),
    "valid snapshot should save",
  );
}

async function testBuggyPatternNeverTicksWithin13Seconds() {
  const result = await simulateBuggyProgressInterval({
    intervalMs: 120,
    advanceMs: 130,
    timeupdateEveryMs: 10,
    tick: () => {},
  });

  assert(result.effectRuns > 5, "buggy pattern should recreate effect often");
  assert(result.tickCount === 0, "buggy pattern should not reach interval tick");
}

async function testStablePatternTicksOnceWithin13Seconds() {
  const saves = [];

  const result = await simulateStableProgressInterval({
    intervalMs: 120,
    advanceMs: 130,
    timeupdateEveryMs: 10,
    tick: (positionSeconds) => {
      saves.push(positionSeconds);
    },
  });

  assert(result.effectRuns === 1, "stable pattern should not recreate interval");
  assert(result.tickCount === 1, "stable pattern should tick once in 13s");
  assert(
    result.lastSavedPosition !== null && result.lastSavedPosition > 0.1,
    "saved position should reflect playback time",
  );
  assert(saves.length === 1, "only one interval save expected in 13s");
}

async function testCleanupStopsFurtherTicks() {
  const tickCount = await simulateIntervalCleanup({
    intervalMs: 50,
    runMs: 130,
    tick: () => {},
  });

  assert(tickCount >= 2, "interval should tick before cleanup");
  assert(tickCount <= 3, "interval should not keep ticking after cleanup");
}

async function testThirteenSecondGuestProgressWithoutPagehide() {
  const storage = new Map();
  let saveCount = 0;
  let intervalId = null;
  let lastSavedPosition = -1;
  const positionRef = { current: 0 };
  const startedAt = Date.now();

  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    },
  };

  const { saveGuestPracticeProgress, buildGuestProgressPayload } = await import(
    "../src/lib/promo/guest-progress.ts"
  );

  intervalId = setInterval(() => {
    const position = positionRef.current;

    if (
      shouldSkipIntervalProgressSave(
        {
          practiceId: "practice-1",
          trackId: "track-1",
          positionSeconds: position,
          durationSeconds: 600,
          isPlaying: true,
        },
        lastSavedPosition,
      )
    ) {
      return;
    }

    saveCount += 1;
    lastSavedPosition = position;

    saveGuestPracticeProgress(
      buildGuestProgressPayload({
        practiceId: "practice-1",
        practiceSlug: "elixir-molodosti",
        trackId: "track-1",
        positionSeconds: position,
        durationSeconds: 600,
        started: true,
        completed: false,
      }),
    );
  }, 120);

  while (Date.now() - startedAt < 130) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    positionRef.current += 0.01;
  }

  clearInterval(intervalId);

  const raw = storage.get("audiolad_gp:practice-1");
  const parsed = raw ? JSON.parse(raw) : null;

  assert(saveCount === 1, "expected exactly one interval save in 13 seconds");
  assert(raw, "guest progress saved by interval");
  assert(
    parsed.positionSeconds > 0.1,
    "saved position reflects simulated playback progress",
  );

  delete globalThis.window;
}

const tests = [
  [
    "useSequentialPlayer interval deps",
    testUseSequentialPlayerDoesNotDependIntervalOnCurrentTime,
  ],
  ["interval save guards", testShouldSkipIntervalGuards],
  ["buggy pattern never ticks", testBuggyPatternNeverTicksWithin13Seconds],
  ["stable pattern ticks once", testStablePatternTicksOnceWithin13Seconds],
  ["cleanup stops interval", testCleanupStopsFurtherTicks],
  [
    "13s guest progress without pagehide",
    testThirteenSecondGuestProgressWithoutPagehide,
  ],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length} guest progress interval checks passed`);
console.log("guest progress saved by interval");
console.log("position > 10 seconds");
console.log("no pagehide required");
