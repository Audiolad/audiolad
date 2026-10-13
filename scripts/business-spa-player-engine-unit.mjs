#!/usr/bin/env node
// Business SPA pilot (0e05333f): engine tests with fake audio elements + fake clock.
// Covers review 2026-10-13 blockers 4–9 for #841.
import assert from "node:assert/strict";

import { SPA_CROSSFADE_MS, SpaPlayerEngine } from "../src/lib/business-app/spa-player-engine.ts";

const DAY = 86400000;
const T0 = Date.parse("2026-10-13T06:00:00Z");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

function makeWorld({ durations, offlineUntil = () => new Date(T0 + 7 * DAY), playableUntil = () => null, expiresAt = T0 + 7 * DAY, timerLatency = 0, webAudio = false } = {}) {
  const world = { now: T0, online: true, timers: [], seq: 0, plays: [], ends: [], manifestRes: null, signs: [], cache: new Map(), storage: new Map(), synced: [], stops: [] };
  const durationOf = new Map();
  class FakeAudio {
    constructor(name) { this.name = name; this._src = ""; this._t = 0; this.paused = true; this.readyState = 0; this.volume = 1; this.listeners = new Map(); this.startClock = 0; this.endedFired = false; }
    get src() { return this._src; }
    set src(v) { this.cancelPending?.(); this.deadline = null; this._src = v; this._t = 0; this.paused = true; this.readyState = 0; this.endedFired = false; }
    get duration() { return durationOf.get(this._src.replace(/^blob:/, "").replace(/^https:\/\/s\//, "")) ?? NaN; }
    get currentTime() { return this.paused ? this._t : Math.min(this.duration, (world.now - this.startClock) / 1000); }
    set currentTime(v) { this._t = v; if (!this.paused) this.startClock = world.now - v * 1000; }
    async play() { if (!this._src) throw new Error("no src"); this._t = this.currentTime; this.paused = false; this.startClock = world.now - this._t * 1000; world.plays.push({ el: this.name, src: this._src, at: world.now, pos: this._t, vol: this.volume }); }
    pause() { this.cancelPending(); if (!this.paused) { this._t = this.currentTime; this.paused = true; } }
    cancelPending() { if (this.pending) { world.timers = world.timers.filter((t) => t !== this.pending); this.pending = null; } }
    // Web Audio model: start exactly at prev's end on the audio clock (no timer latency).
    startAfter(prev) {
      if (!webAudio || prev.paused || !this._src || this.readyState < 4 || !this.paused || this.pending) return false;
      const at = prev.startClock + prev.duration * 1000;
      if (at <= world.now) return false;
      this._t = 0;
      const p = { at, id: ++world.seq, fn: () => { this.pending = null; this.paused = false; this.startClock = p.at; world.plays.push({ el: this.name, src: this._src, at: p.at, pos: 0, vol: this.volume, scheduled: true }); } };
      this.pending = p;
      world.timers.push(this.pending);
      return true;
    }
    load() { if (this._src) { this.readyState = 4; queueMicrotask(() => { this.fire("loadedmetadata"); this.fire("canplaythrough"); }); } }
    removeAttribute(n) { if (n === "src") { this.cancelPending(); this._src = ""; this._t = 0; this.paused = true; this.readyState = 0; } }
    addEventListener(t, fn, o) { const a = this.listeners.get(t) ?? []; a.push({ fn, once: o?.once }); this.listeners.set(t, a); }
    removeEventListener(t, fn) { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((l) => l.fn !== fn)); }
    fire(t) { const a = this.listeners.get(t) ?? []; this.listeners.set(t, a.filter((l) => !l.once)); a.forEach((l) => l.fn()); }
    stopAt(ms) { if (webAudio) this.deadline = ms; }
    checkEnd() {
      if (!this.paused && this._src && this.deadline != null && world.now >= this.deadline) {
        this._t = this.currentTime; this.paused = true; world.stops.push({ src: this._src, at: world.now });
        deps.setTimer(() => this.fire("ended"), 40);
        return;
      }
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
      const nextEnd = audios.filter((a) => !a.paused && a._src).map((a) => Math.min(a.startClock + a.duration * 1000, a.deadline ?? Infinity)).reduce((m, x) => Math.min(m, x), Infinity);
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
    assert.ok(starts[k].vol > 0.4, `incoming track audible from its first sample (vol ${starts[k].vol}) — no fade-in silence`);
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

// ---- 13. Re-review A3: outgoing stream stops at its grant deadline during the overlap ----
{
  const { world, deps, audios } = makeWorld({ durations: [5, 60], playableUntil: (i) => (i === 0 ? new Date(T0 + 4650) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(4620); // cross-fade started at ~4600
  assert.ok(audios.some((a) => !a.paused && a.src.endsWith(id(2))), "next track started (overlap)");
  await world.advance(200); // tick at 4750 > deadline 4650
  assert.ok(audios.every((a) => a.paused || !a.src.endsWith(id(1))), "outgoing stream paused after its deadline");
  engine.dispose();
}

// ---- 14. Re-review A3: refresh/scanCache unloads an expired paused blob ----
{
  const { world, deps, audios } = makeWorld({ durations: [600, 600], offlineUntil: () => new Date(T0 + 30_000) });
  const revoked = [];
  deps.objectUrl.revoke = (u) => revoked.push(u);
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  world.online = false;
  await world.advance(300); // switched to blob
  assert.equal(engine.loadedActive().kind, "blob");
  await engine.toggle(); // pause
  world.now = T0 + 31_000; // no tick in between
  world.online = true;
  world.manifestRes = { ok: true, data: world.manifest() };
  await engine.refresh();
  assert.ok(audios.every((a) => !a.src.startsWith("blob:")), "expired paused blob unloaded");
  assert.ok(revoked.length > 0, "object URL revoked");
  engine.dispose();
}

// ---- 15. Re-review A4: Web Audio slots — exact transitions under ANY main-thread latency ----
for (const lat of [0, 600, 2000]) {
  const durations = [7, 5, 9, 6, 8, 5, 7, 6, 9, 5, 8, 6];
  const { world, deps } = makeWorld({ durations, timerLatency: lat, webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(durations.reduce((a, b) => a + b, 0) * 1000 + 3000 + 12 * lat);
  const starts = world.plays.filter((p) => p.pos === 0);
  assert.ok(starts.length >= 13, `latency ${lat}: 13 starts, got ${starts.length}`);
  for (let k = 1; k <= 12; k++) {
    const end = starts[k - 1].at + durations[(k - 1) % 12] * 1000;
    assert.equal(starts[k].at, end, `latency ${lat}ms: transition ${k} exact (gap ${starts[k].at - end}ms)`);
    assert.ok(starts[k].scheduled, `transition ${k} scheduled on the audio clock`);
  }
  assert.equal(starts[12].src, `https://s/${id(1)}`, "wraps to the first track");
  assert.ok(world.plays.every((p) => p.vol > 0.4), "never silent");
  engine.dispose();
}
{
  // Pause before the scheduled start cancels it.
  const { world, deps, audios } = makeWorld({ durations: [5, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(4000); // scheduled at ~3500
  await engine.toggle();
  await world.advance(3000);
  assert.ok(audios.every((a) => a.paused), "paused: scheduled next start cancelled");
  engine.dispose();
}
{
  // Next track whose grant ends before its scheduled start is not scheduled.
  const { world, deps } = makeWorld({ durations: [5, 60, 60], webAudio: true, playableUntil: (i) => (i === 1 ? new Date(T0 + 4900) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(6000);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(2)) && p.scheduled), "not scheduled on the audio clock past its grant");
  assert.ok(world.plays.filter((p) => p.src.endsWith(id(2))).every((p) => p.at < T0 + 4900), "never started after its grant end");
  assert.ok(deps.audios.every((a) => a.paused || !a.src.endsWith(id(2))), "not playing after its grant end");
  engine.dispose();
}

// ---- 16. Re-review A4: early end of a cross-fade still prepares the next track ----
{
  const { world, deps, audios } = makeWorld({ durations: [5, 6, 60], playableUntil: (i) => (i === 0 ? new Date(T0 + 4650) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(5000); // A->B cross-fade, A's grant ends inside the overlap
  assert.ok(audios.some((a) => a.src.endsWith(id(3)) && a.readyState >= 4), "next track (C) prepared after the early handoff end");
  const bStart = world.plays.find((p) => p.src.endsWith(id(2)) && p.pos === 0).at;
  await world.advance(7000);
  const cStart = world.plays.find((p) => p.src.endsWith(id(3)) && p.pos === 0);
  assert.ok(cStart && cStart.at <= bStart + 6000, "B->C without a gap");
  engine.dispose();
}

// ---- 17. Re-review A5 ----
{
  // (1) refresh shortens the grant of an already scheduled next track -> start cancelled.
  const { world, deps, audios } = makeWorld({ durations: [10, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(2000);
  assert.ok(audios.some((a) => a.pending), "B scheduled on the audio clock");
  const list = world.items.map((x) => (x.audio_item_id === id(2) ? { ...x, playable_until: new Date(T0 + 5000).toISOString() } : x));
  world.manifestRes = { ok: true, data: world.manifest(list) };
  await engine.refresh();
  await world.advance(10000);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(2)) && p.at >= T0 + 5000), "no start of B after its shortened grant");
  engine.dispose();
}
{
  // (1b) blob whose server deadline is before the scheduled start is never scheduled/played.
  const { world, deps } = makeWorld({ durations: [10, 60], webAudio: true });
  world.serverUntil = () => new Date(T0 + 8000).toISOString();
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  await world.advance(12000);
  assert.ok(!world.plays.some((p) => p.src.startsWith("blob:") && p.at >= T0 + 8000), "no blob start past its server deadline");
  assert.ok(world.plays.some((p) => p.src === `https://s/${id(2)}`), "B streamed instead");
  engine.dispose();
}
{
  // (2) Wi-Fi->cache with a scheduled next start: schedule re-planned, B starts exactly on time.
  const { world, deps, audios } = makeWorld({ durations: [10, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  await world.advance(5000);
  world.online = false;
  await world.advance(7000);
  const b = world.plays.find((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.ok(b && b.src.startsWith("blob:"), "B plays from cache");
  assert.ok(Math.abs(b.at - (T0 + 10000)) <= 1, `B starts on time (${b && b.at - T0})`);
  assert.ok(audios.some((a) => !a.paused && a.src.endsWith(id(2))), "B audible");
  assert.equal(engine.status, "playing");
  engine.dispose();
}
{
  // (3) AudioContext suspended 2 s: commit waits for the real audio-clock end.
  const { world, deps, audios } = makeWorld({ durations: [10, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(8000);
  const a = audios.find((x) => x.src.endsWith(id(1)));
  const bEl = audios.find((x) => x.pending);
  assert.ok(a && bEl, "A playing, B scheduled");
  a.startClock += 2000; bEl.pending.at += 2000; // audio clock frozen for 2 s
  await world.advance(2500); // wall 10.5 s, audio 8.5 s
  assert.equal(engine.current.audioItemId, id(1), "engine still on A");
  assert.ok(!a.paused, "A not stopped early");
  await world.advance(2000);
  assert.equal(engine.current.audioItemId, id(2));
  assert.ok(!bEl.paused, "B audible after the real transition");
  engine.dispose();
}

// ---- 18. Re-review A6 ----
{
  // (1) suspension shifts B's start past its grant -> pending start cancelled by tick.
  const { world, deps, audios } = makeWorld({ durations: [10, 60, 60], webAudio: true, playableUntil: (i) => (i === 1 ? new Date(T0 + 12000) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(8000);
  const a = audios.find((x) => x.src.endsWith(id(1)));
  const b = audios.find((x) => x.pending);
  assert.ok(a && b && b.src.endsWith(id(2)), "B scheduled");
  a.startClock += 4000; b.pending.at += 4000; // context suspended 4 s: B would start at 14 s
  await world.advance(4600);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(2)) && p.at >= T0 + 12000), "B never starts after its grant");
  assert.ok(!audios.some((x) => x.pending && x.src.endsWith(id(2))), "pending B start cancelled");
  engine.dispose();
}
{
  // (2) no positive commit tolerance: A late by 15 ms is not stopped early.
  const { world, deps, audios } = makeWorld({ durations: [10, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(9000);
  const a = audios.find((x) => x.src.endsWith(id(1)));
  const b = audios.find((x) => x.pending);
  a.startClock += 15; b.pending.at += 15;
  await world.advance(1010); // wall 10.010 s, A ends at 10.015 s
  assert.ok(!a.paused, "A still playing until its real end");
  await world.advance(100);
  const bs = world.plays.find((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.equal(bs.at, T0 + 10015, "B starts exactly at A's end");
  engine.dispose();
}
{
  // (3) refresh right before the boundary with a slow cache scan keeps the exact schedule.
  const { world, deps } = makeWorld({ durations: [10, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(9900);
  const keys = deps.cache.keys;
  deps.cache.keys = () => new Promise((r) => { world.timers.push({ at: world.now + 300, id: ++world.seq, fn: () => r(keys()) }); });
  world.manifestRes = { ok: true, data: world.manifest() };
  const rp = engine.refresh();
  await world.advance(500);
  await rp;
  const bs = world.plays.find((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.ok(bs && bs.at === T0 + 10000 && bs.scheduled, "B still starts exactly on the audio clock");
  assert.equal(engine.current.audioItemId, id(2));
  assert.equal(engine.status, "playing");
  engine.dispose();
}

// ---- 19. Re-review A7 + state-machine invariants ----
// Helper: let the audio-clock transition happen but hold back every engine callback
// (ended event + commit timer), so the engine still believes A is active.
function holdEngine(world, audios) {
  for (const a of audios) a.fire = () => {};
  world.timers = world.timers.filter((t) => audios.some((a) => a.pending === t));
}
{
  // (1) Wi-Fi drops right after the boundary: B (already audible) keeps playing from cache.
  const { world, deps, audios } = makeWorld({ durations: [10, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  await world.advance(9000);
  holdEngine(world, audios);
  await world.advance(1100); // audio clock: B started at 10.000 s
  const b = audios.find((x) => x.src.endsWith(id(2)));
  assert.ok(b && !b.paused, "B audible after the boundary");
  assert.equal(engine.current.audioItemId, id(1), "engine has not committed yet");
  world.online = false;
  await engine.switchToCache();
  await flush();
  assert.equal(engine.current.audioItemId, id(2), "B committed before switching");
  assert.ok(audios.some((x) => !x.paused && x.src === `blob:${id(2)}`), "B continues from its cached copy");
  assert.ok(Math.abs(engine.activeEl().currentTime - 0.1) < 0.05, `B keeps its position (${engine.activeEl().currentTime})`);
  assert.equal(engine.status, "playing");
  engine.dispose();
}
{
  // (2) B removed from the program by refresh after it started: it stops.
  const { world, deps, audios } = makeWorld({ durations: [10, 60, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(9000);
  holdEngine(world, audios);
  await world.advance(1100);
  assert.ok(audios.some((x) => !x.paused && x.src.endsWith(id(2))), "B audible");
  world.manifestRes = { ok: true, data: world.manifest(world.items.filter((x) => x.audio_item_id !== id(2))) };
  await engine.refresh();
  await flush();
  assert.ok(audios.every((x) => x.paused || !x.src.endsWith(id(2))), "removed B no longer playing");
  engine.dispose();
}
{
  // (2b) commitScheduled for a B that vanished from the manifest stops it directly.
  const { world, deps, audios } = makeWorld({ durations: [10, 60, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(9000);
  holdEngine(world, audios);
  await world.advance(1100);
  engine.manifest = { ...engine.manifest, items: engine.manifest.items.filter((i) => i.audioItemId !== id(2)) };
  await engine.tick();
  assert.ok(audios.every((x) => x.paused || !x.src.endsWith(id(2))), "B stopped on commit");
  engine.dispose();
}
{
  // (3) Invariant: pause right after an uncommitted boundary pauses B (what is audible), and
  // resume continues B — not A from its end.
  const { world, deps, audios } = makeWorld({ durations: [10, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(9000);
  holdEngine(world, audios);
  await world.advance(3000);
  await engine.toggle();
  assert.ok(audios.every((x) => x.paused), "everything paused");
  assert.equal(engine.current.audioItemId, id(2));
  await engine.toggle();
  await flush();
  assert.equal(engine.current.audioItemId, id(2), "resumes B");
  assert.ok(engine.activeEl().currentTime >= 1.9, `at B position (${engine.activeEl().currentTime})`);
  engine.dispose();
}
{
  // (4) Invariant: tick commits an uncommitted boundary even if ended/timer never arrive.
  const { world, deps, audios } = makeWorld({ durations: [10, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(9000);
  holdEngine(world, audios);
  await world.advance(1100);
  await engine.tick();
  assert.equal(engine.current.audioItemId, id(2));
  assert.ok(!engine.activeEl().paused);
  engine.dispose();
}

// ---- 20. Re-review A8 ----
const deferred = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };
{
  // (1) refresh removes the audible A while the cache scan is slow: A stops before the scan.
  for (const empty of [false, true]) {
    const { world, deps, audios } = makeWorld({ durations: [60, 60, 60], webAudio: true });
    const engine = new SpaPlayerEngine(deps);
    await engine.init(world.manifestRes.data);
    await world.advance(2000);
    const scan = deferred();
    deps.cache.keys = () => scan.p.then(() => []);
    world.manifestRes = { ok: true, data: world.manifest(empty ? [] : world.items.filter((x) => x.audio_item_id !== id(1))) };
    const rp = engine.refresh();
    await flush();
    assert.ok(audios.every((a) => a.paused || !a.src.endsWith(id(1))), `removed A silent before the scan finishes (empty=${empty})`);
    await engine.tick();
    assert.ok(audios.every((a) => a.paused || !a.src.endsWith(id(1))), "tick does not revive A");
    scan.res(); await rp; await flush();
    if (empty) assert.ok(audios.every((a) => a.paused), "empty program silent");
    else assert.equal(engine.current.audioItemId, id(2));
    engine.dispose();
  }
}
{
  // (2) stale successful refresh / sign after revokeAccess never resumes playback.
  const { world, deps, audios } = makeWorld({ durations: [60, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  const fm = deferred();
  deps.fetchManifest = () => fm.p;
  const rp = engine.refresh();
  const sg = deferred();
  const sign = deps.sign;
  deps.sign = async (...a) => { await sg.p; return sign(...a); };
  const sp = engine.startAt(1);
  await engine.revokeAccess();
  fm.res({ ok: true, data: world.manifest() });
  sg.res();
  await rp; await sp; await flush();
  await world.advance(1000);
  assert.equal(engine.status, "no_access");
  assert.equal(engine.manifest, null);
  assert.ok(audios.every((a) => a.paused), "nothing plays after revoke");
  engine.dispose();
}
{
  // (3) prepared copy that would expire before the boundary: stream prepared instead, no gap.
  const { world, deps } = makeWorld({ durations: [10, 60], webAudio: true });
  world.serverUntil = () => new Date(T0 + 8000).toISOString();
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  const sign = deps.sign;
  deps.sign = async (...a) => { await new Promise((r) => world.timers.push({ at: world.now + 700, id: ++world.seq, fn: r })); return sign(...a); };
  await world.advance(12000);
  const b = world.plays.find((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.ok(b && b.at === T0 + 10000, `B exactly at the boundary (${b && b.at - T0})`);
  assert.ok(!b.src.startsWith("blob:"), "B from stream, not the expiring copy");
  engine.dispose();
}
{
  // (4) grant deadline enforced on the audio clock despite 2 s main-thread latency.
  const { world, deps, audios } = makeWorld({ durations: [60, 60], webAudio: true, timerLatency: 2000, playableUntil: (i) => (i === 0 ? new Date(T0 + 5000) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(5001);
  assert.ok(audios.every((a) => a.paused || !a.src.endsWith(id(1))), "A silent at its grant deadline");
  assert.equal(world.stops[0]?.at, T0 + 5000);
  engine.dispose();
}

console.log("business-spa-player-engine-unit: all tests passed");
