// t1390u follow-up (12.11.2026, 14:48:49 MSK): the hall iPhone page was killed right at a track
// change and Safari reopened it; the dead page's journal was lost. The «last breath» lets the next
// page report how the previous one ended. Covers the record, the report and the wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HALL_LAST_BREATH_KEY,
  HALL_LAST_BREATH_MAX_AGE_MS,
  HALL_LAST_BREATH_MS,
  HallLastBreathWriter,
  hallPrevPageReport,
  readHallLastBreath,
  writeHallLastBreath,
} from "../src/lib/business-app/hall-last-breath";
import {
  HALL_JOURNAL_DATA_KEYS,
  HallDeviceJournal,
  isHallJournalKind,
  parseHallJournalEvent,
  type HallJournalEvent,
} from "../src/lib/business-app/hall-device-journal";

class MemStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const snap = () => ({
  st: "playing", pos: 158, up: 7917, n: 45, trackAgeS: 0, bufN: 3, bufMb: 14.5, dl: 0, vis: "v",
  build: "dc236453", usageMb: 3380, cacheN: 3,
});

// 1. Writer: throttled ticks, forced ticks, goodbye / alive.
{
  const storage = new MemStorage();
  let now = 1_000_000;
  let calls = 0;
  const w = new HallLastBreathWriter(storage, "page-a", () => { calls++; return snap(); }, () => now);
  w.tick();
  assert.equal(calls, 1);
  now += HALL_LAST_BREATH_MS - 1;
  w.tick();
  assert.equal(calls, 1, "throttled");
  w.tick(true);
  assert.equal(calls, 2, "forced write (track change)");
  now += HALL_LAST_BREATH_MS;
  w.tick();
  assert.equal(calls, 3);
  const r = readHallLastBreath(storage)!;
  assert.equal(r.id, "page-a");
  assert.equal(r.at, now);
  assert.equal(r.bye, false);
  assert.equal(r.n, 45);
  assert.equal(r.build, "dc236453");
  w.goodbye();
  assert.equal(readHallLastBreath(storage)!.bye, true);
  w.alive();
  assert.equal(readHallLastBreath(storage)!.bye, false);
  // A snapshot that throws leaves the previous record.
  const bad = new HallLastBreathWriter(storage, "page-b", () => { throw new Error("x"); }, () => now);
  bad.tick(true);
  assert.equal(readHallLastBreath(storage)!.id, "page-a");
}

// 2. Report for the next page: killed vs normal, own record, too old, garbage.
{
  const storage = new MemStorage();
  writeHallLastBreath(storage, { ...snap(), id: "old", at: 10_000, bye: false });
  const rep = hallPrevPageReport(readHallLastBreath(storage), { pageId: "new", now: 14_000 })!;
  assert.equal(rep.bye, false, "killed page: no goodbye");
  assert.equal(rep.ageS, 4);
  assert.equal(rep.n, 45);
  assert.equal(rep.trackAgeS, 0);
  assert.equal(rep.usageMb, 3380);
  assert.equal(hallPrevPageReport(readHallLastBreath(storage), { pageId: "old", now: 14_000 }), null, "own record");
  assert.equal(hallPrevPageReport(readHallLastBreath(storage), { pageId: "new", now: 10_000 + HALL_LAST_BREATH_MAX_AGE_MS + 1 }), null, "too old");
  assert.equal(hallPrevPageReport(readHallLastBreath(storage), { pageId: "new", now: 9_000 }), null, "clock went back");
  assert.equal(hallPrevPageReport(null, { pageId: "new", now: 1 }), null);
  storage.setItem(HALL_LAST_BREATH_KEY, "{not json");
  assert.equal(readHallLastBreath(storage), null);
  storage.setItem(HALL_LAST_BREATH_KEY, JSON.stringify({ id: "x" }));
  assert.equal(readHallLastBreath(storage), null, "no time");
  assert.equal(readHallLastBreath(null), null);
  // Storage that throws never breaks the page.
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
  assert.equal(readHallLastBreath(throwing), null);
  writeHallLastBreath(throwing, { ...snap(), id: "a", at: 1, bye: false });
}

// 3. Journal: «prev_page» is a known, urgent kind; context:false keeps every report key.
{
  assert.equal(isHallJournalKind("prev_page"), true);
  const sent: HallJournalEvent[][] = [];
  let now = 5_000_000;
  const j = new HallDeviceJournal({
    send: async (e) => { sent.push(e); return true; },
    context: () => ({ st: "idle", pos: 0, up: 2, n: 0, vis: "v", wl: false, bufN: 0, bufMb: 0, bufMem: 0, heapMb: null, ctxOnly: 1 }),
    now: () => now,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  const rep = hallPrevPageReport({ ...snap(), id: "old", at: now - 4_000, bye: false }, { pageId: "new", now })!;
  assert.ok(Object.keys(rep).length <= HALL_JOURNAL_DATA_KEYS);
  assert.equal(j.log("prev_page", rep, { context: false }), true);
  assert.equal(j.log("prev_page", rep, { context: false }), true, "urgent: not throttled by kind");
  await j.flush();
  const ev = sent[0][0];
  assert.equal(ev.k, "prev_page");
  assert.equal(ev.d.ctxOnly, undefined, "no live context mixed in");
  assert.equal(ev.d.bye, false);
  assert.equal(ev.d.usageMb, 3380);
  assert.equal(ev.d.cacheN, 3);
  assert.equal(Object.keys(ev.d).length, Object.keys(rep).length, "no key dropped");
  assert.ok(parseHallJournalEvent(ev, now), "the point route accepts it");
  // Default log still carries the context.
  now += 20_000;
  j.log("snapshot");
  await j.flush();
  assert.equal(sent[1][0].d.ctxOnly, 1);
}

// 4. Wiring in the hall player.
{
  const player = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
  assert.match(player, /j\.log\("prev_page", prev, \{ context: false \}\)/);
  assert.match(player, /breath\.goodbye\(\)/, "normal unload says goodbye");
  assert.match(player, /lastTrackAtRef\.current = Date\.now\(\)/, "track change time recorded");
  assert.match(player, /lastBreathRef\.current\?\.tick\(true\)/, "every journal event refreshes the last breath");
  assert.match(player, /window\.clearInterval\(breathTimer\)/);
  // Diagnostics only: the last breath never reloads, pauses or plays anything.
  const lib = readFileSync(new URL("../src/lib/business-app/hall-last-breath.ts", import.meta.url), "utf8");
  assert.doesNotMatch(lib, /location\.|\.play\(|\.pause\(|reload/);
}

console.log("business-hall-last-breath-unit: ok");
