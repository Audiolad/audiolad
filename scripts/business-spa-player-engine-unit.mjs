#!/usr/bin/env node
// Business SPA pilot (0e05333f): engine tests with fake audio elements + fake clock.
// Covers review 2026-10-13 blockers 4–9 for #841.
import assert from "node:assert/strict";

// SPA_ENGINE_MODULE lets scripts/business-spa-player-mutation-unit.mjs run this suite against mutants.
const { SPA_CROSSFADE_MS, SpaPlayerEngine } = await import(process.env.SPA_ENGINE_MODULE ?? "../src/lib/business-app/spa-player-engine.ts");

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
    set src(v) { this.gen = (this.gen ?? 0) + 1; this.cancelPending?.(); this.deadline = null; this._src = v; this._t = 0; this.paused = true; this.readyState = 0; this.endedFired = false; }
    get duration() { return durationOf.get(this._src.replace(/^blob:/, "").replace(/^https:\/\/s\//, "")) ?? NaN; }
    // Like WebAudioTrack: a scheduled-but-not-started slot reports running (paused=false) at 0.
    get currentTime() { return this.paused || this.pending ? this._t : Math.min(this.duration, (world.now - this.startClock) / 1000); }
    set currentTime(v) { this._t = v; if (!this.paused) this.startClock = world.now - v * 1000; }
    async play(guard) { if (!this._src) throw new Error("no src");
      const pd = world.playDelayFn ? world.playDelayFn() : world.playDelay;
      if (pd) { // pending play()/AudioContext.resume(): like WebAudioTrack, re-check after it
        const g = this.gen = (this.gen ?? 0) + 1, src0 = this._src;
        await new Promise((r) => world.timers.push({ at: world.now + pd, id: ++world.seq, fn: r }));
        if (g !== this.gen || this._src !== src0) return;
        if (!this.paused) return;
        if (guard && !guard()) return;
        if (this.deadline != null && world.now >= this.deadline) return;
      } this._t = this.currentTime; if (this.endedFired || this._t >= this.duration) { this._t = 0; this.endedFired = false; } // like HTMLMediaElement: play() after the end restarts
      if (this._t < 0.05 && audios.some((o) => o !== this && !o.paused && !o.pending && o._src === this._src && o.currentTime > 0.5 && o.currentTime < o.duration - 0.5)) world.restarts = (world.restarts ?? 0) + 1;
      this.paused = false; this.startClock = world.now - this._t * 1000; world.plays.push({ el: this.name, src: this._src, at: world.now, pos: this._t, vol: this.volume }); }
    pause() { this.gen = (this.gen ?? 0) + 1; if (this.pending) { this.cancelPending(); this.paused = true; this._t = 0; return; } if (!this.paused) { this._t = this.currentTime; this.paused = true; } }
    cancelPending() { if (this.pending) { world.timers = world.timers.filter((t) => t !== this.pending); this.pending = null; } }
    // Web Audio model: start exactly at prev's end on the audio clock (no timer latency).
    startAfter(prev) {
      if (!webAudio || prev.paused || prev.pending || !this._src || this.readyState < 4 || !this.paused || this.pending) return false;
      const at = Math.min(prev.startClock + prev.duration * 1000, prev.deadline ?? Infinity);
      if (at <= world.now) return false;
      this._t = 0;
      this.endedFired = false;
      const p = { at, id: ++world.seq, fn: () => { this.pending = null; this.startClock = p.at; world.plays.push({ el: this.name, src: this._src, at: p.at, pos: 0, vol: this.volume, scheduled: true }); } };
      this.pending = p;
      this.paused = false;
      world.timers.push(this.pending);
      return true;
    }
    load() {
      if (!this._src) return;
      const src = this._src;
      const done = () => { if (this._src !== src) return; this.readyState = 4; this.fire("loadedmetadata"); this.fire("canplaythrough"); };
      const ld = world.loadDelayFn ? world.loadDelayFn() : world.loadDelay;
      if (ld) world.timers.push({ at: world.now + ld, id: ++world.seq, fn: done });
      else { this.readyState = 4; queueMicrotask(() => { this.fire("loadedmetadata"); this.fire("canplaythrough"); }); }
    }
    removeAttribute(n) { if (n === "src") { this.cancelPending(); this._src = ""; this._t = 0; this.paused = true; this.readyState = 0; } }
    addEventListener(t, fn, o) { const a = this.listeners.get(t) ?? []; a.push({ fn, once: o?.once }); this.listeners.set(t, a); }
    removeEventListener(t, fn) { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((l) => l.fn !== fn)); }
    fire(t) { const a = this.listeners.get(t) ?? []; this.listeners.set(t, a.filter((l) => !l.once)); a.forEach((l) => l.fn()); }
    stopAt(ms) { if (webAudio) this.deadline = ms; }
    checkEnd() {
      if (this.pending) return;
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
  // Like HTMLAudioElement: no audio-clock hard stop in the <audio> fallback.
  if (!webAudio) for (const x of audios) x.stopAt = undefined;
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
    for (let guard = 0; ; guard++) {
      if (guard > 100000) throw new Error(`fake clock stuck at ${world.now - T0} ms; audios ${JSON.stringify(audios.map((a) => [a.name, a._src.slice(-2), a.paused, !!a.pending, a.currentTime, a.duration, a.deadline != null ? a.deadline - T0 : null, a.endedFired]))}; timers ${JSON.stringify(world.timers.map((t) => t.at - T0).sort((x, y) => x - y).slice(0, 5))}`);
      await flush();
      const nextTimer = world.timers.reduce((m, t) => (m === null || t.at < m.at ? t : m), null);
      const nextEnd = audios.filter((a) => !a.paused && a._src && !a.pending).map((a) => Math.min(a.startClock + a.duration * 1000, a.deadline ?? Infinity)).reduce((m, x) => Math.min(m, x), Infinity);
      const at = Math.min(nextTimer ? nextTimer.at : Infinity, nextEnd);
      if (at > until) { world.now = until; await flush(); return; }
      world.now = Math.max(world.now, at);
      if (nextTimer && nextTimer.at <= world.now) { world.timers = world.timers.filter((t) => t !== nextTimer); nextTimer.fn(); }
      audios.forEach((a) => a.checkEnd());
    }
  };
  // Buffering stall: the media clock of `el` stands still for `ms` of wall time.
  world.stall = (el, ms) => { if (!el.paused && !el.pending) el.startClock += ms; };
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
  // Pause, then grant ends; resume must not play it. (Web Audio: a mid-track deadline needs the
  // audio-clock hard stop; the <audio> fallback would not start A at all — section 28.)
  const { world, deps } = makeWorld({ durations: [60, 60], webAudio: true, playableUntil: (i) => (i === 0 ? new Date(T0 + 10000) : null) });
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
  // A18: <audio> has no audio-clock stop -> a track whose deadline lies inside it (+ slack)
  // is never started; B plays instead.
  await world.advance(4820);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(1))), "A (deadline inside the track) never audible on <audio>");
  assert.ok(audios.some((a) => !a.paused && a.src.endsWith(id(2))), "B plays");
  engine.dispose();
}

// ---- 14. Re-review A3: refresh/scanCache unloads an expired paused blob ----
{
  const { world, deps, audios } = makeWorld({ durations: [600, 600], webAudio: true, offlineUntil: () => new Date(T0 + 30_000) });
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

// ---- 21. Re-review A9 ----
{
  // (1) Wi-Fi->cache waiting on cache.get while refresh removes A: A never comes back.
  const { world, deps, audios } = makeWorld({ durations: [60, 60, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  await world.advance(2000);
  const g = deferred();
  const get = deps.cache.get;
  deps.cache.get = async (k) => { await g.p; return get(k); };
  world.online = false;
  const sw = engine.switchToCache();
  world.online = true;
  world.manifestRes = { ok: true, data: world.manifest(world.items.filter((x) => x.audio_item_id !== id(1))) };
  const rp = engine.refresh();
  g.res();
  await sw; await rp; await flush();
  await world.advance(1000);
  assert.ok(audios.every((a) => a.paused || !a.src.endsWith(id(1))), "removed A not revived by a stale switch");
  engine.dispose();
}
{
  // (2) A stopped early by its deadline with B scheduled at A's natural end: B starts now.
  const { world, deps, audios } = makeWorld({ durations: [60, 60], webAudio: true, timerLatency: 2000, playableUntil: (i) => (i === 0 ? new Date(T0 + 5000) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(16000);
  const b = world.plays.find((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.ok(b && b.at <= T0 + 5000 + 2500, `B started soon after A's deadline (${b && b.at - T0})`);
  assert.ok(!b.scheduled || b.at < T0 + 60000, "not waiting for A's natural end");
  assert.ok(audios.some((a) => !a.paused && a.src.endsWith(id(2))), "B audible at 16 s");
  assert.equal(engine.current.audioItemId, id(2));
  engine.dispose();
}
{
  // (3) prepared copy expiring before the boundary after Wi-Fi->cache; stream B on time.
  const { world, deps } = makeWorld({ durations: [10, 60], webAudio: true, timerLatency: 2000 });
  world.serverUntil = () => new Date(T0 + 8000).toISOString();
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  world.online = false;
  await world.advance(1000);
  world.online = true;
  await world.advance(11000);
  const b = world.plays.find((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.ok(b && b.at === T0 + 10000, `B exactly at the boundary (${b && b.at - T0})`);
  engine.dispose();
}

// ---- 22. Re-review A10 ----
{
  // (1) a late, stale prepare of B never disturbs B once it is audible.
  const { world, deps, audios } = makeWorld({ durations: [10, 60, 60], webAudio: true });
  const sign = deps.sign;
  let first = true;
  deps.sign = async (aid, purpose) => {
    if (aid === id(2) && first) { first = false; await new Promise((r) => world.timers.push({ at: world.now + 11000, id: ++world.seq, fn: r })); }
    return sign(aid, purpose);
  };
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(1000);
  world.manifestRes = { ok: true, data: world.manifest() };
  await engine.refresh(); // second prepare of B, fast
  await world.advance(12000); // B starts at 10 s; the stale first response lands at ~11 s
  const bStarts = world.plays.filter((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.equal(bStarts.length, 1, "B started once");
  assert.equal(bStarts[0].at, T0 + 10000);
  const b = audios.find((x) => x.src.endsWith(id(2)));
  assert.ok(b && !b.paused && Math.abs(b.currentTime - 3) < 0.1, `B continuous (${b && b.currentTime})`);
  engine.dispose();
}
{
  // (2) a stale Wi-Fi->cache waiting for readiness never clears the newer source.
  const { world, deps, audios } = makeWorld({ durations: [60, 60, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  await world.advance(2000);
  world.loadDelay = 500;
  world.online = false;
  const sw = engine.switchToCache();
  await flush();
  world.online = true;
  world.manifestRes = { ok: true, data: world.manifest(world.items.filter((x) => x.audio_item_id !== id(1))) };
  const rp = engine.refresh();
  await world.advance(16000); // stale readiness waits time out after 15 s
  void sw; void rp;
  await world.advance(1000);
  assert.ok(audios.some((x) => !x.paused && x.src.endsWith(id(2))), "B playing; not cleared by the stale switch");
  assert.equal(engine.status, "playing");
  engine.dispose();
}
{
  // (3) B not allowed at the boundary: C is prepared early and starts exactly at the boundary.
  const { world, deps } = makeWorld({ durations: [10, 60, 60], webAudio: true, playableUntil: (i) => (i === 1 ? new Date(T0 + 8000) : null) });
  const sign = deps.sign;
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  deps.sign = async (...a) => { await new Promise((r) => world.timers.push({ at: world.now + 700, id: ++world.seq, fn: r })); return sign(...a); };
  await world.advance(12000);
  const c = world.plays.find((p) => p.src.endsWith(id(3)) && p.pos === 0);
  assert.ok(c && c.at === T0 + 10000, `C exactly at the boundary (${c && c.at - T0})`);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(2))), "B never played");
  engine.dispose();
}
{
  // (4) known early deadline of A: B scheduled exactly at A's deadline on the audio clock.
  const { world, deps } = makeWorld({ durations: [60, 60], webAudio: true, timerLatency: 2000, playableUntil: (i) => (i === 0 ? new Date(T0 + 5000) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(8000);
  const b = world.plays.find((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.ok(b && b.at === T0 + 5000 && b.scheduled, `B exactly at A's deadline (${b && b.at - T0})`);
  engine.dispose();
}
{
  // (5) pause while a resume-play() is pending: stays paused.
  const { world, deps, audios } = makeWorld({ durations: [60, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(2000);
  const a = engine.activeEl();
  a.pause(); // interruption dropped the node
  const d = deferred();
  const play = a.play.bind(a);
  a.play = async () => { await d.p; return play(); };
  const t = engine.tick();
  await flush();
  await engine.toggle();
  assert.equal(engine.status, "paused");
  d.res(); await t; await flush();
  assert.ok(audios.every((x) => x.paused), "no sound after pause");
  assert.equal(engine.status, "paused");
  engine.dispose();
}

// ---- 23. Invariants I1–I9: table-driven through the single guard (mayStart/fresh) ----
{
  const cases = [
    // [invariant, setup(world, engine) -> mutate state, expected mayStart for active slot]
    ["I1 grant deadline passed", { playableUntil: (i) => (i === 0 ? new Date(T0 + 1000) : null) }, async (w) => { w.now = T0 + 2000; }, false],
    ["I1 grant valid", {}, async () => {}, true],
    ["I1 manifest expired", { expiresAt: T0 + 1000 }, async (w) => { w.now = T0 + 2000; }, false],
    ["I1 deadline at scheduled moment", { playableUntil: (i) => (i === 0 ? new Date(T0 + 5000) : null) }, async () => {}, false, T0 + 6000],
    ["I2 stream needs network", {}, async (w) => { w.online = false; }, false],
    ["I3 offline copy expired (server deadline)", { cached: true, serverUntil: () => new Date(T0 + 3000).toISOString() }, async (w, e) => { w.online = false; await e.switchToCache(); w.now = T0 + 4000; }, false],
    ["I3 offline copy valid", { cached: true }, async (w, e) => { w.online = false; await e.switchToCache(); }, true],
    ["I4 track removed from manifest", {}, async (w, e) => { w.manifestRes = { ok: true, data: w.manifest(w.items.slice(1)) }; await e.refresh(); }, "removed"],
    ["I5 no_access", {}, async (w, e) => { await e.revokeAccess(); }, false],
  ];
  for (const [name, opts, mutate, expected, atMs] of cases) {
    const { world, deps } = makeWorld({ durations: [60, 60, 60], webAudio: true, ...opts });
    const engine = new SpaPlayerEngine(deps);
    await engine.init(world.manifestRes.data);
    if (opts.serverUntil) world.serverUntil = opts.serverUntil;
    if (opts.cached) await engine.downloadAll();
    await mutate(world, engine);
    const t = engine.token(engine.active);
    if (expected === "removed") assert.ok(engine.loadedActive()?.audioItemId !== id(1) && engine.loaded.every((l) => l?.audioItemId !== id(1)), name);
    else assert.equal(engine.mayStart(t, atMs), expected, name);
    engine.dispose();
  }
  // I8/I9: the token goes stale on refresh-load / clear / pause / no_access.
  const stale = [
    ["I8 newer load on slot", (e) => { e.slotOp[e.active] += 1; }],
    ["I9 user pause", async (e) => { await e.toggle(); }],
    ["I5 access epoch", async (e) => { await e.revokeAccess(); }],
    ["I5/OP epoch alone (op started before a newer start/refresh/pause/no_access)", (e) => { e.opEpoch += 1; }],
  ];
  for (const [name, act] of stale) {
    const { world, deps } = makeWorld({ durations: [60, 60] });
    const engine = new SpaPlayerEngine(deps);
    await engine.init(world.manifestRes.data);
    const t = engine.token(engine.active);
    assert.equal(engine.fresh(t), true, `${name}: fresh before`);
    await act(engine);
    assert.equal(engine.fresh(t), false, `${name}: stale after`);
    engine.dispose();
  }
  {
    // I4 at the guard itself: a loaded source whose track is not in the manifest never starts.
    const { world, deps } = makeWorld({ durations: [60, 60] });
    const engine = new SpaPlayerEngine(deps);
    await engine.init(world.manifestRes.data);
    engine.loaded[engine.active] = { ...engine.loaded[engine.active], audioItemId: id(77) };
    assert.equal(engine.mayStart(engine.token(engine.active)), false, "I4 guard: unknown track");
    engine.dispose();
  }
  // I6/I7 behavioural: covered by sections 22(1)-(4); I9 pending resume by 22(5).
}

// ---- 24. Re-review A11 ----
{
  // (1) I9: refresh that removed A waits on the cache scan; a pause meanwhile is final.
  const { world, deps, audios } = makeWorld({ durations: [60, 60, 60] });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(2000);
  const d = deferred();
  const keys = deps.cache.keys;
  deps.cache.keys = async () => { await d.p; return keys(); };
  world.manifestRes = { ok: true, data: world.manifest(world.items.slice(1)) };
  const rp = engine.refresh();
  await flush();
  if (engine.status === "playing") await engine.toggle();
  assert.equal(engine.status, "paused");
  d.res(); await rp; await flush(); await world.advance(2000);
  assert.equal(engine.status, "paused", "refresh did not resume after pause");
  assert.ok(audios.every((x) => x.paused), "silent after pause");
  engine.dispose();
}
{
  // (2) I9: pause during a fallback advance (B's play() pending) stops A too; no restart later.
  const { world, deps, audios } = makeWorld({ durations: [5, 60, 60] });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  const d = deferred();
  let hold = true;
  for (const a of audios) {
    const play = a.play.bind(a);
    a.play = async () => { if (hold && a._src.endsWith(id(2))) { hold = false; await d.p; } return play(); };
  }
  for (let t = 0; t < 5000 && hold; t += 50) await world.advance(50); // stop as soon as B's play() is pending (A still audible)
  assert.ok(!audios[0].paused, "A still audible while B's play() is pending");
  assert.equal(hold, false, "B play pending");
  if (engine.status === "playing") await engine.toggle();
  assert.equal(engine.status, "paused");
  assert.ok(audios.every((x) => x.paused), "A stopped by pause too");
  d.res(); await flush(); await world.advance(3000);
  assert.equal(engine.status, "paused", "old advance did not restart playback");
  assert.ok(audios.every((x) => x.paused), "still silent");
  engine.dispose();
}
{
  // (3) I7: offline, B has no copy, C has: C is prepared right after the switch and plays.
  const { world, deps, audios } = makeWorld({ durations: [10, 60, 60], webAudio: true, offlineUntil: (i) => (i === 1 ? null : new Date(T0 + 7 * DAY)) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  await world.advance(2000);
  world.loadDelay = 700;
  world.online = false;
  void engine.tick();
  await world.advance(14000);
  assert.equal(engine.status, "playing", "program keeps playing offline");
  assert.ok(audios.some((x) => !x.paused && x.src.endsWith(id(3))), "C playing from cache");
  const c = world.plays.find((p) => p.src.endsWith(id(3)) && p.pos === 0);
  const aPlays = world.plays.filter((p) => p.src.endsWith(id(1)));
  assert.ok(aPlays.every((p, k) => k === 0 || p.pos > 1), "A resumed from its position, never restarted from 0");
  const lastA = aPlays.at(-1);
  const aEnd = lastA.at + (10 - lastA.pos) * 1000;
  assert.ok(c && c.scheduled && Math.abs(c.at - aEnd) < 1, `C exactly at A's end (${c && c.at - T0} vs ${aEnd - T0})`);
  engine.dispose();
}

// ---- 25. Re-review A12: identity survives awaits (manifest reordered during a load) ----
{
  const durations = Array.from({ length: 12 }, () => 60);
  const { world, deps, audios } = makeWorld({ durations });
  world.loadDelay = 700;
  const engine = new SpaPlayerEngine(deps);
  const ip = engine.init(world.manifestRes.data); // startAt(A) is now waiting for readiness
  await world.advance(200);
  // Manifest order is by `position`: swap A and B (rights unchanged).
  const swapped = [{ ...world.items[1], position: 1 }, { ...world.items[0], position: 2 }, ...world.items.slice(2)];
  world.manifestRes = { ok: true, data: world.manifest(swapped) };
  const rp = engine.refresh(); // resolves once its restart has finished (needs the clock)
  void rp;
  await world.advance(5000);
  await ip;
  assert.equal(engine.status, "playing", "still playing after reorder during load");
  assert.equal(engine.current?.audioItemId, id(1), "engine index follows A by identity");
  assert.ok(audios.some((x) => !x.paused && x.src.endsWith(id(1))), "A audible");
  engine.dispose();
}
{
  // Fallback advance: while B's play() is pending a refresh removes B and moves A to 2nd
  // place; the successor of A is resolved by identity (C), A is not restarted.
  const { world, deps, audios } = makeWorld({ durations: [5, 60, 60, 60] });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  const d = deferred();
  let hold = true;
  for (const a of audios) {
    const play = a.play.bind(a);
    // Like WebAudioTrack (gen check): a play() whose source was replaced meanwhile does nothing.
    a.play = async () => { if (hold && a._src.endsWith(id(2))) { hold = false; const src = a._src; await d.p; if (a._src !== src) return; } return play(); };
  }
  for (let t = 0; t < 6000 && hold; t += 50) await world.advance(50);
  assert.equal(hold, false, "B play pending");
  const [A, , C, D] = world.items;
  world.manifestRes = { ok: true, data: world.manifest([{ ...D, position: 1 }, { ...A, position: 2 }, { ...C, position: 3 }]) };
  const rp = engine.refresh(); // resolves once its restart has finished (needs the clock)
  void rp;
  d.res(); await flush(); await world.advance(3000);
  assert.equal(engine.status, "playing");
  assert.equal(engine.current?.audioItemId, id(3), "successor of A by identity is C");
  assert.ok(!world.plays.some((p, k) => k > 0 && p.src.endsWith(id(1)) && p.pos === 0), "A not restarted");
  const cStarts = world.plays.filter((p) => p.src.endsWith(id(3)) && p.pos === 0);
  assert.equal(cStarts.length, 1, `C started exactly once (${cStarts.length})`);
  const cEl = audios.find((x) => !x.paused && x.src.endsWith(id(3)));
  assert.ok(cEl && cEl.currentTime > 2, `C position preserved (${cEl && cEl.currentTime})`);
  engine.dispose();
}

// ---- 26. Re-review A14: whole-operation epoch ----
if (!process.env.SPA_FUZZ_ONLY) {
  // (1) refresh removes A and waits on the cache scan; a tick meanwhile must not start C;
  // B (the refresh's choice) plays and is never cut off.
  const { world, deps, audios } = makeWorld({ durations: Array.from({ length: 12 }, () => 60), webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(2000);
  const keys = deps.cache.keys;
  deps.cache.keys = async () => { await new Promise((r) => world.timers.push({ at: world.now + 1000, id: ++world.seq, fn: r })); return keys(); };
  const sign = deps.sign; // B's signing spans several ticks
  deps.sign = async (...x) => { await new Promise((r) => world.timers.push({ at: world.now + 600, id: ++world.seq, fn: r })); return sign(...x); };
  world.manifestRes = { ok: true, data: world.manifest(world.items.slice(1)) };
  void engine.refresh();
  await world.advance(4000);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(3))), "C never started");
  assert.ok(audios.some((x) => !x.paused && !x.pending && x.src.endsWith(id(2))), "B audible");
  const b = world.plays.filter((p) => p.src.endsWith(id(2)) && p.pos === 0);
  assert.equal(b.length, 1, "B started once");
  engine.dispose();
}
if (!process.env.SPA_FUZZ_ONLY) {
  // (2) fallback activation invalidates a late prepare of the same slot.
  const { world, deps, audios } = makeWorld({ durations: [10, 60, 60, 60], webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(9000);
  const sign = deps.sign;
  deps.sign = async (...a) => { await new Promise((r) => world.timers.push({ at: world.now + 1500, id: ++world.seq, fn: r })); return sign(...a); };
  const [A, B, C, D] = world.items;
  world.manifestRes = { ok: true, data: world.manifest([{ ...A, playable_until: new Date(T0 + 9600).toISOString() }, { ...C, position: 2 }, { ...B, position: 3 }, D]) };
  void engine.refresh();
  await world.advance(4000);
  assert.equal(engine.status, "playing", "program continues");
  const cur = engine.current?.audioItemId;
  assert.ok(cur && audios.some((x) => !x.paused && !x.pending && x.src.endsWith(cur)), "engine.current is audible");
  engine.dispose();
}

if (!process.env.SPA_FUZZ_ONLY) {
  // (3) the track becomes disallowed while it loads: the program moves on, no stall.
  const { world, deps, audios } = makeWorld({ durations: [60, 60, 60, 60] });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(2000);
  const sign = deps.sign;
  deps.sign = async (...x) => { await new Promise((r) => world.timers.push({ at: world.now + 500, id: ++world.seq, fn: r })); return sign(...x); };
  const [, B, C, D] = world.items;
  world.manifestRes = { ok: true, data: world.manifest([{ ...B, playable_until: new Date(world.now + 300).toISOString() }, C, D]) };
  void engine.refresh();
  await world.advance(4000);
  assert.equal(engine.status, "playing", "no stall after B expired during its load");
  assert.ok(audios.some((x) => !x.paused && x.src.endsWith(id(3))), "C plays");
  engine.dispose();
}

// ---- 28. Re-review A15 ----
if (!process.env.SPA_FUZZ_ONLY) {
  // (1) a late init() (slow first cache scan) never overrides the user's pause.
  const { world, deps, audios } = makeWorld({ durations: Array.from({ length: 12 }, () => 60), webAudio: true });
  const d = deferred();
  const keys = deps.cache.keys;
  let first = true;
  deps.cache.keys = async () => { if (first) { first = false; await d.p; } return keys(); };
  const engine = new SpaPlayerEngine(deps);
  const ip = engine.init(world.manifestRes.data);
  await flush();
  world.manifestRes = { ok: true, data: world.manifest() };
  void engine.refresh();
  await world.advance(500);
  if (engine.status !== "playing") await engine.toggle();
  await world.advance(2000);
  assert.equal(engine.status, "playing");
  await engine.toggle();
  assert.equal(engine.status, "paused");
  d.res(); await ip; await world.advance(2000);
  assert.equal(engine.status, "paused", "stale init did not resume");
  assert.ok(audios.every((x) => x.paused), "silent");
  engine.dispose();
}
if (!process.env.SPA_FUZZ_ONLY) {
  // (2) an old cache scan (old manifest without B) never drops B's newer valid copy.
  const { world, deps } = makeWorld({ durations: [60, 60, 60], webAudio: true });
  const [A, B, C] = world.items;
  const d = deferred();
  const keys = deps.cache.keys;
  let first = true;
  deps.cache.keys = async () => { if (first) { first = false; const k = await keys(); await d.p; return [...k, B.audio_item_id]; } return keys(); };
  const engine = new SpaPlayerEngine(deps);
  world.manifestRes = { ok: true, data: world.manifest([A, C]) };
  const ip = engine.init(world.manifestRes.data);
  await flush();
  world.manifestRes = { ok: true, data: world.manifest([A, B, C]) };
  void engine.refresh();
  await world.advance(500);
  await engine.downloadAll();
  assert.ok(world.cache.has(B.audio_item_id), "B copy stored");
  world.online = false;
  d.res(); await ip; await world.advance(500);
  assert.ok(world.cache.has(B.audio_item_id), "old scan did not drop B's new copy");
  engine.dispose();
}
if (!process.env.SPA_FUZZ_ONLY) {
  // (3) <audio> fallback + 900 ms timer latency (< SPA_HTML_DEADLINE_MARGIN_MS): a refresh
  // that moves A's deadline inside the track -> wall-clock forced stop before the deadline.
  const { world, deps, audios } = makeWorld({ durations: [60, 60, 60], timerLatency: 900 });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(1000);
  const [A, B, C] = world.items;
  world.manifestRes = { ok: true, data: world.manifest([{ ...A, playable_until: new Date(T0 + 5000).toISOString() }, B, C]) };
  await engine.refresh();
  await world.advance(4950 - (world.now - T0));
  assert.ok(audios.every((x) => x.paused || !x.src.endsWith(id(1))), "A stopped before its deadline");
  await world.advance(6000);
  assert.ok(audios.every((x) => x.paused || !x.src.endsWith(id(1))), "A never audible again");
  engine.dispose();
}

if (!process.env.SPA_FUZZ_ONLY) {
  // (2b) B's copy existed before the scan; the old scan (manifest without B) must judge by
  // the CURRENT manifest after its await and keep it.
  const { world, deps } = makeWorld({ durations: [60, 60, 60], webAudio: true });
  const [A, B, C] = world.items;
  world.cache.set(B.audio_item_id, { data: { url: `https://s/${B.audio_item_id}` }, cachedAt: T0 - 1000, until: T0 + 5 * DAY });
  const d = deferred();
  const keys = deps.cache.keys;
  let first = true;
  deps.cache.keys = async () => { if (first) { first = false; const k = await keys(); await d.p; return k; } return keys(); };
  const engine = new SpaPlayerEngine(deps);
  world.manifestRes = { ok: true, data: world.manifest([A, C]) };
  const ip = engine.init(world.manifestRes.data);
  await flush();
  world.manifestRes = { ok: true, data: world.manifest([A, B, C]) };
  void engine.refresh();
  await world.advance(500);
  d.res(); await ip; await world.advance(500);
  assert.ok(world.cache.has(B.audio_item_id), "old scan kept B's valid copy (current manifest has B)");
  engine.dispose();
}
if (!process.env.SPA_FUZZ_ONLY) {
  // (4) a copy expiring while its blob is still loading ends the wait at once: the program
  // moves on within a tick, not after the 15 s readiness timeout.
  const { world, deps, audios } = makeWorld({ durations: [60, 60, 60], webAudio: true });
  world.serverUntil = (aid) => (aid === id(1) ? new Date(T0 + 3000).toISOString() : new Date(T0 + 5 * DAY).toISOString());
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  await world.advance(1000);
  world.loadDelay = 2500;
  world.online = false;
  // Expiry at 3 s ends the pending wait for A's copy; B's copy (2.5 s load) plays well
  // before the 15 s readiness timeout would have elapsed.
  await world.advance(9000);
  assert.equal(engine.status, "playing", "program continues offline");
  assert.ok(audios.some((x) => !x.paused && !x.pending && x.src.startsWith("blob:") && !x.src.endsWith(id(1))), "next cached track plays within seconds");
  engine.dispose();
}


// ---- 29. Re-review A16 ----
if (!process.env.SPA_FUZZ_ONLY) {
  // (1) A17 #1 exactly: <audio>, A 10 s, deadline 12 s, 4 s stall at 2 s, 2000 ms timer
  // latency. A is refused at start (deadline within remaining + slack); nothing past 12 s.
  {
    const { world, deps, audios } = makeWorld({ durations: [10, 60, 60], timerLatency: 2000, playableUntil: (i) => (i === 0 ? new Date(T0 + 12000) : null) });
    const engine = new SpaPlayerEngine(deps);
    await engine.init(world.manifestRes.data);
    await world.advance(2000);
    for (const x of audios) world.stall(x, 4000);
    await world.advance(11000);
    assert.ok(!world.plays.some((p) => p.src.endsWith(id(1))), "A never started on <audio>");
    assert.equal(engine.status, "playing", "B plays");
    engine.dispose();
  }
  // (1b) deadline introduced by a refresh into a PLAYING <audio> track + stall + 2000 ms
  // latency: the backup forced stop (margin 3000 ms) still cuts it before the deadline.
  const { world, deps, audios } = makeWorld({ durations: [10, 60, 60], timerLatency: 2000 });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(2000);
  const A = audios.find((x) => !x.paused && x.src.endsWith(id(1)));
  assert.ok(A, "A plays");
  const [I1, I2, I3] = world.items;
  world.manifestRes = { ok: true, data: world.manifest([{ ...I1, playable_until: new Date(T0 + 12000).toISOString() }, I2, I3]) };
  await engine.refresh();
  world.stall(A, 4000);
  for (let t = 0; t < 44; t++) {
    await world.advance(250);
    if (world.now >= T0 + 12000) assert.ok(audios.every((x) => x.paused || !x.src.endsWith(id(1))), `A silent at ${world.now - T0} ms`);
  }
  assert.ok(audios.every((x) => x.paused || !x.src.endsWith(id(1))), "A stopped despite the stalled media clock");
  assert.equal(engine.status, "playing", "program moved on");
  engine.dispose();
}
if (!process.env.SPA_FUZZ_ONLY) {
  // (3) refresh while play()/resume() is pending: the start is taken over, not lost.
  for (const mode of ["start", "toggle"]) {
    const { world, deps, audios } = makeWorld({ durations: Array.from({ length: 12 }, () => 60), webAudio: true });
    world.playDelay = 1500;
    const engine = new SpaPlayerEngine(deps);
    if (mode === "toggle") {
      world.playDelay = 0;
      await engine.init(world.manifestRes.data);
      await world.advance(1000);
      await engine.toggle();
      assert.equal(engine.status, "paused");
      world.playDelay = 1500;
      void engine.toggle();
    } else void engine.init(world.manifestRes.data);
    await world.advance(300);
    world.manifestRes = { ok: true, data: world.manifest() };
    void engine.refresh();
    await world.advance(100);
    world.playDelay = 0;
    await world.advance(4000);
    assert.equal(engine.status, "playing", `${mode}: refresh during pending play() keeps the start`);
    assert.ok(audios.some((x) => !x.paused && !x.pending), `${mode}: audible`);
    engine.dispose();
  }
}
if (!process.env.SPA_FUZZ_ONLY) {
  // dispose() cancels a running init(): nothing starts after cleanup.
  const { world, deps, audios } = makeWorld({ durations: [60, 60], webAudio: false });
  const d = deferred();
  const keys = deps.cache.keys;
  deps.cache.keys = async () => { await d.p; return keys(); };
  const engine = new SpaPlayerEngine(deps);
  const ip = engine.init(world.manifestRes.data);
  await flush();
  engine.dispose();
  d.res(); await ip; await world.advance(3000);
  assert.ok(audios.every((x) => x.paused), "no sound after dispose");
  assert.ok(!world.plays.length, "nothing started after dispose");
}

if (!process.env.SPA_FUZZ_ONLY) {
  // A17: an <audio> track whose deadline lies inside the forced-stop margin is never started.
  const { world, deps, audios } = makeWorld({ durations: [60, 60], playableUntil: (i) => (i === 0 ? new Date(T0 + 800) : null) });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(1500);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(1))), "A inside the margin never audible");
  assert.ok(audios.some((x) => !x.paused && x.src.endsWith(id(2))), "B plays");
  engine.dispose();
}

if (!process.env.SPA_FUZZ_ONLY) {
  // A16 #2: the grant ends while play()/resume() is pending. The hard stop is armed BEFORE
  // play(), so the adapter never starts sound past the deadline (not even for a microtask).
  const { world, deps } = makeWorld({ durations: [60, 60], webAudio: true, playableUntil: (i) => (i === 0 ? new Date(T0 + 500) : null) });
  world.playDelay = 1000;
  const engine = new SpaPlayerEngine(deps);
  void engine.init(world.manifestRes.data);
  await world.advance(400);
  world.playDelay = 0;
  await world.advance(3000);
  assert.ok(!world.plays.some((p) => p.src.endsWith(id(1)) && p.at >= T0 + 500), "A never started after its deadline");
  assert.equal(engine.status, "playing", "program moved on to B");
  engine.dispose();
}

// ---- 30. Re-review A17 ----
if (!process.env.SPA_FUZZ_ONLY) {
  // (3) a stale download whose cache.put() resolves late never drops the CURRENT valid copy
  // (stored by a newer download) nor clears the audible blob source.
  const { world, deps, audios } = makeWorld({ durations: Array.from({ length: 12 }, () => 60), webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await world.advance(500);
  const put = deps.cache.put;
  const hold = deferred();
  let first = true;
  deps.cache.put = async (k, ...r) => { if (first && k === id(1)) { first = false; await hold.p; } return put(k, ...r); };
  const old = engine.downloadAll();
  await world.advance(200);
  world.manifestRes = { ok: true, data: world.manifest() };
  await engine.refresh();
  await world.advance(200);
  await engine.downloadAll();
  assert.equal(world.cache.size, 12, "new download stored all copies");
  world.online = false;
  await world.advance(1500);
  const active = () => audios.find((x) => !x.paused && !x.pending);
  assert.ok(active()?.src.startsWith("blob:"), "playing from the copy offline");
  hold.res(); await old; await world.advance(1000);
  assert.ok(world.cache.has(id(1)), "stale put did not drop the current copy");
  assert.ok(engine.cachedAt.has(id(1)), "index kept");
  assert.equal(engine.status, "playing");
  assert.ok(active()?.src.startsWith("blob:"), "audible copy not cleared");
  engine.dispose();
}
if (!process.env.SPA_FUZZ_ONLY) {
  // (2) cache switch whose play() is pending while a newer op resumes the same slot: the
  // stale switch continuation must not pause the newer start.
  const { world, deps, audios } = makeWorld({ durations: Array.from({ length: 12 }, () => 60), webAudio: true });
  const engine = new SpaPlayerEngine(deps);
  await engine.init(world.manifestRes.data);
  await engine.downloadAll();
  await world.advance(3000);
  world.playDelay = 600;
  world.online = false;
  void engine.switchToCache();
  await world.advance(100); // copy loaded, switch's play() pending
  void engine.tick();       // newer op: resumes the same (silent) active slot
  const pauses = [];
  for (const x of audios) { const p0 = x.pause.bind(x); x.pause = () => { if (x._src.startsWith("blob:")) pauses.push(world.now); p0(); }; }
  await world.advance(50);
  world.playDelay = 0;
  await world.advance(1000);
  assert.equal(engine.status, "playing");
  assert.ok(audios.some((x) => !x.paused && !x.pending && x.src.startsWith("blob:") && x.src.endsWith(engine.current.audioItemId)), "active copy audible");
  assert.equal(pauses.length, 0, "the stale switch continuation never paused the resumed copy (no extra gap)");
  engine.dispose();
}

// ---- 27. Randomized interleavings (seeded): invariants after every step ----
{
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const SEEDS = Number(process.env.SPA_FUZZ_SEEDS ?? 150);
  const FROM = Number(process.env.SPA_FUZZ_FROM ?? 1);
  const failures = [];
  // Seeds that once found real bugs (A17: forced stop during a pending start; stale play()
  // continuation silencing a newer start) always run as regressions.
  const REGRESSION = process.env.SPA_FUZZ_FROM ? [] : [1417, 1452];
  const seeds = [...Array.from({ length: Math.max(0, SEEDS - FROM + 1) }, (_, k) => FROM + k), ...REGRESSION.filter((x) => x > SEEDS)];
  for (const seed of seeds) {
    const rnd = mulberry(seed);
    const pick = (n) => Math.floor(rnd() * n);
    const durations = Array.from({ length: 6 }, () => 4 + pick(8));
    const webAudio = rnd() < 0.6;
    // <audio> slots get realistic JS timer latency up to 2 s (A17 #1).
    const lat = webAudio ? 0 : pick(2000);
    const { world, deps, audios } = makeWorld({ durations, webAudio, timerLatency: lat });
    // Random resolution order: every sign / scan / manifest fetch / load resolves after a random delay.
    const later = (max) => new Promise((r) => world.timers.push({ at: world.now + pick(max), id: ++world.seq, fn: r }));
    const sign = deps.sign; deps.sign = async (...a) => { await later(900); return sign(...a); };
    const keys = deps.cache.keys; deps.cache.keys = async () => { await later(900); return keys(); };
    // Late cache I/O (A17 #3): puts/gets resolve out of order with refreshes and downloads.
    const put = deps.cache.put; deps.cache.put = async (...a) => { await later(1500); return put(...a); };
    const get = deps.cache.get; deps.cache.get = async (...a) => { await later(400); return get(...a); };
    const fetchM = deps.fetchManifest; deps.fetchManifest = async () => { const m = world.manifestRes; await later(900); world.manifestRes = m; return fetchM(); };
    world.loadDelayFn = () => pick(700);
    // Pending play()/resume() of random length (A16 #2/#3).
    world.playDelayFn = () => (rnd() < 0.4 ? pick(900) : 0);
    const engine = new SpaPlayerEngine(deps);
    // Sampled liveness: <audio> transitions may cost JS timer latency (gap), so poll.
    const audibleWithin = async (ms) => {
      for (let t = 0; t < ms; t += 100) {
        if (engine.status === "playing" && engine.current && audios.some((x) => !x.paused && !x.pending && x._src.endsWith(engine.current.audioItemId))) return;
        await world.advance(100);
      }
    };
    // I6/I3: a copy the current state holds as VALID (indexed, in the manifest, offline
    // allowed, not expired) is never dropped (A17 #3: stale download put).
    const invalidDrops = [];
    const dci = engine.dropCacheIndex.bind(engine);
    engine.dropCacheIndex = (cid) => {
      const it = engine.items.find((i) => i.audioItemId === cid);
      if (engine.status !== "no_access" && it && it.offlineAllowed && engine.cachedAt.has(cid) && engine.cachedDate(cid) !== null && engine.allowed(it, "blob")) invalidDrops.push(`${cid.slice(-2)}@${world.now - T0}`);
      dci(cid);
    };
    let revoked = false;
    let wantPlay = true;
    const check = (step, what) => {
      const fail = (msg) => { throw new Error(`seed ${seed} step ${step} (${what}): ${msg}`); };
      const audible = audios.filter((x) => !x.paused && !x.pending && x._src);
      const ids = new Set(engine.items.map((i) => i.audioItemId));
      if (revoked && audible.length) fail("I5 sound after no_access");
      if (invalidDrops.length) fail(`I6 valid copy dropped: ${invalidDrops.join(",")}`);
      if (engine.status !== "playing" && audible.length) fail(`I9 sound while ${engine.status}`);
      if (audible.length > 2) fail("more than two audible slots");
      for (const x of audible) {
        const aid = x._src.replace(/^blob:/, "").replace(/^https:\/\/s\//, "");
        if (!ids.has(aid)) fail(`I4 removed track audible ${aid.slice(-2)}`);
        if (x._src.startsWith("blob:") && !world.cache.has(aid)) fail(`I6 audible copy ${aid.slice(-2)} no longer stored`);
        const it = engine.items.find((i) => i.audioItemId === aid);
        if (it?.playableUntil && world.now >= it.playableUntil.getTime()) fail(`I1 audible past deadline: ${x.name} ${aid.slice(-2)} by ${world.now - it.playableUntil.getTime()} ms, el.deadline ${x.deadline != null ? x.deadline - world.now : "none"}, webAudio ${webAudio}`);
      }
    };
    try {
      void engine.init(world.manifestRes.data);
      for (let step = 0; step < 30; step++) {
        const r = rnd();
        let what;
        if (r < 0.35) { what = "time"; }
        else if (r < 0.6) {
          what = "refresh";
          let list = world.items.map((x) => ({ ...x }));
          if (rnd() < 0.5) list = list.filter((_, k) => k !== pick(list.length));
          if (rnd() < 0.5) { const order = list.map((_, k) => k).sort(() => rnd() - 0.5); list = order.map((k, j) => ({ ...list[k], position: j + 1 })); }
          if (rnd() < 0.2) { const k = pick(list.length); list[k] = { ...list[k], playable_until: new Date(world.now + pick(4000)).toISOString() }; }
          world.manifestRes = { ok: true, data: world.manifest(list) };
          void engine.refresh();
        } else if (r < 0.75) { what = "toggle"; wantPlay = engine.status !== "playing"; void engine.toggle(); }
        else if (r < 0.8) { what = "network"; world.online = !world.online; }
        else if (r < 0.88) { what = "download"; void engine.downloadAll(); }
        else if (r < 0.93) { what = "stall"; for (const x of audios) world.stall(x, pick(4000)); }
        else { what = "tick"; void engine.tick(); }
        await world.advance(50 + pick(2500));
        if (process.env.SPA_FUZZ_TRACE) console.log(seed, step, what, world.online, engine.status, engine.current?.audioItemId.slice(-2), JSON.stringify(audios.map((x) => [x._src.slice(-2), x.paused, +x.currentTime.toFixed(1)])), engine.loaded.map((l) => l && l.kind + l.audioItemId.slice(-2)).join(","), world.now - T0, engine.opEpoch, engine.starting, JSON.stringify(engine.pendingStart), engine.playOp);
        check(step, what);
        if (world.restarts) throw new Error(`seed ${seed} step ${step} (${what}): I7 an audible track was restarted from 0`);
        // Liveness: online, user wants playback, some track allowed for >10 s -> after a quiet
        // period the engine must be playing and engine.current audible (no silent stall).
        const okItems = engine.items.filter((i) => !i.playableUntil || i.playableUntil.getTime() > world.now + 10000);
        // ("error"/"empty" are explicit user-visible outcomes, e.g. offline without copies.)
        if (wantPlay && world.online && okItems.length && ["playing", "paused", "idle"].includes(engine.status)) {
          await world.advance(4000);
          // A deadline/end inside the window may legitimately cost one load: allow recovery.
          const live = () => engine.status === "playing" && engine.current && audios.some((x) => !x.paused && !x.pending && x._src.endsWith(engine.current.audioItemId));
          if (!live()) await audibleWithin(2500 + 3 * lat);
          const cur = engine.current?.audioItemId;
          const okNow = engine.items.some((i) => !i.playableUntil || i.playableUntil.getTime() > world.now + 2000);
          if (okNow && (engine.status !== "playing" || !cur || !audios.some((x) => !x.paused && !x.pending && x._src.endsWith(cur))))
            throw new Error(`seed ${seed} step ${step} (${what}): stalled: status ${engine.status}, current ${cur?.slice(-2)} not audible` + (process.env.SPA_FUZZ_TRACE ? ` msg=${engine.message} items=${JSON.stringify(engine.items.map((i) => [i.audioItemId.slice(-2), i.playableUntil ? i.playableUntil.getTime() - world.now : null]))} plays=${JSON.stringify(world.plays.slice(-4).map((p) => [p.el, p.src.slice(-2), p.at - T0, p.pos]))} signs=${world.signs.length} rs=${audios.map(a=>a.readyState)} timers=${JSON.stringify(world.timers.map(t=>t.at-world.now))} wait=${engine.slotWaiters.map(w=>w.length)} op=${engine.opEpoch} st=${engine.starting} ps=${JSON.stringify(engine.pendingStart)} so=${engine.slotOp} expires=${engine.manifest?.expiresAt?.getTime?.() - world.now}` : ""));
          check(step, "quiet");
        }
      }
      // Liveness: valid manifest, online, playing -> something audible and it is engine.current.
      world.online = true;
      world.manifestRes = { ok: true, data: world.manifest(world.items) };
      void engine.refresh();
      await world.advance(3000);
      if (engine.status !== "playing") { void engine.toggle(); await world.advance(3000); }
      check("final", "liveness");
      if (engine.status === "playing") {
        // A modelled pending play()/resume() (≤ 900 ms) may still be resolving.
        if (!audios.some((x) => !x.paused && !x.pending && engine.current && x._src.endsWith(engine.current.audioItemId))) await audibleWithin(1000 + 3 * lat); // + <audio> JS timer latency
        const cur = engine.current?.audioItemId;
        if (!cur || !audios.some((x) => !x.paused && !x.pending && x._src.endsWith(cur))) throw new Error(`seed ${seed}: playing but engine.current (${cur?.slice(-2)}) not audible` + (process.env.SPA_FUZZ_TRACE ? " " + JSON.stringify(audios.map((x) => [x._src.slice(-2), x.paused, !!x.pending, x.currentTime, x.duration])) + " loaded=" + engine.loaded.map((l) => l && l.audioItemId.slice(-2)).join(",") + " active=" + engine.active + " items=" + JSON.stringify(engine.items.map((i) => [i.audioItemId.slice(-2), i.playableUntil ? i.playableUntil.getTime() - world.now : null])) + " plays=" + JSON.stringify(world.plays.slice(-4).map((p) => [p.el, p.src.slice(-2), p.at - T0, p.pos])) + " now=" + (world.now - T0) : ""));
      }
      // I5 last.
      await engine.revokeAccess(); revoked = true;
      await world.advance(1000);
      check("revoked", "no_access");
    } catch (e) {
      failures.push(e.message.startsWith("seed ") ? e.message : `seed ${seed}: ${e.message}`);
    }
    engine.dispose();
  }
  assert.equal(failures.length, 0, `interleaving failures (${failures.length}/${seeds.length}):\n${failures.slice(0, 8).join("\n")}`);
}

console.log("business-spa-player-engine-unit: all tests passed");
