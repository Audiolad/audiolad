#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  studioClipOverlapsAny,
} from "../src/lib/studio/clip-math.ts";
import {
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
import {
  serializeStudioProjectState,
  validateStudioProjectDocument,
} from "../src/lib/studio/persistence.ts";
import { createStudioRenderSnapshot } from "../src/lib/studio/render/snapshot.ts";
import { buildStudioRenderTimeline } from "../src/lib/studio/render/timeline.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const shell = readFileSync(join(ROOT, "src/components/studio/StudioEditorShell.tsx"), "utf8");
const provider = readFileSync(join(ROOT, "src/components/studio/StudioAudioProvider.tsx"), "utf8");
const persistence = readFileSync(join(ROOT, "src/lib/studio/persistence.ts"), "utf8");
const serverValidation = readFileSync(join(ROOT, "src/lib/studio/server/validation.ts"), "utf8");

function clip(id, startTime, duration = 3, extras = {}) {
  return {
    id,
    startTime,
    offset: 0,
    duration,
    fadeInDuration: extras.fadeInDuration ?? 0,
    fadeOutDuration: extras.fadeOutDuration ?? 0,
  };
}

function trackSnapshot(id, assetId, clips, extras = {}) {
  return {
    id,
    fileName: `${id}.mp3`,
    fileSize: 12,
    assetId,
    assetPersistenceStatus: "saved",
    clips,
    volume: extras.volume ?? 0.8,
    muted: extras.muted ?? false,
    trackKind: extras.trackKind ?? "music",
    voicePreset: extras.voicePreset ?? "none",
  };
}

// Copy / paste: new clip id, same asset, same-track only, overlap rejected.
const source = clip("clip-a", 0, 3, { fadeInDuration: 0.2, fadeOutDuration: 0.1 });
const clipboard = createStudioClipClipboard("track-a", [source]);
assert.equal(clipboard.sourceTrackId, "track-a");
assert.equal(clipboard.clips[0].id, "clip-a");
const pasted = getStudioPasteClips({
  clipboard,
  targetStartTime: 6,
  targetBufferDuration: 30,
  createClipId: () => "clip-paste",
});
assert.equal(pasted.length, 1);
assert.equal(pasted[0].id, "clip-paste");
assert.equal(pasted[0].startTime, 6);
assert.equal(pasted[0].duration, 3);
assert.equal(pasted[0].fadeInDuration, 0.2);
assert.notEqual(pasted[0].id, source.id);
assert.equal(
  studioClipOverlapsAny(pasted[0], [source, clip("busy", 5, 3)]),
  true,
);
assert.equal(
  studioClipOverlapsAny(pasted[0], [source]),
  false,
);

// Duplicate clip: immediately after selected, repeated D is sequential, overlap rejected.
const first = getStudioPasteClips({
  clipboard: createStudioClipClipboard("track-a", [source]),
  targetStartTime: getStudioDuplicateClipStartTime(source),
  targetBufferDuration: 30,
  createClipId: () => "clip-b",
});
assert.deepEqual(first.map((item) => [item.id, item.startTime, item.duration]), [["clip-b", 3, 3]]);
const second = getStudioPasteClips({
  clipboard: createStudioClipClipboard("track-a", [first[0]]),
  targetStartTime: getStudioDuplicateClipStartTime(first[0]),
  targetBufferDuration: 30,
  createClipId: () => "clip-c",
});
assert.deepEqual(second.map((item) => [item.id, item.startTime]), [["clip-c", 6]]);
assert.equal(
  studioClipOverlapsAny(first[0], [source, clip("blocker", 4, 2)]),
  true,
);

// Duplicate track: new track/slot/clip IDs, same asset, settings preserved, naming, 5-track limit.
const originalTrack = trackSnapshot("track-a", "asset-music", [source, first[0]], {
  volume: 0.4,
  muted: true,
  trackKind: "music",
});
const duplicatedTrack = createStudioDuplicatedTrackSnapshot(originalTrack, {
  trackId: "track-b",
  createClipId: (() => {
    let index = 0;
    return () => `dup-${++index}`;
  })(),
});
assert.equal(duplicatedTrack.id, "track-b");
assert.notEqual(duplicatedTrack.id, originalTrack.id);
assert.equal(duplicatedTrack.assetId, originalTrack.assetId);
assert.equal(duplicatedTrack.volume, 0.4);
assert.equal(duplicatedTrack.muted, true);
assert.equal(duplicatedTrack.trackKind, "music");
assert.deepEqual(duplicatedTrack.clips.map((item) => item.id), ["dup-1", "dup-2"]);
assert.deepEqual(duplicatedTrack.clips.map((item) => item.startTime), [0, 3]);
assert.equal(originalTrack.clips[0].id, "clip-a");

const slots = [
  { id: "slot-voice-1", name: "Голос 1", audioTrackId: "voice-1", trackKind: "voice" },
  { id: "slot-music-1", name: "Музыка 1", audioTrackId: "track-a", trackKind: "music" },
];
assert.equal(getNextStudioSlotName(slots, "music"), "Музыка 2");
const withVoiceCopy = insertStudioTrackSlot(slots, {
  id: "slot-voice-2",
  name: getNextStudioSlotName(slots, "voice"),
  audioTrackId: "voice-2",
  trackKind: "voice",
});
assert.deepEqual(withVoiceCopy.map((slot) => slot.id), [
  "slot-voice-1",
  "slot-voice-2",
  "slot-music-1",
]);
assert.equal(withVoiceCopy[1].name, "Голос 2");
assert.equal(slots.length < 5, true);

// Shared-asset safety: deleting one copy does not drop the shared assetId.
const liveAfterDeleteOriginal = [duplicatedTrack];
assert.equal(isStudioAssetStillReferenced("asset-music", liveAfterDeleteOriginal), true);
assert.equal(isStudioAssetStillReferenced("asset-music", []), false);
assert.equal(
  isStudioAssetStillReferenced("asset-music", [originalTrack, duplicatedTrack]),
  true,
);

// Undo/redo of duplicate track is one history step.
const before = createStudioEditingSnapshot({
  tracks: [originalTrack],
  slots,
  selectedClipId: "clip-a",
  position: 1,
});
const after = createStudioEditingSnapshot({
  tracks: [originalTrack, duplicatedTrack],
  slots: [
    ...slots,
    { id: "slot-music-2", name: "Музыка 2", audioTrackId: "track-b", trackKind: "music" },
  ],
  selectedClipId: "clip-a",
  position: 1,
});
const recorded = recordStudioHistory(createStudioHistory(before), after);
const undone = undoStudioHistory(recorded);
assert.equal(undone.snapshot?.tracks.length, 1);
assert.equal(undone.snapshot?.slots.length, 2);
const redone = redoStudioHistory(undone.history);
assert.equal(redone.snapshot?.tracks.length, 2);
assert.equal(redone.snapshot?.tracks[1].assetId, "asset-music");
assert.equal(redone.snapshot?.slots.at(-1)?.name, "Музыка 2");

// Persistence / autosave contract: shared assetId is a valid V2 document.
const assetId = "11111111-1111-4111-8111-111111111111";
const persisted = serializeStudioProjectState({
  currentTime: 4,
  slots: [
    { id: "slot-music-1", name: "Музыка 1", audioTrackId: "music-1", trackKind: "music" },
    { id: "slot-music-2", name: "Музыка 2", audioTrackId: "music-2", trackKind: "music" },
  ],
  tracks: [
    {
      id: "music-1",
      assetId,
      name: "bed.mp3",
      volume: 0.5,
      muted: false,
      trackKind: "music",
      clips: [clip("a1", 0, 3), clip("a2", 3, 3)],
    },
    {
      id: "music-2",
      assetId,
      name: "bed.mp3",
      volume: 0.5,
      muted: false,
      trackKind: "music",
      clips: [clip("b1", 0.5, 3, { fadeInDuration: 0.2, fadeOutDuration: 0.2 })],
    },
  ],
});
assert.equal(persisted.pendingTrackIds.length, 0);
assert.equal(persisted.document.tracks[0].assetId, persisted.document.tracks[1].assetId);
validateStudioProjectDocument(persisted.document);

// Render snapshot: sequential duplicated clips + overlapping duplicated tracks.
const snapshot = createStudioRenderSnapshot({
  project: {
    id: "project",
    author_id: "author",
    name: "Shared music",
    schema_version: 2,
    revision: 3,
    status: "active",
    created_at: "",
    updated_at: "",
    last_opened_at: null,
    deleted_at: null,
    project_data: persisted.document,
  },
  expectedRevision: 3,
  assets: [{
    id: assetId,
    project_id: "project",
    storage_path: "studio/author/project/asset/bed.mp3",
    original_name: "bed.mp3",
    mime_type: "audio/mpeg",
    size_bytes: 12,
    duration_seconds: 12,
    source_type: "upload",
    created_at: "",
    deleted_at: null,
  }],
});
assert.equal(snapshot.tracks.length, 2);
assert.equal(snapshot.assets.length, 1);
assert.equal(snapshot.tracks[0].clips.length, 2);
assert.equal(snapshot.tracks[0].clips[1].startTime, 3);
assert.equal(snapshot.tracks[1].clips[0].startTime, 0.5);
const timeline = buildStudioRenderTimeline(snapshot);
assert.equal(timeline.tracks.length, 2);
assert.equal(timeline.durationSeconds, 6);

// Editor / provider contract.
assert.match(shell, /isNativeInteractiveTarget\(event\.target\)/);
assert.match(shell, /event\.key\.toLowerCase\(\) === "c"/);
assert.match(shell, /event\.key\.toLowerCase\(\) === "v"/);
assert.match(shell, /event\.key\.toLowerCase\(\) === "d"/);
assert.match(shell, /if \(!selectedTrackAndClip\) return;/);
assert.match(shell, /if \(duplicateSelectedClip\(\)\) \{\s*event\.preventDefault\(\)/);
assert.match(shell, /track\.id === clipboard\.sourceTrackId/);
assert.match(shell, /getStudioDuplicateClipStartTime/);
assert.match(shell, /label="Дублировать \(⌘\/Ctrl\+D\)"/);
assert.match(shell, /aria-label="Дублировать дорожку"/);
assert.match(shell, /title="Дублировать дорожку"/);
assert.match(shell, /slotsRef\.current\.length >= MAX_TRACK_SLOTS/);
assert.match(shell, /grid grid-cols-2 gap-1/);
assert.match(shell, /Фрагмент скопирован/);
assert.match(shell, /Фрагмент вставлен/);
assert.match(shell, /Фрагмент дублирован/);
assert.match(shell, /Дорожка дублирована/);
assert.match(shell, /Нельзя вставить: место занято/);
assert.match(provider, /duplicateTrack/);
assert.match(provider, /assetVaultRef\.current\.set\(snapshot\.id, asset\)/);
assert.match(provider, /createTrackRuntime\(asset\)/);
assert.match(provider, /bindSharedAssetState/);
assert.match(provider, /sharedWithLiveTrack/);
assert.doesNotMatch(provider, /startTrackAssetUpload\(snapshot\.id\)/);
assert.doesNotMatch(persistence, /if \(assetIds\.has\(track\.assetId\)\)/);
assert.doesNotMatch(serverValidation, /duplicate_track_asset/);

console.log("studio-copy-duplicate-unit: ok");
