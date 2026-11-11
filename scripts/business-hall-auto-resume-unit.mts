#!/usr/bin/env npx tsx
/**
 * t1365u / t1366u–t1368u (Sergey 11.11.2026): the hall music plays all day by itself.
 * - «the hall was playing» survives a reload of the page and starts the music again by itself;
 * - a deliberate pause (hall tap / closed bar / owner) clears it – such a hall stays silent;
 * - the build reload never fires while the hall still means to play (#1212 kept and widened);
 * - the hall iPhone starts tracks from a fresh pre-signed stream, the device copy stays the
 *   reconnect / offline source (no whole-track blob loaded into the page at every boundary);
 * - the offline buffer keeps fewer blobs in memory where asked.
 * No owner messages, no hall hints: nothing here produces any text.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HALL_AUTO_RESUME_MAX_AGE_MS,
  HALL_PLAYING_MARKER_KEY,
  HALL_PLAYING_MARKER_REFRESH_MS,
  HallPlayingMarkerWriter,
  clearHallPlayingMarker,
  hallMeantToPlay,
  readHallPlayingMarker,
  shouldAutoResumeHall,
  writeHallPlayingMarker,
} from "../src/lib/business-app/hall-auto-resume";
import { hallIntentOf, hallMusicSilent, shouldReloadForNewBuild } from "../src/lib/business-app/hall-build-reload";
import { HallWakeIntentTracker } from "../src/lib/business-app/hall-wake-lock";
import { HallOfflineBuffer, type BufferStore } from "../src/lib/business-app/hall-offline-buffer";
import { SpaOnlinePlayer, type OnlineSignResult } from "../src/lib/business-app/spa-online-player";
import { FadingAudio } from "../src/lib/business-app/player-fade";
import { pointCommandApplied, runPointCommands } from "../src/lib/business-app/point-commands";

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); };

function memoryStorage() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => { rows.set(k, v); },
    removeItem: (k: string) => { rows.delete(k); },
  };
}

const SCOPE = "space-1:loc-1";

// --- marker helpers ---
{
  const s = memoryStorage();
  assert.equal(readHallPlayingMarker(s), null);
  writeHallPlayingMarker(s, SCOPE, 1_000);
  assert.deepEqual(readHallPlayingMarker(s), { scope: SCOPE, at: 1_000 });
  s.setItem(HALL_PLAYING_MARKER_KEY, "{broken");
  assert.equal(readHallPlayingMarker(s), null, "broken JSON is ignored");
  s.setItem(HALL_PLAYING_MARKER_KEY, JSON.stringify({ scope: "", at: 5 }));
  assert.equal(readHallPlayingMarker(s), null, "empty scope is ignored");
  writeHallPlayingMarker(s, SCOPE, 2_000);
  clearHallPlayingMarker(s);
  assert.equal(readHallPlayingMarker(s), null);
  // Storage that throws (private mode) never breaks the hall.
  const throwing = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  assert.equal(readHallPlayingMarker(throwing), null);
  writeHallPlayingMarker(throwing, SCOPE, 1);
  clearHallPlayingMarker(throwing);
}

// --- auto-resume decision ---
{
  const now = 50_000_000;
  const fresh = { scope: SCOPE, at: now - 10_000 };
  assert.equal(shouldAutoResumeHall({ marker: fresh, scope: SCOPE, now }), true, "recent marker of this hall");
  assert.equal(shouldAutoResumeHall({ marker: fresh, scope: "other:hall", now }), false, "another hall");
  assert.equal(shouldAutoResumeHall({ marker: fresh, scope: null, now }), false, "not a hall device");
  assert.equal(shouldAutoResumeHall({ marker: null, scope: SCOPE, now }), false, "never played / paused on purpose");
  assert.equal(shouldAutoResumeHall({ marker: { scope: SCOPE, at: now - HALL_AUTO_RESUME_MAX_AGE_MS - 1 }, scope: SCOPE, now }), false, "too old");
  assert.equal(shouldAutoResumeHall({ marker: { scope: SCOPE, at: now - HALL_AUTO_RESUME_MAX_AGE_MS }, scope: SCOPE, now }), true);
  assert.equal(shouldAutoResumeHall({ marker: { scope: SCOPE, at: now + 30_000 }, scope: SCOPE, now }), true, "small clock skew");
  assert.equal(shouldAutoResumeHall({ marker: { scope: SCOPE, at: now + 3_600_000 }, scope: SCOPE, now }), false, "marker from the future");
  assert.equal(hallMeantToPlay(fresh, SCOPE), true);
  assert.equal(hallMeantToPlay({ scope: SCOPE, at: 1 }, SCOPE), true, "any age blocks a build reload");
  assert.equal(hallMeantToPlay(fresh, "other:hall"), false);
  assert.equal(hallMeantToPlay(null, SCOPE), false);
}

// --- marker writer ---
{
  const s = memoryStorage();
  let clock = 1_000_000;
  const w = new HallPlayingMarkerWriter(s, () => clock);
  w.observe(SCOPE, "idle", false);
  assert.equal(readHallPlayingMarker(s), null, "idle never writes");
  w.observe(SCOPE, "playing", false);
  assert.deepEqual(readHallPlayingMarker(s), { scope: SCOPE, at: clock });
  const first = clock;
  clock += HALL_PLAYING_MARKER_REFRESH_MS - 1;
  w.observe(SCOPE, "playing", false);
  assert.equal(readHallPlayingMarker(s)?.at, first, "throttled");
  clock += 1;
  w.observe(SCOPE, "playing", false);
  assert.equal(readHallPlayingMarker(s)?.at, clock, "refreshed");
  for (const status of ["loading", "error", "paused", "idle"]) {
    w.observe(SCOPE, status, false);
    assert.ok(readHallPlayingMarker(s), `${status} without a deliberate pause keeps the marker`);
  }
  w.observe(SCOPE, "paused", true);
  assert.equal(readHallPlayingMarker(s), null, "deliberate pause clears");
  w.observe(SCOPE, "playing", false);
  assert.ok(readHallPlayingMarker(s), "a new start writes at once after a clear");
  w.observe(SCOPE, "no_access", false);
  assert.equal(readHallPlayingMarker(s), null, "no access clears");
  w.observe(null, "playing", false);
  assert.equal(readHallPlayingMarker(s), null, "no scope: never writes");
}

// --- wake intent: deliberatelyPaused ---
{
  const t = new HallWakeIntentTracker();
  assert.equal(t.deliberatelyPaused, false);
  t.markPaused();
  assert.equal(t.deliberatelyPaused, true);
  t.observe("playing");
  assert.equal(t.deliberatelyPaused, false, "a fresh start ends the deliberate pause");
}

// --- controller world (real SpaOnlinePlayer, real FadingAudio without fades like iPhone) ---
type Item = { position: number; audioItemId: string; trackCode: null; title: string; durationSeconds: number | null;
  gainDb: null; playableUntil: Date | null; offlineAllowed: false; offlineCacheUntil: null };
const items: Item[] = ["a", "b", "c"].map((id, i) => ({
  position: i + 1, audioItemId: id, trackCode: null, title: id, durationSeconds: 180,
  gainDb: null, playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
}));

function world(opts: { refuse?: boolean; streamFirst?: boolean; copies?: Record<string, string | null>; signFails?: boolean } = {}) {
  let refuse = opts.refuse ?? false;
  let signFails = opts.signFails ?? false;
  const storage = memoryStorage();
  const intent = new HallWakeIntentTracker();
  const writer = new HallPlayingMarkerWriter(storage, () => Date.now());
  const signs: string[] = [];
  const srcs: string[] = [];
  const reloads: string[] = [];
  let pendingBuild = true;
  const audio = {
    _src: "", currentTime: 0, volume: 1, paused: true, ended: false,
    get src() { return this._src; },
    set src(v: string) { this._src = v; if (v) srcs.push(v); },
    async play() {
      if (refuse) { const e = new Error("gesture"); e.name = "NotAllowedError"; throw e; }
      this.paused = false;
    },
    pause() { this.paused = true; },
    removeAttribute() { this._src = ""; },
    load() {},
  };
  const fader = new FadingAudio(audio as never, { enabled: false });
  // eslint-disable-next-line prefer-const
  let p: SpaOnlinePlayer;
  // Mirrors BusinessCabinetPlayer.trySafeBuildReload with the t1365u marker guard.
  const tryReload = () => {
    if (hallMeantToPlay(readHallPlayingMarker(storage), SCOPE)) return;
    if (shouldReloadForNewBuild({
      pageVisible: true,
      musicPaused: hallMusicSilent(hallIntentOf(p), audio),
      pendingServerBuild: pendingBuild ? "b".repeat(40) : null,
      alreadyReloadedFor: null,
    })) { reloads.push(p.status); pendingBuild = false; }
  };
  const copies = { ...(opts.copies ?? {}) };
  p = new SpaOnlinePlayer({
    audio: fader as never,
    async sign(id: string): Promise<OnlineSignResult> {
      signs.push(id);
      if (signFails) return { ok: false, reason: "network" };
      return { ok: true, data: { url: `https://stream/${id}` } };
    },
    localSource: (id: string) => copies[id] ?? null,
    streamFirst: () => opts.streamFirst === true,
    isOnline: () => true,
    onChange() {
      intent.observe(p.status);
      writer.observe(SCOPE, p.status, intent.deliberatelyPaused);
      if (p.status === "paused" || p.status === "idle") tryReload();
    },
  } as never, items as never);
  return {
    p, audio, storage, intent, writer, signs, srcs, reloads, copies,
    setRefuse(v: boolean) { refuse = v; },
    setSignFails(v: boolean) { signFails = v; },
    /** Mirrors the provider's toggle(): a pause marks the deliberate intent first. */
    async userToggle() {
      if (p.status === "playing" || p.status === "loading") intent.markPaused();
      await p.toggle();
    },
  };
}

// 1. Playing hall: marker written; a pause nobody chose (iOS / rights / unknown) never reloads.
{
  const w = world();
  await w.p.playIndex(0);
  await flush();
  assert.equal(w.p.status, "playing");
  assert.ok(readHallPlayingMarker(w.storage), "playing writes the marker");
  // Simulate an unexplained controller pause (e.g. element interrupted, Media Session) – not deliberate.
  w.audio.paused = true;
  (w.p as unknown as { set(s: string): void }).set("paused");
  assert.deepEqual(w.reloads, [], "no build reload while the hall still means to play");
  // A deliberate pause in the hall: marker cleared, the reload may happen (old behaviour kept).
  (w.p as unknown as { set(s: string): void }).set("playing");
  w.audio.paused = false;
  await w.userToggle();
  await flush();
  assert.equal(w.p.status, "paused");
  assert.equal(readHallPlayingMarker(w.storage), null);
  assert.deepEqual(w.reloads, ["paused"], "deliberately paused hall still picks up a new build");
}

// 2. Page opened again after it was playing: a new page starts by itself (no tap) where allowed.
{
  const before = world();
  await before.p.playIndex(1);
  await flush();
  const marker = readHallPlayingMarker(before.storage);
  assert.ok(marker);
  // «Reload»: a fresh controller on the same storage.
  const after = world();
  for (const [k, v] of before.storage.rows) after.storage.rows.set(k, v);
  assert.equal(shouldAutoResumeHall({ marker: readHallPlayingMarker(after.storage), scope: SCOPE, now: Date.now() }), true);
  assert.equal(after.p.status, "idle");
  await after.p.playIndex(1); // what toggle() does from idle
  await flush();
  assert.equal(after.p.status, "playing", "music continues without anyone");
  assert.equal(after.p.needsGesture, false);
}

// 3. iOS refuses the start without a tap: the track stays loaded, the marker stays, no reload,
//    and the next touch / foreground resumes the same track.
{
  const w = world({ refuse: true });
  w.writer.observe(SCOPE, "playing", false); // marker left by the page before the reload
  await w.p.playIndex(0);
  await flush();
  assert.equal(w.p.status, "paused");
  assert.equal(w.p.needsGesture, true);
  assert.ok(readHallPlayingMarker(w.storage), "a refusal is not a deliberate pause");
  assert.deepEqual(w.reloads, []);
  assert.equal(w.intent.deliberatelyPaused, false, "first-touch resume is allowed");
  w.setRefuse(false);
  await w.p.toggle(); // first touch anywhere / foreground retry
  await flush();
  assert.equal(w.p.status, "playing");
}

// 4. Stream first (hall iPhone): a fresh pre-sign wins over the device copy at the boundary.
{
  const w = world({ streamFirst: true, copies: { a: "blob:a", b: "blob:b", c: "blob:c" } });
  await w.p.playIndex(0);
  await flush();
  assert.equal(w.srcs.at(-1), "blob:a", "no pre-sign for the very first start: the copy plays (no network wait)");
  // afterPlay pre-signed the next track.
  assert.ok(w.signs.includes("b"));
  w.audio.paused = true;
  w.audio.ended = true;
  await w.p.onEnded();
  await flush();
  assert.equal(w.srcs.at(-1), "https://stream/b", "boundary plays the pre-signed stream, not a blob");
  assert.equal(w.p.localItemId, null);
  assert.equal(w.p.status, "playing");
}
{
  const w = world({ streamFirst: false, copies: { a: "blob:a", b: "blob:b" } });
  await w.p.playIndex(0);
  await flush();
  w.audio.paused = true;
  await w.p.onEnded();
  await flush();
  assert.equal(w.srcs.at(-1), "blob:b", "other devices: copy first, unchanged");
}

// 5. Signing fails (offline) and a copy appears only now: the start plays the copy, no dead stop.
{
  const w = world({ streamFirst: true });
  w.setSignFails(true);
  let calls = 0;
  (w.p as unknown as { d: { localSource: (id: string) => string | null } }).d.localSource = (id) => (++calls > 1 ? `blob:${id}` : null);
  await w.p.playIndex(0);
  await flush();
  assert.equal(w.srcs.at(-1), "blob:a");
  assert.equal(w.p.status, "playing");
}

// 6. Offline buffer: fewer blobs in memory where asked (hall iPhone: 1 next track).
async function bufferWarm(warmTracks?: number) {
  const rows = new Map<string, { blob: Blob; downloadedAt: number }>();
  const store: BufferStore = {
    kind: "cache",
    async get(id) { return rows.get(id) ?? null; },
    async put(id, blob, downloadedAt) { rows.set(id, { blob, downloadedAt }); },
    async delete(id) { rows.delete(id); },
    async keys() { return [...rows.keys()]; },
    async clear() { rows.clear(); },
  };
  let n = 0;
  const b = new HallOfflineBuffer({
    store,
    sign: async (id) => ({ ok: true, data: { url: `https://s/${id}` } }),
    fetchBlob: async () => new Blob([new Uint8Array(1024)], { type: "audio/mpeg" }),
    createUrl: () => `blob:${++n}`,
    revokeUrl: () => {},
    window: () => ({ until: null }),
    isOnline: () => true,
    warmTracks,
    setTimer: () => 0,
    clearTimer: () => {},
  });
  b.setPlan(["x", "y", "z"]);
  await b.refill(true);
  await flush();
  await b.warm();
  return { b, inMemory: ["x", "y", "z"].filter((id) => b.localSource(id, 60) !== null), onDisk: rows.size };
}
{
  const def = await bufferWarm();
  assert.deepEqual(def.inMemory, ["x", "y"], "default: 2 next tracks in memory");
  assert.equal(def.onDisk, 3);
  const ios = await bufferWarm(1);
  assert.deepEqual(ios.inMemory, ["x"], "hall iPhone: 1 next track in memory");
  assert.equal(ios.onDisk, 3, "still 10-track (here 3) reserve on disk");
}

// 6b. Review of b2853392 (blocker 1): the owner's pause clears «the hall was playing» through the
// real command handler (runPointCommands + pointCommandApplied, wired like the player), also when
// the hall is already silent – paused after an iOS autoplay refusal, or idle – and the pause
// itself is a no-op. A page reloaded right after must not start the music by itself.
{
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const pauseCommand = (n: number) => ({
    id: uuid(n), type: "pause", claim_id: uuid(n + 100), claim_until: new Date(Date.now() + 30_000).toISOString(),
  });
  async function ownerPauseOn(status: "paused" | "idle" | "playing", needsGesture: boolean) {
    const storage = memoryStorage();
    let now = 1_000_000;
    const writer = new HallPlayingMarkerWriter(storage, () => now);
    const intent = new HallWakeIntentTracker();
    const ctl = { status: "playing" as string, needsGesture: false };
    const audio = { paused: false };
    // The hall played, then went silent for a reason nobody chose (or still plays).
    intent.observe("playing");
    writer.observe(SCOPE, "playing", intent.deliberatelyPaused);
    now += 60_000;
    ctl.status = status;
    ctl.needsGesture = needsGesture;
    audio.paused = status !== "playing";
    intent.observe(status);
    writer.observe(SCOPE, status, intent.deliberatelyPaused);
    if (status !== "playing") assert.ok(readHallPlayingMarker(storage), "unexplained silence keeps the marker");
    let remotePaused = false;
    let toggles = 0;
    let acks = 0;
    let wakeSyncs = 0;
    await runPointCommands([pauseCommand(1)], {
      ready: () => true,
      status: () => ctl.status,
      toggle: async () => {
        toggles += 1;
        // Player toggle on a playing hall: deliberate pause, then the controller pauses.
        intent.markPaused();
        ctl.status = "paused";
        audio.paused = true;
        intent.observe("paused");
        writer.observe(SCOPE, "paused", intent.deliberatelyPaused);
      },
      next: async () => { throw new Error("no next for a pause"); },
      applied: pointCommandApplied({
        status: () => ctl.status,
        audio: () => audio,
        fade: () => null,
        ownerPaused: () => {
          remotePaused = true;
          intent.markPaused();
          writer.clear();
          wakeSyncs += 1;
        },
      }),
      ack: async () => { acks += 1; },
      stopped: () => false,
    });
    // «Reload»: fresh refs, the remote-pause latch is gone, only localStorage survives.
    const fresh = shouldAutoResumeHall({ marker: readHallPlayingMarker(storage), scope: SCOPE, now: now + 1_000 });
    return { toggles, acks, remotePaused, wakeSyncs, marker: readHallPlayingMarker(storage), fresh, deliberate: intent.deliberatelyPaused };
  }
  for (const [status, gesture] of [["paused", true], ["paused", false], ["idle", false]] as const) {
    const r = await ownerPauseOn(status, gesture);
    const label = `${status}${gesture ? "+needsGesture" : ""}`;
    assert.equal(r.toggles, 0, `${label}: the pause itself is a no-op`);
    assert.equal(r.acks, 1, `${label}: acknowledged`);
    assert.equal(r.remotePaused, true, `${label}: owner pause latched`);
    assert.equal(r.wakeSyncs, 1, `${label}: wake lock re-synced`);
    assert.equal(r.marker, null, `${label}: owner pause clears the marker`);
    assert.equal(r.deliberate, true, `${label}: owner pause counts as deliberate (no first-touch resume)`);
    assert.equal(r.fresh, false, `${label}: a reloaded page stays silent after the owner's pause`);
  }
  const playing = await ownerPauseOn("playing", false);
  assert.equal(playing.toggles, 1, "playing hall: paused through toggle");
  assert.equal(playing.acks, 1);
  assert.equal(playing.marker, null);
  assert.equal(playing.fresh, false);
  // Control: without the owner's pause the same silent hall still auto-resumes after a reload.
  {
    const storage = memoryStorage();
    const writer = new HallPlayingMarkerWriter(storage, () => 1_000_000);
    writer.observe(SCOPE, "playing", false);
    writer.observe(SCOPE, "paused", false);
    assert.equal(shouldAutoResumeHall({ marker: readHallPlayingMarker(storage), scope: SCOPE, now: 1_061_000 }), true);
  }
  // A pause that did not silence the element is not confirmed: nothing is cleared, no ack.
  {
    let owner = 0;
    const applied = pointCommandApplied({
      status: () => "paused", audio: () => ({ paused: false }), fade: () => null, ownerPaused: () => { owner += 1; },
    });
    assert.equal(await applied("pause"), false);
    assert.equal(owner, 0);
    const noAudio = pointCommandApplied({ status: () => "idle", audio: () => null, fade: () => null, ownerPaused: () => { owner += 1; } });
    assert.equal(await noAudio("pause"), false);
    assert.equal(owner, 0);
    // Resume / next never touch the owner-pause path.
    const resume = pointCommandApplied({
      status: () => "playing", audio: () => ({ paused: false }), fade: () => null, ownerPaused: () => { owner += 1; },
    });
    assert.equal(await resume("resume"), true);
    assert.equal(await resume("next_track"), true);
    assert.equal(owner, 0);
  }
}

// 7. Source guards: the provider wires all of it, and adds no owner message or hall hint.
{
  const src = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
  assert.match(src, /hallMeantToPlay\(readHallPlayingMarker\(hallLocalStorage\(\)\), hallScopeRef\.current\)\) return;/, "build reload guard");
  assert.match(src, /shouldAutoResumeHall\(/, "auto-resume after a reload");
  assert.match(src, /streamFirst: \(\) => streamFirstRef\.current/, "stream first on the hall iPhone");
  assert.match(src, /warmTracks: isAppleTouchDevice\(navigator\) \? 1 : undefined/);
  assert.match(src, /playingMarkerRef\.current\?\.clear\(\);/, "closing the bar clears the marker");
  // The player's command handler is the tested pointCommandApplied, and its owner pause clears the marker.
  assert.match(src, /applied: pointCommandApplied\(\{/, "player uses the tested command check");
  assert.match(src, /ownerPaused: \(\) => \{\n\s+remotePausedRef\.current = true;[\s\S]{0,400}?wakeIntentRef\.current\.markPaused\(\);\n\s+playingMarkerRef\.current\?\.clear\(\);\n\s+syncWakeLock\(\);/, "owner pause clears the marker");
  // #1213 wake lock untouched: still synced from the controller.
  assert.match(src, /wakeIntentRef\.current\.observe\(current\.status\);\n\s+syncWakeLock\(\);/);
  const lib = readFileSync(new URL("../src/lib/business-app/hall-auto-resume.ts", import.meta.url), "utf8");
  assert.doesNotMatch(lib, /[А-Яа-яЁё]{3,}[^*\n]*["'`]/u, "no user-facing Russian strings in the auto-resume module");
}

console.log("business-hall-auto-resume-unit: ok");
