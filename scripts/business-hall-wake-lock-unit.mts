#!/usr/bin/env npx tsx
/**
 * Hall screen wake lock (t1350u): the hall device keeps the screen on while music is meant to
 * play, releases it on a local pause / idle / no access, re-acquires when visible again, and
 * fails silently where the API is missing. No migration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HALL_WAKE_LOCK_HINT,
  HallWakeLock,
  hallWakeLockSupported,
  hallWantsScreenAwake,
  type WakeLockDocument,
  type WakeLockNavigator,
} from "../src/lib/business-app/hall-wake-lock";

// --- intent ---
for (const status of ["playing", "loading", "error"]) {
  assert.equal(hallWantsScreenAwake({ status }), true, status);
}
for (const status of ["paused", "idle", "no_access", null, undefined]) {
  assert.equal(hallWantsScreenAwake({ status }), false, String(status));
}
assert.equal(hallWantsScreenAwake(null), false);
assert.equal(hallWantsScreenAwake({ status: "paused", recovering: true }), true, "recovery");
assert.equal(hallWantsScreenAwake({ status: "paused", needsGesture: true }), true, "autoplay refused");
assert.equal(hallWantsScreenAwake({ status: "paused", resumePending: true }), true, "resume pending");
assert.equal(hallWantsScreenAwake({ status: "paused", remotePaused: true }), true, "owner pause keeps commands alive");
assert.equal(hallWantsScreenAwake({ status: "idle", remotePaused: true }), false);
assert.equal(hallWantsScreenAwake({ status: "no_access", recovering: true, remotePaused: true }), false, "no access always releases");

// --- fakes ---
type FakeSentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: "release", fn: () => void) => void; fire: () => void };
function fakeEnv(opts: { reject?: boolean } = {}) {
  const sentinels: FakeSentinel[] = [];
  let requests = 0;
  const pendingResolves: (() => void)[] = [];
  let manual = false;
  const nav: WakeLockNavigator = {
    wakeLock: {
      request: (type) => {
        assert.equal(type, "screen");
        requests++;
        if (opts.reject) return Promise.reject(new Error("NotAllowedError"));
        const listeners: (() => void)[] = [];
        const s: FakeSentinel = {
          released: false,
          release: async () => {
            if (s.released) return;
            s.released = true;
            listeners.forEach((fn) => fn());
          },
          addEventListener: (_t, fn) => listeners.push(fn),
          fire: () => { s.released = true; listeners.forEach((fn) => fn()); },
        };
        sentinels.push(s);
        if (!manual) return Promise.resolve(s);
        return new Promise((resolve) => pendingResolves.push(() => resolve(s)));
      },
    },
  };
  const vis: (() => void)[] = [];
  const doc: WakeLockDocument & { set: (v: string) => void } = {
    visibilityState: "visible",
    addEventListener: (_t, fn) => vis.push(fn),
    removeEventListener: (_t, fn) => { const i = vis.indexOf(fn); if (i >= 0) vis.splice(i, 1); },
    set(v: string) { this.visibilityState = v; vis.slice().forEach((fn) => fn()); },
  };
  return {
    nav, doc, sentinels, vis,
    get requests() { return requests; },
    hold() { manual = true; },
    resolveAll() { pendingResolves.splice(0).forEach((r) => r()); },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

// Acquire while playing, one lock only.
{
  const env = fakeEnv();
  const lock = new HallWakeLock(env.nav, env.doc);
  assert.equal(lock.held, false);
  lock.setWanted(true);
  lock.setWanted(true);
  await flush();
  assert.equal(env.requests, 1, "no double request");
  assert.equal(lock.held, true);
  lock.setWanted(true);
  await flush();
  assert.equal(env.requests, 1, "held lock is reused");
  // Local pause releases.
  lock.setWanted(false);
  await flush();
  assert.equal(env.sentinels[0].released, true);
  assert.equal(lock.held, false);
  lock.dispose();
  assert.equal(env.vis.length, 0, "listener removed on dispose");
}

// Hidden page: the browser drops the lock; visible again → re-acquire, only if still wanted.
{
  const env = fakeEnv();
  const lock = new HallWakeLock(env.nav, env.doc);
  lock.setWanted(true);
  await flush();
  env.doc.visibilityState = "hidden";
  env.sentinels[0].fire();
  env.doc.set("hidden");
  await flush();
  assert.equal(lock.held, false);
  assert.equal(env.requests, 1, "no request from a hidden page");
  env.doc.set("visible");
  await flush();
  assert.equal(env.requests, 2, "re-acquired on visible");
  assert.equal(lock.held, true);
  lock.setWanted(false);
  env.doc.set("hidden");
  env.doc.set("visible");
  await flush();
  assert.equal(env.requests, 2, "not wanted → no re-acquire");
  lock.dispose();
}

// Wanted while hidden: waits for visible.
{
  const env = fakeEnv();
  env.doc.visibilityState = "hidden";
  const lock = new HallWakeLock(env.nav, env.doc);
  lock.setWanted(true);
  await flush();
  assert.equal(env.requests, 0);
  env.doc.set("visible");
  await flush();
  assert.equal(env.requests, 1);
  assert.equal(lock.held, true);
  lock.dispose();
  assert.equal(env.sentinels[0].released, true, "dispose releases");
}

// A pause while the request is in flight releases the late sentinel.
{
  const env = fakeEnv();
  env.hold();
  const lock = new HallWakeLock(env.nav, env.doc);
  lock.setWanted(true);
  lock.setWanted(false);
  env.resolveAll();
  await flush();
  assert.equal(lock.held, false);
  assert.equal(env.sentinels[0].released, true, "late sentinel released");
  lock.dispose();
}

// Dispose while in flight.
{
  const env = fakeEnv();
  env.hold();
  const lock = new HallWakeLock(env.nav, env.doc);
  lock.setWanted(true);
  lock.dispose();
  env.resolveAll();
  await flush();
  assert.equal(env.sentinels[0].released, true);
  lock.setWanted(true);
  await flush();
  assert.equal(env.requests, 1, "disposed lock never requests");
}

// Refused request (battery saver, permissions policy): silent, retried on next visible.
{
  const env = fakeEnv({ reject: true });
  const lock = new HallWakeLock(env.nav, env.doc);
  lock.setWanted(true);
  await flush();
  assert.equal(lock.held, false);
  env.doc.set("visible");
  await flush();
  assert.equal(env.requests, 2);
  lock.dispose();
}

// Unsupported (older iOS / Android WebView): no listener, no throw.
{
  const vis: (() => void)[] = [];
  const doc: WakeLockDocument = {
    visibilityState: "visible",
    addEventListener: (_t, fn) => vis.push(fn),
    removeEventListener: () => {},
  };
  assert.equal(hallWakeLockSupported({}), false);
  assert.equal(hallWakeLockSupported(null), false);
  const lock = new HallWakeLock({}, doc);
  lock.setWanted(true);
  lock.setWanted(false);
  lock.dispose();
  assert.equal(vis.length, 0);
  const throwing = new HallWakeLock({ wakeLock: { request: () => { throw new Error("sync"); } } } as unknown as WakeLockNavigator, doc);
  throwing.setWanted(true);
  await flush();
  assert.equal(throwing.held, false);
  throwing.dispose();
}

// --- wiring contracts ---
assert.doesNotMatch(HALL_WAKE_LOCK_HINT, /-/, "en dash only");
assert.match(HALL_WAKE_LOCK_HINT, /–/);
const player = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
assert.match(player, /if \(!canBeat \|\| typeof navigator === "undefined"[^\n]*\) return;\n\s*const lock = new HallWakeLock\(/, "hall device only");
assert.match(player, /remotePausedRef\.current = true;\n\s*syncWakeLock\(\);/, "owner pause keeps the lock");
assert.equal((player.match(/syncWakeLock\(\);/g) ?? []).length >= 5, true, "synced on change / pause / toggle / next / dispose");
assert.doesNotMatch(player.slice(player.indexOf("const syncWakeLock"), player.indexOf("const syncWakeLock") + 800), /reload|audio\.(play|pause)/, "screen-only");
const lib = readFileSync(new URL("../src/lib/business-app/hall-wake-lock.ts", import.meta.url), "utf8");
assert.doesNotMatch(lib, /<video|createElement\(/, "no hidden video fallback");
const home = readFileSync(new URL("../src/components/business-app/BusinessHallHome.tsx", import.meta.url), "utf8");
assert.match(home, /cabinet\.mode === "point" \? \(\s*<p[^>]*data-testid="biz-hall-wake-hint"/, "hint on the hall device only");
for (const other of ["src/components/business-app/SpaOnlinePlayer.tsx", "src/components/business-app/sound/BusinessGuestPlayback.tsx"]) {
  assert.doesNotMatch(readFileSync(new URL(`../${other}`, import.meta.url), "utf8"), /wakeLock|HallWakeLock/, `${other}: no wake lock`);
}

console.log("business-hall-wake-lock-unit: ok");
