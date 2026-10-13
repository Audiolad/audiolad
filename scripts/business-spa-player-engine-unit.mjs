#!/usr/bin/env node
// Business SPA pilot (0e05333f): engine tests with fake audio elements + fake clock.
// Covers review 2026-10-13 blockers 4–9 for #841.
import assert from "node:assert/strict";

import { SPA_CROSSFADE_MS, SpaPlayerEngine } from "../src/lib/business-app/spa-player-engine.ts";

const DAY = 86400000;
const T0 = Date.parse("2026-10-13T06:00:00Z");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

function makeWorld({ durations, offlineUntil = () => new Date(T0 + 7 * DAY), playableUntil = () => null, expiresAt = T0 + 7 * DAY, timerLatency = 0 } = {}) {
  const world = { now: T0, online: true, timers: [], seq: 0, plays: [], ends: [], manifestRes: null, signs: [], cache: new Map(), storage: new Map(), synced: [] };
  const durationOf = new Map();
  class FakeAudio {
    constructor(name) { this.name = name; this._src = ""; this._t = 0; this.paused = true; this.readyState = 0; this.volume = 1; this.listeners = new Map(); this.startClock = 0; this.endedFired = false; }
    get src() { return this._src; }
    set src(v) { this._src = v; this._t = 0; this.paused = true; this.readyState = 0; this.endedFired = false; }
    get duration() { return durationOf.get(this._src.replace(/^blob:/, "").replace(/^https:\/\/s\//, "")) ?? NaN; }
    get currentTime() { return this.paused ? this._t : Math.min(this.duration, (world.now - this.startClock) / 1000); }
    set currentTime(v) { this._t = v; if (!this.paused) this.startClock = world.now - v * 1000; }
    async play() { if (!this._src) throw new Error("no src"); this._t = this.currentTime; this.paused = false; this.startClock = world.now - this._t * 1000; world.plays.push({ el: this.name, src: this._src, at: world.now, pos: this._t }); }
    pause() { if (!this.paused) { this._t = this.currentTime; this.paused = true; } }
    load() { if (this._src) { this.readyState = 4; queueMicrotask(() => { this.fire("loadedmetadata"); this.fire("canplaythrough"); }); } }
    removeAttribute(n) { if (n === "src") { this._src = ""; this._t = 0; this.paused = true; this.readyState = 0; } }
    addEventListener(t, fn, o) { const a = this.listeners.get(t) ?? []; a.push({ fn, once: o?.once }); this.listeners.set(t, a); }
    removeEventListener(t, fn) { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((l) => l.fn !== fn)); }
    fire(t) { const a = this.listeners.get(t) ?? []; this.listeners.set(t, a.filter((l) => !l.once)); a.forEach((l) => l.fn()); }
    checkEnd() {
      if (!this.paused && this._src && !this.endedFired && world.now >= this.startClock + this.duration * 1000) {
        this.endedFired = true; this._t = this.duration; this.paused = true;
        world.ends.push({ el: this.name, src: this._src, at: this.startClock + this.duration * 1000 });
        // Real browsers deliver `ended` late (event-loop latency); model 40 ms.
        deps.setTimer(() => this.fire("ended"), 40);
      }
    }
  }
  const audios = [new FakeAudio("A"), new FakeAudio("B")];
  const items = durations.map((d, i) => ({
    position: i + 1, audio_item_id: id(i + 1), title: `Track ${i + 1}`, duration_seconds: d, gain_db: -6,
    playable_until: playableUntil(i)?.toISOString() ?? null, offline_allowed: offlineUntil(i) !== null,
    offline_cache_until: offlineUntil(i)?.toISOString() ?? null,
  }));
  items.forEach((it, i) => durationOf.set(it.audio_item_id, durations[i]));
  const manifest = (list = items) => ({
    manifest_version: "business_spa_manifest_v1", program_id: id(100), location_id: id(101),
    generated_at: new Date(world.now).toISOString(), expires_at: new Date(expiresAt).toISOString(),
    offline_cache_max_seconds: 604800, withheld_count: 0, content_hash: list.map((x) => x.audio_item_id).join(","), items: list,
  });
  world.manifestRes = { ok: true, data: manifest() };
  const deps = {
    audios, now: () => world.now, online: () => world.online,
    setTimer: (fn, ms) => { const t = { at: world.now + ms + timerLatency, fn, id: ++world.seq }; world.timers.push(t); return t.id; },
    clearTimer: (tid) => { world.timers = world.timers.filter((t) => t.id !== tid); },
    sign: async (aid, purpose) => {
      world.signs.push({ aid, purpose });
      if (world.manifestRes.ok === false) return { ok: false, reason: world.manifestRes.reason };
      const it = world.manifestRes.data.items.find((x) => x.audio_item_id === aid);
      if (!it) return { ok: false, reason: "not_in_manifest" };
      if (purpose === "offline" && !it.offline_allowed) return { ok: false, reason: "offline_not_allowed" };
      const until = purpose === "offline" && world.serverUntil ? world.serverUntil(aid) : it.offline_cache_until;
      return { ok: true, data: { url: `https://s/${aid}`, offlineCacheUntil: until } };
    },
    fetchManifest: async () => world.manifestRes,
    sync: async (evs) => { world.synced.push(...evs); return { ok: true, data: evs.map((e) => e.client_event_id) }; },
    download: async (url) => { if (!world.online) return null; if (world.onDownload) await world.onDownload(url); return { url }; },
    cache: {
      get: async (k) => world.cache.get(k) ?? null,
      put: async (k, data, cachedAt, until) => { world.cache.set(k, { data, cachedAt, until }); },
      delete: async (k) => { world.cache.delete(k); },
      keys: async () => [...world.cache.keys()],
      clear: async () => world.cache.clear(),
    },
    objectUrl: { create: (b) => `blob:${b.url.replace("https://s/", "")}`, revoke: () => {} },
    storage: { get: (k) => world.storage.get(k) ?? null, set: (k, v) => world.storage.set(k, v), remove: (k) => world.storage.delete(k) },
    uuid: () => id(5000 + ++world.seq), onChange: () => {}, programId: id(100), playerId: id(900), zoneId: id(901),
  };
  // Advance the fake clock event by event (timers and natural ends), flushing promises between.
  world.advance = async (ms) => {
    const until = world.now + ms;
    for (;;) {
      await flush();
      const nextTimer = world.timers.reduce((m, t) => (m === null || t.at < m.at ? t : m), null);
      const nextEnd = audios.filter((a) => !a.paused && a._src).map((a) => a.startClock + a.duration * 1000).reduce((m, x) => Math.min(m, x), Infinity);
      const at = Math.min(nextTimer ? nextTimer.at : Infinity, nextEnd);
      if (at > until) { world.now = until; await flush(); return; }
      world.now = Math.max(world.now, at);
      if (nextTimer && nextTimer.at <= world.now) { world.timers = world.timers.filter((t) => t !== nextTimer); nextTimer.fn(); }
      audios.forEach((a) => a.checkEnd());
    }
  };
  world.manifest = manifest;
  world.items = items;
  return { world, deps, audios };
}

// ---- 1. Gapless: 12 tracks back-to-back, including last -> first ----
{
  const durations = [7, 5, 9, 6, 8, 5, 7, 6, 9, 5, 8, 6];
  const { world, deps } = makeWorld({ durations });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  assert.equal(engine.status, "playing");
  const total = durations.reduce((a, b) => a + b, 0) * 1000;
  await world.advance(total + 3000);
  const starts = world.plays.filter((p) => p.pos === 0);
  assert.ok(starts.length >= 13, `13 starts incl. wrap, got ${starts.length}`);
  for (let k = 1; k <= 12; k++) {
    const prevStart = starts[k - 1];
    const expectedEnd = prevStart.at + durations[(k - 1) % 12] * 1000;
    const gap = starts[k].at - expectedEnd; // negative = overlap (cross-fade), positive = silence
    assert.ok(gap <= 0 && gap >= -SPA_CROSSFADE_MS - 20, `transition ${k} (${k === 12 ? "last->first" : "n->n+1"}) gap ${gap}ms`);
    assert.notEqual(starts[k].el, prevStart.el, "next track starts on the other, pre-buffered element");
  }
  assert.equal(starts[12].src, `https://s/${id(1)}`, "wraps to the first track");
  engine.dispose();
}

// ---- 2. Expiry rechecked on prepare/resume and mid-track ----
{
  // Track 2 playable only until T0+3s: prepared before expiry, must not start after it.
  const { world, deps } = makeWorld({ durations: [5, 5, 5], playableUntil: (i) => (i === 1 ? new Date(T0 + 3000) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(5200);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(2))), "expired prepared track never plays");
  assert.ok(world.plays.some((p) => p.src.endsWith(id(3)) && p.pos === 0), "skips to the next allowed track");
  engine.dispose();
}
{
  // Pause, then grant ends; resume must not play it.
  const { world, deps } = makeWorld({ durations: [60, 60], playableUntil: (i) => (i === 0 ? new Date(T0 + 10000) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(2000);
  await engine.toggle();
  assert.equal(engine.status, "paused");
  await world.advance(15000);
  const before = world.plays.length;
  await engine.toggle();
  await flush();
  assert.ok(world.plays.slice(before).every((p) => !p.src.endsWith(id(1))), "resume re-checks playable_until");
  engine.dispose();
}
{
  // Mid-track expiry stops the current track.
  const { world, deps, audios } = makeWorld({ durations: [60, 60], playableUntil: (i) => (i === 0 ? new Date(T0 + 5000) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(6000);
  assert.ok(audios.every((a) => a.paused || !a.src.endsWith(id(1))), "expired track no longer playing");
  engine.dispose();
}
{
  // Expired manifest: no new start without refresh.
  const { world, deps } = makeWorld({ durations: [5, 5], expiresAt: T0 + 2000 });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  world.manifestRes = { ok: false, reason: "manifest_failed" };
  await world.advance(6000);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(2))), "no start after manifest expiry");
  engine.dispose();
}

// ---- 3. Offline download: separate authorization + re-check before put ----
{
  const { world, deps } = makeWorld({ durations: [30, 30, 30], offlineUntil: (i) => (i === 2 ? null : new Date(T0 + 7 * DAY)) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  // While track 2 downloads, the server revokes its offline permission.
  world.onDownload = async (url) => {
    if (url.endsWith(id(2))) {
      const list = world.items.map((x) => (x.audio_item_id === id(2) ? { ...x, offline_allowed: false, offline_cache_until: null } : x));
      world.manifestRes = { ok: true, data: world.manifest(list) };
      await engine.refresh();
    }
  };
  await engine.downloadAll();
  await flush();
  assert.ok(world.signs.filter((s) => s.purpose === "offline").length >= 1, "offline uses purpose=offline");
  assert.ok(world.cache.has(id(1)), "allowed track cached");
  assert.ok(!world.cache.has(id(2)), "stale download discarded after offline revoked");
  assert.ok(!world.cache.has(id(3)), "track without offline permission never cached");
  assert.ok(!world.signs.some((s) => s.aid === id(3) && s.purpose === "offline"), "no offline sign for non-offline track");
  engine.dispose();
}

// ---- 4. Removed track stops (playing, paused, empty program) ----
{
  const { world, deps, audios } = makeWorld({ durations: [60, 60, 60] });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(2000);
  world.manifestRes = { ok: true, data: world.manifest(world.items.filter((x) => x.audio_item_id !== id(1))) };
  await engine.refresh();
  await flush();
  assert.ok(audios.every((a) => !a.src.endsWith(id(1))), "removed playing track source cleared");
  assert.equal(engine.current?.audioItemId, id(2), "continues with the next remaining track");
  // Paused removal
  await engine.toggle();
  world.manifestRes = { ok: true, data: world.manifest(world.items.filter((x) => x.audio_item_id === id(3))) };
  await engine.refresh();
  await engine.toggle();
  await flush();
  assert.ok(audios.every((a) => !a.src.endsWith(id(2))), "removed paused track is not resumed");
  // Empty program stops audio.
  world.manifestRes = { ok: true, data: world.manifest([]) };
  await engine.refresh();
  assert.ok(audios.every((a) => a.paused && !a.src), "empty program: everything stopped");
  assert.equal(engine.status, "empty");
  engine.dispose();
}

// ---- 5. no_access on refresh stops and wipes ----
{
  const { world, deps, audios } = makeWorld({ durations: [60, 60] });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  assert.ok(world.cache.size > 0);
  world.manifestRes = { ok: false, reason: "no_access" };
  await engine.refresh();
  assert.equal(engine.status, "no_access");
  assert.ok(audios.every((a) => a.paused && !a.src), "stopped");
  assert.equal(world.cache.size, 0, "cache wiped");
  assert.equal(world.storage.has(engine.resumeKey), false, "resume point wiped");
  assert.equal(engine.manifest, null);
  // A network error, by contrast, keeps playing.
  const w2 = makeWorld({ durations: [60, 60] });
  const e2 = new SpaPlayerEngine(w2.deps);
  await e2.init(w2.world.manifestRes.data);
  w2.world.manifestRes = { ok: false, reason: "manifest_failed" };
  await e2.refresh();
  assert.equal(e2.status, "playing");
  engine.dispose(); e2.dispose();
}

// ---- 6. Wi-Fi drop switches the stream to the cached copy at the same position ----
{
  const { world, deps, audios } = makeWorld({ durations: [600, 600] });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data); // starts from stream (cache empty)
  assert.equal(engine.loadedActive().kind, "stream");
  await engine.downloadAll();
  await world.advance(42000);
  const pos = engine.activeEl().currentTime;
  world.online = false;
  await world.advance(300); // next tick detects the change
  const el = engine.activeEl();
  assert.equal(engine.loadedActive().kind, "blob", "active source is the cached copy");
  assert.ok(el.src.startsWith("blob:"), el.src);
  assert.ok(!el.paused, "keeps playing offline");
  assert.ok(Math.abs(el.currentTime - pos) < 1, `position kept (${pos} -> ${el.currentTime})`);
  assert.equal(engine.status, "playing");
  // Offline minutes are logged as offline and uploaded once Wi-Fi returns (item 5).
  await world.advance(60000);
  world.online = true;
  await world.advance(300);
  await engine.flushLog();
  assert.ok(world.synced.some((e) => e.offline && e.played_ms >= 59000), "offline segment uploaded");
  assert.ok(world.synced.every((e) => e.player_id === id(900) && e.zone_id === id(901)), "player bound at creation");
  void audios;
  engine.dispose();
}

// ---- 7. Resume after reload ----
{
  const a = makeWorld({ durations: [600, 600] });
  const e1 = new SpaPlayerEngine(a.deps);
  await e1.init(a.world.manifestRes.data);
  await a.world.advance(100000);
  e1.saveResume();
  e1.dispose();
  const b = makeWorld({ durations: [600, 600] });
  b.world.storage = a.world.storage; // same browser
  b.deps.storage = a.deps.storage;
  const e2 = new SpaPlayerEngine(b.deps);
  await e2.init(b.world.manifestRes.data);
  assert.equal(e2.current.audioItemId, id(1));
  assert.ok(Math.abs(e2.activeEl().currentTime - 100) < 1, `resumed at ${e2.activeEl().currentTime}`);
  e2.dispose();
}

// ---- 8. Re-review A2: gapless under timer/main-thread latency ----
{
  const durations = [7, 5, 9, 6, 8, 5, 7, 6, 9, 5, 8, 6];
  const { world, deps } = makeWorld({ durations, timerLatency: 250 });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(durations.reduce((a, b) => a + b, 0) * 1000 + 3000);
  const starts = world.plays.filter((p) => p.pos === 0);
  assert.ok(starts.length >= 13, `13 starts with latency, got ${starts.length}`);
  for (let k = 1; k <= 12; k++) {
    const end = starts[k - 1].at + durations[(k - 1) % 12] * 1000;
    assert.ok(starts[k].at <= end, `no silence with 250ms timer latency: transition ${k} starts ${starts[k].at - end}ms after end`);
  }
  engine.dispose();
}

// ---- 9. Server deadline of the offline download is binding ----
{
  const { world, deps } = makeWorld({ durations: [600, 600] });
  world.serverUntil = () => new Date(T0 + 60_000).toISOString(); // manifest says 7 days, server says 1 minute
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  assert.equal(world.cache.get(id(1)).until, T0 + 60_000, "server deadline stored with the copy");
  world.online = false;
  await world.advance(61_000);
  assert.ok(!world.cache.has(id(1)) && !world.cache.has(id(2)), "copies dropped at the server deadline");
  assert.ok(deps.audios.every((a) => a.paused || !a.src.startsWith("blob:")), "no blob plays past the server deadline");
  engine.dispose();
}
{
  // Server deadline already passed when the download finishes -> never written.
  const { world, deps } = makeWorld({ durations: [600, 600] });
  world.serverUntil = () => new Date(T0 + 1000).toISOString();
  world.onDownload = async () => { world.now += 2000; };
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  assert.equal(world.cache.size, 0, "expired-on-arrival download not cached");
  engine.dispose();
}
{
  // No server deadline -> no offline copy.
  const { world, deps } = makeWorld({ durations: [600] });
  world.serverUntil = () => null;
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  assert.equal(world.cache.size, 0);
  engine.dispose();
}

// ---- 10. Expired copies purged on tick while paused and offline (inactive tracks too) ----
{
  const { world, deps } = makeWorld({ durations: [600, 600, 600], offlineUntil: () => new Date(T0 + 30_000) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  assert.equal(world.cache.size, 3);
  await engine.toggle();
  assert.equal(engine.status, "paused");
  world.online = false;
  await world.advance(31_000);
  assert.equal(world.cache.size, 0, "all expired copies removed while paused offline");
  assert.equal(engine.cachedAt.size, 0);
  engine.dispose();
}

// ---- 11. Expiry stop does not wait for a hung manifest refresh ----
{
  const { world, deps, audios } = makeWorld({ durations: [60, 60], playableUntil: (i) => (i === 0 ? new Date(T0 + 5000) : null), expiresAt: T0 + 3000 });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  deps.fetchManifest = () => new Promise(() => {}); // never resolves
  await world.advance(5300);
  assert.ok(audios.every((a) => a.paused || !a.src.endsWith(id(1))), "expired track stopped despite hung refresh");
  engine.dispose();
}

// ---- 12. Wi-Fi->cache switch re-checks rights before play() ----
{
  const { world, deps, audios } = makeWorld({ durations: [600, 600] });
  world.serverUntil = () => new Date(T0 + 40_000).toISOString();
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  // The copy expires exactly while the cached source is loading.
  const origGet = deps.cache.get;
  deps.cache.get = async (k) => { const c = await origGet(k); world.now = T0 + 41_000; return c; };
  world.now = T0 + 39_000;
  world.online = false;
  await world.advance(300);
  assert.ok(!world.plays.some((p) => p.src.startsWith("blob:")), "expired cached copy never played");
  void audios;
  engine.dispose();
}

console.log("business-spa-player-engine-unit: all tests passed");
