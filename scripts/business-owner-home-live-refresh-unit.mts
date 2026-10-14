import assert from "node:assert/strict";
import {
  ageOwnerHomeSignals,
  startOwnerHomeLiveRefresh,
  OWNER_HOME_LIVE_REFRESH_MS,
} from "../src/lib/business-app/owner-home-live-refresh";
import { deriveOwnerConnectivitySignal, deriveOwnerPlaybackSignal } from "../src/lib/business-app/owner-home-signals";
import { formatBusinessAge } from "../src/lib/business-app/owner-home-status-copy";

function fakeEnv() {
  let now = 0; let hidden = false; let tick: (() => void) | null = null; let wake: (() => void) | null = null;
  let cancelled = false; let removed = false;
  return {
    env: {
      now: () => now, isHidden: () => hidden,
      schedule: (cb: () => void) => { tick = cb; return 1; },
      cancel: () => { cancelled = true; },
      addWakeListener: (cb: () => void) => { wake = cb; return () => { removed = true; }; },
    },
    advance: (ms: number) => { now += ms; }, setHidden: (h: boolean) => { hidden = h; },
    tick: () => tick!(), wake: () => wake!(), state: () => ({ cancelled, removed }),
  };
}

assert.ok(OWNER_HOME_LIVE_REFRESH_MS >= 10_000 && OWNER_HOME_LIVE_REFRESH_MS <= 20_000);
{
  const f = fakeEnv(); let n = 0;
  const stop = startOwnerHomeLiveRefresh(() => n++, 15_000, f.env);
  f.advance(15_000); f.tick(); assert.equal(n, 1, "interval refreshes");
  f.setHidden(true); f.advance(15_000); f.tick(); assert.equal(n, 1, "hidden tab does not poll");
  f.setHidden(false); f.advance(1_000); f.wake(); assert.equal(n, 2, "visible again → immediate refresh");
  f.advance(500); f.wake(); assert.equal(n, 2, "focus burst throttled");
  stop(); f.advance(20_000); f.tick(); f.wake(); assert.equal(n, 2, "stopped ignores queued callbacks");
  assert.deepEqual(f.state(), { cancelled: true, removed: true });
}

const base = {
  pointState: "playing", playerCount: 1, primaryHealthStatus: "online", secondsSinceHeartbeat: 20,
  stoppedMinutes: null, lastBusinessPlayAt: null, lastPlayMinutesAgo: null, lastSeenSeconds: 20,
  playbackState: "playing", playbackConfirmedAt: "2026-10-14T10:00:00Z", playbackConfirmedSecondsAgo: 10,
  currentTrack: { title: "T" }, liveConnected: true, source: "player_health",
} as const;
assert.equal(ageOwnerHomeSignals(base as never, 0), base, "no elapsed → same object");
assert.equal(ageOwnerHomeSignals(null, 30), null);
const aged = ageOwnerHomeSignals(base as never, 120)!;
assert.equal(aged.secondsSinceHeartbeat, 140); assert.equal(aged.lastSeenSeconds, 140);
assert.equal(aged.playbackConfirmedSecondsAgo, 130); assert.equal(aged.liveConnected, true);
assert.equal(aged.lastPlayMinutesAgo, null, "missing data stays missing");
assert.equal(formatBusinessAge((base.secondsSinceHeartbeat) / 60), "только что");
assert.equal(formatBusinessAge(aged.secondsSinceHeartbeat! / 60), "2 мин назад", "label ticks");
const stale = ageOwnerHomeSignals(base as never, 400)!;
assert.equal(stale.liveConnected, false, "link window lapses without reload");
assert.equal(deriveOwnerConnectivitySignal(stale).kind, "offline");
const nowMs = (s: typeof aged) => Date.parse(s.playbackConfirmedAt!) + s.playbackConfirmedSecondsAgo! * 1000;
const fresh = deriveOwnerPlaybackSignal({ nowMs: nowMs(aged), playbackState: "playing", playbackConfirmedAt: base.playbackConfirmedAt });
const old = deriveOwnerPlaybackSignal({ nowMs: nowMs(stale), playbackState: "playing", playbackConfirmedAt: base.playbackConfirmedAt });
assert.notEqual(fresh.kind, old.kind, "confirmed playback expires as time passes");
console.log("business-owner-home-live-refresh-unit OK");
