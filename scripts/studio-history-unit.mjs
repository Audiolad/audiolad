#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  MAX_STUDIO_HISTORY_SNAPSHOTS,
  createStudioClipClipboard,
  createStudioDuplicatedTrackSnapshot,
  createStudioEditingSnapshot,
  createStudioHistory,
  getNextStudioSlotName,
  getStudioDuplicateClipStartTime,
  getStudioPasteClips,
  insertStudioTrackSlot,
  isStudioAssetStillReferenced,
  recordStudioHistory,
  redoStudioHistory,
  undoStudioHistory,
} from "../src/lib/studio/history.ts";

const initial = createStudioEditingSnapshot({
  position: 3,
  selectedClipId: "clip-a",
  slots: [{ id: "slot-a", name: "Дорожка 1", audioTrackId: "track-a" }],
  tracks: [{
    id: "track-a",
    fileName: "voice.wav",
    fileSize: 42,
    volume: 0.75,
    muted: false,
    trackKind: "voice",
    voicePreset: "depth",
    clips: [{
      id: "clip-a",
      startTime: 2,
      offset: 1,
      duration: 4,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
    }],
  }],
});

const history = createStudioHistory(initial);
initial.tracks[0].clips[0].startTime = 99;
initial.tracks[0].voicePreset = "trance";
initial.slots[0].audioTrackId = null;
assert.equal(history.past[0].tracks[0].clips[0].startTime, 2);
assert.equal(history.past[0].tracks[0].voicePreset, "depth");
assert.equal(history.past[0].slots[0].audioTrackId, "track-a");
assert.equal(history.past[0].selectedClipId, "clip-a");

const next = createStudioEditingSnapshot({
  ...history.past[0],
  position: 8,
});
const recorded = recordStudioHistory(history, next);
const undone = undoStudioHistory(recorded);
assert.equal(undone.snapshot?.position, 3);
assert.equal(undone.history.future.length, 1);
const redone = redoStudioHistory(undone.history);
assert.equal(redone.snapshot?.position, 8);
assert.equal(redone.history.future.length, 0);

let capped = createStudioHistory(history.past[0]);
for (let position = 1; position <= MAX_STUDIO_HISTORY_SNAPSHOTS + 10; position += 1) {
  capped = recordStudioHistory(capped, {
    ...history.past[0],
    position,
  });
}
assert.equal(capped.past.length, MAX_STUDIO_HISTORY_SNAPSHOTS);

const clipboard = createStudioClipClipboard("track-a", [{
  id: "clip-a",
  startTime: 4,
  offset: 8,
  duration: 5,
  fadeInDuration: 3,
  fadeOutDuration: 3,
}]);
const pasted = getStudioPasteClips({
  clipboard,
  targetStartTime: 10,
  targetBufferDuration: 10,
  createClipId: () => "pasted-a",
});
assert.deepEqual(pasted, [{
  id: "pasted-a",
  startTime: 10,
  offset: 8,
  duration: 2,
  fadeInDuration: 1,
  fadeOutDuration: 1,
}]);
assert.equal(clipboard.clips[0].id, "clip-a");

const selected = {
  id: "clip-a",
  startTime: 0,
  offset: 0,
  duration: 3,
  fadeInDuration: 0,
  fadeOutDuration: 0,
};
assert.equal(getStudioDuplicateClipStartTime(selected), 3);
const firstCopy = getStudioPasteClips({
  clipboard: createStudioClipClipboard("track-a", [selected]),
  targetStartTime: getStudioDuplicateClipStartTime(selected),
  targetBufferDuration: 30,
  createClipId: () => "clip-b",
});
assert.deepEqual(firstCopy.map((clip) => [clip.id, clip.startTime, clip.duration]), [["clip-b", 3, 3]]);
const secondCopy = getStudioPasteClips({
  clipboard: createStudioClipClipboard("track-a", [firstCopy[0]]),
  targetStartTime: getStudioDuplicateClipStartTime(firstCopy[0]),
  targetBufferDuration: 30,
  createClipId: () => "clip-c",
});
assert.deepEqual(secondCopy.map((clip) => [clip.id, clip.startTime]), [["clip-c", 6]]);

const duplicated = createStudioDuplicatedTrackSnapshot(history.past[0].tracks[0], {
  trackId: "track-b",
  createClipId: () => "clip-copy",
});
assert.equal(duplicated.id, "track-b");
assert.equal(duplicated.clips[0].id, "clip-copy");
assert.equal(duplicated.clips[0].startTime, 2);
assert.equal(duplicated.assetId, history.past[0].tracks[0].assetId);
assert.equal(duplicated.volume, 0.75);
assert.equal(duplicated.voicePreset, "depth");
assert.equal(history.past[0].tracks[0].id, "track-a");
assert.equal(history.past[0].tracks[0].clips[0].id, "clip-a");
assert.equal(
  isStudioAssetStillReferenced("asset-a", [
    { assetId: "asset-a" },
    { assetId: "asset-a" },
  ]),
  true,
);
assert.equal(
  isStudioAssetStillReferenced("asset-a", [{ assetId: "asset-b" }]),
  false,
);
assert.equal(
  getNextStudioSlotName(
    [{ name: "Музыка 1", trackKind: "music" }],
    "music",
  ),
  "Музыка 2",
);
assert.equal(
  getNextStudioSlotName(
    [
      { name: "Голос 1", trackKind: "voice" },
      { name: "Голос 3", trackKind: "voice" },
    ],
    "voice",
  ),
  "Голос 2",
);
const ordered = insertStudioTrackSlot(
  [
    { id: "v1", trackKind: "voice" },
    { id: "m1", trackKind: "music" },
  ],
  { id: "v2", trackKind: "voice" },
);
assert.deepEqual(ordered.map((slot) => slot.id), ["v1", "v2", "m1"]);

const beforeDuplicate = createStudioEditingSnapshot(history.past[0]);
const afterDuplicate = createStudioEditingSnapshot({
  ...beforeDuplicate,
  tracks: [...beforeDuplicate.tracks, duplicated],
  slots: [
    ...beforeDuplicate.slots,
    { id: "slot-b", name: "Голос 2", audioTrackId: "track-b", trackKind: "voice" },
  ],
});
const recordedDuplicate = recordStudioHistory(
  createStudioHistory(beforeDuplicate),
  afterDuplicate,
);
const undoneDuplicate = undoStudioHistory(recordedDuplicate);
assert.equal(undoneDuplicate.snapshot?.tracks.length, 1);
assert.equal(undoneDuplicate.snapshot?.slots.length, 1);
const redoneDuplicate = redoStudioHistory(undoneDuplicate.history);
assert.equal(redoneDuplicate.snapshot?.tracks.length, 2);
assert.equal(redoneDuplicate.snapshot?.tracks[1].id, "track-b");
assert.equal(redoneDuplicate.snapshot?.tracks[1].assetId, beforeDuplicate.tracks[0].assetId);

console.log("studio-history-unit: ok");
