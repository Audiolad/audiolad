#!/usr/bin/env node
/**
 * Live 13s guest progress interval check (no pagehide).
 * Uses real 12s timer — run manually before production deploy.
 */
import {
  buildGuestProgressPayload,
  saveGuestPracticeProgress,
} from "../src/lib/promo/guest-progress.ts";
import { shouldSkipIntervalProgressSave } from "../src/lib/promo/progress-interval.ts";

const INTERVAL_MS = 12_000;
const RUN_MS = 13_000;

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
}, INTERVAL_MS);

const startedAt = Date.now();

while (Date.now() - startedAt < RUN_MS) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  positionRef.current += 0.1;
}

clearInterval(intervalId);

const raw = storage.get("audiolad_gp:practice-1");
const parsed = raw ? JSON.parse(raw) : null;

if (!raw || saveCount !== 1 || !parsed || parsed.positionSeconds <= 10) {
  console.error("GUEST_PROGRESS_LIVE_FAIL", {
    saveCount,
    positionSeconds: parsed?.positionSeconds ?? null,
  });
  process.exit(1);
}

console.log("guest progress saved by interval");
console.log(`position > 10 seconds (${parsed.positionSeconds.toFixed(1)}s)`);
console.log("no pagehide required");
console.log("GUEST_PROGRESS_LIVE_PASS");

delete globalThis.window;
