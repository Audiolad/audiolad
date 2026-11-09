// t1331u / t1332u (Sergey 09.11.2026, widget t1332s9582): hall offline buffer – the next 10 queue
// tracks are kept on the device (2 hours at most, never past the access end) so a short internet
// outage does not stop the hall. Option A: technical buffer, not the multi-day offline mode.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HALL_BUFFER_MAX_AGE_MS,
  HALL_BUFFER_TRACKS,
  HallOfflineBuffer,
  hallBufferLine,
  hallBufferPlan,
  type BufferStore,
  type HallBufferDeps,
} from "../src/lib/business-app/hall-offline-buffer";
import { createHallBufferStore } from "../src/lib/business-app/hall-offline-buffer-store";
import { HALL_REPORT_QUEUE_MAX, HallReportQueue, type HallUsageSample } from "../src/lib/business-app/hall-report-queue";
import { postPointUsage } from "../src/lib/business-app/cabinet-player-client";
import { hallBufferedCount, isHallNowPlayingReport, parseHallNowPlaying } from "../src/lib/business-app/hall-mirror";
import { LOCAL_STALL_MS, SpaOnlinePlayer, type OnlineSignResult } from "../src/lib/business-app/spa-online-player";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); };
const MB = 1024 * 1024;

function memoryStore(kind: "cache" | "idb" = "cache") {
  const rows = new Map<string, { blob: Blob; downloadedAt: number }>();
  const deleted: string[] = [];
  let cleared = 0;
  const store: BufferStore = {
    kind,
    async get(id) { return rows.get(id) ?? null; },
    async put(id, blob, downloadedAt) { rows.set(id, { blob, downloadedAt }); },
    async delete(id) { deleted.push(id); rows.delete(id); },
    async keys() { return [...rows.keys()]; },
    async clear() { cleared++; rows.clear(); },
  };
  return { store, rows, deleted, cleared: () => cleared };
}

type Timer = { fn: () => void; at: number };

function bufferWorld(opts: { store?: BufferStore | null; until?: number | null; online?: boolean; quota?: number; usage?: number; sizeMb?: number; deny?: boolean } = {}) {
  let clock = 10_000_000;
  let online = opts.online ?? true;
  const mem = memoryStore();
  const store = opts.store === undefined ? mem.store : opts.store;
  const signs: string[] = [];
  const fetches: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const urls = new Set<string>();
  const revoked: string[] = [];
  const expired: string[] = [];
  let noAccess = 0;
  let allowed = new Set<string>(Array.from({ length: 30 }, (_, i) => `t${i}`));
  let until: number | null = opts.until ?? null;
  const timers: Timer[] = [];
  const deps: HallBufferDeps = {
    store,
    async sign(id): Promise<OnlineSignResult> {
      signs.push(id);
      if (opts.deny) return { ok: false, reason: "no_access" };
      return { ok: true, data: { url: `https://s/${id}` } };
    },
    async fetchBlob(url) {
      fetches.push(url);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 0));
      inFlight--;
      return new Blob([new Uint8Array((opts.sizeMb ?? 6) * MB)], { type: "audio/mpeg" });
    },
    createUrl() { const u = `blob:hall/${urls.size + revoked.length + 1}`; urls.add(u); return u; },
    revokeUrl(u) { revoked.push(u); urls.delete(u); },
    window(id) { return allowed.has(id) ? { until } : null; },
    isOnline: () => online,
    // Real browsers count the buffer itself in `usage`.
    estimate: opts.quota !== undefined ? async () => ({
      quota: opts.quota,
      usage: (opts.usage ?? 0) + [...mem.rows.values()].reduce((sum, r) => sum + r.blob.size, 0),
    }) : undefined,
    onExpired: (id) => { expired.push(id); },
    onNoAccess: () => { noAccess++; },
    now: () => clock,
    setTimer: (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return t; },
    clearTimer: (t) => { const i = timers.indexOf(t as Timer); if (i >= 0) timers.splice(i, 1); },
  };
  const b = new HallOfflineBuffer(deps);
  return {
    b, mem, signs, fetches, revoked, expired, urls,
    get noAccess() { return noAccess; },
    get maxInFlight() { return maxInFlight; },
    tick(ms: number) { clock += ms; },
    setOnline(v: boolean) { online = v; },
    setUntil(v: number | null) { until = v; },
    setAllowed(ids: string[]) { allowed = new Set(ids); },
    now: () => clock,
  };
}

// --- 1. Plan follows the controller's own next order (wrap included), never the current track.
{
  const tracks = Array.from({ length: 15 }, (_, i) => ({ audioItemId: `t${i}` }));
  const seq = (cur: number, len: number) => (cur < 0 || cur >= len - 1 ? 0 : cur + 1);
  assert.equal(HALL_BUFFER_TRACKS, 10, "Sergey: 10 tracks");
  assert.deepEqual(hallBufferPlan(tracks, 12, seq), ["t13", "t14", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7"]);
  assert.deepEqual(hallBufferPlan(tracks.slice(0, 3), 1, seq), ["t2", "t0"], "short queue: loops back, no duplicates");
  assert.deepEqual(hallBufferPlan(tracks, -1, seq, 2), ["t0", "t1"], "not started yet: from the first track");
  const order = [4, 2, 9];
  const custom = (cur: number) => order[(order.indexOf(cur) + 1) % order.length]!;
  assert.deepEqual(hallBufferPlan(tracks, 4, custom), ["t2", "t9"]);
  assert.deepEqual(hallBufferPlan([], 0, seq), []);
}

// --- 2. Owner line copy (en dash rule: no hyphen-as-dash, Russian plural).
{
  assert.equal(hallBufferLine(10), "В запасе 10 треков на случай пропадания интернета");
  assert.equal(hallBufferLine(1), "В запасе 1 трек на случай пропадания интернета");
  assert.equal(hallBufferLine(3), "В запасе 3 трека на случай пропадания интернета");
  assert.equal(hallBufferLine(0), null, "nothing buffered: hidden");
  assert.equal(hallBufferLine(null), null, "unsupported: hidden");
}

// --- 3. Capability fallback: no window / no storage → streaming only; a throwing Cache Storage
//        falls through; a working one is used.
{
  assert.equal(await createHallBufferStore(), null, "server / no window: streaming only");
  const g = globalThis as Record<string, unknown>;
  g.window = { isSecureContext: true };
  g.caches = { open: async () => { throw new Error("SecurityError"); }, delete: async () => true };
  assert.equal(await createHallBufferStore(), null, "Cache Storage throws and no IndexedDB: streaming only");
  const caches = new Map<string, Response>();
  g.caches = {
    open: async () => ({
      async put(k: string, r: Response) { caches.set(k, r); },
      async match(k: string) { const r = caches.get(k); return r ? r.clone() : undefined; },
      async delete(k: string) { return caches.delete(k); },
      async keys() { return [...caches.keys()].map((k) => new Request(`https://biz.audiolad.ru${k}`)); },
    }),
    delete: async () => { caches.clear(); return true; },
  };
  const store = await createHallBufferStore();
  assert.equal(store?.kind, "cache", "Cache Storage preferred");
  assert.equal(caches.size, 0, "the probe leaves nothing behind");
  await store!.put("t1", new Blob(["abc"], { type: "audio/mpeg" }), 1234);
  const got = await store!.get("t1");
  assert.equal(got?.downloadedAt, 1234);
  assert.equal(got?.blob.size, 3);
  assert.deepEqual(await store!.keys(), ["t1"]);
  g.window = { isSecureContext: false };
  assert.equal(await createHallBufferStore(), null, "insecure context: streaming only");
  delete g.window;
  delete g.caches;

  const w = bufferWorld({ store: null });
  w.b.setPlan(["t1", "t2"]);
  await w.b.refill(true);
  await flush();
  assert.equal(w.b.supported, false);
  assert.deepEqual(w.fetches, [], "no storage: nothing is downloaded");
  assert.equal(w.b.localSource("t1"), null);
}

// --- 4. Refill: in play order, one download at a time, only while online and active.
{
  const w = bufferWorld();
  w.b.setPlan(["t1", "t2", "t3"]);
  await w.b.refill(false);
  await flush();
  assert.deepEqual(w.fetches, [], "idle / paused hall: no downloads");
  w.setOnline(false);
  await w.b.refill(true);
  await flush();
  assert.deepEqual(w.fetches, [], "offline: no downloads");
  w.setOnline(true);
  await w.b.refill(true);
  await flush();
  assert.deepEqual(w.fetches, ["https://s/t1", "https://s/t2", "https://s/t3"], "next tracks in play order");
  assert.equal(w.maxInFlight, 1, "one at a time");
  assert.equal(w.b.readyCount, 3);
  assert.ok(w.b.localSource("t2", 180)?.startsWith("blob:"), "copy served as a blob: URL");
  assert.equal(w.mem.rows.size, 3, "copies stored");
}

// --- 4b. Memory: only the sounding track and the next HALL_BUFFER_WARM copies are held as Blobs;
//         the rest waits on disk and is loaded (offline too) when it moves up the queue.
{
  const w = bufferWorld();
  w.b.setPlan(["t1", "t2", "t3", "t4"]);
  await w.b.refill(true);
  await flush();
  assert.equal(w.b.readyCount, 4, "all four on disk");
  assert.ok(w.b.localSource("t2", 180), "next tracks are warm");
  assert.equal(w.b.localSource("t4", 180), null, "a later one is not in memory yet");
  w.setOnline(false);
  w.b.pin("t1");
  w.b.setPlan(["t2", "t3", "t4"]);
  await flush();
  assert.ok(w.b.localSource("t3", 180)?.startsWith("blob:"), "moved up: loaded from disk, offline");
  w.mem.rows.delete("t4"); // the browser evicted a cold copy behind our back
  w.b.pin("t2");
  w.b.setPlan(["t3", "t4"]);
  await flush();
  assert.equal(w.b.localSource("t4", 180), null);
  assert.equal(w.b.readyCount, 1, "a copy the browser dropped is forgotten (and downloaded again later)");
}

// --- 5. Budget: the browser reports little free space → N shrinks; the soft cap holds otherwise.
{
  const w = bufferWorld({ quota: 50 * MB + 20 * MB, usage: 0, sizeMb: 6 });
  w.b.setPlan(Array.from({ length: 10 }, (_, i) => `t${i}`));
  await w.b.refill(true);
  await flush();
  assert.ok(w.b.readyCount >= 1 && w.b.readyCount < 10, `small quota shrinks the buffer (${w.b.readyCount})`);
  const big = bufferWorld({ sizeMb: 30 });
  big.b.setPlan(Array.from({ length: 10 }, (_, i) => `t${i}`));
  await big.b.refill(true);
  await flush();
  assert.ok(big.b.readyCount <= 4, `~100 MB soft cap with 30 MB tracks (${big.b.readyCount})`);
}

// --- 6. Eviction: played tracks and tracks that left the queue go (store + blob: URL); the
//        sounding track stays until another one sounds.
{
  const w = bufferWorld();
  w.b.setPlan(["t1", "t2", "t3"]);
  await w.b.refill(true);
  await flush();
  const url1 = w.b.localSource("t1", 180)!;
  w.b.pin("t1");
  w.b.setPlan(["t2", "t3", "t4"]); // advanced to t1
  assert.ok(w.b.has("t1"), "sounding copy kept");
  assert.ok(!w.revoked.includes(url1));
  w.b.pin("t2");
  w.b.setPlan(["t3", "t4", "t5"]);
  assert.ok(!w.b.has("t1"), "played track evicted");
  assert.ok(w.revoked.includes(url1), "its blob: URL released");
  assert.ok(w.mem.deleted.includes("t1"));
  // Queue rebuild / top-up: orphans go at once.
  w.b.setPlan(["t9", "t8"]);
  assert.ok(!w.b.has("t3") && w.mem.deleted.includes("t3"), "orphan after a rebuild evicted");
  assert.ok(w.b.has("t2"), "the sounding one still stays");
}

// --- 7. Deadlines: 2 hours from download, playable_until (access end), and the whole track has to
//        fit; enforced on every start and by the sweep (sounding copy → onExpired).
{
  const w = bufferWorld();
  w.b.setPlan(["t1", "t2"]);
  await w.b.refill(true);
  await flush();
  w.tick(HALL_BUFFER_MAX_AGE_MS - 60_000);
  assert.equal(w.b.localSource("t1", 180), null, "a 3-minute track no longer fits in the copy's last minute");
  assert.ok(w.b.localSource("t1", 30), "a 30-second one still does");
  w.tick(61_000);
  assert.equal(w.b.localSource("t1", 30), null, "older than 2 hours: never started");
  assert.ok(!w.mem.rows.has("t1"), "and deleted");
  w.b.pin("t2");
  w.b.sweep();
  assert.deepEqual(w.expired, ["t2"], "expired while sounding: the player is told");
  assert.equal(w.b.readyCount, 0);

  const a = bufferWorld();
  a.b.setPlan(["t1"]);
  await a.b.refill(true);
  await flush();
  a.setUntil(a.now() + 10 * 60_000);
  assert.ok(a.b.localSource("t1", 180), "access ends in 10 minutes: still usable");
  a.tick(10 * 60_000);
  assert.equal(a.b.localSource("t1", 30), null, "past the access end: not usable even within 2 hours");
  const m = bufferWorld();
  m.b.setPlan(["t1"]);
  await m.b.refill(true);
  await flush();
  m.setAllowed([]);
  assert.equal(m.b.localSource("t1", 30), null, "left the manifest: not usable");
}

// --- 8. no_access from the server: everything is purged at once.
{
  const w = bufferWorld();
  w.b.setPlan(["t1", "t2"]);
  await w.b.refill(true);
  await flush();
  assert.equal(w.b.readyCount, 2);
  await w.b.purge();
  assert.equal(w.b.readyCount, 0);
  assert.equal(w.mem.cleared(), 1);
  const d = bufferWorld({ deny: true });
  d.b.setPlan(["t1"]);
  await d.b.refill(true);
  await flush();
  assert.equal(d.noAccess, 1, "sign said no_access: purge + tell the page");
  assert.equal(d.mem.cleared(), 1);
}

// --- 9. Rehydrate after a reload: fresh copies come back, expired ones are deleted.
{
  const w = bufferWorld();
  const now = w.now();
  await w.mem.store.put("t1", new Blob(["a"], { type: "audio/mpeg" }), now - 60_000);
  await w.mem.store.put("t2", new Blob(["b"], { type: "audio/mpeg" }), now - HALL_BUFFER_MAX_AGE_MS - 1);
  await w.b.rehydrate();
  w.b.setPlan(["t1", "t2"]);
  assert.ok(w.b.has("t1"), "fresh copy taken over");
  assert.ok(!w.b.has("t2") && !w.mem.rows.has("t2"), "expired copy deleted on reload");
}

// --- Player: a copy is preferred over the network; outage → copy at the same position.
const item = (n: number, durationSeconds: number | null = 200, playableUntil: Date | null = null): SpaManifestItem => ({
  position: n, audioItemId: `t${n}`, trackCode: null, title: `T${n}`, durationSeconds,
  gainDb: null, playableUntil, offlineAllowed: false, offlineCacheUntil: null,
});

function playerWorld(local: Map<string, string>, opts: { online?: boolean; loop?: boolean } = {}) {
  let online = opts.online ?? true;
  let clock = 5_000_000;
  const signs: string[] = [];
  const log: string[] = [];
  const timers: Timer[] = [];
  const sources: string[] = [];
  const audio = {
    src: "", currentTime: 0, paused: true, loop: opts.loop ?? true,
    async play() { log.push(`play:${this.src}`); this.paused = false; },
    async playInstant() { return this.play(); },
    pause() { log.push("pause"); this.paused = true; },
    removeAttribute() { log.push("removeAttribute"); this.src = ""; },
    load() { log.push("load"); },
  };
  const p = new SpaOnlinePlayer({
    audio,
    now: () => clock,
    setTimer: (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return t; },
    clearTimer: (t) => { const i = timers.indexOf(t as Timer); if (i >= 0) timers.splice(i, 1); },
    isOnline: () => online,
    random: () => 0.5,
    sign: async (id): Promise<OnlineSignResult> => {
      signs.push(id);
      if (!online) return { ok: false, reason: "network" };
      return { ok: true, data: { url: `https://s/${id}` } };
    },
    backgroundAdvance: () => true,
    loopAdvance: () => audio.loop,
    localSource: (id) => local.get(id) ?? null,
    onSource: (id, isLocal) => { sources.push(`${id}:${isLocal ? "local" : "net"}`); },
    onChange() {},
  }, [item(1), item(2), item(3)]);
  const runTimers = async (upTo: number) => {
    clock = Math.max(clock, upTo);
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > upTo) break;
      timers.shift();
      t.fn();
      await flush();
    }
  };
  return { p, audio, signs, log, timers, sources, runTimers, setOnline(v: boolean) { online = v; }, now: () => clock };
}

function playThrough(w: ReturnType<typeof playerWorld>, from: number, to: number, duration: number) {
  for (let t = from; t <= to + 1e-9; t += 0.25) {
    w.audio.currentTime = t;
    w.p.onProgress(t, duration);
  }
}

// --- 10. Handoff prefers the copy: the next track starts from the device (offline too), inside
//         the media event, and the start is re-checked by the server in the background.
{
  const local = new Map([["t2", "blob:hall/2"]]);
  const w = playerWorld(local);
  await w.p.toggle();
  await flush();
  assert.equal(w.audio.src, "https://s/t1", "no copy: stream as before");
  w.setOnline(false);
  playThrough(w, 0, 198, 200);
  w.log.length = 0;
  w.signs.length = 0;
  w.p.onSeeking(0.05, 200); // loop wrap (iPhone home-screen app, screen locked)
  assert.equal(w.audio.src, "blob:hall/2", "next track from the device copy");
  assert.deepEqual(w.log, ["pause", "play:blob:hall/2"], "same element, no teardown");
  await flush();
  assert.equal(w.p.current?.audioItemId, "t2");
  assert.equal(w.p.status, "playing");
  assert.equal(w.p.localItemId, "t2");
  assert.ok(w.signs.includes("t2"), "server re-check attempted (offline: ignored, keeps playing)");
  assert.ok(w.sources.includes("t2:local"));
}

// --- 11. Network error mid-track while a copy of the same track exists: switch to the copy at once
//         at the same position (no backoff); stalls switch after LOCAL_STALL_MS.
{
  const local = new Map([["t1", "blob:hall/1"]]);
  const w = playerWorld(local, { loop: false });
  local.delete("t1");
  await w.p.toggle();
  await flush();
  assert.equal(w.audio.src, "https://s/t1");
  local.set("t1", "blob:hall/1"); // downloaded meanwhile
  playThrough(w, 0, 80, 200);
  w.setOnline(false);
  await w.p.onError();
  const t = w.timers.find((x) => x.at === w.now());
  assert.ok(t, "retry scheduled with no delay");
  await w.runTimers(w.now());
  assert.equal(w.audio.src, "blob:hall/1", "same track from the copy");
  assert.equal(w.p.status, "playing");
  assert.ok(Math.abs(w.audio.currentTime - 80) < 0.01, `resumed at the same position (${w.audio.currentTime})`);

  const s = playerWorld(new Map(), { loop: false });
  await s.p.toggle();
  await flush();
  const m = new Map([["t1", "blob:hall/1"]]);
  (s.p as unknown as { d: { localSource: (id: string) => string | null } }).d.localSource = (id) => m.get(id) ?? null;
  s.p.onWaiting();
  const stall = s.timers.at(-1)!;
  assert.equal(stall.at - s.now(), LOCAL_STALL_MS, "stall with a copy at hand: short wait");
}

// --- 12. Offline, the current track has no copy but the next one has: move on to it, no silence
//         for the whole resume window.
{
  const local = new Map([["t2", "blob:hall/2"]]);
  const w = playerWorld(local, { loop: false });
  await w.p.toggle();
  await flush();
  playThrough(w, 0, 30, 200);
  w.setOnline(false);
  await w.p.onError();
  await w.runTimers(w.now() + 2_000);
  assert.equal(w.p.current?.audioItemId, "t2");
  assert.equal(w.audio.src, "blob:hall/2");
}

// --- 13. Deadline expiry of the sounding copy stops it (offline: the hall waits, never plays past it).
{
  const local = new Map([["t1", "blob:hall/1"]]);
  const w = playerWorld(local, { loop: false });
  await w.p.toggle();
  await flush();
  assert.equal(w.audio.src, "blob:hall/1", "start from the copy");
  w.setOnline(false);
  local.delete("t1"); // the buffer swept it (2 h / access end)
  w.p.localExpired("t1");
  assert.equal(w.audio.src, "", "copy stopped at once");
  assert.equal(w.p.status, "loading", "reconnecting, not playing");
  await w.runTimers(w.now() + 1_000);
  assert.notEqual(w.audio.src, "blob:hall/1", "never the expired copy again");
  w.p.localExpired("t9"); // not the sounding one: nothing happens
}

// --- 13b. Review #1 F1 – the real buffer wired like the provider: the controller's own "loading"
//          change rebuilds the plan before it asks for the copy; the selected copy must survive
//          and the hall must go on offline from the device.
{
  const bw = bufferWorld();
  const tracks = [item(1), item(2), item(3), item(4)];
  let ctl: SpaOnlinePlayer | null = null;
  let online = true;
  const audio = {
    src: "", currentTime: 0, paused: true, loop: true,
    async play() { this.paused = false; },
    async playInstant() { return this.play(); },
    pause() { this.paused = true; },
    removeAttribute() { this.src = ""; },
    load() {},
  };
  const seq = (cur: number, len: number) => (cur < 0 || cur >= len - 1 ? 0 : cur + 1);
  const plan = () => {
    if (!ctl) return;
    const index = ctl.index >= 0 ? ctl.index : 0;
    bw.b.setPlan(hallBufferPlan(tracks, index, seq), tracks[index]?.audioItemId ?? null);
  };
  ctl = new SpaOnlinePlayer({
    audio,
    now: () => bw.now(),
    setTimer: () => ({}),
    clearTimer: () => {},
    isOnline: () => online,
    sign: async (id): Promise<OnlineSignResult> => (online ? { ok: true, data: { url: `https://s/${id}` } } : { ok: false, reason: "network" }),
    backgroundAdvance: () => true,
    loopAdvance: () => true,
    nextIndex: seq,
    localSource: (id, d) => bw.b.localSource(id, d),
    onSource: (id) => { if (id) bw.b.pin(id); },
    onChange: () => plan(),
  }, tracks);
  await ctl.toggle();
  await flush();
  await bw.b.refill(true);
  await flush();
  assert.equal(bw.b.readyCount, 3, "next three on the device");
  online = false;
  bw.setOnline(false);
  for (const expected of ["t2", "t3", "t4"]) {
    for (let t = 0; t <= 198; t += 0.25) { audio.currentTime = t; ctl.onProgress(t, 200); }
    audio.currentTime = 0.05;
    ctl.onSeeking(0.05, 200); // loop wrap
    await flush();
    assert.equal(ctl.current?.audioItemId, expected);
    assert.ok(audio.src.startsWith("blob:"), `${expected} played from the device offline (${audio.src})`);
    assert.equal(ctl.status, "playing");
  }
}

// --- 14. Offline report queue: samples kept in order, flushed on reconnect, drops refused ones.
{
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
  let now = 1_000_000;
  const q = new HallReportQueue(storage, () => now);
  const s = (n: number): HallUsageSample => ({ eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, sessionId: "00000000-0000-4000-8000-0000000000aa", seq: n, positionMs: n * 15_000, audioItemId: "00000000-0000-4000-8000-0000000000bb", at: now });
  // Review #1 F2: an empty flush on mount must not block every later flush.
  assert.equal(await q.flush(async () => "sent"), 0);
  q.push(s(1));
  const firstSent: number[] = [];
  assert.equal(await q.flush(async (x) => { firstSent.push(x.seq); return "sent"; }), 0);
  assert.deepEqual(firstSent, [1], "sent after an earlier empty flush");
  q.push(s(1)); q.push(s(2)); q.push(s(3));
  q.push(s(2)); // same event id: once
  assert.equal(q.size, 3);
  const sent: number[] = [];
  let fail = true;
  const left = await q.flush(async (x) => {
    if (x.seq === 2 && fail) return "retry";
    sent.push(x.seq);
    return "sent";
  });
  assert.equal(left, 2, "network failure stops the flush, order kept");
  assert.deepEqual(sent, [1]);
  fail = false;
  assert.equal(await q.flush(async (x) => { sent.push(x.seq); return x.seq === 3 ? "drop" : "sent"; }), 0);
  assert.deepEqual(sent, [1, 2, 3], "oldest first");
  assert.equal(q.size, 0);
  for (let i = 1; i <= HALL_REPORT_QUEUE_MAX + 20; i++) q.push(s(i));
  assert.equal(q.size, HALL_REPORT_QUEUE_MAX, "bounded");
  now += 25 * 60 * 60_000;
  assert.equal(q.size, 0, "a day later: not sent any more");

  let body: Record<string, unknown> = {};
  const r = await postPointUsage({ eventId: "e", sessionId: "s", seq: 1, positionMs: 0, audioItemId: "a" }, (async (_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { status: 200, json: async () => ({ ok: true }) } as Response;
  }) as typeof fetch);
  assert.equal(r, "sent");
  assert.equal(body.kind, "usage");
  assert.equal((body.usage as Record<string, unknown>).offline, true, "flagged as recorded offline");
  assert.equal(await postPointUsage({ eventId: "e", sessionId: "s", seq: 1, positionMs: 0, audioItemId: "a" }, (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch), "retry");
  assert.equal(await postPointUsage({ eventId: "e", sessionId: "s", seq: 1, positionMs: 0, audioItemId: "a" }, (async () => ({ status: 200, json: async () => ({ ok: false, reason: "usage_report_failed" }) }) as Response) as typeof fetch), "drop");
}

// --- 15. Mirror carries the buffered count (optional, bounded); the owner dot is never faked.
{
  const ok = { positionMs: 0, durationMs: null, queue: [], aheadCount: 0, bufferedCount: 10 };
  assert.equal(isHallNowPlayingReport(ok), true);
  assert.equal(isHallNowPlayingReport({ ...ok, bufferedCount: 51 }), false);
  assert.equal(isHallNowPlayingReport({ ...ok, bufferedCount: -1 }), false);
  assert.equal(isHallNowPlayingReport({ positionMs: 0, durationMs: null, queue: [] }), true, "old clients still valid");
  assert.equal(hallBufferedCount(undefined), null);
  const hall = parseHallNowPlaying({ ok: true, hall: { state: "playing", audioItemId: null, queue: [], bufferedCount: 7 } });
  assert.equal(hall?.bufferedCount, 7);

  const route = readFileSync("src/app/api/business/point/route.ts", "utf8");
  const usage = route.slice(route.indexOf('if (body.kind === "usage")'), route.indexOf('const kind = body.kind === "playback"'));
  assert.ok(usage.includes("apply_business_point_usage_sample"));
  assert.ok(!usage.includes("report_business_point_player"), "a late sample never refreshes live state / last_seen (no fake green)");
  const player = readFileSync("src/components/business-app/workspace/BusinessCabinetPlayer.tsx", "utf8");
  assert.match(player, /bufferedCount: mirror \? mirror\.bufferedCount : \(pointReports && online \? bufferedCount : null\)/);
  assert.match(player, /if \(current\.status === "no_access"\) \{\n\s+void bufferRef\.current\?\.purge\(\);/);
  assert.ok(!player.includes("SPA_OFFLINE_ENABLED"), "multi-day offline stays off");
  assert.match(player, /onNoAccess: \(\) => \{\n\s+void ctlRef\.current\?\.applyManifest\(null\);/, "review #1 F3: buffer no_access stops the hall");
  assert.match(player, /buffer\.setPlan\(\n\s+hallBufferPlan\([^\n]+\),\n\s+current\.tracks\[index\]\?\.audioItemId \?\? null,/, "selected track kept");
  const sw = readFileSync("public/sw.js", "utf8");
  assert.ok(sw.includes('"/storage/v1/"') && sw.includes('request.headers.get("range")'), "service worker still bypasses audio");
  const ws = readFileSync("src/components/business-app/workspace/BusinessWorkspace.tsx", "utf8");
  assert.match(ws, /data-testid="biz-now-offline-buffer"/);
}

console.log("business hall offline buffer: ok");
