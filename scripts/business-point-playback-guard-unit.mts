import assert from "node:assert/strict";
import { pointPlaybackAllowed } from "../src/lib/business-app/point-playback-guard";
import { POINT_MUSIC_FORBIDDEN } from "../src/lib/business-app/point-sound";
import { handleWorkspaceState } from "../src/lib/business-workspace/routes";

const now = Date.parse("2026-10-28T12:00:10Z");
const stored = { index: 2, positionSec: 30, volume: 0.8, updatedAt: "2026-10-28T12:00:00Z" };
const base = { isPoint: true, pointCanEdit: false, stored, now, cause: "progress", next: { index: 2, positionSec: 40 } };
assert.equal(pointPlaybackAllowed(base), true, "normal wall-clock progress");
assert.equal(pointPlaybackAllowed({ ...base, next: { index: 2, positionSec: 30 } }), true, "volume only or play/pause");
assert.equal(pointPlaybackAllowed({ ...base, next: { index: 2, positionSec: 43 } }), true, "small timing tolerance");
for (const cause of ["manual", "unexpected", undefined, null]) {
  assert.equal(pointPlaybackAllowed({ ...base, cause }), false, "manual/missing/unknown cause refused");
}
for (const next of [{ index: 2, positionSec: 90 }, { index: 2, positionSec: 10 }, { index: 3, positionSec: 40 }]) {
  assert.equal(pointPlaybackAllowed({ ...base, next }), false, "forward/backward seek or progress track change refused");
}
for (const cause of ["advance", "owner"]) {
  assert.equal(pointPlaybackAllowed({ ...base, cause, next: { index: 3, positionSec: 0 } }), true);
  assert.equal(pointPlaybackAllowed({ ...base, cause, next: { index: 0, positionSec: 2 } }), true, "wrap");
  assert.equal(pointPlaybackAllowed({ ...base, cause, next: { index: 4, positionSec: 0 } }), false, "cannot skip tracks");
  assert.equal(pointPlaybackAllowed({ ...base, cause, next: { index: 3, positionSec: 10 } }), false, "cannot seek with next");
}
assert.equal(pointPlaybackAllowed({ ...base, stored: null, cause: "manual" }), true, "first save");
assert.equal(pointPlaybackAllowed({ ...base, pointCanEdit: true, cause: "manual", next: { index: 9, positionSec: 90 } }), true);
assert.equal(pointPlaybackAllowed({ ...base, isPoint: false, cause: undefined, next: { index: 9, positionSec: 90 } }), true, "owner without cookie");
assert.equal(POINT_MUSIC_FORBIDDEN, "Менять музыку с устройства в заведении запрещено.");

// Exercise the actual handler boundary: refusal precedes both writes and analytics.
let writes = 0;
let plays = 0;
const deps = {
  userId: async () => "owner",
  playerOpen: async () => true,
  playbackAllowed: async (input: { index: number; positionSec: number; cause: unknown }) =>
    pointPlaybackAllowed({ ...base, next: input, cause: input.cause }),
  savePlayback: async () => { writes++; },
  recordPlay: async () => { plays++; },
  recordOfferClick: async () => {},
};
for (const patch of [
  { cause: "manual" }, { cause: undefined }, { cause: "progress", positionSec: 90 }, { cause: "progress", index: 3 },
]) {
  assert.deepEqual(await handleWorkspaceState({ kind: "playback", index: 2, positionSec: 40, volume: 0.4, play: true, ...patch }, deps),
    { ok: false, reason: "forbidden" });
}
assert.equal(writes, 0);
assert.equal(plays, 0);
for (const patch of [
  { cause: "progress" }, { cause: "progress", positionSec: 30, volume: 0.1, play: false },
  { cause: "advance", index: 3, positionSec: 0 }, { cause: "owner", index: 3, positionSec: 0 },
]) {
  assert.deepEqual(await handleWorkspaceState({ kind: "playback", index: 2, positionSec: 40, volume: 0.4, play: true, ...patch }, deps), { ok: true });
}
assert.equal(writes, 4);
console.log("business-point-playback-guard-unit: ok");
