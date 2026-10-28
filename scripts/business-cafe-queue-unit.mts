/**
 * Cafe queue: daypart energy, calm/lively, more/less, passport fallback,
 * album separation, and the admission seam (the ranker never adds a track).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { handleCafeQueue } from "../src/lib/business-app/cafe-queue/handle";
import { cafeQueueIndices, cafeQueueNextIndex, cafeUpcomingMoreCount, ruTrackWord } from "../src/lib/business-app/cafe-queue/order";
import { currentCabinetAdmission, restrictCafePool } from "../src/lib/business-app/cafe-queue/pool";
import {
  cafeDaypartAtMinute,
  cafeDaypartFromHour,
  parseCafeQueuePrefs,
  validateCafeDaypartHours,
  CAFE_DAYPART_HOURS_DEFAULT,
  voteCafeFeedback,
} from "../src/lib/business-app/cafe-queue/prefs";
import {
  atmospherePlaybackPlan,
  atmosphereQueueStart,
  markAtmosphereRestart,
  parseAtmosphereRestart,
  peekAtmosphereRestart,
  takeAtmosphereRestart,
} from "../src/lib/business-app/cafe-queue/atmosphere-restart";
import { cafeEnergyTarget, rankCafeQueue, type CafeQueueRanking, type CafeQueueTrack } from "../src/lib/business-app/cafe-queue/rank";
import { parseCafeQueueRequest } from "../src/lib/business-app/cafe-queue/request";
import { cafeSignalsFromPassport, type CafeTrackSignals } from "../src/lib/business-app/cafe-queue/signals";
import type { GuestCoffeePassportVersionRow } from "../src/lib/business-app/guest-coffee/passport-features";
import type { GuestCoffeeSoundFeatures } from "../src/lib/business-app/guest-coffee/passport-features";
import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";

const read = (path: string) => readFileSync(path, "utf8");

function sound(input: { genres?: string[]; moods?: string[]; instruments?: string[] } = {}): GuestCoffeeSoundFeatures {
  const pack = (labels: string[] = []) => labels.map((label, index) => ({ label, weight: Number((1 - index * 0.1).toFixed(2)) }));
  return {
    genres: pack(input.genres),
    styles: [],
    moods: pack(input.moods),
    instruments: pack(input.instruments),
    character: [],
    bpm: null,
    energy: null,
  };
}

function signals(patch: Partial<CafeTrackSignals> & Pick<CafeTrackSignals, "energy">): CafeTrackSignals {
  return {
    hasPassport: patch.hasPassport ?? patch.energy !== null,
    energy: patch.energy,
    loudnessLufs: patch.loudnessLufs ?? -14,
    sound: patch.sound === undefined ? sound({ genres: ["jazz"], moods: ["calm"] }) : patch.sound,
  };
}

function track(id: string, albumKey: string): CafeQueueTrack {
  return { audioItemId: id, albumKey };
}

const base = { character: "cozy" as const, direction: "jazz" as const, daypart: "day" as const, energyOffset: 0 };

function order(pool: CafeQueueTrack[], rows: Record<string, CafeTrackSignals>, ranking: CafeQueueRanking = base) {
  return rankCafeQueue(pool, new Map(Object.entries(rows)), ranking).map((item) => item.audioItemId);
}

// ---------------------------------------------------------------- daypart, offset, loudness, mood
{
  assert.equal(cafeDaypartFromHour(4), "evening", "before 07:00 stays evening, the old night");
  assert.equal(cafeDaypartFromHour(6), "evening");
  assert.equal(cafeDaypartFromHour(7), "morning");
  assert.equal(cafeDaypartFromHour(10), "morning");
  assert.equal(cafeDaypartFromHour(11), "day");
  assert.equal(cafeDaypartFromHour(15), "day");
  assert.equal(cafeDaypartFromHour(16), "evening");
  assert.equal(cafeDaypartFromHour(19), "evening");
  assert.equal(cafeDaypartFromHour(20), "evening", "from 20:00 the night stays evening");
  assert.equal(cafeDaypartAtMinute(10 * 60 + 59), "morning");
  assert.equal(cafeDaypartAtMinute(11 * 60), "day");
  assert.equal(validateCafeDaypartHours(CAFE_DAYPART_HOURS_DEFAULT), null);
  assert.match(validateCafeDaypartHours({ ...CAFE_DAYPART_HOURS_DEFAULT, morning: { start: "12:00", end: "11:00" } }) ?? "", /раньше конца/);
  assert.match(validateCafeDaypartHours({
    morning: { start: "07:00", end: "12:00" },
    day: { start: "11:00", end: "16:00" },
    evening: { start: "16:00", end: "20:00" },
  }) ?? "", /не должны пересекаться/);
  assert.match(validateCafeDaypartHours({
    morning: { start: "07:00", end: "10:00" },
    day: { start: "11:00", end: "16:00" },
    evening: { start: "16:00", end: "20:00" },
  }) ?? "", /идти подряд/);
  assert.equal(ruTrackWord(1), "трек");
  assert.equal(ruTrackWord(2), "трека");
  assert.equal(ruTrackWord(5), "треков");
  assert.equal(ruTrackWord(11), "треков");
  assert.equal(ruTrackWord(21), "трек");
  assert.equal(cafeUpcomingMoreCount(7), 4);
  assert.equal(cafeUpcomingMoreCount(3), 0);
  assert.equal(cafeEnergyTarget("morning", 0), 40);
  assert.equal(cafeEnergyTarget("day", 0), 62);
  assert.equal(cafeEnergyTarget("evening", 0), 28);
  assert.equal(cafeEnergyTarget("morning", -15), 25);
  assert.equal(cafeEnergyTarget("morning", 15), 55);
  assert.equal(cafeEnergyTarget("evening", -15), 13);
  assert.equal(cafeEnergyTarget("day", 40), 77, "the shift stays inside ±15");

  const calm = track("calm", "album-a");
  const lively = track("lively", "album-b");
  const pool = [calm, lively];
  const rows = {
    calm: signals({ energy: 40 }),
    lively: signals({ energy: 62 }),
  };
  assert.deepEqual(order(pool, rows, { ...base, daypart: "morning" }), ["calm", "lively"]);
  assert.deepEqual(order(pool, rows, { ...base, daypart: "day" }), ["lively", "calm"]);
  assert.deepEqual(order(pool, rows, { ...base, daypart: "evening" }), ["calm", "lively"]);
  assert.deepEqual(
    order(pool, rows, { ...base, daypart: "morning", energyOffset: 15 }),
    ["lively", "calm"],
    "Бодрее moves the morning target up by 15",
  );
  assert.deepEqual(
    order(pool, { calm: signals({ energy: 25 }), lively: signals({ energy: 40 }) }, { ...base, daypart: "morning", energyOffset: -15 }),
    ["calm", "lively"],
    "Спокойнее moves the morning target down by 15",
  );

  assert.deepEqual(
    order(
      [track("hot", "h"), track("sane", "s")],
      {
        hot: signals({ energy: 62, loudnessLufs: -50 }),
        sane: signals({ energy: 62, loudnessLufs: -14 }),
      },
    ),
    ["sane", "hot"],
  );

  assert.deepEqual(
    order(
      [track("soft", "s"), track("harsh", "h")],
      {
        soft: signals({ energy: 62, sound: sound({ genres: ["jazz"], moods: ["calm", "peaceful"] }) }),
        harsh: signals({ energy: 62, sound: sound({ genres: ["rock"], moods: ["aggressive", "tense"] }) }),
      },
      { ...base, direction: "calm", character: "cozy", daypart: "evening" },
    ),
    ["soft", "harsh"],
  );
}

// ---------------------------------------------------------------- more / less, fallback, albums, pool
{
  const marker = { genres: ["jazz"], moods: ["calm"], instruments: ["piano", "session marker"] };
  const plain = { genres: ["jazz"], moods: ["calm"], instruments: ["piano"] };
  const similar = track("similar", "album-s");
  const other = track("other", "album-o");
  const pool = [other, similar];
  const rows = {
    similar: signals({ energy: 30, sound: sound(marker) }),
    other: signals({ energy: 40, sound: sound(plain) }),
  };
  const morning = { ...base, daypart: "morning" as const };
  assert.deepEqual(order(pool, rows, morning), ["other", "similar"], "without a vote the closer energy leads");
  assert.deepEqual(
    order(pool, rows, { ...morning, feedback: [{ audioItemId: "similar", kind: "more" }] }),
    ["similar", "other"],
    "Больше таких pulls the overlapping tags forward",
  );
  assert.deepEqual(
    order(pool, rows, { ...morning, feedback: [{ audioItemId: "not-in-pool", kind: "more" }] }),
    ["other", "similar"],
    "a vote outside the pool changes nothing",
  );
  const ahead = {
    similar: signals({ energy: 40, sound: sound(marker) }),
    other: signals({ energy: 32, sound: sound(plain) }),
  };
  assert.deepEqual(order([similar, other], ahead, morning), ["similar", "other"]);
  assert.deepEqual(
    order([similar, other], ahead, { ...morning, feedback: [{ audioItemId: "similar", kind: "less" }] }),
    ["other", "similar"],
    "Меньше таких pushes the current sound back",
  );

  const missing = track("missing", "album-m");
  const later = track("later", "album-l");
  const withGap = [similar, missing, later];
  const gapRows = {
    similar: signals({ energy: 62 }),
    later: signals({ energy: 30 }),
  };
  assert.deepEqual(order(withGap, gapRows), ["similar", "later", "missing"], "no passport is appended, not dropped");
  const firstGap = track("gap-a", "g1");
  const secondGap = track("gap-b", "g2");
  assert.deepEqual(
    order([firstGap, similar, secondGap, later], gapRows),
    ["similar", "later", "gap-a", "gap-b"],
    "fallback tracks keep their relative order",
  );
  assert.deepEqual(
    order([similar, later], { similar: signals({ energy: null, hasPassport: true }), later: signals({ energy: 62 }) }),
    ["later", "similar"],
    "passport without energy stays in the fallback",
  );

  const sameA = track("a1", "same");
  const sameB = track("a2", "same");
  const otherAlbum = track("b1", "other");
  assert.deepEqual(
    order([sameA, sameB, otherAlbum], {
      a1: signals({ energy: 62 }),
      a2: signals({ energy: 60 }),
      b1: signals({ energy: 50 }),
    }),
    ["a1", "b1", "a2"],
    "the same album does not play twice in a row",
  );

  const jazzTrack = track("jazz-track", "album-jazz");
  const calmTrack = track("calm-track", "album-calm");
  const directionRows = {
    "jazz-track": signals({
      energy: 62,
      sound: sound({ genres: ["jazz"], instruments: ["saxophone"] }),
    }),
    "calm-track": signals({
      energy: 62,
      sound: sound({ genres: ["ambient"], moods: ["calm", "relaxing"] }),
    }),
  };
  assert.deepEqual(
    order([calmTrack, jazzTrack], directionRows, { ...base, direction: "jazz" }),
    ["jazz-track", "calm-track"],
    "sound type jazz ranks the jazz passport first",
  );
  assert.deepEqual(
    order([calmTrack, jazzTrack], directionRows, { ...base, direction: "calm" }),
    ["calm-track", "jazz-track"],
    "sound type calm ranks the calm passport first",
  );
  const cozyTrack = track("cozy-track", "album-cozy");
  const cityTrack = track("city-track", "album-city");
  const characterRows = {
    "cozy-track": signals({
      energy: 62,
      sound: sound({ moods: ["happy", "warm", "tender"], instruments: ["acoustic guitar", "harp"] }),
    }),
    "city-track": signals({
      energy: 62,
      sound: sound({ moods: ["happy", "upbeat"], genres: ["electronic"] }),
    }),
  };
  const cozyOrder = order([cityTrack, cozyTrack], characterRows, { ...base, character: "cozy", direction: "jazz" });
  const cityOrder = order([cityTrack, cozyTrack], characterRows, { ...base, character: "city", direction: "jazz" });
  assert.notDeepEqual(cozyOrder, cityOrder, "venue character changes which passport comes first");
  assert.equal(cozyOrder[0], "cozy-track", "a cozy room leads with the warm passport");
  assert.equal(cityOrder[0], "city-track", "a city room leads with the upbeat passport");

  const catalog = [
    { audioItemId: "saved" },
    { audioItemId: "first-of-new" },
    { audioItemId: "later" },
  ];
  const newOrder = ["missing", "first-of-new", "later", "saved"];
  assert.equal(atmosphereQueueStart(catalog, newOrder), 1, "the new queue starts at its first real track, not the saved one");
  assert.equal(atmospherePlaybackPlan({
    tracks: catalog,
    orderedIds: newOrder,
    restart: null,
    status: "playing",
  }), null, "an ordinary queue refresh keeps the saved place");
  assert.deepEqual(atmospherePlaybackPlan({
    tracks: catalog,
    orderedIds: newOrder,
    restart: { playing: false },
    status: "idle",
  }), { index: 1, play: false }, "after «Создать атмосферу» the music page shows the new first track");
  assert.deepEqual(atmospherePlaybackPlan({
    tracks: catalog,
    orderedIds: newOrder,
    restart: { playing: true },
    status: "paused",
  }), { index: 1, play: true }, "music that was already playing starts that new first track");
  assert.deepEqual(atmospherePlaybackPlan({
    tracks: catalog,
    orderedIds: newOrder,
    restart: { playing: false },
    status: "playing",
  }), { index: 1, play: true }, "a still-playing bar also switches");
  const memory = new Map<string, string>();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
  };
  markAtmosphereRestart(true, store);
  assert.deepEqual(peekAtmosphereRestart(store), { playing: true });
  assert.deepEqual(takeAtmosphereRestart(store), { playing: true });
  assert.equal(peekAtmosphereRestart(store), null, "the handoff is used once");
  assert.equal(parseAtmosphereRestart("nope"), null);
  assert.equal(parseAtmosphereRestart("{\"playing\":1}"), null);

  const only = [sameA];
  assert.deepEqual(
    order(only, { a1: signals({ energy: 10 }), outside: signals({ energy: 62 }) }),
    ["a1"],
    "a signal outside the pool cannot enter it",
  );
  assert.equal(rankCafeQueue(pool, new Map(Object.entries(rows)), morning).length, pool.length);
}

// ---------------------------------------------------------------- admission adapter
{
  const cabinet = [track("one", "1"), track("two", "2")];
  assert.deepEqual(currentCabinetAdmission.loadPool({ cabinetTracks: cabinet }).tracks, cabinet);
  assert.deepEqual(restrictCafePool(cabinet).map((item) => item.audioItemId), ["one", "two"]);
  const foreign = track("foreign", "f");
  assert.deepEqual(
    restrictCafePool(cabinet, { loadPool: () => ({ tracks: [foreign, cabinet[1]!] }) }).map((item) => item.audioItemId),
    ["two"],
    "the adapter may shrink the pool and must not add to it",
  );
  const seam = read("src/lib/business-app/cafe-queue/pool.ts") + read("src/lib/business-app/cafe-queue/rank.ts");
  assert.doesNotMatch(seam, /AURAFON|JAZZ_RELAX|KOFEYNIK|CHILI|59c7e5b8|f0f911f1/);
  assert.doesNotMatch(read("src/app/api/business/workspace/queue/route.ts"), /signWorkspaceAudio|createSignedUrl/);
  assert.doesNotMatch(read("src/lib/business-app/cafe-queue/signals.ts"), /vocal_role/);
}

// ---------------------------------------------------------------- access gate and catalog fallback
{
  const body = {
    character: "cozy",
    direction: "jazz",
    daypart: "evening",
    energyOffset: -15,
    feedback: [] as const,
  };
  let tracks = 0;
  let reads = 0;
  const closed = await handleCafeQueue(body, {
    access: async () => "closed",
    loadTracks: async () => {
      tracks += 1;
      return [];
    },
    loadSignals: async () => {
      reads += 1;
      return new Map();
    },
  });
  assert.deepEqual(closed, { ok: false, reason: "no_access" });
  assert.equal(tracks, 0);
  assert.equal(reads, 0);

  const cabinet = [track("a", "a"), track("b", "b")];
  const failed = await handleCafeQueue(body, {
    access: async () => "open",
    loadTracks: async () => cabinet,
    loadSignals: async () => {
      throw new Error("passport down");
    },
  });
  assert.deepEqual(failed, { ok: true, order: ["a", "b"] });

  const ranked = await handleCafeQueue(body, {
    access: async () => "open",
    loadTracks: async () => cabinet,
    loadSignals: async (ids) => {
      assert.deepEqual(ids, ["a", "b"]);
      return new Map([
        ["a", signals({ energy: 80 })],
        ["b", signals({ energy: 28 })],
      ]);
    },
  }, { loadPool: () => ({ tracks: cabinet }) });
  assert.deepEqual(ranked, { ok: true, order: ["b", "a"] });

  const subset = await handleCafeQueue(body, {
    access: async () => "open",
    loadTracks: async () => cabinet,
    loadSignals: async (ids) => {
      assert.deepEqual(ids, ["a"]);
      return new Map([["a", signals({ energy: 28 })], ["b", signals({ energy: 28 })]]);
    },
  }, { loadPool: ({ cabinetTracks }) => ({ tracks: cabinetTracks.filter((item) => item.audioItemId === "a") }) });
  assert.deepEqual(subset, { ok: true, order: ["a"] });
  assert.equal(parseCafeQueueRequest({ ...body, energyOffset: 30 }), null);
  assert.equal(parseCafeQueueRequest({ ...body, daypart: "allday" }), null);
}

// ---------------------------------------------------------------- energy is the analyzer result, not the passport table
{
  const version = (energy: number | null): GuestCoffeePassportVersionRow => ({
    id: "passport-1",
    audio_item_id: "track-1",
    status: "active",
    sealed_at: "2026-10-27T00:00:00Z",
    ceased_at: null,
    structured_fields: {
      genres: [{ label: "Jazz", score: 0.9 }],
      moods: [{ label: "calm", score: 0.8 }],
      loudness_lufs: -18,
      energy,
    },
  });
  const normalized = (energy: number, vocal: string) => ({
    vocal: { type: vocal },
    analysis_features_v1: {
      schema_version: "audiolad-features:1",
      calibration_version: "conservative:1",
      features: {
        energy_0_100: {
          value: energy,
          confidence: null,
          source: "local:spectral-rhythm",
          model_version: "audiolad-dsp:2",
          origin: "interpreted",
          status: "candidate",
          reason: null,
        },
        loudness_lufs: {
          value: -11,
          confidence: null,
          source: "ffmpeg:ebur128",
          model_version: "test",
          origin: "measured",
          status: "measured",
          reason: null,
        },
      },
    },
  });
  const vocal = cafeSignalsFromPassport(version(99), [], normalized(42, "vocal"));
  const instrumental = cafeSignalsFromPassport(version(99), [], normalized(42, "instrumental"));
  assert.equal(vocal.energy, 42, "energy comes from analysis_features_v1, not structured_fields.energy");
  assert.equal(vocal.loudnessLufs, -18, "LUFS on the sealed passport wins");
  assert.equal(vocal.sound?.bpm, null);
  assert.equal(vocal.sound?.energy, null);
  assert.deepEqual(vocal, instrumental, "voice and instrumental labels do not change the signal");
  const noResult = cafeSignalsFromPassport(version(0.4), [{ passport_id: "passport-1", attribute_key: "energy", origin: "measured", value_numeric: 0.9, value_text: null, confidence: 0.95 }], {});
  assert.equal(noResult.energy, null, "a passport energy attribute is not the analyzer result");
  assert.equal(noResult.hasPassport, true);
}

// ---------------------------------------------------------------- client order never adds a track the server left out
{
  const tracks = [{ audioItemId: "a" }, { audioItemId: "b" }, { audioItemId: "c" }];
  assert.deepEqual(cafeQueueIndices(tracks, ["c", "nope", "a"]), [2, 0], "unknown ids and omitted catalog tracks stay out");
  assert.deepEqual(cafeQueueNextIndex([2, 0, 1], 2, 3), 0);
  assert.deepEqual(cafeQueueNextIndex([2, 0, 1], 1, 3), 2);
  assert.equal(cafeQueueNextIndex(null, 2, 3), 0);
  assert.deepEqual(parseCafeQueuePrefs('{"daypartMode":"evening","energyOffset":-15}'), { daypartMode: "evening", energyOffset: -15 });
  assert.deepEqual(parseCafeQueuePrefs('{"daypartMode":"allday","energyOffset":30}'), { daypartMode: "auto", energyOffset: 0 });
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(voteCafeFeedback([], id, "more"), [{ audioItemId: id, kind: "more" }]);
  assert.deepEqual(voteCafeFeedback([{ audioItemId: id, kind: "more" }], id, "more"), []);
  assert.match(read("src/components/business-app/workspace/useCafeQueuePreferences.ts"), /sessionStorage/);
  assert.doesNotMatch(read("src/components/business-app/workspace/CafeQueueControls.tsx"), /—/);
}

// ---------------------------------------------------------------- player follows the queue index, not the catalog row
{
  const items: SpaManifestItem[] = [0, 1, 2].map((position) => ({
    position,
    audioItemId: `t${position}`,
    trackCode: null,
    title: `Трек ${position}`,
    durationSeconds: 10,
    gainDb: null,
    playableUntil: null,
    offlineAllowed: false,
    offlineCacheUntil: null,
  }));
  const audio = {
    src: "",
    currentTime: 0,
    async play() {},
    pause() {},
    removeAttribute() {
      this.src = "";
    },
    load() {},
  };
  const order = [2, 0, 1];
  const ctl = new SpaOnlinePlayer(
    {
      audio,
      sign: async () => ({ ok: true, data: { url: "https://audiolad.ru/s/ok" } }),
      onChange() {},
      nextIndex: (current, length) => cafeQueueNextIndex(order, current, length),
    },
    items,
  );
  await ctl.playIndex(2);
  await ctl.next();
  assert.equal(ctl.index, 0);
  await ctl.next();
  assert.equal(ctl.index, 1);
  await ctl.onEnded();
  assert.equal(ctl.index, 2);
}

console.log("business-cafe-queue-unit: ok");
