import assert from "node:assert/strict";
import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";
import { CAFE_DAYPART_HOURS_DEFAULT, CAFE_QUEUE_DEFAULT_PREFS } from "../src/lib/business-app/cafe-queue/prefs";
import { GUEST_COFFEE_DEFAULT_PROFILE } from "../src/lib/business-app/guest-coffee/catalog";
import { cafeQueueNextIndex } from "../src/lib/business-app/cafe-queue/order";
import { createPointSoundApplier, pointDaypart, pointKeepCurrentOrder, pointMusicAllowed, pointSoundUpdate, POINT_MUSIC_FORBIDDEN, soundDraftFromBody, type PointSoundUpdate } from "../src/lib/business-app/point-sound";

// 1: absent settings default ON; OFF and invalid sessions grant no manual music change.
assert.equal(pointMusicAllowed({ ok: true, found: false }), true);
assert.equal(pointMusicAllowed({ ok: true, point_can_edit_settings: true }), true);
assert.equal(pointMusicAllowed({ ok: true, point_can_edit_settings: false }), false);
assert.equal(pointMusicAllowed({ ok: false }), false);
assert.equal(pointMusicAllowed(null), false);
assert.equal(POINT_MUSIC_FORBIDDEN, "Менять музыку с устройства в заведении запрещено.");

// 3: the current track is the boundary; the first new track follows it,
// including when the current track was excluded from the new pool.
assert.deepEqual(pointKeepCurrentOrder([2, 1, 0], 1), [1, 2, 0]);
assert.deepEqual(pointKeepCurrentOrder([2, 0], 1), [1, 2, 0]);
assert.equal(cafeQueueNextIndex(pointKeepCurrentOrder([2, 1, 0], 1), 1, 3), 2);

// Real controller: rebuilding only the order preserves source, status and position,
// both while paused and during an outstanding play/sign request.
for (const phase of ["paused", "playing", "loading"] as const) {
  const items: SpaManifestItem[] = [0, 1, 2].map((position) => ({
    position, audioItemId: `t${position}`, trackCode: null, title: `Track ${position}`,
    durationSeconds: 180, gainDb: null, playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
  }));
  const audio = {
    src: "", currentTime: 0,
    async play() {}, pause() {}, load() {},
    removeAttribute() { this.src = ""; },
  };
  let finishSign!: () => void;
  const waiting = new Promise<void>((resolve) => { finishSign = resolve; });
  let order = [0, 1, 2];
  let signCount = 0;
  const ctl = new SpaOnlinePlayer({
    audio, onChange() {},
    sign: async (id) => {
      signCount++;
      if (phase === "loading" && signCount === 1) await waiting;
      return { ok: true, data: { url: `https://audiolad.ru/test/${id}` } };
    },
    nextIndex: (index, length) => cafeQueueNextIndex(order, index, length),
  }, items);
  const starting = ctl.playIndex(1);
  if (phase !== "loading") await starting;
  if (phase === "paused") await ctl.toggle();
  audio.currentTime = 42;
  const source = audio.src;
  assert.equal(ctl.status, phase);
  order = pointKeepCurrentOrder([2, 1, 0], ctl.index);
  assert.equal(ctl.index, 1);
  assert.equal(ctl.status, phase);
  assert.equal(audio.src, source);
  assert.equal(audio.currentTime, 42);
  if (phase === "loading") { finishSign(); await starting; }
  if (phase === "paused") {
    await ctl.toggle();
    assert.equal(ctl.status, "playing");
    assert.equal(ctl.index, 1);
    assert.equal(audio.currentTime, 42);
    assert.equal(signCount, 1, "resume uses the same track source");
  }
  await ctl.next();
  assert.equal(ctl.index, 2, "new atmosphere starts from next track");
  ctl.dispose();
}

// 4: arbitrary JSON shapes cannot throw and cannot become a valid draft.
const draft = { character: "cozy", direction: "jazz", daypartMode: "auto", energyOffset: 0, hours: CAFE_DAYPART_HOURS_DEFAULT };
assert.deepEqual(soundDraftFromBody(draft), draft);
for (const hours of [undefined, null, {}, [], true, 1, "07:00", { morning: {} },
  { ...CAFE_DAYPART_HOURS_DEFAULT, day: null },
  { ...CAFE_DAYPART_HOURS_DEFAULT, day: { start: 11, end: "16:00" } },
  { ...CAFE_DAYPART_HOURS_DEFAULT, day: { start: "25:00", end: "16:00" } },
  { ...CAFE_DAYPART_HOURS_DEFAULT, day: { start: "11:01", end: "16:00" } },
]) assert.equal(soundDraftFromBody({ ...draft, hours }), null);
for (const body of [null, [], "bad", 42, {}, { ...draft, energyOffset: "0" }]) assert.equal(soundDraftFromBody(body), null);

const sound: PointSoundUpdate = {
  version: 3, pointCanEdit: true, character: "cozy", direction: "jazz",
  daypartMode: "auto", energyOffset: 0, hours: CAFE_DAYPART_HOURS_DEFAULT, timezone: "Europe/Moscow",
};
const morning = new Date("2026-10-28T07:59:59Z"); // 10:59 Moscow
const day = new Date("2026-10-28T08:00:00Z");
const evening = new Date("2026-10-28T13:00:00Z");

// An authorized point with no saved atmosphere builds its first queue too.
// Version 0 cannot collide with the first saved profile (version 1).
const defaultSound = pointSoundUpdate({ ok: true, found: false });
assert.ok(defaultSound);
assert.deepEqual(defaultSound, {
  version: 0, pointCanEdit: true,
  character: GUEST_COFFEE_DEFAULT_PROFILE.character,
  direction: GUEST_COFFEE_DEFAULT_PROFILE.direction,
  daypartMode: CAFE_QUEUE_DEFAULT_PREFS.daypartMode,
  energyOffset: CAFE_QUEUE_DEFAULT_PREFS.energyOffset,
  hours: CAFE_DAYPART_HOURS_DEFAULT, timezone: "Europe/Moscow",
});
const nullSettings = {
  ok: true, found: true, character: null, direction: null, daypart_mode: null,
  energy_offset: null, settings_version: null, morning_start: null, morning_end: null,
  day_start: null, day_end: null, evening_start: null, evening_end: null, timezone: null,
};
assert.deepEqual(pointSoundUpdate(nullSettings), defaultSound);
assert.deepEqual(pointSoundUpdate({ ...nullSettings, settings_version: 1 }), { ...defaultSound, version: 1 });
assert.deepEqual(pointSoundUpdate({
  ok: true, found: true, character: "city", direction: "rhythm", daypart_mode: "evening",
  energy_offset: 15, settings_version: 7, morning_start: "07:00", morning_end: "11:00",
  day_start: "11:00", day_end: "16:00", evening_start: "16:00", evening_end: "20:00",
  timezone: "Asia/Yekaterinburg", point_can_edit_settings: false,
}), {
  ...defaultSound, character: "city", direction: "rhythm", daypartMode: "evening",
  energyOffset: 15, version: 7, timezone: "Asia/Yekaterinburg", pointCanEdit: false,
});
assert.equal(pointSoundUpdate({ ok: true, found: false, point_can_edit_settings: false })?.pointCanEdit, false);
for (const invalid of [null, [], {}, { ok: false, found: false }, { ok: false, found: true },
  { ok: true }, { ok: true, found: true }, { ...nullSettings, ok: false },
  { ...nullSettings, character: "invalid" }, { ...nullSettings, direction: "invalid" },
  { ...nullSettings, daypart_mode: "invalid" }, { ...nullSettings, energy_offset: 16 },
  { ...nullSettings, settings_version: -1 }, { ...nullSettings, settings_version: 0 },
  { ...nullSettings, day_start: "25:00" },
]) assert.equal(pointSoundUpdate(invalid), null);
const defaultApply = createPointSoundApplier();
const defaultPeriods: string[] = [];
const buildDefaultQueue = async (period: string) => { defaultPeriods.push(period); return "applied" as const; };
await defaultApply(defaultSound, buildDefaultQueue, morning);
await defaultApply(defaultSound, buildDefaultQueue, morning);
await defaultApply(defaultSound, buildDefaultQueue, day);
await defaultApply(defaultSound, buildDefaultQueue, new Date("2026-10-28T12:59:59Z"));
await defaultApply(defaultSound, buildDefaultQueue, evening);
assert.deepEqual(defaultPeriods, ["morning", "day", "evening"], "initial queue and Moscow 11:00/16:00 transitions");
await defaultApply({ ...defaultSound, version: 1 }, buildDefaultQueue, evening);
assert.equal(defaultPeriods.length, 4, "the first saved version still applies");
const otherZone = pointSoundUpdate({ ok: true, found: false, timezone: "Asia/Yekaterinburg" });
assert.ok(otherZone);
assert.equal(pointDaypart(otherZone, new Date("2026-10-28T05:59:59Z")), "morning");
assert.equal(pointDaypart(otherZone, new Date("2026-10-28T06:00:00Z")), "day");
assert.equal(pointDaypart(otherZone, new Date("2026-10-28T10:59:59Z")), "day");
assert.equal(pointDaypart(otherZone, new Date("2026-10-28T11:00:00Z")), "evening");

// 5: a deferred/failed version is retried; only applied suppresses another install.
const apply = createPointSoundApplier();
let attempts = 0;
for (const result of ["deferred", "failed", "applied"] as const) {
  assert.equal(await apply(sound, async () => { attempts++; return result; }, morning), result);
}
await apply(sound, async () => { throw new Error("already applied"); }, morning);
assert.equal(attempts, 3);
let release!: () => void;
const wait = new Promise<void>((resolve) => { release = resolve; });
const serial = createPointSoundApplier();
const first = serial(sound, async () => { await wait; return "applied"; }, morning);
assert.equal(await serial(sound, async () => { assert.fail("overlapping install"); }, morning), "deferred");
release();
assert.equal(await first, "applied");
const retry = createPointSoundApplier();
assert.equal(await retry(sound, async () => { throw new Error("network"); }, morning), "failed");
assert.equal(await retry(sound, async () => "applied", morning), "applied");

// 6: same version at the clock boundary installs the next period, then deduplicates.
const periods: string[] = [];
const install = async (period: string) => { periods.push(period); return "applied" as const; };
await apply(sound, install, day);
await apply(sound, install, day);
await apply(sound, install, evening);
assert.deepEqual(periods, ["day", "evening"]);
const custom = { ...sound, version: 4, hours: {
  morning: { start: "06:30", end: "10:15" },
  day: { start: "10:15", end: "15:45" },
  evening: { start: "15:45", end: "22:00" },
} };
const customApply = createPointSoundApplier();
periods.length = 0;
await customApply(custom, install, new Date("2026-10-28T07:14:59Z"));
await customApply(custom, install, new Date("2026-10-28T07:15:00Z"));
await customApply(custom, install, new Date("2026-10-28T12:45:00Z"));
assert.deepEqual(periods, ["morning", "day", "evening"]);
periods.length = 0;
const manual = createPointSoundApplier();
await manual({ ...sound, daypartMode: "morning" }, install, morning);
await manual({ ...sound, daypartMode: "morning" }, install, evening);
assert.deepEqual(periods, ["morning"]);
console.log("business-point-sound-apply-unit: ok");
