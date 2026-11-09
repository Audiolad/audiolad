#!/usr/bin/env npx tsx
/**
 * Hall / owner queue auto top-up (t1327u): trigger, splice, ahead count, no repeats, failure fallback.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CAFE_QUEUE_RECENT_RING,
  CAFE_QUEUE_TOPUP_NOTE,
  CAFE_QUEUE_TOPUP_THRESHOLD,
  appendExcludedIds,
  createQueueTopUpGuard,
  nextTopUpBackoffMs,
  pushRecentIdsToBack,
  rememberPlayedId,
  shouldTopUpQueue,
  spliceTopUpOrder,
  uniqueAheadCount,
  queueTopUpOwnsPlayback,
} from "../src/lib/business-app/cafe-queue/auto-topup";
import { cafeUniqueAhead } from "../src/lib/business-app/cafe-queue/order";
import { parseCafeQueueRequest } from "../src/lib/business-app/cafe-queue/request";
import { CAFE_QUEUE_EXCLUDE_LIMIT } from "../src/lib/business-app/cafe-queue/prefs";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

assert.equal(CAFE_QUEUE_TOPUP_THRESHOLD, 25);
assert.equal(CAFE_QUEUE_RECENT_RING, 180);
assert.equal(CAFE_QUEUE_TOPUP_NOTE, "Очередь обновляется сама");
assert.equal(CAFE_QUEUE_TOPUP_NOTE.includes("—"), false);
assert.equal(CAFE_QUEUE_TOPUP_NOTE.includes("-"), false);

assert.equal(shouldTopUpQueue(25), true);
assert.equal(shouldTopUpQueue(26), false);
assert.equal(shouldTopUpQueue(0), true);
assert.equal(shouldTopUpQueue(-1), false);

assert.equal(queueTopUpOwnsPlayback({ pointDevice: true, hallMirror: false }), true);
assert.equal(queueTopUpOwnsPlayback({ pointDevice: true, hallMirror: true }), true, "hall device always owns");
assert.equal(queueTopUpOwnsPlayback({ pointDevice: false, hallMirror: true }), false, "owner mirror defers to hall");
assert.equal(queueTopUpOwnsPlayback({ pointDevice: false, hallMirror: false }), true, "owner local owns");

const ring0 = rememberPlayedId([], id(1));
assert.deepEqual(ring0, [id(1)]);
const ring1 = rememberPlayedId(ring0, id(2));
assert.deepEqual(ring1, [id(2), id(1)]);
const ringDup = rememberPlayedId(ring1, id(1));
assert.deepEqual(ringDup, [id(1), id(2)], "move existing id to front");
const big = Array.from({ length: 250 }, (_, i) => id(i + 1));
assert.equal(rememberPlayedId(big, id(999)).length, CAFE_QUEUE_RECENT_RING);

const tracks = [
  { audioItemId: id(1) },
  { audioItemId: id(2) },
  { audioItemId: id(3) },
  { audioItemId: id(4) },
  { audioItemId: id(5) },
];
// ranked: 3,4,5,1,2 – current is index 0 (id1); recent has id2 and id3
const ranked = [2, 3, 4, 0, 1];
const spliced = spliceTopUpOrder(ranked, 0, tracks, [id(2), id(3)]);
assert.equal(spliced[0], 0, "current stays first");
assert.ok(spliced.indexOf(2) > spliced.indexOf(4), "recent id3 (index 2) goes back");
assert.ok(spliced.indexOf(1) > spliced.indexOf(4), "recent id2 (index 1) goes back");
assert.deepEqual(
  pushRecentIdsToBack([0, 1, 2, 3, 4], tracks, [id(2), id(4)], 0),
  [0, 2, 4, 1, 3],
);

const longTracks = Array.from({ length: 40 }, (_, i) => ({ audioItemId: id(i + 1) }));
const longOrder = longTracks.map((_, i) => i);
assert.equal(uniqueAheadCount(longTracks, longOrder, 10), cafeUniqueAhead(longTracks, longOrder, 10).length);
assert.equal(uniqueAheadCount(longTracks, longOrder, 14), 25);
assert.equal(shouldTopUpQueue(uniqueAheadCount(longTracks, longOrder, 14)), true);
assert.equal(shouldTopUpQueue(uniqueAheadCount(longTracks, longOrder, 13)), false);

// After splice, unique ahead must not include recent-as-repeat of already-heard prefix.
const after = spliceTopUpOrder(
  Array.from({ length: 40 }, (_, i) => (i + 15) % 40),
  14,
  longTracks,
  longOrder.slice(0, 15).map((i) => longTracks[i]!.audioItemId),
);
assert.equal(after[0], 14);
const aheadIds = cafeUniqueAhead(longTracks, after, 14).map((i) => longTracks[i]!.audioItemId);
const heard = new Set(longOrder.slice(0, 15).map((i) => longTracks[i]!.audioItemId));
for (const aid of aheadIds.slice(0, 20)) {
  assert.equal(heard.has(aid), false, `fresh head must not repeat heard ${aid}`);
}

assert.deepEqual(
  appendExcludedIds([id(3), id(1), id(2), id(4)], [id(1), id(5)], [id(1), id(2), id(3), id(4)]),
  [id(3), id(2), id(4), id(1)],
  "excluded stay in pool, deferred to end; unknown exclude dropped",
);

const guard = createQueueTopUpGuard();
assert.equal(guard.canStart(0), true);
assert.equal(guard.begin(), true);
assert.equal(guard.begin(), false, "one in flight");
assert.equal(guard.canStart(0), false);
guard.fail(1_000);
assert.equal(guard.failCount(), 1);
assert.equal(guard.canStart(1_000 + nextTopUpBackoffMs(1) - 1), false);
assert.equal(guard.canStart(1_000 + nextTopUpBackoffMs(1)), true);
assert.equal(guard.begin(), true);
guard.succeed();
assert.equal(guard.failCount(), 0);
assert.equal(guard.canStart(0), true);

const baseBody = {
  character: "cozy",
  direction: "calm",
  daypart: "day",
  energyOffset: 0,
  feedback: [],
  seed: 42,
  excludeAudioItemIds: [id(1), id(2)],
};
assert.deepEqual(parseCafeQueueRequest(baseBody)?.excludeAudioItemIds, [id(1), id(2)]);
assert.equal(parseCafeQueueRequest({ ...baseBody, excludeAudioItemIds: "x" }), null);
assert.equal(parseCafeQueueRequest({
  ...baseBody,
  excludeAudioItemIds: Array.from({ length: CAFE_QUEUE_EXCLUDE_LIMIT + 1 }, (_, i) => id(i + 1)),
}), null);

const player = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
assert.match(player, /tryQueueTopUp/);
assert.match(player, /spliceTopUpOrder/);
assert.match(player, /excludeAudioItemIds/);
assert.match(player, /ctlRef\.current\?\.queueChanged\(\)/);
assert.match(player, /queueTopUpOwnsPlayback/);

const workspace = readFileSync(new URL("../src/components/business-app/workspace/BusinessWorkspace.tsx", import.meta.url), "utf8");
assert.match(workspace, /CAFE_QUEUE_TOPUP_NOTE/);
assert.match(workspace, /biz-now-queue-autotopup/);
assert.match(workspace, /\{CAFE_QUEUE_TOPUP_NOTE\}/);

const handle = readFileSync(new URL("../src/lib/business-app/cafe-queue/handle.ts", import.meta.url), "utf8");
assert.match(handle, /appendExcludedIds/);
assert.match(handle, /excludeAudioItemIds/);

// Failure fallback: wrap still available via cafeQueueNextIndex (modulo) – untouched.
const orderSrc = readFileSync(new URL("../src/lib/business-app/cafe-queue/order.ts", import.meta.url), "utf8");
assert.match(orderSrc, /valid\[\(pos \+ 1\) % valid\.length\]/);

console.log("business-queue-autotopup-unit: ok");
