#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  MAX_STUDIO_HISTORY_SNAPSHOTS,
  createStudioClipClipboard,
  createStudioEditingSnapshot,
  createStudioHistory,
  getStudioPasteClips,
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

console.log("studio-history-unit: ok");
