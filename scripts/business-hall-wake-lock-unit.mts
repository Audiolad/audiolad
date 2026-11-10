#!/usr/bin/env npx tsx
/**
 * Hall screen wake lock (t1350u): the hall device keeps the screen on while music is meant to
 * play, releases it on a local pause / idle / no access, re-acquires when visible again, and
 * fails silently where the API is missing. No migration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";
import { FadingAudio } from "../src/lib/business-app/player-fade";
import {
  HALL_WAKE_LOCK_HINT,
  HallWakeIntentTracker,
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
assert.equal(hallWantsScreenAwake({ status: "idle", needsGesture: true, resumePending: true, recovering: true }), false, "idle releases (review F2)");
assert.equal(hallWantsScreenAwake({ status: "idle", resuming: true }), true, "a start from idle holds (review G1)");
assert.equal(hallWantsScreenAwake({ status: "no_access", resuming: true }), false);
assert.equal(hallWantsScreenAwake({ status: "paused", needsGesture: true, localPaused: true }), false, "deliberate pause beats a stale autoplay flag (F2)");
assert.equal(hallWantsScreenAwake({ status: "paused", resumePending: true, localPaused: true }), false, "deliberate pause beats a stale restore flag (F1)");
assert.equal(hallWantsScreenAwake({ status: "error", localPaused: true }), false);
assert.equal(hallWantsScreenAwake({ status: "paused", resuming: true }), true, "start in flight (F3)");
assert.equal(hallWantsScreenAwake({ status: "paused", resuming: true, localPaused: true }), true, "a new start wins");
assert.equal(hallWantsScreenAwake({ status: "paused", localPaused: true, remotePaused: true }), true, "owner pause keeps the page alive");
assert.equal(hallWantsScreenAwake({ status: "playing", localPaused: true }), true, "playing always holds");

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

// A synchronous throw once must not block later requests (review F4).
{
  const env = fakeEnv();
  const real = env.nav.wakeLock!.request;
  let calls = 0;
  env.nav.wakeLock!.request = (type) => {
    calls++;
    if (calls === 1) throw new Error("sync");
    return real(type);
  };
  const lock = new HallWakeLock(env.nav, env.doc);
  lock.setWanted(true);
  await flush();
  assert.equal(lock.held, false);
  lock.setWanted(false);
  lock.setWanted(true);
  await flush();
  assert.equal(calls, 2, "second request made");
  assert.equal(lock.held, true);
  lock.dispose();
}

// --- controller sequences (real SpaOnlinePlayer), provider wiring as in BusinessCabinetPlayer ---
const item = (n: number) => ({
  position: n, audioItemId: `track-${n}`, trackCode: null, title: `T${n}`, durationSeconds: null,
  gainDb: null, playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
});
function hall() {
  let refuse = false;
  let holdPlay = false;
  let holdSign = false;
  const heldPlays: (() => void)[] = [];
  const heldSigns: (() => void)[] = [];
  const audio = {
    src: "", currentTime: 0, volume: 1, paused: true, ended: false,
    play() {
      if (refuse) { const e = new Error("gesture"); e.name = "NotAllowedError"; return Promise.reject(e); }
      if (holdPlay) return new Promise<void>((r) => heldPlays.push(() => { this.paused = false; r(); }));
      this.paused = false;
      return Promise.resolve();
    },
    pause() { this.paused = true; },
    removeAttribute() { this.src = ""; },
    load() {},
  };
  const fader = new FadingAudio(audio as never, { enabled: false });
  const tracker = new HallWakeIntentTracker();
  const remote = { paused: false };
  const env = fakeEnv();
  const lock = new HallWakeLock(env.nav, env.doc);
  // eslint-disable-next-line prefer-const
  let p: SpaOnlinePlayer;
  const sync = () => lock.setWanted(tracker.wanted(p, remote.paused));
  p = new SpaOnlinePlayer({
    audio: fader as never,
    sign: (id: string) => holdSign
      ? new Promise((r) => heldSigns.push(() => r({ ok: true, data: { url: `https://example.invalid/${id}` } })))
      : Promise.resolve({ ok: true, data: { url: `https://example.invalid/${id}` } }),
    backgroundAdvance: () => false,
    onChange() { tracker.observe(p.status); sync(); },
  } as never, [item(1), item(2)] as never);
  // Provider toggle / next (BusinessCabinetPlayer).
  const toggle = async () => {
    remote.paused = false;
    if (p.status === "playing" || p.status === "loading") {
      tracker.markPaused();
      sync();
      await p.toggle();
    } else await tracker.whileStarting(() => p.toggle(), sync);
  };
  const next = async (opts: { install?: Promise<void>; signal?: AbortSignal } = {}) => {
    remote.paused = false;
    await tracker.whileStarting(async () => {
      if (opts.install) await opts.install;
      if (opts.signal?.aborted) return false;
      await p.next();
    }, sync);
  };
  // Provider dismissBar: a deliberate local stop.
  const dismiss = async () => {
    tracker.markPaused({ stop: true });
    sync();
    if (p.status === "playing" || p.status === "loading") await p.toggle();
    fader.pause();
    audio.removeAttribute();
  };
  return {
    p, lock, env, toggle, next, dismiss, sync, remote, audio,
    refuse(v: boolean) { refuse = v; },
    holdPlay(v: boolean) { holdPlay = v; },
    holdSign(v: boolean) { holdSign = v; },
    releasePlays() { heldPlays.splice(0).forEach((f) => f()); },
    releaseSigns() { heldSigns.splice(0).forEach((f) => f()); },
  };
}

// Plain play → pause releases, play again acquires.
{
  const h = hall();
  await h.toggle();
  await flush();
  assert.equal(h.p.status, "playing");
  assert.equal(h.lock.held, true);
  await h.toggle();
  await flush();
  assert.equal(h.lock.held, false, "local pause releases");
  await h.toggle();
  await flush();
  assert.equal(h.lock.held, true);
  h.lock.dispose();
  h.p.dispose();
}

// F1: local pause during access restoration – no stale resumePending lock.
{
  const h = hall();
  await h.toggle();
  await h.p.applyManifest(null as never);
  await flush();
  assert.equal(h.p.status, "no_access");
  assert.equal(h.lock.held, false);
  h.holdSign(true);
  const restore = h.p.restoreVerifiedAccess([item(1), item(2)] as never);
  await flush();
  assert.equal(h.p.status, "loading");
  await h.toggle(); // local pause while the resume signs
  h.releaseSigns();
  await restore;
  await flush();
  assert.equal(h.p.status, "paused");
  assert.equal(h.lock.held, false, "deliberate pause releases after restoration (F1)");
  h.lock.dispose();
  h.p.dispose();
}

// F2: autoplay refusal, Next with pending sign, local pause – released; idle releases too.
{
  const h = hall();
  h.refuse(true);
  await h.toggle();
  await flush();
  assert.equal(h.p.needsGesture, true);
  assert.equal(h.lock.held, true, "autoplay refusal keeps the screen on for the tap");
  h.refuse(false);
  h.holdSign(true);
  const n = h.next();
  await flush();
  await h.toggle();
  h.releaseSigns();
  await n;
  await flush();
  assert.equal(h.p.status, "paused");
  assert.equal(h.lock.held, false, "stale needsGesture does not hold the screen (F2)");
  await h.p.applyManifest([] as never);
  h.sync();
  await flush();
  assert.equal(h.lock.held, false, "idle releases");
  h.lock.dispose();
  h.p.dispose();
}

// F3: resume waits on audio.play() without "loading" – the screen stays on meanwhile.
{
  const h = hall();
  await h.toggle();
  await h.toggle();
  await flush();
  assert.equal(h.lock.held, false);
  h.holdPlay(true);
  const resume = h.toggle();
  await flush();
  assert.equal(h.p.status, "paused", "controller still paused while play() is pending");
  assert.equal(h.lock.held, true, "start in flight holds the screen (F3)");
  h.releasePlays();
  await resume;
  await flush();
  assert.equal(h.p.status, "playing");
  assert.equal(h.lock.held, true);
  h.lock.dispose();
  h.p.dispose();
}

// Owner pause keeps the page alive; owner resume continues; a local tap releases.
{
  const h = hall();
  await h.toggle();
  await h.toggle(); // remote pause runs the same provider toggle
  h.remote.paused = true;
  h.sync();
  await flush();
  assert.equal(h.lock.held, true, "remote pause keeps the screen on");
  await h.toggle(); // remote resume
  await flush();
  assert.equal(h.p.status, "playing");
  await h.toggle(); // local pause
  await flush();
  assert.equal(h.lock.held, false);
  h.lock.dispose();
  h.p.dispose();
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

// D1: an aborted Next (never reached the controller) keeps the earlier deliberate pause.
{
  const h = hall();
  h.refuse(true);
  await h.toggle();
  h.refuse(false);
  h.holdSign(true);
  const n = h.next();
  await flush();
  await h.toggle();
  h.releaseSigns();
  await n;
  await flush();
  assert.equal(h.p.needsGesture, true, "stale flag still set on the controller");
  assert.equal(h.lock.held, false);
  let install!: () => void;
  const ctrl = new AbortController();
  const aborted = h.next({ install: new Promise<void>((r) => { install = r; }), signal: ctrl.signal });
  await flush();
  assert.equal(h.lock.held, true, "screen on while the start waits");
  ctrl.abort();
  install();
  await aborted;
  await flush();
  assert.equal(h.p.status, "paused");
  assert.equal(h.lock.held, false, "aborted start restores the deliberate pause (D1)");
  h.lock.dispose();
  h.p.dispose();
}

// D2: closing the bar after an owner pause releases the screen; an owner resume takes it again.
{
  const h = hall();
  await h.toggle();
  await h.toggle();
  h.remote.paused = true;
  h.sync();
  await flush();
  assert.equal(h.lock.held, true);
  await h.dismiss();
  h.sync();
  await flush();
  assert.equal(h.audio.paused, true);
  assert.equal(h.lock.held, false, "local close beats the owner pause latch (D2)");
  await h.toggle(); // owner resume (same provider toggle)
  await flush();
  assert.equal(h.p.status, "playing");
  assert.equal(h.lock.held, true);
  h.lock.dispose();
  h.p.dispose();
}

// D3: a deliberate pause supersedes a start in flight at once.
{
  const h = hall();
  h.holdSign(true);
  const n = h.toggle(); // first start: signing pending
  await flush();
  assert.equal(h.p.status, "loading");
  assert.equal(h.lock.held, true);
  await h.toggle(); // pause while loading
  await flush();
  assert.equal(h.lock.held, false, "released before the obsolete sign settles (D3)");
  h.releaseSigns();
  await n;
  await flush();
  assert.equal(h.p.status, "paused");
  assert.equal(h.lock.held, false);
  h.lock.dispose();
  h.p.dispose();
}

// E1: an older aborted start never rolls back newer intent (both settlement orders).
{
  const h = hall();
  await h.toggle();
  await h.toggle(); // deliberate pause
  await flush();
  assert.equal(h.lock.held, false);
  let install!: () => void;
  const ctrl = new AbortController();
  const a = h.next({ install: new Promise<void>((r) => { install = r; }), signal: ctrl.signal });
  ctrl.abort();
  h.refuse(true);
  await h.toggle(); // newer start B: autoplay refused, waits for a tap
  await flush();
  assert.equal(h.p.needsGesture, true);
  assert.equal(h.lock.held, true);
  install(); // A settles after B
  await a;
  await h.p.applyManifest([item(1), item(2)] as never);
  h.sync();
  await flush();
  assert.equal(h.lock.held, true, "older aborted start keeps newer autoplay intent (E1)");
  h.lock.dispose();
  h.p.dispose();
}
{
  // Order 2: B settles, then a later deliberate pause, then A aborts – the pause stays.
  const h = hall();
  await h.toggle();
  await h.toggle();
  let install!: () => void;
  const ctrl = new AbortController();
  const a = h.next({ install: new Promise<void>((r) => { install = r; }), signal: ctrl.signal });
  ctrl.abort();
  await h.toggle(); // B plays
  await flush();
  assert.equal(h.p.status, "playing");
  await h.toggle(); // later deliberate pause
  install();
  await a;
  await flush();
  assert.equal(h.p.status, "paused");
  assert.equal(h.lock.held, false, "later deliberate pause stays in force");
  h.lock.dispose();
  h.p.dispose();
}

{
  // Order 3: A (aborted) settles before B, which is refused autoplay – B's intent holds.
  const h = hall();
  await h.toggle();
  await h.toggle();
  let install!: () => void;
  const ctrl = new AbortController();
  const a = h.next({ install: new Promise<void>((r) => { install = r; }), signal: ctrl.signal });
  ctrl.abort();
  h.refuse(true);
  h.holdPlay(false);
  const b = h.toggle();
  install();
  await a;
  await b;
  await flush();
  assert.equal(h.p.needsGesture, true);
  assert.equal(h.lock.held, true, "A before B: autoplay intent holds");
  h.lock.dispose();
  h.p.dispose();
}

// G1: first Next from idle while the sound install is pending holds the screen.
{
  const h = hall();
  assert.equal(h.p.status, "idle");
  let install!: () => void;
  const n = h.next({ install: new Promise<void>((r) => { install = r; }) });
  await flush();
  assert.equal(h.p.status, "idle");
  assert.equal(h.lock.held, true, "start from idle holds during the install wait (G1)");
  install();
  await n;
  await flush();
  assert.equal(h.p.status, "playing");
  assert.equal(h.lock.held, true);
  // A deliberate pause during such a wait releases at once.
  await h.toggle();
  let install2!: () => void;
  const n2 = h.next({ install: new Promise<void>((r) => { install2 = r; }) });
  await flush();
  assert.equal(h.lock.held, true);
  await h.dismiss();
  h.sync();
  await flush();
  assert.equal(h.lock.held, false, "close supersedes the waiting start");
  install2();
  await n2;
  await flush();
  h.lock.dispose();
  h.p.dispose();
}

// Tracker accounting: exceptions and overlapping starts balance.
{
  const t = new HallWakeIntentTracker();
  const ctl = { status: "paused", recovering: false, needsGesture: false, resumePending: false };
  await assert.rejects(t.whileStarting(async () => { throw new Error("x"); }, () => {}));
  assert.equal(t.wanted(ctl, false), false, "no leak after a throw");
  let a!: () => void;
  let b!: () => void;
  const pa = t.whileStarting(() => new Promise<void>((r) => { a = r; }), () => {});
  const pb = t.whileStarting(() => new Promise<void>((r) => { b = r; }), () => {});
  assert.equal(t.wanted(ctl, false), true);
  a();
  await pa;
  assert.equal(t.wanted(ctl, false), true, "second start still in flight");
  b();
  await pb;
  assert.equal(t.wanted(ctl, false), false);
}

console.log("business-hall-wake-lock-unit: ok");
