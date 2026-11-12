// t1390u (Sergey 12.11.2026): the hall iPhone went quiet at 09:42 MSK on 11.11 and 12.11 – Safari
// re-opened the hall page by itself after 50–70 track changes (memory), and the fresh page could
// not start the sound without a tap. This covers:
//   A) iPhone memory: 3-track buffer streamed into Cache Storage (no Blob in the page), lazy copies,
//      no download in the first 45 s of a track, one sign at the boundary (next link after 30 s);
//   B) in-page recovery: a pause nobody asked for / a position that does not move for 10 s →
//      play() on the same element with backoff, never a message or a button;
//   telemetry: hall device journal (throttled, small), crash-suspect page load, autoplay code,
//      the point route «events» kind and an additive-only migration.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  SELF_RESUME_BASE_MS,
  WATCHDOG_STUCK_MS,
  SpaOnlinePlayer,
  type OnlineSignResult,
} from "../src/lib/business-app/spa-online-player";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";
import {
  HALL_BUFFER_IOS_START_DELAY_MS,
  HALL_BUFFER_IOS_TRACKS,
  HallOfflineBuffer,
  type BufferStore,
} from "../src/lib/business-app/hall-offline-buffer";
import {
  HALL_JOURNAL_BATCH,
  HALL_JOURNAL_KIND_GAP_MS,
  HALL_JOURNAL_MAX_PER_HOUR,
  HALL_PAGE_ALIVE_KEY,
  HallDeviceJournal,
  cleanHallJournalData,
  clearHallPageAlive,
  hallNavigationType,
  markHallPageAlive,
  parseHallJournalEvent,
  type HallJournalEvent,
} from "../src/lib/business-app/hall-device-journal";

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); };
const MB = 1024 * 1024;
const item = (n: number, durationSeconds: number | null = 180): SpaManifestItem => ({
  position: n,
  audioItemId: `track-${n}`,
  trackCode: null,
  title: `T${n}`,
  durationSeconds,
  gainDb: null,
  playableUntil: null,
  offlineAllowed: false,
  offlineCacheUntil: null,
});

type Timer = { fn: () => void; at: number };
function clock() {
  let t = 1_000_000;
  const timers: Timer[] = [];
  const setTimer = (fn: () => void, ms: number) => { const h = { fn, at: t + ms }; timers.push(h); return h; };
  const clearTimer = (h: unknown) => { const i = timers.indexOf(h as Timer); if (i >= 0) timers.splice(i, 1); };
  const advance = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      const due = timers.filter((h) => h.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = due.at;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
      await flush();
    }
    t = end;
    await flush();
  };
  return { now: () => t, setTimer, clearTimer, advance, timers };
}

function world(opts: { presignDelay?: number; play?: (n: number) => Promise<void> | void; element?: boolean; background?: boolean } = {}) {
  const c = clock();
  const signs: string[] = [];
  const events: { kind: string; data?: Record<string, unknown> }[] = [];
  let plays = 0;
  const audio = {
    src: "",
    currentTime: 0,
    paused: true,
    ended: false,
    async play() {
      plays++;
      if (opts.play) await opts.play(plays);
      this.paused = false;
      this.ended = false;
    },
    pause() { this.paused = true; },
    removeAttribute() { this.src = ""; this.currentTime = 0; },
    load() {},
  };
  const p = new SpaOnlinePlayer(
    {
      audio,
      now: c.now,
      random: () => 0.5,
      isOnline: () => true,
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
      sign: async (id): Promise<OnlineSignResult> => {
        signs.push(id);
        return { ok: true, data: { url: `https://s/${id}?n=${signs.length}` } };
      },
      onChange() {},
      backgroundAdvance: () => opts.background === true,
      presignDelaySec: opts.presignDelay === undefined ? undefined : () => opts.presignDelay!,
      element: opts.element === false ? undefined : () => ({ paused: audio.paused, ended: audio.ended, currentTime: audio.currentTime }),
      onEvent: (kind, data) => events.push({ kind, data }),
    },
    [item(1), item(2), item(3)],
  );
  return { p, audio, signs, events, c, plays: () => plays };
}

// A1. Without a delay (Android, as before): the next link is signed right at the start.
{
  const w = world();
  await w.p.toggle();
  await flush();
  assert.equal(w.p.status, "playing");
  assert.deepEqual(w.signs, ["track-1", "track-2"], "start + next link at once (unchanged default)");
}

// A2. Hall iPhone (delay 30 s): at a pre-signed boundary only the access re-check goes out; the
// next link follows after 30 s of play – never two requests at the boundary.
{
  const w = world({ presignDelay: 30 });
  await w.p.toggle();
  await flush();
  assert.deepEqual(w.signs, ["track-1"], "no next link in the first seconds");
  w.audio.currentTime = 10;
  w.p.onProgress(10, 180);
  await flush();
  assert.deepEqual(w.signs, ["track-1"]);
  w.audio.currentTime = 31;
  w.p.onProgress(31, 180);
  await flush();
  assert.deepEqual(w.signs, ["track-1", "track-2"], "next link after 30 s");
  // Natural end → the pre-signed track-2 starts; only its re-check is signed at the boundary.
  w.audio.ended = true;
  await w.p.onEnded();
  await flush();
  assert.equal(w.p.status, "playing");
  assert.deepEqual(w.signs, ["track-1", "track-2", "track-2"], "boundary: exactly one request (re-check)");
  w.audio.currentTime = 1;
  w.p.onProgress(1, 180);
  await flush();
  assert.equal(w.signs.length, 3, "still one request at the boundary");
}

// A3. A short track or the end near: the link is not delayed past the end; a locked screen signs at once.
{
  const short = world({ presignDelay: 30 });
  short.p.items = [item(1, 50), item(2, 50)];
  await short.p.toggle();
  await flush();
  short.audio.currentTime = 5;
  short.p.onProgress(5, 50);
  await flush();
  assert.deepEqual(short.signs, ["track-1", "track-2"], "end near: sign now");
  const locked = world({ presignDelay: 30, background: true });
  await locked.p.toggle();
  await flush();
  assert.deepEqual(locked.signs, ["track-1", "track-2"], "locked iPhone: the handoff never waits");
}

// B1. The element paused by itself while playing → play() on the same element, no message.
{
  const w = world();
  await w.p.toggle();
  await flush();
  const playsBefore = w.plays();
  const src = w.audio.src;
  w.audio.currentTime = 70;
  w.audio.paused = true; // iOS interruption: the element pauses, nobody asked
  w.p.onElementPause();
  assert.equal(w.p.status, "playing", "the hall still means to play");
  assert.equal(w.p.selfResuming, true);
  assert.equal(w.p.message, null, "no message");
  assert.equal(w.p.needsGesture, false, "no «press to continue»");
  await w.c.advance(SELF_RESUME_BASE_MS);
  assert.equal(w.plays(), playsBefore + 1, "play() again");
  assert.equal(w.audio.src, src, "same element, same source");
  assert.equal(w.audio.paused, false);
  assert.ok(w.events.some((e) => e.kind === "unexpected_pause"));
  assert.ok(w.events.some((e) => e.kind === "self_resume_ok"));
}

// B2. A deliberate pause (tap / owner / lock screen go through toggle) is never undone.
{
  const w = world();
  await w.p.toggle();
  await flush();
  await w.p.toggle(); // pause
  assert.equal(w.p.status, "paused");
  w.p.onElementPause();
  assert.equal(w.p.selfResuming, false);
  await w.c.advance(60_000);
  assert.equal(w.audio.paused, true, "deliberate pause stays");
}

// B3. Refused / failing resumes back off (doubling) and keep trying; a broken source reconnects.
{
  let fail = 0;
  const w = world({ play: (n) => { if (n > 1 && fail > 0) { fail--; throw Object.assign(new Error("x"), { name: "NotAllowedError" }); } } });
  await w.p.toggle();
  await flush();
  fail = 3;
  w.audio.paused = true;
  w.p.onElementPause();
  await w.c.advance(SELF_RESUME_BASE_MS); // 1st fails
  await w.c.advance(SELF_RESUME_BASE_MS * 2); // 2nd fails
  await w.c.advance(SELF_RESUME_BASE_MS * 4); // 3rd fails
  assert.equal(w.audio.paused, true);
  assert.equal(w.p.status, "playing");
  await w.c.advance(SELF_RESUME_BASE_MS * 8); // 4th works
  assert.equal(w.audio.paused, false, "resumed by itself after backoff");
  assert.equal(w.events.filter((e) => e.kind === "self_resume_failed").length, 3);

  let broken = 0;
  const b = world({ play: (n) => { if (n > 1 && broken > 0) { broken--; throw new Error("decode"); } } });
  await b.p.toggle();
  await flush();
  broken = 3;
  b.audio.paused = true;
  b.p.onElementPause();
  await b.c.advance(SELF_RESUME_BASE_MS + SELF_RESUME_BASE_MS * 2 + SELF_RESUME_BASE_MS * 4);
  assert.ok(b.events.some((e) => e.kind === "recover"), "3 broken resumes → reconnect at the position");
}

// B4. Watchdog: playing but the position does not move for 10 s.
{
  const w = world();
  await w.p.toggle();
  await flush();
  w.audio.currentTime = 50;
  w.p.watchdog();
  await w.c.advance(5_000);
  w.p.watchdog();
  assert.equal(w.events.filter((e) => e.kind === "watchdog_stuck").length, 0, "5 s is not stuck");
  w.audio.paused = true; // paused without any event
  await w.c.advance(WATCHDOG_STUCK_MS);
  w.p.watchdog();
  assert.equal(w.events.filter((e) => e.kind === "watchdog_stuck").length, 1);
  await w.c.advance(SELF_RESUME_BASE_MS);
  assert.equal(w.audio.paused, false, "paused element played again");

  // Moving position: nothing happens.
  const m = world();
  await m.p.toggle();
  await flush();
  for (let i = 0; i < 10; i++) {
    m.audio.currentTime += 2;
    m.p.watchdog();
    await m.c.advance(2_000);
  }
  assert.equal(m.events.filter((e) => e.kind === "watchdog_stuck").length, 0);

  // Claims to play but does not move twice → reconnect.
  const s = world();
  await s.p.toggle();
  await flush();
  s.audio.currentTime = 20;
  s.p.watchdog();
  await s.c.advance(WATCHDOG_STUCK_MS);
  s.p.watchdog();
  await s.c.advance(WATCHDOG_STUCK_MS);
  s.p.watchdog();
  assert.ok(s.events.some((e) => e.kind === "recover"), "stuck twice → reconnect");

  // Ended without "ended" → next track.
  const e = world();
  await e.p.toggle();
  await flush();
  e.audio.currentTime = 180;
  e.p.watchdog();
  e.audio.ended = true;
  e.audio.paused = true;
  await e.c.advance(WATCHDOG_STUCK_MS);
  e.p.watchdog();
  await flush();
  assert.equal(e.p.current?.audioItemId, "track-2", "moved on");

  // Paused hall: no watchdog at all.
  const pz = world();
  await pz.p.toggle();
  await flush();
  await pz.p.toggle();
  pz.p.watchdog();
  await pz.c.advance(WATCHDOG_STUCK_MS * 3);
  pz.p.watchdog();
  assert.equal(pz.events.filter((x) => x.kind === "watchdog_stuck").length, 0);

  // No element hook (owner preview): off.
  const off = world({ element: false });
  await off.p.toggle();
  await flush();
  off.audio.paused = true;
  off.p.onElementPause();
  off.p.watchdog();
  await off.c.advance(WATCHDOG_STUCK_MS * 2);
  off.p.watchdog();
  assert.equal(off.p.selfResuming, false);
  assert.equal(off.events.length, 0);
}

// B5. Autoplay refusal (after a reload) is reported as an event.
{
  const w = world({ play: () => { throw Object.assign(new Error("x"), { name: "NotAllowedError" }); } });
  await w.p.toggle();
  await flush();
  assert.equal(w.p.needsGesture, true);
  assert.ok(w.events.some((e) => e.kind === "autoplay_blocked"));
}

// A4. Buffer on the hall iPhone: streamed into the store, nothing in page memory, held at a
// boundary, 3 tracks, lazy copy for a reconnect, released when another track sounds.
{
  const c = clock();
  const rows = new Map<string, { size: number; downloadedAt: number }>();
  const blobsRead: string[] = [];
  let putResponses = 0;
  const store: BufferStore = {
    kind: "cache",
    async get(id) {
      blobsRead.push(id);
      const r = rows.get(id);
      return r ? { blob: new Blob([new Uint8Array(r.size)], { type: "audio/mpeg" }), downloadedAt: r.downloadedAt } : null;
    },
    async put() { throw new Error("blob path must not be used"); },
    async putResponse(id, response, downloadedAt) {
      putResponses++;
      const size = Number(response.headers.get("content-length"));
      rows.set(id, { size, downloadedAt });
      return size;
    },
    async meta(id) { return rows.get(id) ?? null; },
    async delete(id) { rows.delete(id); },
    async keys() { return [...rows.keys()]; },
    async clear() { rows.clear(); },
  };
  const signs: string[] = [];
  let blobFetches = 0;
  const urls: string[] = [];
  const revoked: string[] = [];
  const buffer = new HallOfflineBuffer({
    store,
    sign: async (id) => { signs.push(id); return { ok: true, data: { url: `https://s/${id}` } }; },
    async fetchBlob() { blobFetches++; return new Blob(["x"]); },
    async fetchResponse() {
      return new Response("x", { headers: { "content-length": String(8 * MB), "content-type": "audio/mpeg" } });
    },
    streamToStore: true,
    lazyCopies: true,
    startDelayMs: HALL_BUFFER_IOS_START_DELAY_MS,
    maxTracks: HALL_BUFFER_IOS_TRACKS,
    createUrl: () => { const u = `blob:${urls.length}`; urls.push(u); return u; },
    revokeUrl: (u) => revoked.push(u),
    window: () => ({ until: null }),
    isOnline: () => true,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
  });
  buffer.setPlan(["a", "b", "c", "d", "e", "f"], "cur");
  buffer.pin("cur"); // a track starts: hold
  await buffer.refill(true);
  await flush();
  assert.equal(signs.length, 0, "no buffer request at the boundary");
  await c.advance(HALL_BUFFER_IOS_START_DELAY_MS);
  await flush();
  assert.deepEqual([...rows.keys()].sort(), ["a", "b", "c"], "3 tracks on the iPhone");
  assert.equal(putResponses, 3);
  assert.equal(blobFetches, 0, "no Blob download");
  assert.equal(blobsRead.length, 0, "nothing read back into the page");
  assert.deepEqual(buffer.stats(), { tracks: 3, bytes: 24 * MB, inMemory: 0 });
  assert.equal(buffer.localSource("a", 180), null, "lazy: no copy in memory without a reconnect");
  await flush();
  assert.equal(buffer.stats().inMemory, 0);
  buffer.prepare("a"); // a reconnect asks for it
  await flush();
  assert.equal(buffer.stats().inMemory, 1);
  const url = buffer.localSource("a", 180);
  assert.ok(url, "the reconnect finds the copy");
  buffer.pin("a");
  await flush();
  buffer.setPlan(["b", "c", "d"], null);
  buffer.pin("b"); // another track sounds: the copy goes from memory
  await flush();
  assert.equal(buffer.stats().inMemory, 0, "released");
  assert.ok(revoked.includes(url!), "blob: URL revoked");

  // Reload: rehydrate reads sizes from headers, never the bodies.
  blobsRead.length = 0;
  const again = new HallOfflineBuffer({
    store,
    sign: async () => ({ ok: true, data: { url: "x" } }),
    async fetchBlob() { return new Blob(["x"]); },
    createUrl: () => "blob:x",
    revokeUrl: () => {},
    window: () => ({ until: null }),
    isOnline: () => true,
    lazyCopies: true,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
  });
  await again.rehydrate();
  assert.equal(blobsRead.length, 0, "rehydrate uses meta()");
  assert.equal(again.stats().bytes > 0, true);
}

// Telemetry 1. Journal: throttled by kind, urgent kinds flushed soon, batches, hourly cap.
{
  const c = clock();
  const sent: HallJournalEvent[][] = [];
  const j = new HallDeviceJournal({
    send: async (e) => { sent.push(e); return true; },
    context: () => ({ st: "playing", up: 12, n: 3, vis: "v", wl: true, bufMb: 24 }),
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
  });
  assert.equal(j.log("el_waiting"), true);
  assert.equal(j.log("el_waiting"), false, "same kind within 10 s is folded");
  await c.advance(HALL_JOURNAL_KIND_GAP_MS);
  assert.equal(j.log("el_waiting"), true);
  assert.equal(j.size, 2);
  assert.equal(j.log("page_load", { nav: "reload", crashSuspect: true, wasPlaying: true }), true);
  await c.advance(2_000);
  assert.equal(sent.length, 1, "urgent event flushed within seconds");
  assert.equal(sent[0].length, 3);
  assert.equal(sent[0][1].d.skipped, 1, "folded events counted");
  assert.equal(sent[0][2].d.crashSuspect, true);
  assert.equal(sent[0][2].d.st, "playing", "context merged");
  for (let i = 0; i < HALL_JOURNAL_MAX_PER_HOUR + 20; i++) j.log("recover", { i });
  assert.ok(j.dropped >= 20, "hourly cap");
  await c.advance(60_000);
  assert.ok(sent.every((b) => b.length <= HALL_JOURNAL_BATCH), "batches stay small");
  // Failed sends keep the events.
  const k = new HallDeviceJournal({ send: async () => false, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  k.log("page_load");
  await c.advance(2_000);
  assert.equal(k.size, 1);
  j.dispose();
  k.dispose();
}

// Telemetry 2. Data cleaning and server parsing.
{
  const d = cleanHallJournalData({ ok: 1.23456, s: "x".repeat(200), bad: { nested: 1 }, "no-dash": 1, n: Number.NaN, b: false, z: null });
  assert.deepEqual(d, { ok: 1.23, s: "x".repeat(64), b: false, z: null });
  const now = Date.now();
  assert.equal(parseHallJournalEvent({ k: "drop_table", at: now, d: {} }, now), null, "unknown kind refused");
  const e = parseHallJournalEvent({ k: "page_load", at: now - 30 * 86_400_000, d: { nav: "reload" } }, now);
  assert.equal(e?.at, now, "insane client clock → server time");
  assert.equal(parseHallJournalEvent({ k: "snapshot", at: now, d: [] }, now)?.k, "snapshot");
}

// Telemetry 3. Page alive flag: a page killed by the browser never says goodbye.
{
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  assert.deepEqual(markHallPageAlive(storage, "p1"), { previousAlive: false }, "first load");
  assert.deepEqual(markHallPageAlive(storage, "p2"), { previousAlive: true }, "p1 never unloaded → crash suspect");
  clearHallPageAlive(storage);
  assert.equal(mem.has(HALL_PAGE_ALIVE_KEY), false);
  assert.deepEqual(markHallPageAlive(storage, "p3"), { previousAlive: false }, "normal reload");
  assert.equal(hallNavigationType({ getEntriesByType: () => [{ type: "reload" }] }), "reload");
  assert.equal(hallNavigationType(null), "unknown");
}

// Wiring (source guards).
{
  const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const player = read("src/components/business-app/workspace/BusinessCabinetPlayer.tsx");
  assert.match(player, /presignDelaySec: \(\) => \(streamFirstRef\.current \? HALL_IOS_PRESIGN_DELAY_SEC : 0\)/);
  assert.match(player, /window\.setInterval\(\(\) => ctl\.watchdog\(\), HALL_WATCHDOG_TICK_MS\)/);
  assert.match(player, /ctl\.onElementPause\(\);/);
  assert.match(player, /"autoplay_blocked_after_reload" : "autoplay_blocked"/);
  assert.match(player, /fetchResponse: fetchTrackResponse/);
  assert.match(player, /startDelayMs: HALL_BUFFER_IOS_START_DELAY_MS/);
  assert.doesNotMatch(player, /Нажмите|нажмите, чтобы продолжить/, "no press-to-continue copy added");
  const route = read("src/app/api/business/point/route.ts");
  assert.match(route, /body\.kind === "events"/);
  assert.match(route, /from\("business_player_device_events"\)\.insert\(rows\)/);
  const name = readdirSync(new URL("../supabase/migrations/", import.meta.url)).find((f) => f.endsWith("_business_player_device_events.sql"));
  assert.ok(name, "migration present");
  const sql = read(`supabase/migrations/${name}`).replace(/--.*$/gm, "");
  assert.match(sql, /CREATE TABLE public\.business_player_device_events/);
  assert.doesNotMatch(sql, /^\s*(DROP|DELETE|UPDATE|TRUNCATE|INSERT)\b/im, "additive only: no data statements");
  assert.doesNotMatch(sql, /ALTER TABLE public\.(?!business_player_device_events)/i, "no other table touched");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
}

console.log("business-hall-ios-memory-recovery-unit: OK");
