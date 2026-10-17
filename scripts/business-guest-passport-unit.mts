#!/usr/bin/env -S npx tsx
/**
 * a8240527 (passport stage, Sergey 17.10.2026 – Core clarifications 5ff3ce84 / d1e867c1):
 * music passports as the hidden basis of the coffee-shop recommendations, with the editorial
 * tags as the reserve. Pure checks on the real shelf tags, the live passport Sergey showed
 * («Солнечное утро в Риме») and clearly synthetic test passports; 64-setting regression;
 * contract that no passport data reaches the browser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import fixtures from "./fixtures/business-guest-passport-fixtures.json" with { type: "json" };
import {
  GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES,
  GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS,
  assembleGuestCoffeeAtmosphere,
} from "../src/lib/business-app/guest-coffee/atmosphere";
import {
  GUEST_COFFEE_DIRECTIONS,
  GUEST_COFFEE_SHELF,
  GUEST_COFFEE_SOUND_LABELS,
  findGuestCoffeeTrack,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
} from "../src/lib/business-app/guest-coffee/catalog";
import {
  GUEST_COFFEE_BPM_MIN_CONFIDENCE,
  guestCoffeeFeaturesFromPassport,
  type GuestCoffeePassportAttributeRow,
  type GuestCoffeePassportVersionRow,
  type GuestCoffeeSoundFeatures,
} from "../src/lib/business-app/guest-coffee/passport-features";
import { queryGuestCoffeePassportFeatures, type GuestCoffeePassportClient } from "../src/lib/business-app/guest-coffee/passport-query";
import {
  GUEST_COFFEE_FIT_THRESHOLD,
  allGuestCoffeeProfiles,
  buildGuestCoffeeAlbumRankings,
  buildGuestCoffeeRecommendationPlan,
  guestCoffeePassportWeight,
  guestCoffeeProfileKey,
  guestCoffeeRecommendation,
  guestCoffeeTrackAffinity,
  rankGuestCoffeeAlbums,
  type GuestCoffeeRecommendationPlan,
} from "../src/lib/business-app/guest-coffee/recommend";

const read = (p: string) => readFileSync(p, "utf8");
const ROME = fixtures.sunnyMorningRome;
const version = (structured: unknown, over: Partial<GuestCoffeePassportVersionRow> = {}): GuestCoffeePassportVersionRow => ({
  id: "v1", audio_item_id: "t1", status: "active", sealed_at: "2026-10-17T00:00:00Z", ceased_at: null, structured_fields: structured, ...over,
});
const synth = (k: keyof typeof fixtures.synthetic, id = "x") => guestCoffeeFeaturesFromPassport(version(fixtures.synthetic[k], { id }), [])!;

// ---------------------------------------------------------------- the live passport «Солнечное утро в Риме»
const rome = guestCoffeeFeaturesFromPassport(ROME.version as GuestCoffeePassportVersionRow, []);
assert.ok(rome, "usable passport");
assert.equal(rome.bpm, null, "BPM 85.2 is a LOW-confidence candidate (raw 170.5 failed the gate) – never used");
assert.equal(rome.energy, null);
assert.deepEqual(rome.genres.map((g) => g.label), ["jazz", "blues", "new age"]);
assert.deepEqual(rome.styles.map((g) => g.label), ["lounge", "contemporary", "smooth jazz"]);
assert.deepEqual(rome.instruments.map((g) => g.label), ["electric piano", "piano", "harp", "grand piano", "strings"]);
assert.ok(!("key" in rome) && !("loudness" in rome), "key / mode / loudness carry no meaning here");
const romeAff = guestCoffeeTrackAffinity(rome);
// Sergey's multi-category hypothesis: warm + calm + romantic + piano / harp → calm, melodic, cozy.
for (const s of ["calm", "melodic", "jazz"] as const) assert.ok(romeAff.sound[s] >= GUEST_COFFEE_FIT_THRESHOLD, `Rome fits ${s}`);
assert.ok(romeAff.sound.rhythm < GUEST_COFFEE_FIT_THRESHOLD, "not «Лёгкий ритм»");
assert.ok(romeAff.character.cozy >= GUEST_COFFEE_FIT_THRESHOLD && romeAff.character.city < GUEST_COFFEE_FIT_THRESHOLD);
assert.ok(romeAff.daypart.evening >= GUEST_COFFEE_FIT_THRESHOLD, "dreamy / romantic → evening too");
// A different key or loudness changes nothing.
const romeOtherKey = guestCoffeeFeaturesFromPassport(version({ ...ROME.version.structured_fields, key: { published: "C", published_mode: "major", candidate: null, candidate_mode: null }, loudness_lufs: -20 }), [])!;
assert.deepEqual(guestCoffeeTrackAffinity(romeOtherKey), romeAff);

// ---------------------------------------------------------------- reliability of tempo / energy
{
  const sf = ROME.version.structured_fields;
  const attr = (key: string, value: number, confidence: number, origin = "measured"): GuestCoffeePassportAttributeRow =>
    ({ passport_id: "v1", attribute_key: key, origin, value_numeric: value, value_text: null, confidence });
  const low = guestCoffeeFeaturesFromPassport(version(sf), [attr("bpm", 85.2, 0.3)])!;
  assert.equal(low.bpm, null, `confidence below ${GUEST_COFFEE_BPM_MIN_CONFIDENCE} → ignored`);
  assert.deepEqual(guestCoffeeTrackAffinity(low), romeAff, "low-confidence BPM changes nothing");
  assert.equal(guestCoffeeFeaturesFromPassport(version(sf), [attr("bpm", 85.2, 0.9, "interpreted")])!.bpm, null, "only a measured BPM");
  assert.equal(guestCoffeeFeaturesFromPassport(version(sf), [{ ...attr("bpm", 85.2, 0.9), passport_id: "other" }])!.bpm, null, "another passport's row is ignored");
  assert.equal(guestCoffeeFeaturesFromPassport(version(sf), [attr("bpm", 400, 0.95)])!.bpm, null, "implausible BPM ignored");
  const fast = guestCoffeeFeaturesFromPassport(version(sf), [attr("bpm", "150" as unknown as number, "0.92" as unknown as number)])!;
  assert.equal(fast.bpm, 150, "numeric strings from PostgREST numeric are read");
  assert.ok(guestCoffeeTrackAffinity(fast).sound.calm < romeAff.sound.calm, "a reliable fast tempo lowers «Спокойный фон»");
  const energetic = guestCoffeeFeaturesFromPassport(version(sf), [attr("energy", 0.95, 0.9)])!;
  assert.equal(energetic.energy, 0.95);
  assert.ok(guestCoffeeTrackAffinity(energetic).sound.rhythm > romeAff.sound.rhythm);
  assert.equal(guestCoffeeFeaturesFromPassport(version(sf), [attr("energy", 0.95, 0.4)])!.energy, null, "low-confidence energy ignored");
}

// ---------------------------------------------------------------- NO_PASSPORT cases
assert.equal(guestCoffeeFeaturesFromPassport(null), null);
assert.equal(guestCoffeeFeaturesFromPassport(version(ROME.version.structured_fields, { status: "superseded" })), null, "superseded");
assert.equal(guestCoffeeFeaturesFromPassport(version(ROME.version.structured_fields, { sealed_at: null })), null, "unsealed = invisible");
assert.equal(guestCoffeeFeaturesFromPassport(version(ROME.version.structured_fields, { ceased_at: "2026-10-18T00:00:00Z" })), null, "ceased");
assert.equal(guestCoffeeFeaturesFromPassport(version({ bpm: { published: 90 } })), null, "no sound labels → not usable");
const fromAttrs = guestCoffeeFeaturesFromPassport(version(null), [
  { passport_id: "v1", attribute_key: "mood", origin: "measured", value_numeric: null, value_text: "calm", confidence: 0.31 },
  { passport_id: "v1", attribute_key: "instrument", origin: "interpreted", value_numeric: null, value_text: "piano", confidence: null },
]);
assert.ok(fromAttrs && fromAttrs.moods[0].label === "calm" && fromAttrs.instruments[0].label === "piano", "attribute rows serve when no snapshot");

// ---------------------------------------------------------------- coverage → passport weight
assert.equal(guestCoffeePassportWeight(0, 8), 0);
assert.equal(guestCoffeePassportWeight(3, 8), 0, "partial album (< 50 %) → editorial reserve");
assert.equal(guestCoffeePassportWeight(1, 2), 0, "a single covered track of two is not an album basis");
assert.equal(guestCoffeePassportWeight(1, 1), 0.8, "a one-track album fully covered");
assert.equal(guestCoffeePassportWeight(4, 8), 0.6);
assert.equal(guestCoffeePassportWeight(8, 8), 0.8, "editorial stays a 20 % reserve even at full coverage");

// ---------------------------------------------------------------- the real shelf (tags as in production)
const shelf: GuestCoffeePlaylist[] = GUEST_COFFEE_SHELF.map((ref) => ({
  id: `p-${ref.productSlug}`, authorSlug: ref.authorSlug, productSlug: ref.productSlug, title: ref.productSlug, authorName: ref.authorSlug,
  href: `https://audiolad.ru/practice/${ref.authorSlug}/${ref.productSlug}`, coverUrl: null, coverImage: null, updatedAt: null, format: null,
  direction: ref.direction, ...(ref.sounds ? { sounds: ref.sounds } : {}), dayparts: ref.dayparts, characters: ref.characters,
  tracks: Array.from({ length: 8 }, (_, i) => ({
    audioItemId: ref.productSlug === "italyanskiy-dzhaz" && i === 3 ? ROME.audioItemId : `${ref.productSlug}-t${i}`,
    title: `${ref.productSlug} ${i}`, durationSeconds: 150 + i * 10,
  })),
}));
const P = (slug: string) => `p-${slug}`;
const featuresFor = (entries: Array<[string, GuestCoffeeSoundFeatures, number?]>) => {
  const m = new Map<string, GuestCoffeeSoundFeatures>();
  for (const [slug, f, n = 8] of entries) for (let i = 0; i < n; i++) m.set(`${slug}-t${i}`, f);
  return m;
};

// Labels: one constant, the working labels of 17.10.2026.
assert.deepEqual(GUEST_COFFEE_DIRECTIONS.map((d) => d.label), Object.values(GUEST_COFFEE_SOUND_LABELS));
assert.deepEqual(Object.values(GUEST_COFFEE_SOUND_LABELS), ["Джаз", "Спокойный фон", "Лёгкий ритм", "Мелодичная музыка"]);

// ---------------------------------------------------------------- concrete shelf changes with passports
const editorialPlan = buildGuestCoffeeRecommendationPlan(shelf);
const calmMorningCozy: GuestCoffeeProfile = { character: "cozy", direction: "calm", daypart: "morning" };
const rhythmDayCity: GuestCoffeeProfile = { character: "city", direction: "rhythm", daypart: "day" };
{
  // «Джаз для работы» (editorial: jazz + rhythm, city) – if its passports say calm piano, it
  // joins «Спокойный фон · Утро · Уютная»; «Часы отеля» (editorial: sax, classic / evening) –
  // if its passports say upbeat bossa, it leads «Лёгкий ритм · День · Городская».
  const features = featuresFor([["dzhaz-dlya-raboty", synth("calmPiano")], ["chasy-otelya-muzyka-dlya-oteley-i-restoranov", synth("upbeatBossa")]]);
  const plan = buildGuestCoffeeRecommendationPlan(shelf, features);
  const k1 = guestCoffeeProfileKey(calmMorningCozy);
  assert.ok(!editorialPlan.entries[k1].ids.slice(0, 4).includes(P("dzhaz-dlya-raboty")), "editorial only: not a calm album");
  assert.ok(plan.entries[k1].ids.slice(0, 4).includes(P("dzhaz-dlya-raboty")), "passport: calm piano sound → in the calm morning playlist");
  const k2 = guestCoffeeProfileKey(rhythmDayCity);
  assert.notEqual(editorialPlan.entries[k2].ids[0], P("chasy-otelya-muzyka-dlya-oteley-i-restoranov"));
  assert.equal(plan.entries[k2].ids[0], P("chasy-otelya-muzyka-dlya-oteley-i-restoranov"), "passport: upbeat bossa sound → first for light rhythm by day");
  const a = assembleGuestCoffeeAtmosphere(shelf, rhythmDayCity, plan)!;
  assert.equal(a.sources[0].id, P("chasy-otelya-muzyka-dlya-oteley-i-restoranov"));
  assert.equal(a.match.direction.state, "all");
  // The same features on only 3 of 8 tracks: partial coverage → the album keeps its editorial place.
  const partial = buildGuestCoffeeRecommendationPlan(shelf, featuresFor([["chasy-otelya-muzyka-dlya-oteley-i-restoranov", synth("upbeatBossa"), 3]]));
  assert.deepEqual(partial.entries[k2].ids, editorialPlan.entries[k2].ids, "partial coverage → editorial album ranking");
  // A passport that contradicts the editorial genre moves the album down – no hard genre filter either way.
  const contra = buildGuestCoffeeRecommendationPlan(shelf, featuresFor([["vecherniy-dzhaz", synth("upbeatBossa")]]));
  const k3 = guestCoffeeProfileKey({ character: "evening", direction: "jazz", daypart: "evening" });
  assert.equal(editorialPlan.entries[k3].ids[0], P("vecherniy-dzhaz"));
  assert.notEqual(contra.entries[k3].ids[0], P("vecherniy-dzhaz"), "upbeat daytime sound is not the first evening album");
}

// ---------------------------------------------------------------- one real track: track-level effect, album stays editorial
{
  const features = new Map([[ROME.audioItemId, rome]]);
  const rankings = buildGuestCoffeeAlbumRankings(shelf, features);
  const it = rankings.find((r) => r.id === P("italyanskiy-dzhaz"))!;
  assert.deepEqual([it.covered, it.total, it.basis], [1, 8, "editorial"], "1 of 8 tracks is not an album passport");
  const ranked = rankGuestCoffeeAlbums(shelf, rankings, { character: "cozy", direction: "melodic", daypart: "evening" });
  const entry = ranked.find((r) => r.id === P("italyanskiy-dzhaz"))!;
  assert.equal(entry.order?.[0], 3, "«Солнечное утро в Риме» comes first in its album for a cozy melodic evening");
  const editorialRanked = rankGuestCoffeeAlbums(shelf, buildGuestCoffeeAlbumRankings(shelf), { character: "cozy", direction: "melodic", daypart: "evening" });
  assert.deepEqual(ranked.map((r) => r.id), editorialRanked.map((r) => r.id), "album order unchanged by one track");
  const rhythmEntry = rankGuestCoffeeAlbums(shelf, rankings, rhythmDayCity).find((r) => r.id === P("italyanskiy-dzhaz"))!;
  assert.notEqual(rhythmEntry.order?.[0], 3, "…but not first for light rhythm in a city coffee shop by day");
}

// ---------------------------------------------------------------- 64 settings: never empty, only shelf tracks, deterministic
const mixedFeatures = featuresFor([
  ["dzhaz-dlya-raboty", synth("calmPiano")],
  ["chasy-otelya-muzyka-dlya-oteley-i-restoranov", synth("upbeatBossa")],
  ["dzhaz-na-saksofone", synth("eveningSax")],
  ["myagkiy-dzhaz", synth("eveningSax"), 3],
]);
mixedFeatures.set(ROME.audioItemId, rome);
const plans: Array<[string, GuestCoffeeRecommendationPlan | null]> = [
  ["passport", buildGuestCoffeeRecommendationPlan(shelf, mixedFeatures)],
  ["editorial", editorialPlan],
  ["no plan", null],
];
const shelfIds = new Set(shelf.map((p) => p.id));
for (const [name, plan] of plans) {
  if (plan) {
    assert.equal(Object.keys(plan.entries).length, 64);
    assert.deepEqual(buildGuestCoffeeRecommendationPlan(shelf, name === "passport" ? mixedFeatures : new Map()), plan, "deterministic plan");
  }
  for (const profile of allGuestCoffeeProfiles()) {
    const key = guestCoffeeProfileKey(profile);
    if (plan) {
      const e = plan.entries[key];
      assert.ok(e.ids.length >= 1 && e.ids.length <= 6 && new Set(e.ids).size === e.ids.length && e.ids.every((id) => shelfIds.has(id)), `${name} ${key}: ids`);
      assert.ok(e.fits.every((f) => /^[01]{3}$/.test(f)) && e.fits.length === e.ids.length);
      e.order.forEach((o, i) => {
        if (o === null) return;
        const n = shelf.find((p) => p.id === e.ids[i])!.tracks.length;
        assert.deepEqual([...o].sort((x, y) => x - y), Array.from({ length: n }, (_, k) => k), "order is a permutation");
      });
    }
    const rec = guestCoffeeRecommendation(shelf, profile, plan);
    assert.equal(rec.albums.length, shelf.length, `${name} ${key}: every album ranked, nothing dropped`);
    assert.equal(rec.soundFallback, false, `${name} ${key}: every sound type has fitting albums on the real shelf`);
    const a = assembleGuestCoffeeAtmosphere(shelf, profile, plan);
    assert.ok(a && a.tracks.length >= 1 && a.tracks.length <= GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS, `${name} ${key}: not empty`);
    assert.ok(a.sources.length <= GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES);
    assert.equal(new Set(a.tracks.map((t) => t.audioItemId)).size, a.tracks.length, "no duplicates");
    for (const t of a.tracks) assert.equal(findGuestCoffeeTrack(shelf, t.audioItemId)?.playlist.id, t.playlistId, "only shelf tracks");
    assert.ok(a.match.direction.matched >= 1, `${name} ${key}: at least one album of the chosen sound type`);
    assert.deepEqual(assembleGuestCoffeeAtmosphere(shelf, profile, plan), a, "deterministic");
  }
}

// ---------------------------------------------------------------- fallback paths of the plan
{
  const profile = calmMorningCozy;
  const base = assembleGuestCoffeeAtmosphere(shelf, profile, null)!;
  assert.deepEqual(assembleGuestCoffeeAtmosphere(shelf, profile, editorialPlan), base, "no plan = editorial plan");
  const key = guestCoffeeProfileKey(profile);
  const bogus: GuestCoffeeRecommendationPlan = {
    version: 1,
    entries: { [key]: { ids: ["unknown-album", P("myagkiy-dzhaz"), P("myagkiy-dzhaz")], fits: ["111", "111", "111"], order: [null, [9, 9, 9], null] } },
  };
  const b = assembleGuestCoffeeAtmosphere(shelf, profile, bogus)!;
  assert.ok(b.tracks.every((t) => findGuestCoffeeTrack(shelf, t.audioItemId)), "unknown ids ignored, invalid order ignored");
  assert.equal(b.sources[0].id, P("myagkiy-dzhaz"));
  assert.deepEqual(b.tracks.filter((t) => t.playlistId === P("myagkiy-dzhaz")).map((t) => t.audioItemId).slice(0, 1), ["myagkiy-dzhaz-t0"], "invalid order → album order");
  assert.deepEqual(assembleGuestCoffeeAtmosphere(shelf, profile, { version: 2 } as unknown as GuestCoffeeRecommendationPlan), base, "unknown plan version → editorial");
  // An album that became unavailable after the plan was built (paid, unpublished) never comes back.
  const passportPlan = plans[0][1]!;
  const gone = passportPlan.entries[key].ids[0];
  const without = shelf.filter((p) => p.id !== gone);
  const c = assembleGuestCoffeeAtmosphere(without, profile, passportPlan)!;
  assert.ok(c.sources.every((s) => s.id !== gone) && c.tracks.every((t) => t.playlistId !== gone));
  assert.equal(assembleGuestCoffeeAtmosphere([], profile, passportPlan), null);
}

// ---------------------------------------------------------------- server read: batched, read-only, fail-safe
{
  const calls: Array<{ table: string; columns: string; filters: string[] }> = [];
  const passports = new Map<string, GuestCoffeePassportVersionRow>([
    [ROME.audioItemId, ROME.version as GuestCoffeePassportVersionRow],
  ]);
  const client = (fail = false): GuestCoffeePassportClient => ({
    from: (table) => ({
      select: (columns) => ({
        in: (column, values) => {
          const call = { table, columns, filters: [`in:${column}:${values.length}`] };
          calls.push(call);
          const rows = table === "music_passport_versions"
            ? values.flatMap((v) => (passports.has(v) ? [passports.get(v)!] : []))
            : [];
          const result = Promise.resolve(fail ? { data: null, error: { message: "boom" } } : { data: rows, error: null });
          return Object.assign(result, {
            eq: (c: string, v: string) => {
              call.filters.push(`eq:${c}:${v}`);
              return {
                is: (c2: string) => {
                  call.filters.push(`is:${c2}:null`);
                  return { not: (c3: string, op: string) => { call.filters.push(`not:${c3}:${op}:null`); return result; } };
                },
              };
            },
          });
        },
      }),
    }),
  });
  const ids = shelf.flatMap((p) => p.tracks.map((t) => t.audioItemId));
  const got = await queryGuestCoffeePassportFeatures(client(), ids);
  assert.deepEqual([...got.keys()], [ROME.audioItemId]);
  const versionCalls = calls.filter((c) => c.table === "music_passport_versions");
  assert.equal(versionCalls.length, Math.ceil(ids.length / 50), "chunked, no per-album / per-track queries");
  assert.equal(calls.filter((c) => c.table === "music_passport_attributes").length, 1);
  assert.ok(versionCalls.every((c) => c.filters.includes("eq:status:active") && c.filters.includes("is:ceased_at:null") && c.filters.includes("not:sealed_at:is:null")), "only active sealed versions");
  assert.ok(calls.every((c) => ["music_passport_versions", "music_passport_attributes"].includes(c.table)), "only the two passport tables");
  await assert.rejects(queryGuestCoffeePassportFeatures(client(true), ids), /guest_coffee_passport_versions_unavailable/);
}

// ---------------------------------------------------------------- contract: no passport data / service role in the browser
{
  const plan = plans[0][1]!;
  // Ids are the shelf's own album ids (checked above); everything else must be bare structure.
  const json = JSON.stringify({ keys: Object.keys(plan.entries), rest: Object.values(plan.entries).map((e) => ({ fits: e.fits, order: e.order })) });
  assert.deepEqual(Object.keys(plan).sort(), ["entries", "version"]);
  for (const e of Object.values(plan.entries)) assert.deepEqual(Object.keys(e).sort(), ["fits", "ids", "order"]);
  for (const leak of ["smooth jazz", "romantic", "harp", "new age", "rich", "lounge", "85.2", "170.5", "confidence", "coverage", "bpm", "score", "label"]) {
    assert.ok(!json.toLowerCase().includes(leak), `plan carries no passport detail: ${leak}`);
  }
  const studio = read("src/components/business-app/sound/BusinessSoundStudio.tsx");
  const settings = read("src/components/business-app/sound/BusinessSoundSettings.tsx");
  const section = read("src/components/business-app/sound/BusinessMusicSection.tsx");
  const server = read("src/lib/business-app/guest-coffee/passport.server.ts");
  const recommend = read("src/lib/business-app/guest-coffee/recommend.ts");
  const atmosphere = read("src/lib/business-app/guest-coffee/atmosphere.ts");
  const route = read("src/app/api/business/guest/coffee/track-url/route.ts");
  for (const [name, src] of [["studio", studio], ["settings", settings], ["recommend", recommend], ["atmosphere", atmosphere]] as const) {
    assert.doesNotMatch(src, /passport\.server|passport-query|service-role|SUPABASE_SERVICE_ROLE|music_passport_/, `${name}: no server passport access`);
  }
  assert.doesNotMatch(studio + settings, /passport-features/, "client components never import the feature parser");
  assert.match(server, /^import "server-only";/, "the adapter is server-only");
  assert.match(section, /plan=\{plan\}/);
  assert.doesNotMatch(section, /features=|passport=\{/, "only the plan is passed to the client component");
  assert.match(studio, /plan\?: GuestCoffeeRecommendationPlan \| null/);
  // Rights / limit path unchanged: the stream URL is signed only for shelf tracks, after the fresh free check and the server meter.
  const routes = read("src/lib/business-app/guest-coffee/routes.ts");
  assert.doesNotMatch(route + routes, /recommend|passport/, "the passport never decides what may be played");
  assert.match(route, /loadShelf: loadGuestCoffeeShelf/);
  assert.match(route, /isStillFree: isGuestCoffeePlaylistStillFree/);
  assert.match(routes, /findGuestCoffeeTrack\(await deps\.loadShelf\(\), audioItemId\)/, "shelf membership check unchanged");
  // Visible text: en dash only, no technical passport words in the UI copy.
  for (const f of ["src/lib/business-app/guest-coffee/copy.ts", "src/lib/business-app/guest-coffee/recommend.ts", "src/lib/business-app/guest-coffee/passport-features.ts", "src/lib/business-app/guest-coffee/passport.server.ts", "src/lib/business-app/guest-coffee/passport-query.ts", "src/lib/business-app/guest-coffee/catalog.ts"]) {
    assert.doesNotMatch(read(f), /—/, `${f}: en dashes only`);
  }
  const copy = read("src/lib/business-app/guest-coffee/copy.ts");
  assert.doesNotMatch(copy, /BPM|уверенност|паспорт|confidence/i, "no technical details or confidence in the UI copy");
}

console.log("business-guest-passport-unit: OK");
