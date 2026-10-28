/**
 * Seeded cafe playlist mix.
 * Same album is not adjacent around the loop when the counts allow it.
 * One album larger than floor(n / 2) must leave some joins: a circle of n
 * seats can separate an album of k tracks only while k <= floor(n / 2).
 * The leftover joins are the minimum, 2k - n for that album.
 */
import assert from "node:assert/strict";

import { rankCafeQueue, type CafeQueueRanking, type CafeQueueTrack } from "../src/lib/business-app/cafe-queue/rank";
import { circularAlbumAdjacencies, minimumCircularAlbumAdjacencies, mulberry32 } from "../src/lib/business-app/cafe-queue/shuffle";
import type { CafeTrackSignals } from "../src/lib/business-app/cafe-queue/signals";
import type { GuestCoffeeSoundFeatures } from "../src/lib/business-app/guest-coffee/passport-features";

function sound(moods: string[]): GuestCoffeeSoundFeatures {
  const pack = (labels: string[]) => labels.map((label, index) => ({ label, weight: Number((1 - index * 0.1).toFixed(2)) }));
  return { genres: pack(["jazz"]), styles: [], moods: pack(moods), instruments: pack(["piano"]), character: [], bpm: null, energy: null };
}

function signals(energy: number, moods: string[] = ["calm", "peaceful"]): CafeTrackSignals {
  return { hasPassport: true, energy, loudnessLufs: -14, sound: sound(moods) };
}

function track(id: string, albumKey: string): CafeQueueTrack {
  return { audioItemId: id, albumKey };
}

const morning: CafeQueueRanking = { character: "cozy", direction: "calm", daypart: "morning", energyOffset: 0 };

function assertSeparated(order: readonly { albumKey: string }[], label: string) {
  const counts = new Map<string, number>();
  for (const item of order) counts.set(item.albumKey, (counts.get(item.albumKey) ?? 0) + 1);
  assert.equal(circularAlbumAdjacencies(order), minimumCircularAlbumAdjacencies([...counts.values()]), label);
}

{
  const rng = mulberry32(7);
  const draws = Array.from({ length: 20 }, () => rng());
  assert.equal(new Set(draws).size, 20);
  assert.deepEqual(
    Array.from({ length: 4 }, () => mulberry32(7)()),
    Array.from({ length: 4 }, () => mulberry32(7)()),
  );
}

{
  const pool = [
    track("a1", "album-a"), track("a2", "album-a"), track("a3", "album-a"),
    track("b1", "album-b"), track("b2", "album-b"),
    track("c1", "album-c"),
  ];
  const rows = Object.fromEntries(pool.map((item, index) => [item.audioItemId, signals(30 + index)]));
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40; seed += 1) {
    const order = rankCafeQueue(pool, new Map(Object.entries(rows)), { ...morning, seed });
    assert.equal(order.length, pool.length);
    assert.equal(new Set(order.map((item) => item.audioItemId)).size, pool.length);
    assertSeparated(order, `seed ${seed}`);
    seen.add(order.map((item) => item.audioItemId).join(","));
  }
  assert.ok(seen.size > 1, "different seeds do not all print the same playlist");
}

{
  // Five tracks of one album and one each from two others. A circle of 7
  // can keep an album of 5 apart only down to 2*5-7 = 3 joins.
  const pool = [
    ...Array.from({ length: 5 }, (_, index) => track(`a${index}`, "album-a")),
    track("b1", "album-b"),
    track("c1", "album-c"),
  ];
  const rows = Object.fromEntries(pool.map((item) => [item.audioItemId, signals(40)]));
  for (let seed = 1; seed <= 25; seed += 1) {
    const order = rankCafeQueue(pool, new Map(Object.entries(rows)), { ...morning, seed });
    assert.equal(circularAlbumAdjacencies(order), 3, `unavoidable joins stay at the minimum, seed ${seed}`);
    assert.equal(new Set(order.map((item) => item.albumKey)).size, 3, "the small albums are not dropped");
  }
}

{
  const only = [track("a1", "solo"), track("a2", "solo"), track("a3", "solo")];
  const rows = Object.fromEntries(only.map((item) => [item.audioItemId, signals(40)]));
  const order = rankCafeQueue(only, new Map(Object.entries(rows)), { ...morning, seed: 4 });
  assert.equal(circularAlbumAdjacencies(order), 3, "one album cannot be separated from itself");
}

{
  const pool = [track("a1", "album-a"), track("b1", "album-b"), track("c1", "album-c"), track("a2", "album-a")];
  const rows = Object.fromEntries(pool.map((item) => [item.audioItemId, signals(50)]));
  for (let seed = 1; seed <= 30; seed += 1) {
    const order = rankCafeQueue(pool, new Map(Object.entries(rows)), { ...morning, seed, boundaryAlbumKey: "album-a" });
    assert.notEqual(order[0]?.albumKey, "album-a", `seed ${seed} does not open on the album already playing`);
    assertSeparated(order, `boundary seed ${seed}`);
  }
}

{
  const fit = track("fit", "fit-album");
  const far = track("far", "far-album");
  const pool = [far, fit];
  const rows = {
    fit: signals(40, ["cheerful", "uplifting", "happy"]),
    far: signals(90, ["aggressive", "tense"]),
  };
  let fitAhead = 0;
  const seeds = 80;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const order = rankCafeQueue(pool, new Map(Object.entries(rows)), { ...morning, seed });
    if (order[0]?.audioItemId === "fit") fitAhead += 1;
  }
  assert.ok(fitAhead > seeds * 0.7, `morning-fitting track led ${fitAhead}/${seeds} mixes`);
}

{
  // Same artist, two albums: those albums may sit next to each other.
  const pool = [track("x1", "artist:one"), track("x2", "artist:two")];
  const rows = Object.fromEntries(pool.map((item) => [item.audioItemId, signals(40)]));
  const order = rankCafeQueue(pool, new Map(Object.entries(rows)), { ...morning, seed: 2 });
  assert.deepEqual(order.map((item) => item.audioItemId).sort(), ["x1", "x2"]);
  assert.notEqual(order[0]?.albumKey, order[1]?.albumKey);
}

console.log("business-playlist-shuffle-unit: PASS");
