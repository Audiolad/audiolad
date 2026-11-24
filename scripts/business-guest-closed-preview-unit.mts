/**
 * t1670u / t1671u – guest «Собрать атмосферу» preview from the closed catalogue «АудиоЛад
 * Кофейня»: 12 unique tracks, at most 2 vocal tracks (only from sound-fitting vocal albums),
 * 12 instrumental when there are no vocal albums, browser gets only the preset tracks.
 */
import assert from "node:assert/strict";

import { GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS } from "../src/lib/business-app/guest-coffee/atmosphere";
import type { GuestCoffeeProfile } from "../src/lib/business-app/guest-coffee/catalog";
import {
  GUEST_COFFEE_PREVIEW_VOCAL_TRACKS,
  assembleGuestCoffeePreviewAtmosphere,
  buildGuestCoffeeClosedShelf,
  buildGuestCoffeePreview,
  guestCoffeeAtmosphereFromPreset,
  guestCoffeeVocalSlots,
  type GuestCoffeeClosedAlbum,
} from "../src/lib/business-app/guest-coffee/closed-preview";
import { allGuestCoffeeProfiles, guestCoffeeProfileKey } from "../src/lib/business-app/guest-coffee/recommend";

const TITLES = ["Вишнёвое дерево", "Вечерний джаз у окна", "Мягкий свет", "Утро без суеты", "Город входит в ритм", "Романтичное фортепиано", "Джаз для работы", "Спокойный фон", "Огни за стеклом", "Кофе и свет"];

function album(i: number, hasVocals = false, n = 10): GuestCoffeeClosedAlbum {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    title: TITLES[i % TITLES.length] + (i >= TITLES.length ? ` ${i}` : ""),
    authorName: "АудиоЛад",
    hasVocals,
    coverUrl: null,
    tracks: Array.from({ length: n }, (_, k) => ({ audioItemId: `a${i}-t${k}`, title: `Трек ${i}.${k}`, durationSeconds: 180 + k })),
  };
}

const profile: GuestCoffeeProfile = { character: "cozy", direction: "jazz", daypart: "allday" };

// ---- shelf
{
  const shelf = buildGuestCoffeeClosedShelf([album(0), album(0), album(1, true), { ...album(2), tracks: [] }]);
  assert.equal(shelf.length, 2, "dedupe + albums without tracks dropped");
  for (const p of shelf) {
    assert.equal(p.closed, true);
    assert.equal(p.href, "", "no public page link");
    assert.equal(p.authorSlug, "");
  }
  assert.equal(shelf[1].hasVocals, true);
}

// ---- 0 vocal albums (prod today): 12 unique instrumental tracks, varied albums
{
  const shelf = buildGuestCoffeeClosedShelf(Array.from({ length: 10 }, (_, i) => album(i)));
  for (const p of allGuestCoffeeProfiles()) {
    const a = assembleGuestCoffeePreviewAtmosphere(shelf, p, null);
    assert.ok(a);
    assert.equal(a.tracks.length, GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS, guestCoffeeProfileKey(p));
    assert.equal(new Set(a.tracks.map((t) => t.audioItemId)).size, a.tracks.length, "unique tracks");
    assert.ok(new Set(a.tracks.map((t) => t.playlistId)).size >= 3, "at least 3 albums of the one closed label");
    const perAlbum = new Map<string, number>();
    for (const t of a.tracks) perAlbum.set(t.playlistId, (perAlbum.get(t.playlistId) ?? 0) + 1);
    if (!a.diversity.fallback) assert.ok(Math.max(...perAlbum.values()) <= 4, "no album gives more than 4 of 12");
  }
}

// ---- vocal albums: exactly 2 vocal of 12, spread
{
  const albums = [...Array.from({ length: 8 }, (_, i) => album(i)), album(20, true), album(21, true)];
  albums[8].title = "Вечерний джаз с голосом";
  albums[9].title = "Джаз и песни";
  const shelf = buildGuestCoffeeClosedShelf(albums);
  const vocalIds = new Set(shelf.filter((p) => p.hasVocals).flatMap((p) => p.tracks.map((t) => t.audioItemId)));
  const a = assembleGuestCoffeePreviewAtmosphere(shelf, profile, null);
  assert.ok(a);
  assert.equal(a.tracks.length, 12);
  assert.equal(new Set(a.tracks.map((t) => t.audioItemId)).size, 12);
  const vocalPositions = a.tracks.flatMap((t, i) => (vocalIds.has(t.audioItemId) ? [i] : []));
  assert.equal(vocalPositions.length, GUEST_COFFEE_PREVIEW_VOCAL_TRACKS, "2 with vocals, 10 without");
  assert.deepEqual(vocalPositions, guestCoffeeVocalSlots(12, 2));
  assert.deepEqual(guestCoffeeVocalSlots(12, 2), [3, 7]);
  assert.equal(a.match.direction.of, a.sources.length, "match counts every contributing album");

  // Vocal albums that do not fit the sound type → filled with instrumental tracks.
  const calm = assembleGuestCoffeePreviewAtmosphere(shelf, { character: "cozy", direction: "melodic", daypart: "allday" }, null);
  assert.ok(calm);
  assert.equal(calm.tracks.length, 12);
  assert.ok(calm.tracks.filter((t) => vocalIds.has(t.audioItemId)).length <= GUEST_COFFEE_PREVIEW_VOCAL_TRACKS);

  // Only one vocal track available → 1 vocal + 11 instrumental.
  const one = buildGuestCoffeeClosedShelf([...Array.from({ length: 8 }, (_, i) => album(i)), { ...album(22, true, 1), title: "Джаз с голосом" }]);
  const oneVocal = new Set(one.filter((p) => p.hasVocals).flatMap((p) => p.tracks.map((t) => t.audioItemId)));
  const b = assembleGuestCoffeePreviewAtmosphere(one, profile, null);
  assert.ok(b);
  assert.equal(b.tracks.length, 12);
  assert.equal(b.tracks.filter((t) => oneVocal.has(t.audioItemId)).length, 1);
}

// ---- presets: browser gets only the preset tracks; rehydration is exact
{
  const shelf = buildGuestCoffeeClosedShelf(Array.from({ length: 34 }, (_, i) => album(i, false, 10)));
  const total = shelf.reduce((s, p) => s + p.tracks.length, 0);
  const preview = buildGuestCoffeePreview(shelf, null);
  assert.equal(Object.keys(preview.presets).length, 64);
  const sent = preview.playlists.reduce((s, p) => s + p.tracks.length, 0);
  assert.ok(sent < total, `trimmed: ${sent} of ${total} tracks`);
  const sentIds = new Set(preview.playlists.flatMap((p) => p.tracks.map((t) => t.audioItemId)));
  for (const p of allGuestCoffeeProfiles()) {
    const key = guestCoffeeProfileKey(p);
    const preset = preview.presets[key];
    const a = guestCoffeeAtmosphereFromPreset(key, preset, preview.playlists);
    for (const t of a?.tracks ?? []) assert.ok(sentIds.has(t.audioItemId));
    const direct = assembleGuestCoffeePreviewAtmosphere(shelf, p, null);
    assert.deepEqual(a, direct, `${key}: preset = server assembly`);
  }
  assert.equal(guestCoffeeAtmosphereFromPreset("cozy|jazz|allday", undefined, preview.playlists), null);
  assert.equal(guestCoffeeAtmosphereFromPreset("bogus", Object.values(preview.presets)[0], preview.playlists), null);
  assert.ok(JSON.stringify(preview.presets).length < 64 * 400, "compact presets");
  assert.deepEqual(buildGuestCoffeePreview([], null), { playlists: [], presets: {} });
}

console.log("business-guest-closed-preview-unit: ok");
