import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  completionThresholdSeconds,
  completionToleranceSeconds,
  createListeningProgressState,
  getNewlyReachedMilestones,
  isListeningCompleted,
  updateListeningProgressState,
  type ListeningProgressState,
} from "../src/lib/analytics/listening";
import {
  rememberContinuousListenCompleted,
  resetContinuousListenSession,
} from "../src/lib/listen/repeat-analytics";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function update(
  state: ListeningProgressState,
  input: {
    currentTime: number;
    duration: number;
    isPlaying?: boolean;
    wallDeltaSeconds: number;
    programCompleted?: boolean;
  },
): ListeningProgressState {
  return updateListeningProgressState(state, {
    currentTime: input.currentTime,
    duration: input.duration,
    isPlaying: input.isPlaying !== false,
    deltaSeconds: Math.min(5, Math.max(0, input.wallDeltaSeconds)),
    wallDeltaSeconds: input.wallDeltaSeconds,
  });
}

function playTo(duration: number, toSeconds: number): ListeningProgressState {
  const state = update(createListeningProgressState(), {
    currentTime: 0,
    duration,
    wallDeltaSeconds: 0,
  });
  return advance(state, toSeconds, duration);
}

function advance(
  state: ListeningProgressState,
  toSeconds: number,
  duration: number,
  step = 1,
): ListeningProgressState {
  let current = state;
  const start = current.playbackAnchorSeconds;
  if (toSeconds <= start) {
    return current;
  }

  const ticks = Math.ceil((toSeconds - start) / step);
  for (let index = 1; index <= ticks; index += 1) {
    const currentTime = Math.min(toSeconds, start + index * step);
    current = update(current, {
      currentTime,
      duration,
      wallDeltaSeconds: step,
    });
  }

  return current;
}

function seek(
  state: ListeningProgressState,
  toSeconds: number,
  duration: number,
): ListeningProgressState {
  return update(state, {
    currentTime: toSeconds,
    duration,
    wallDeltaSeconds: 0.25,
  });
}

function completed(
  state: ListeningProgressState,
  duration: number,
  currentTime: number,
  programCompleted = false,
): boolean {
  return isListeningCompleted(state, {
    currentTime,
    duration,
    programCompleted,
  });
}

function testToleranceExamples() {
  assert.equal(completionToleranceSeconds(20 * 60), 30);
  assert.equal(completionThresholdSeconds(20 * 60), 19 * 60 + 30);

  assert.equal(completionToleranceSeconds(10 * 60), 30);
  assert.equal(completionThresholdSeconds(10 * 60), 9 * 60 + 30);

  assert.equal(completionToleranceSeconds(5 * 60), 30);
  assert.equal(completionThresholdSeconds(5 * 60), 4 * 60 + 30);

  assert.equal(completionToleranceSeconds(60), 6);
  assert.equal(completionThresholdSeconds(60), 54);

  assert.equal(completionToleranceSeconds(0), 0);
  assert.equal(completionThresholdSeconds(0), Number.POSITIVE_INFINITY);
}

function testAcceptancePositions() {
  const long = 20 * 60;

  const at1935 = playTo(long, 19 * 60 + 35);
  assert.equal(
    completed(at1935, long, 19 * 60 + 35),
    true,
    "20:00 stopped at 19:35 is completed",
  );

  const paused = update(at1935, {
    currentTime: 19 * 60 + 35,
    duration: long,
    isPlaying: false,
    wallDeltaSeconds: 30,
  });
  assert.equal(
    completed(paused, long, 19 * 60 + 35),
    true,
    "pause after the zone keeps the completion",
  );

  const at1920 = playTo(long, 19 * 60 + 20);
  assert.equal(
    completed(at1920, long, 19 * 60 + 20),
    false,
    "20:00 stopped at 19:20 is not completed",
  );

  const at55 = playTo(60, 55);
  assert.equal(completed(at55, 60, 55), true, "60s stopped at 55s is completed");

  const at50 = playTo(60, 50);
  assert.equal(completed(at50, 60, 50), false, "60s stopped at 50s is not completed");

  const seeked = seek(playTo(long, 10), 19 * 60 + 40, long);
  assert.equal(
    completed(seeked, long, 19 * 60 + 40),
    false,
    "seek 00:10 → 19:40 does not complete",
  );
  const stillInside = advance(seeked, 19 * 60 + 50, long);
  assert.equal(
    completed(stillInside, long, 19 * 60 + 50),
    false,
    "playback that stays inside the zone after a seek still does not complete",
  );

  const crossed = playTo(long, 19 * 60 + 31);
  assert.equal(
    completed(crossed, long, 19 * 60 + 31),
    true,
    "normal playback that crosses 19:30 completes",
  );

  const seekBeforeZone = seek(playTo(long, 10), 19 * 60 + 20, long);
  const playedAcross = advance(seekBeforeZone, 19 * 60 + 35, long);
  assert.equal(
    completed(playedAcross, long, 19 * 60 + 35),
    true,
    "a seek that lands before the zone still completes once playback crosses it",
  );
}

function testOneCompletionPerPlay() {
  const duration = 20 * 60;
  let state = playTo(duration, 19 * 60 + 35);
  let tracked = false;
  let emits = 0;

  const observe = (next: ListeningProgressState, programCompleted = false) => {
    if (
      !tracked &&
      completed(next, duration, next.playbackAnchorSeconds, programCompleted)
    ) {
      tracked = true;
      emits += 1;
    }
  };

  observe(state);
  assert.equal(emits, 1, "crossing the zone emits once");

  state = seek(state, 15, duration);
  observe(state);
  let flips = 0;
  for (let time = state.playbackAnchorSeconds + 1; time <= duration; time += 1) {
    const before = state.completionReached;
    state = update(state, { currentTime: time, duration, wallDeltaSeconds: 1 });
    if (!before && state.completionReached) {
      flips += 1;
    }
    observe(state, time === duration);
  }

  assert.equal(flips, 0, "re-entering the final zone does not arm completion again");
  assert.equal(emits, 1, "seek back and reach the end again is still one completion");
  assert.equal(state.completionReached, true);

  // programCompleted resets the tracker's local flag; the continuous session
  // still refuses a second audio_completed for the same item.
  resetContinuousListenSession();
  assert.equal(rememberContinuousListenCompleted("practice", "track", 1_000), true);
  tracked = false;
  const replay = playTo(duration, duration);
  if (completed(replay, duration, duration, true)) {
    if (rememberContinuousListenCompleted("practice", "track", 2_000)) {
      emits += 1;
    }
  }
  assert.equal(emits, 1, "a replay in the same continuous session does not emit again");

  assert.equal(
    completed(playTo(duration, 30), duration, 30, true),
    true,
    "ended still counts even when the final zone was not crossed",
  );
}

function testSparsePlaybackStillCrosses() {
  const duration = 20 * 60;
  const before = playTo(duration, 19 * 60);
  const caughtUp = update(before, {
    currentTime: 19 * 60 + 40,
    duration,
    wallDeltaSeconds: 40,
  });
  assert.equal(
    completed(caughtUp, duration, 19 * 60 + 40),
    true,
    "a 40s playhead advance over 40s of wall time crosses the zone",
  );

  const scrub = update(before, {
    currentTime: 19 * 60 + 40,
    duration,
    wallDeltaSeconds: 0.25,
  });
  assert.equal(
    completed(scrub, duration, 19 * 60 + 40),
    false,
    "the same position jump in 0.25s is a seek",
  );
}

function testMilestonesUnchanged() {
  const progress = createListeningProgressState();
  const atStart = updateListeningProgressState(progress, {
    currentTime: 0,
    duration: 100,
    isPlaying: true,
    deltaSeconds: 0,
  });
  assert.deepEqual(getNewlyReachedMilestones(progress, atStart), []);

  const at25 = updateListeningProgressState(atStart, {
    currentTime: 25,
    duration: 100,
    isPlaying: true,
    deltaSeconds: 25,
  });
  assert.deepEqual(getNewlyReachedMilestones(atStart, at25), ["audio_progress_25"]);
  assert.equal(completed(at25, 100, 25), false);
}

function testSharedStatsWiring() {
  const tracker = read("src/components/analytics/ListenAnalyticsTracker.tsx");
  const analytics = read("src/components/analytics/GlobalPlaybackAnalytics.tsx");
  const dictionary = read("src/lib/admin/analytics-metrics-dictionary.ts");
  const client = read("src/lib/analytics/client.ts");
  const progress = read("src/lib/listen/progress.ts");

  assert.match(tracker, /wallDeltaSeconds/);
  assert.match(tracker, /isListeningCompleted/);
  assert.match(tracker, /event_name: "audio_completed"/);
  assert.match(tracker, /context\.completionTracked/);
  assert.match(tracker, /rememberContinuousListenCompleted/);
  assert.match(tracker, /hasTrackedListeningMilestone\(listeningKey, "audio_completed"\)/);
  assert.match(analytics, /programCompleted=\{engine\.programCompleted\}/);
  assert.match(analytics, /<ListenAnalyticsTracker/);
  assert.match(client, /keepalive: true/);
  assert.match(dictionary, /event_name = audio_completed/);
  assert.match(dictionary, /formula: "COUNT\(\*\)"/);
  assert.match(dictionary, /COUNT\(DISTINCT visitor_key\)/);
  assert.match(progress, /COMPLETION_THRESHOLD_SECONDS = 2/);
  assert.doesNotMatch(
    read("src/lib/analytics/listening.ts"),
    /currentTime >= input\.duration - 2/,
    "completion is no longer the last-two-seconds gate",
  );
}

testToleranceExamples();
testAcceptancePositions();
testOneCompletionPerPlay();
testSparsePlaybackStillCrosses();
testMilestonesUnchanged();
testSharedStatsWiring();

console.log("listen-completion-zone-unit: ok");
