#!/usr/bin/env node
/**
 * Guest progress interval regression tests.
 * Reproduces the bug where currentTime in effect deps reset the 12s timer.
 *
 * All timing is driven by a deterministic fake clock — no wall-clock waits.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  shouldSkipIntervalProgressSave,
  simulateBuggyProgressInterval,
  simulateIntervalCleanup,
  simulateStableProgressInterval,
} from "../src/lib/promo/progress-interval.ts";
import { createFakeClock } from "./lib/fake-clock.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Production save interval (ms). Semantic scale — not wall-clock compressed. */
const PROGRESS_SAVE_INTERVAL_MS = 12_000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testUseSequentialPlayerDoesNotDependIntervalOnCurrentTime() {
  const source = readFileSync(
    join(ROOT, "src/components/audio/useSequentialPlayer.ts"),
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
  assert(
    source.includes(`PROGRESS_SAVE_INTERVAL_MS`) ||
      source.includes("12_000") ||
      source.includes("12000"),
    "production defines the 12s progress save interval",
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

async function withFakeClock(run) {
  const clock = createFakeClock();
  const restore = clock.install();
  try {
    await run(clock);
    assert(clock.pendingCount() === 0, "no pending timers after test");
  } finally {
    restore();
  }
}

async function testBuggyPatternNeverTicksWithin13Seconds() {
  await withFakeClock(async (clock) => {
    const result = await simulateBuggyProgressInterval({
      intervalMs: PROGRESS_SAVE_INTERVAL_MS,
      advanceMs: PROGRESS_SAVE_INTERVAL_MS + 1_000,
      timeupdateEveryMs: 250,
      tick: () => {},
      clock,
    });

    assert(result.effectRuns > 5, "buggy pattern should recreate effect often");
    assert(result.tickCount === 0, "buggy pattern should not reach interval tick");
  });
}

async function testStablePatternTicksOnceWithin13Seconds() {
  await withFakeClock(async (clock) => {
    const saves = [];
    const result = await simulateStableProgressInterval({
      intervalMs: PROGRESS_SAVE_INTERVAL_MS,
      advanceMs: PROGRESS_SAVE_INTERVAL_MS + 1_000,
      timeupdateEveryMs: 250,
      tick: (positionSeconds) => {
        saves.push(positionSeconds);
      },
      clock,
    });

    assert(result.effectRuns === 1, "stable pattern should not recreate interval");
    assert(result.tickCount === 1, "stable pattern should tick once in 13s");
    assert(
      result.lastSavedPosition !== null && result.lastSavedPosition >= 12,
      "saved position should reflect playback time",
    );
    assert(saves.length === 1, "only one interval save expected in 13s");
  });
}

async function testCleanupStopsFurtherTicks() {
  await withFakeClock(async (clock) => {
    const tickCount = await simulateIntervalCleanup({
      intervalMs: 5_000,
      runMs: 13_000,
      tick: () => {},
      clock,
    });

    assert(tickCount >= 2, "interval should tick before cleanup");
    assert(tickCount <= 3, "interval should not keep ticking after cleanup");
  });
}

async function testThirteenSecondGuestProgressWithoutPagehide() {
  await withFakeClock(async (clock) => {
    const storage = new Map();
    let saveCount = 0;
    let lastSavedPosition = -1;
    const positionRef = { current: 0 };

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

    try {
      const { saveGuestPracticeProgress, buildGuestProgressPayload } =
        await import("../src/lib/promo/guest-progress.ts");

      const intervalId = setInterval(() => {
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
      }, PROGRESS_SAVE_INTERVAL_MS);

      assert(clock.pendingCount() === 1, "interval is scheduled");

      // Before first threshold: playback has advanced, but save must not fire.
      positionRef.current = (PROGRESS_SAVE_INTERVAL_MS - 1) / 1000;
      clock.advanceBy(PROGRESS_SAVE_INTERVAL_MS - 1);
      assert(saveCount === 0, "no save before the 12s threshold");
      assert(!storage.get("audiolad_gp:practice-1"), "storage empty before threshold");

      // At threshold: production save reads the live playback position.
      positionRef.current = PROGRESS_SAVE_INTERVAL_MS / 1000;
      clock.advanceBy(1);
      assert(saveCount === 1, "expected exactly one interval save in 13 seconds");

      const raw = storage.get("audiolad_gp:practice-1");
      const parsed = raw ? JSON.parse(raw) : null;
      assert(raw, "guest progress saved by interval");
      assert(
        parsed.positionSeconds === 12,
        "saved position reflects simulated playback progress",
      );

      // Before second threshold — still a single save.
      positionRef.current = (PROGRESS_SAVE_INTERVAL_MS * 2 - 1) / 1000;
      clock.advanceBy(PROGRESS_SAVE_INTERVAL_MS - 1);
      assert(saveCount === 1, "no duplicate save before the next threshold");

      clearInterval(intervalId);
      positionRef.current = (PROGRESS_SAVE_INTERVAL_MS * 2) / 1000;
      clock.advanceBy(PROGRESS_SAVE_INTERVAL_MS);
      assert(saveCount === 1, "cleanup prevents further interval saves");
      assert(clock.pendingCount() === 0, "interval removed from clock");
    } finally {
      delete globalThis.window;
    }
  });
}

async function testFakeClockRestoresGlobalsAfterError() {
  const originalSetTimeout = globalThis.setTimeout;
  const originalDateNow = Date.now;
  const clock = createFakeClock();
  const restore = clock.install();

  try {
    assert(globalThis.setTimeout !== originalSetTimeout, "setTimeout patched");
    throw new Error("forced_error_for_restore_check");
  } catch (error) {
    assert(
      error instanceof Error && error.message === "forced_error_for_restore_check",
      "forced error thrown",
    );
  } finally {
    restore();
  }

  assert(globalThis.setTimeout === originalSetTimeout, "setTimeout restored");
  assert(Date.now === originalDateNow, "Date.now restored");
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
  ["fake clock restores globals after error", testFakeClockRestoresGlobalsAfterError],
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
