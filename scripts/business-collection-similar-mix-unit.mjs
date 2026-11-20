import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectPersonalVenuePool } from "../src/lib/business-collections/venue-pool.mjs";
import {
  CLAP_VECTOR_SIZE,
  collectionShareLabel,
  cosineSimilarity,
  clapCentroid,
  energyWindow,
  normalizeCollectionSharePercent,
  pickSimilarTracks,
  readClapVector,
  similarCount,
} from "../src/lib/business-collections/similar-mix.mjs";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function vec(axis, weight = 1) {
  const vector = new Float64Array(CLAP_VECTOR_SIZE);
  vector[axis] = weight;
  return vector;
}

assert.equal(normalizeCollectionSharePercent(null), 50);
assert.equal(normalizeCollectionSharePercent(undefined), 50);
assert.equal(normalizeCollectionSharePercent(49), 50);
assert.equal(normalizeCollectionSharePercent(96), 50);
assert.equal(normalizeCollectionSharePercent(70.5), 50);
assert.equal(normalizeCollectionSharePercent("80"), 80);
assert.equal(normalizeCollectionSharePercent(95), 95);
assert.equal(collectionShareLabel(70), "70 на 30");
assert.equal(collectionShareLabel(null), "50 на 50");

assert.equal(similarCount(19, 50, 228), 19);
assert.equal(similarCount(19, 70, 228), 8);
assert.equal(similarCount(19, 90, 228), 2, "p>=90 has no hard minimum");
assert.equal(similarCount(19, 95, 228), 1);
assert.equal(similarCount(5, 50, 228), 5, "short collections keep the chosen ratio");
assert.equal(similarCount(200, 50, 228), 80, "cap 80");
assert.equal(similarCount(19, 50, 10), 10, "cannot exceed remaining catalog");
assert.equal(similarCount(0, 50, 100), 0);
assert.equal(similarCount(19, 50, 0), 0);
// Soft floor of 8 only when it would not drop share more than 5 points below p.
assert.equal(similarCount(7, 50, 228), 8, "N=7 at 50/50 may lift 7 to 8 (share still >= 45)");
assert.equal(similarCount(15, 70, 228), 8, "N=15 at 70/30 lifts 6 to 8 (share still >= 65)");
assert.equal(similarCount(5, 80, 228), 1, "short collection at 80/20 stays 5+1, not 5+8");

assert.deepEqual(energyWindow([56, 81]), { lo: 48, hi: 89 });
assert.equal(energyWindow([]), null);
assert.equal(energyWindow([null, undefined]), null);

const first = vec(0);
const second = vec(1);
assert.equal(cosineSimilarity(first, first), 1);
assert.ok(Math.abs(cosineSimilarity(first, second)) < 1e-12);
const mid = clapCentroid([vec(0, 3), vec(1, 4)]);
assert.ok(mid);
assert.ok(Math.abs(Math.hypot(...mid) - 1) < 1e-9);
assert.ok(cosineSimilarity(mid, vec(1)) > cosineSimilarity(mid, vec(0)));

assert.equal(readClapVector({ embedding: first }), null, "embedding must be an object with vector[]");
const stored = { embedding: { vector: Array.from(first), dimension: 512, normalized: "l2", pooling: "mean" } };
assert.deepEqual(Array.from(readClapVector(stored)), Array.from(first));
assert.equal(readClapVector({ embedding: { vector: [1, 2] } }), null);

const collection = [{ audioItemId: "c1" }, { audioItemId: "c2" }];
const candidates = [
  { audioItemId: "c1" },
  { audioItemId: "near" },
  { audioItemId: "far" },
  { audioItemId: "outside" },
  { audioItemId: "mid" },
];
const vectors = new Map([
  ["c1", vec(0)],
  ["c2", vec(0)],
  ["near", vec(0)],
  ["far", vec(8)],
  ["outside", vec(0)],
  ["mid", vec(1)],
]);
const energy = new Map([
  ["c1", 60],
  ["c2", 70],
  ["near", 65],
  ["far", 20],
  ["outside", 20],
  ["mid", 64],
]);
const picked = pickSimilarTracks({
  collection, candidates, sharePercent: 50, vectors, energy,
});
assert.deepEqual(picked.map((row) => row.audioItemId), ["near", "mid"], "top by CLAP, energy window applied, collection ids excluded");

const tagged = pickSimilarTracks({
  collection,
  candidates: [{ audioItemId: "tag-high" }, { audioItemId: "tag-low" }],
  sharePercent: 50,
  vectors: new Map(),
  energy: new Map([["c1", 60], ["c2", 60], ["tag-high", 60], ["tag-low", 60]]),
  tagSimilarity: (referenceId, candidateId) => (candidateId === "tag-high" ? 0.9 : 0.1),
});
assert.deepEqual(tagged.map((row) => row.audioItemId), ["tag-high", "tag-low"], "tag fallback when vectors are missing");

const tracks = Array.from({ length: 12 }, (_, index) => ({ audioItemId: `t${index}` }));
const collectionOnly = await selectPersonalVenuePool(tracks, async () => ["t1", "t2"], async () => true, async () => [tracks[5]]);
assert.deepEqual(collectionOnly, [tracks[1], tracks[2]], "trial does not leak similar tracks");
const paid = await selectPersonalVenuePool(tracks, async () => ["t1", "t2"], async () => false, async () => [tracks[5], tracks[6]]);
assert.deepEqual(paid, [tracks[1], tracks[2], tracks[5], tracks[6]]);
assert.equal(await selectPersonalVenuePool(tracks, async () => [], async () => true), "collection_unavailable");
assert.equal(await selectPersonalVenuePool(tracks, async () => [], async () => false), tracks);
assert.deepEqual(
  await selectPersonalVenuePool(tracks, async () => ["t1"], async () => false, async () => { throw new Error("mix"); }),
  [tracks[1]],
);

assert.doesNotMatch(source("src/lib/business-collections/venue-pool.mjs"), /rankCafeQueue|spa-player-engine/);
assert.doesNotMatch(source("src/lib/business-workspace/load.server.ts"), /rankCafeQueue/);
assert.match(source("src/lib/business-workspace/load.server.ts"), /loadPaidSimilarMix/);
assert.match(source("supabase/migrations/20270405120000_business_personal_collection_share_percent.sql"), /ADD COLUMN collection_share_percent smallint DEFAULT 50/);
assert.match(source("supabase/migrations/20270405120000_business_personal_collection_share_percent.sql"), /DROP COLUMN IF EXISTS collection_share_percent/);
assert.doesNotMatch(source("supabase/migrations/20270405120000_business_personal_collection_share_percent.sql"), /GRANT /);
assert.match(source("supabase/rollbacks/20270405120000_business_personal_collection_share_percent.rollback.sql"), /DROP COLUMN IF EXISTS collection_share_percent/);

console.log("business-collection-similar-mix-unit: PASS");
