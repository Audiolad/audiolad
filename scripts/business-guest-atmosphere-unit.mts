#!/usr/bin/env -S npx tsx
/**
 * a8240527 (Sergey 17.10.2026 23:21) – «Собрать атмосферу» in the AudioLad Business Music
 * section (https://business.audiolad.ru/guest/coffee): the assembly of ONE playlist from the
 * curated shelf, the honest match report, and the explicit-step contract of the UI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  GUEST_COFFEE_ATMOSPHERE_LONG_TRACK_SECONDS,
  GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES,
  GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS,
  GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS,
  assembleGuestCoffeeAtmosphere,
  guestCoffeeAtmosphereKey,
  guestCoffeeAtmosphereMatchLines,
  guestCoffeeAtmosphereMeta,
  guestCoffeeAtmosphereName,
  guestCoffeeTrackClock,
  guestCoffeeTracksWord,
} from "../src/lib/business-app/guest-coffee/atmosphere";
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  GUEST_COFFEE_SHELF,
  findGuestCoffeeTrack,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
} from "../src/lib/business-app/guest-coffee/catalog";
import { GUEST_COFFEE_ATMOSPHERE_COPY } from "../src/lib/business-app/guest-coffee/copy";

const read = (p: string) => readFileSync(p, "utf8");

// The real curated shelf (tags as in production); the two long-form single-track albums keep
// their real shape (one ~30-minute track), the others get 8 regular tracks.
const LONG_FORM = new Set(["uyutnoe-fortepiano-dlya-chteniya-i-otdyha", "utrennyaya-muzyka-dlya-horoshego-nastroeniya"]);
const shelf: GuestCoffeePlaylist[] = GUEST_COFFEE_SHELF.map((ref, n) => ({
  id: `p-${ref.productSlug}`,
  authorSlug: ref.authorSlug,
  productSlug: ref.productSlug,
  title: ref.productSlug,
  authorName: ref.authorSlug,
  href: `https://audiolad.ru/practice/${ref.authorSlug}/${ref.productSlug}`,
  coverUrl: null,
  coverImage: null,
  updatedAt: null,
  format: null,
  direction: ref.direction,
  ...(ref.sounds ? { sounds: ref.sounds } : {}),
  dayparts: ref.dayparts,
  characters: ref.characters,
  tracks: LONG_FORM.has(ref.productSlug)
    ? [{ audioItemId: `${ref.productSlug}-t0`, title: "long", durationSeconds: 1800 }]
    : Array.from({ length: 8 }, (_, i) => ({ audioItemId: `${ref.productSlug}-t${i}`, title: `${ref.productSlug} ${i}`, durationSeconds: 170 + ((n + i) % 5) * 15 })),
}));

const all = (): GuestCoffeeProfile[] =>
  GUEST_COFFEE_CHARACTERS.flatMap((c) => GUEST_COFFEE_DIRECTIONS.flatMap((d) => GUEST_COFFEE_DAYPARTS.map((t) => ({ character: c.id, direction: d.id, daypart: t.id }))));

// ---------------------------------------------------------------- every combination assembles ONE real playlist
for (const profile of all()) {
  const a = assembleGuestCoffeeAtmosphere(shelf, profile);
  assert.ok(a, `${guestCoffeeAtmosphereKey(profile)}: assembled`);
  assert.equal(a.key, guestCoffeeAtmosphereKey(profile));
  assert.ok(a.tracks.length > 0 && a.tracks.length <= GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS, "track count");
  assert.ok(a.sources.length >= 1 && a.sources.length <= GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES, "sources");
  assert.equal(new Set(a.tracks.map((t) => t.audioItemId)).size, a.tracks.length, "no duplicate tracks");
  for (const t of a.tracks) {
    // Only real shelf tracks: the existing guest stream-URL route (shelf membership + limit) plays them.
    const found = findGuestCoffeeTrack(shelf, t.audioItemId);
    assert.ok(found, "track is on the shelf");
    assert.equal(found.playlist.id, t.playlistId);
    assert.equal(found.playlist.title, t.albumTitle);
  }
  assert.equal(a.directionFallback, false, "every sound type has fitting albums on the real shelf");
  assert.equal(a.match.direction.state, "all", "only sound-fitting albums when they give enough tracks");
  assert.ok(a.tracks.every((t) => (t.durationSeconds ?? 0) < GUEST_COFFEE_ATMOSPHERE_LONG_TRACK_SECONDS), "no 30-minute single piece when shorter tracks exist");
  const total = a.tracks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0);
  assert.equal(a.totalSeconds, total);
  assert.equal(a.durationKnown, true);
  assert.ok(total < GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS + 15 * 60, "about the target length");
  assert.deepEqual(a.sources.map((s) => s.tracksUsed).reduce((x, y) => x + y, 0), a.tracks.length);
  assert.deepEqual(assembleGuestCoffeeAtmosphere(shelf, profile), a, "deterministic");
  for (const line of guestCoffeeAtmosphereMatchLines(a)) assert.doesNotMatch(line.text, /—/, "en dashes only");
}

// ---------------------------------------------------------------- piano + morning + cozy (Sergey's example)
{
  const a = assembleGuestCoffeeAtmosphere(shelf, { character: "cozy", direction: "calm", daypart: "morning" })!;
  assert.equal(a.name, "Уютная кофейня · Спокойный фон · Утро");
  assert.deepEqual(
    a.sources.map((s) => s.id),
    ["p-muzyka-dlya-relaksa-pianino", "p-spokoynaya-muzyka-dlya-kofeyni", "p-spokoynaya-uyutnaya-muzyka", "p-myagkiy-dzhaz"],
    "best fitting albums first (no hard genre filter: «Мягкий джаз» is a calm morning album too), long-form single tracks skipped",
  );
  // Interleaved: one track from each album in turn.
  assert.deepEqual(a.tracks.slice(0, 4).map((t) => t.playlistId), a.sources.map((s) => s.id));
  // Honest: all 4 albums are morning + cozy albums.
  assert.deepEqual([a.match.daypart.state, a.match.daypart.matched, a.match.daypart.of], ["all", 4, 4]);
  assert.equal(a.match.character.state, "all");
  const lines = guestCoffeeAtmosphereMatchLines(a);
  assert.equal(lines[1].text, "Время суток «Утро» – подходит по звучанию всех альбомов подборки.");
  assert.equal(lines[2].text, "Характер заведения «Уютная» – подходит по звучанию всех альбомов подборки.");
  assert.match(guestCoffeeAtmosphereMeta(a), /^12 треков · \d+ мин · из 4 альбомов$/);
}

// ---------------------------------------------------------------- jazz evening: only evening albums when they suffice
{
  const a = assembleGuestCoffeeAtmosphere(shelf, { character: "evening", direction: "jazz", daypart: "evening" })!;
  assert.equal(a.sources[0].id, "p-vecherniy-dzhaz");
  assert.ok(a.match.daypart.matched >= 3);
}

// ---------------------------------------------------------------- honest fallbacks
{
  const noRhythm = shelf.filter((p) => p.direction === "calm" && !(p.sounds ?? []).includes("rhythm"));
  const a = assembleGuestCoffeeAtmosphere(noRhythm, { character: "cozy", direction: "rhythm", daypart: "day" })!;
  assert.equal(a.directionFallback, true);
  assert.equal(a.match.direction.state, "none");
  const line = guestCoffeeAtmosphereMatchLines(a)[0];
  assert.equal(line.state, "none");
  assert.equal(line.text, "Тип звучания «Лёгкий ритм» – подходящих альбомов пока нет, собрали самое близкое по звучанию.");

  const onlyLong = shelf.filter((p) => LONG_FORM.has(p.productSlug));
  const b = assembleGuestCoffeeAtmosphere(onlyLong, { character: "city", direction: "calm", daypart: "morning" })!;
  assert.equal(b.tracks.length, 2, "long-form tracks are used when nothing shorter exists");
  assert.equal(b.tracks[0].playlistId, "p-utrennyaya-muzyka-dlya-horoshego-nastroeniya", "city + morning first");

  const none = guestCoffeeAtmosphereMatchLines({
    directionFallback: false,
    match: {
      direction: { state: "all", matched: 1, of: 1, label: "Джаз" },
      daypart: { state: "none", matched: 0, of: 1, label: "Утро" },
      character: { state: "none", matched: 0, of: 1, label: "Вечерняя" },
    },
  });
  assert.equal(none[1].text, "Время суток «Утро» – отдельных альбомов пока нет, взяли ближайшие по звучанию.");
  const one = guestCoffeeAtmosphereMatchLines({
    directionFallback: false,
    match: {
      direction: { state: "all", matched: 4, of: 4, label: "Спокойный фон" },
      daypart: { state: "some", matched: 1, of: 4, label: "Вечер" },
      character: { state: "some", matched: 2, of: 4, label: "Уютная" },
    },
  });
  assert.equal(one[1].text, "Время суток «Вечер» – подходит 1 из 4 альбомов, остальные – ближайшие по звучанию.");
  assert.match(one[2].text, /– подходят 2 из 4 альбомов/);

  assert.equal(assembleGuestCoffeeAtmosphere([], { character: "cozy", direction: "jazz", daypart: "day" }), null, "nothing to assemble");
  const empty = { ...shelf[0], tracks: [] };
  assert.equal(assembleGuestCoffeeAtmosphere([empty], { character: "cozy", direction: "jazz", daypart: "day" }), null);

  // The same audio in two albums is played once.
  const twin = { ...shelf[0], id: "twin", tracks: shelf[0].tracks };
  const c = assembleGuestCoffeeAtmosphere([shelf[0], twin], { character: "cozy", direction: "jazz", daypart: "allday" })!;
  assert.equal(new Set(c.tracks.map((t) => t.audioItemId)).size, c.tracks.length);
  assert.deepEqual(c.sources.map((s) => s.id), [shelf[0].id], "an album that gave nothing is not reported as a source");

  // Unknown durations still stop at the track cap; totals only sum the known ones.
  const unknown = { ...shelf[0], tracks: Array.from({ length: 30 }, (_, i) => ({ audioItemId: `u${i}`, title: `u${i}`, durationSeconds: null })) };
  const d = assembleGuestCoffeeAtmosphere([unknown], { character: "cozy", direction: "jazz", daypart: "allday" })!;
  assert.equal(d.tracks.length, 10, "unknown length counts as 4 min → 40-minute target");
  assert.equal(d.totalSeconds, 0);
  assert.equal(guestCoffeeAtmosphereMeta(d), "10 треков · из 1 альбома");
  // Mixed known / unknown durations: no misleading partial total.
  const mixed = { ...shelf[0], tracks: [{ audioItemId: "k0", title: "k0", durationSeconds: 180 }, ...unknown.tracks.slice(0, 9)] };
  const e = assembleGuestCoffeeAtmosphere([mixed], { character: "cozy", direction: "jazz", daypart: "allday" })!;
  assert.equal(e.durationKnown, false);
  assert.equal(e.totalSeconds, 180);
  assert.equal(guestCoffeeAtmosphereMeta(e), "10 треков · из 1 альбома");
}

// ---------------------------------------------------------------- formatting
assert.equal(guestCoffeeAtmosphereName({ character: "evening", direction: "melodic", daypart: "allday" }), "Вечерняя кофейня · Мелодичная музыка · Весь день");
assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map(guestCoffeeTracksWord), ["трек", "трека", "треков", "треков", "трек", "трека", "треков"]);
assert.equal(guestCoffeeAtmosphereMeta({ tracks: new Array(21).fill(null), totalSeconds: 3600, durationKnown: true, sources: new Array(21).fill(null) }), "21 трек · 60 мин · из 21 альбома");
assert.equal(guestCoffeeTrackClock(185), "3:05");
assert.equal(guestCoffeeTrackClock(null), null);
assert.equal(guestCoffeeTrackClock(0), null);

// ---------------------------------------------------------------- UI contract: an explicit step, no silent changes
{
  const studio = read("src/components/business-app/sound/BusinessSoundStudio.tsx");
  const settings = read("src/components/business-app/sound/BusinessSoundSettings.tsx");
  const copy = read("src/lib/business-app/guest-coffee/copy.ts");
  assert.equal(GUEST_COFFEE_ATMOSPHERE_COPY.assemble, "Собрать атмосферу");
  assert.equal(GUEST_COFFEE_ATMOSPHERE_COPY.reassemble, "Пересобрать атмосферу");
  assert.equal(GUEST_COFFEE_ATMOSPHERE_COPY.resultsTitle, "Ваша атмосфера");
  // The playlist is assembled only inside the button handler – never derived from the live settings.
  assert.equal((studio.match(/assembleGuestCoffeeAtmosphere\(/g) ?? []).length, 1);
  assert.match(studio, /const assemble = \(\) => \{[\s\S]*?assembleGuestCoffeeAtmosphere\(playlists, profile, plan\)/);
  assert.doesNotMatch(studio, /selectGuestCoffeePlaylists|useMemo/, "no live re-filtering on settings change");
  assert.match(studio, /onClick=\{assemble\}/);
  assert.match(studio, /const dirty = atmosphere !== null && atmosphere\.key !== currentKey/);
  assert.match(studio, /data-testid="biz-atmosphere-dirty"/, "changed settings prompt re-assembling");
  assert.match(studio, /data-testid="biz-atmosphere-stale"/, "the stale playlist says so itself");
  assert.match(studio, /data-testid="biz-atmosphere-assembling"/, "visible assembling moment");
  assert.match(studio, /prefers-reduced-motion/);
  assert.match(studio, /data-testid="biz-atmosphere-play"/);
  // Blocked starts are disabled; only pausing the playing track stays possible (review asm1).
  assert.match(studio, /disabled=\{!\(current && isPlaying\) && !canStart\}/);
  assert.match(studio, /data-testid="biz-atmosphere-tracks"/);
  assert.match(studio, /data-testid="biz-atmosphere-match"/);
  // Existing guest listening API and 30-minute meter only – no new endpoint, no payment.
  const endpoints = [...studio.matchAll(/fetch\("([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(endpoints, ["/api/business/guest/coffee/track-url", "/api/business/guest/coffee/usage"]);
  assert.doesNotMatch(studio, /checkout|payment|\/api\/payments/i);
  assert.match(settings, /\{action\}/, "the button sits in the settings card");
  assert.doesNotMatch(settings, /обновляются сразу/, "the old live-update promise is gone");
  for (const [file, code] of [["studio", studio], ["settings", settings], ["copy", copy], ["atmosphere", read("src/lib/business-app/guest-coffee/atmosphere.ts")]] as const) {
    const visible = code.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.doesNotMatch(visible, /—/, `${file}: en dashes only`);
  }
  // No DB migration in this step.
  assert.doesNotMatch(read("src/lib/business-app/guest-coffee/atmosphere.ts"), /supabase|from\(|rpc\(/);
}

console.log("business-guest-atmosphere-unit: OK");
