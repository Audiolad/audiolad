export const MIN_INTERVAL_POSITION_DELTA_SECONDS = 1;

export type IntervalProgressSnapshot = {
  practiceId: string;
  trackId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  isPlaying: boolean;
};

export type ProgressIntervalClock = {
  setTimeout: (callback: () => void, delay?: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (callback: () => void, interval?: number) => unknown;
  clearInterval: (id: unknown) => void;
  /** When present, waits advance virtual time instead of parking on the event loop. */
  advanceBy?: (ms: number) => void;
};

function resolveClock(clock?: ProgressIntervalClock): ProgressIntervalClock {
  if (clock) {
    return clock;
  }

  return {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (id) => {
      globalThis.clearTimeout(id as NodeJS.Timeout);
    },
    setInterval: (callback, interval) => globalThis.setInterval(callback, interval),
    clearInterval: (id) => {
      globalThis.clearInterval(id as NodeJS.Timeout);
    },
  };
}

function waitMs(ms: number, clock: ProgressIntervalClock): Promise<void> {
  if (typeof clock.advanceBy === "function") {
    clock.advanceBy(ms);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    clock.setTimeout(() => resolve(), ms);
  });
}

export function shouldSkipIntervalProgressSave(
  snapshot: IntervalProgressSnapshot,
  lastSavedPositionSeconds: number,
): boolean {
  if (!snapshot.isPlaying) {
    return true;
  }

  if (!snapshot.practiceId || !snapshot.trackId) {
    return true;
  }

  if (!Number.isFinite(snapshot.positionSeconds) || snapshot.positionSeconds <= 0) {
    return true;
  }

  const duration = snapshot.durationSeconds;

  if (
    duration !== null &&
    (!Number.isFinite(duration) || duration <= 0)
  ) {
    return true;
  }

  if (
    lastSavedPositionSeconds >= 0 &&
    Math.abs(snapshot.positionSeconds - lastSavedPositionSeconds) <
      MIN_INTERVAL_POSITION_DELTA_SECONDS
  ) {
    return true;
  }

  return false;
}

/**
 * Simulates the pre-fix interval pattern where the effect re-runs whenever
 * playback time updates (e.g. on every audio timeupdate).
 */
export async function simulateBuggyProgressInterval(options: {
  intervalMs: number;
  tick: () => void;
  advanceMs: number;
  timeupdateEveryMs: number;
  clock?: ProgressIntervalClock;
}): Promise<{ tickCount: number; effectRuns: number }> {
  const clock = resolveClock(options.clock);
  let tickCount = 0;
  let effectRuns = 0;
  let intervalId: unknown = null;

  const setupEffect = () => {
    effectRuns += 1;

    if (intervalId !== null) {
      clock.clearInterval(intervalId);
      intervalId = null;
    }

    intervalId = clock.setInterval(() => {
      tickCount += 1;
      options.tick();
    }, options.intervalMs);
  };

  setupEffect();

  const steps = Math.floor(options.advanceMs / options.timeupdateEveryMs);

  for (let step = 0; step < steps; step += 1) {
    await waitMs(options.timeupdateEveryMs, clock);
    setupEffect();
  }

  const remainder = options.advanceMs % options.timeupdateEveryMs;
  if (remainder > 0) {
    await waitMs(remainder, clock);
  }

  if (intervalId !== null) {
    clock.clearInterval(intervalId);
  }

  return { tickCount, effectRuns };
}

/**
 * Simulates the ref-based interval pattern: time updates do not recreate the timer.
 */
export async function simulateStableProgressInterval(options: {
  intervalMs: number;
  tick: (positionSeconds: number) => void;
  advanceMs: number;
  timeupdateEveryMs: number;
  clock?: ProgressIntervalClock;
}): Promise<{
  tickCount: number;
  effectRuns: number;
  lastSavedPosition: number | null;
}> {
  const clock = resolveClock(options.clock);
  let tickCount = 0;
  const effectRuns = 1;
  let lastSavedPosition: number | null = null;
  const positionRef = { current: 0 };

  const intervalId = clock.setInterval(() => {
    tickCount += 1;
    options.tick(positionRef.current);
    lastSavedPosition = positionRef.current;
  }, options.intervalMs);

  const steps = Math.floor(options.advanceMs / options.timeupdateEveryMs);

  for (let step = 0; step < steps; step += 1) {
    // timeupdate lands before the virtual clock advances, so an interval
    // that fires on this step reads the updated playback position.
    positionRef.current += options.timeupdateEveryMs / 1000;
    await waitMs(options.timeupdateEveryMs, clock);
  }

  const remainder = options.advanceMs % options.timeupdateEveryMs;
  if (remainder > 0) {
    positionRef.current += remainder / 1000;
    await waitMs(remainder, clock);
  }

  clock.clearInterval(intervalId);

  return { tickCount, effectRuns, lastSavedPosition };
}

/**
 * Ensures interval callbacks stop after cleanup.
 */
export async function simulateIntervalCleanup(options: {
  intervalMs: number;
  tick: () => void;
  runMs: number;
  clock?: ProgressIntervalClock;
}): Promise<number> {
  const clock = resolveClock(options.clock);
  let tickCount = 0;

  const intervalId = clock.setInterval(() => {
    tickCount += 1;
    options.tick();
  }, options.intervalMs);

  await waitMs(options.runMs, clock);
  clock.clearInterval(intervalId);
  const countAfterCleanup = tickCount;
  await waitMs(options.intervalMs + 100, clock);

  return countAfterCleanup;
}
