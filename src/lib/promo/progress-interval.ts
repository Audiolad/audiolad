export const MIN_INTERVAL_POSITION_DELTA_SECONDS = 1;

export type IntervalProgressSnapshot = {
  practiceId: string;
  trackId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  isPlaying: boolean;
};

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

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
}): Promise<{ tickCount: number; effectRuns: number }> {
  let tickCount = 0;
  let effectRuns = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const setupEffect = () => {
    effectRuns += 1;

    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }

    intervalId = setInterval(() => {
      tickCount += 1;
      options.tick();
    }, options.intervalMs);
  };

  setupEffect();

  const steps = Math.floor(options.advanceMs / options.timeupdateEveryMs);

  for (let step = 0; step < steps; step += 1) {
    await waitMs(options.timeupdateEveryMs);
    setupEffect();
  }

  await waitMs(options.advanceMs % options.timeupdateEveryMs || 0);

  if (intervalId !== null) {
    clearInterval(intervalId);
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
}): Promise<{
  tickCount: number;
  effectRuns: number;
  lastSavedPosition: number | null;
}> {
  let tickCount = 0;
  const effectRuns = 1;
  let lastSavedPosition: number | null = null;
  const positionRef = { current: 0 };
  let intervalId: ReturnType<typeof setInterval> | null = null;

  intervalId = setInterval(() => {
    tickCount += 1;
    options.tick(positionRef.current);
    lastSavedPosition = positionRef.current;
  }, options.intervalMs);

  const steps = Math.floor(options.advanceMs / options.timeupdateEveryMs);

  for (let step = 0; step < steps; step += 1) {
    await waitMs(options.timeupdateEveryMs);
    positionRef.current += options.timeupdateEveryMs / 1000;
  }

  await waitMs(options.advanceMs % options.timeupdateEveryMs || 0);

  if (intervalId !== null) {
    clearInterval(intervalId);
  }

  return { tickCount, effectRuns, lastSavedPosition };
}

/**
 * Ensures interval callbacks stop after cleanup.
 */
export async function simulateIntervalCleanup(options: {
  intervalMs: number;
  tick: () => void;
  runMs: number;
}): Promise<number> {
  let tickCount = 0;

  const intervalId = setInterval(() => {
    tickCount += 1;
    options.tick();
  }, options.intervalMs);

  await waitMs(options.runMs);
  clearInterval(intervalId);
  const countAfterCleanup = tickCount;
  await waitMs(options.intervalMs + 100);

  return countAfterCleanup;
}
