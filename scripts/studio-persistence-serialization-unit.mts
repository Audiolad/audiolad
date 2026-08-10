import assert from "node:assert/strict";

import {
  areStudioProjectDocumentsEqual,
  deserializeStudioProjectDocument,
  serializeStudioProjectState,
  StudioPersistenceError,
  type StudioPersistableProjectInput,
  type StudioProjectDocumentV2,
} from "../src/lib/studio/persistence";

const assetId = "11111111-1111-4111-8111-111111111111";
const secondAssetId = "22222222-2222-4222-8222-222222222222";

function clip(
  id: string,
  startTime = 0,
  overrides: Partial<{
    offset: number;
    duration: number;
    fadeInDuration: number;
    fadeOutDuration: number;
  }> = {},
) {
  return {
    id,
    startTime,
    offset: 0,
    duration: 1,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    ...overrides,
  };
}

function track(
  id: string,
  overrides: Partial<{
    assetId: string | null;
    name: string;
    volume: number;
    muted: boolean;
    clips: ReturnType<typeof clip>[];
  }> = {},
) {
  return {
    id,
    assetId,
    name: id,
    volume: 1,
    muted: false,
    clips: [clip(`${id}-clip`)],
    ...overrides,
  };
}

function state(overrides: Partial<StudioPersistableProjectInput> = {}): StudioPersistableProjectInput {
  return {
    currentTime: 0,
    slots: [],
    tracks: [],
    ...overrides,
  };
}

function errorCode(action: () => unknown, code: string): void {
  assert.throws(
    action,
    (error: unknown) => error instanceof StudioPersistenceError && error.code === code,
  );
}

const empty = serializeStudioProjectState(state());
assert.deepEqual(empty, {
  document: {
    schemaVersion: 2,
    studioVersion: 1,
    editor: { currentTime: 0 },
    slots: [],
    tracks: [],
  },
  pendingTrackIds: [],
});

const oneTrack = serializeStudioProjectState(state({
  slots: [{ id: "slot-1", name: "Slot 1", audioTrackId: "track-1" }],
  tracks: [{
    ...track("track-1"),
    assetPersistenceStatus: "saved",
  }],
}));
assert.equal(oneTrack.document.tracks.length, 1);
assert.equal(oneTrack.document.tracks[0].assetId, assetId);

const fiveTracks = serializeStudioProjectState(state({
  tracks: Array.from({ length: 5 }, (_, index) =>
    track(`track-${index}`, {
      assetId: `${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}-3333-4333-8333-${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}`,
    }),
  ),
}));
assert.equal(fiveTracks.document.tracks.length, 5);

const split = serializeStudioProjectState(state({
  tracks: [track("track-1", {
    clips: [
      clip("middle", 2),
      clip("right", 4, { offset: 2 }),
      clip("left", 0),
    ],
  })],
}));
assert.deepEqual(split.document.tracks[0].clips.map((item) => item.id), ["left", "middle", "right"]);

const pasteWithGap = serializeStudioProjectState(state({
  tracks: [track("track-1", {
    clips: [clip("first", 0), clip("trailing", 8)],
  })],
}));
assert.equal(pasteWithGap.document.tracks[0].clips[1].startTime, 8);

const ripple = serializeStudioProjectState(state({
  tracks: [track("track-1", {
    clips: [clip("first", 0), clip("rippled", 1)],
  })],
}));
assert.equal(ripple.document.tracks[0].clips[1].startTime, 1);

const trimmed = serializeStudioProjectState(state({
  tracks: [track("track-1", { clips: [clip("trimmed", 3, { offset: 2, duration: 4 })] })],
}));
assert.deepEqual(trimmed.document.tracks[0].clips[0], clip("trimmed", 3, { offset: 2, duration: 4 }));

const faded = serializeStudioProjectState(state({
  tracks: [track("track-1", {
    clips: [clip("faded", 0, { duration: 4, fadeInDuration: 1, fadeOutDuration: 2 })],
  })],
}));
assert.equal(faded.document.tracks[0].clips[0].fadeOutDuration, 2);

const mixed = serializeStudioProjectState(state({
  tracks: [track("track-1", { volume: 0.4, muted: true })],
}));
assert.deepEqual(
  { volume: mixed.document.tracks[0].volume, muted: mixed.document.tracks[0].muted },
  { volume: 0.4, muted: true },
);

const beyondDuration = serializeStudioProjectState(state({
  currentTime: 99,
  tracks: [track("track-1")],
}));
assert.equal(beyondDuration.document.editor.currentTime, 99);
assert.equal(serializeStudioProjectState(state({ currentTime: Number.NaN })).document.editor.currentTime, 0);

const pending = serializeStudioProjectState(state({
  slots: [
    { id: "slot-pending", name: "Pending", audioTrackId: "pending-track" },
    { id: "slot-saved", name: "Saved", audioTrackId: "saved-track" },
  ],
  tracks: [
    {
      ...track("pending-track", { assetId: null }),
      assetPersistenceStatus: "pending",
    },
    {
      ...track("error-track", { assetId: null }),
      assetPersistenceStatus: "error",
    },
    track("saved-track", { assetId: secondAssetId }),
  ],
}));
assert.deepEqual(pending.pendingTrackIds, ["pending-track", "error-track"]);
assert.equal(pending.document.slots[0].audioTrackId, null);
assert.equal(pending.document.tracks.length, 1);
errorCode(
  () => serializeStudioProjectState(state({
    tracks: [track("same-track", { assetId: null }), track("same-track")],
  })),
  "duplicate_track_id",
);

const canonical = serializeStudioProjectState(state({
  currentTime: 2,
  slots: [{ id: "slot-1", name: "Slot", audioTrackId: "track-1" }],
  tracks: [track("track-1", {
    clips: [clip("z", 5), clip("a", 3), clip("first", 0)],
    // These runtime values must not escape into the saved document.
    runtime: { buffer: "not-persisted" },
    history: [{ tracks: [] }],
    clipboard: { clips: [] },
    selectedClipId: "first",
  } as never)],
  history: { past: [] },
  clipboard: { clips: [] },
  selection: { clipId: "first" },
} as StudioPersistableProjectInput & Record<string, unknown>));
assert.deepEqual(canonical.document.tracks[0].clips.map((item) => item.id), ["first", "a", "z"]);
assert.deepEqual(Object.keys(canonical.document), [
  "schemaVersion",
  "studioVersion",
  "editor",
  "slots",
  "tracks",
]);

const roundTrip = deserializeStudioProjectDocument(canonical.document);
assert.deepEqual(roundTrip, {
  currentTime: 2,
  slots: canonical.document.slots,
  tracks: canonical.document.tracks,
});
assert(areStudioProjectDocumentsEqual(canonical.document, {
  ...canonical.document,
  tracks: [{ ...canonical.document.tracks[0], clips: [...canonical.document.tracks[0].clips].reverse() }],
}));

const withBounds = serializeStudioProjectState(state({
  tracks: [track("track-1", { clips: [clip("bounded", 0, { offset: 3, duration: 2 })] })],
}), new Map([[assetId, 5]]));
assert.equal(withBounds.document.tracks[0].clips[0].duration, 2);
errorCode(
  () => serializeStudioProjectState(state({
    tracks: [track("track-1", { clips: [clip("too-long", 0, { offset: 3, duration: 3 })] })],
  }), new Map([[assetId, 5]])),
  "clip_exceeds_asset_duration",
);

const document: StudioProjectDocumentV2 = oneTrack.document;
errorCode(
  () => deserializeStudioProjectDocument({ ...document, schemaVersion: 3 }),
  "unsupported_schema_version",
);
errorCode(
  () => deserializeStudioProjectDocument({ ...document, studioVersion: 2 }),
  "unsupported_studio_version",
);
errorCode(
  () => deserializeStudioProjectDocument({ ...document, editor: { currentTime: Number.POSITIVE_INFINITY } }),
  "invalid_editor",
);
errorCode(
  () => deserializeStudioProjectDocument({ ...document, unknown: true }),
  "unknown_field",
);
errorCode(
  () => deserializeStudioProjectDocument({
    ...document,
    slots: [
      document.slots[0],
      { id: document.slots[0].id, name: "Duplicate", audioTrackId: null },
    ],
  }),
  "duplicate_slot_id",
);
errorCode(
  () => deserializeStudioProjectDocument({
    ...document,
    slots: [{ ...document.slots[0], audioTrackId: "missing-track" }],
  }),
  "dangling_slot_track",
);
errorCode(
  () => deserializeStudioProjectDocument({
    ...document,
    tracks: [document.tracks[0], { ...document.tracks[0], id: "other-track" }],
  }),
  "duplicate_asset_id",
);
errorCode(
  () => deserializeStudioProjectDocument({
    ...document,
    tracks: [{
      ...document.tracks[0],
      clips: [clip("same-id"), clip("same-id", 2)],
    }],
  }),
  "duplicate_clip_id",
);
errorCode(
  () => deserializeStudioProjectDocument({
    ...document,
    tracks: [{
      ...document.tracks[0],
      clips: [clip("first", 0, { duration: 2 }), clip("second", 1)],
    }],
  }),
  "overlapping_clips",
);
errorCode(
  () => deserializeStudioProjectDocument({
    ...document,
    tracks: [{
      ...document.tracks[0],
      clips: [clip("bad-fades", 0, { fadeInDuration: 0.75, fadeOutDuration: 0.5 })],
    }],
  }),
  "invalid_clip",
);
errorCode(
  () => deserializeStudioProjectDocument({
    ...document,
    tracks: [{ ...document.tracks[0], volume: Number.NaN }],
  }),
  "invalid_track",
);

console.log("studio persistence serialization checks passed");
