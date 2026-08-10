import assert from "node:assert/strict";

import { StudioAutosaveController, type StudioAutosaveSnapshot } from "../src/lib/studio/autosave";
import { getStudioRippleDeleteResult, splitStudioClip, type StudioClip } from "../src/lib/studio/clip-math";
import {
  createStudioEditingSnapshot,
  createStudioHistory,
  getStudioPasteClips,
  recordStudioHistory,
  redoStudioHistory,
  type StudioTrackSnapshot,
  undoStudioHistory,
} from "../src/lib/studio/history";
import { hydrateStudioProject } from "../src/lib/studio/hydration";
import {
  areStudioProjectDocumentsEqual,
  deserializeStudioProjectDocument,
  serializeStudioProjectState,
  type StudioPersistableProjectInput,
  type StudioProjectDocumentV2,
} from "../src/lib/studio/persistence";
import type {
  StudioProjectAssetMetadata,
  StudioPersistedProject,
} from "../src/lib/studio/persistence-client";

if (!globalThis.File) {
  globalThis.File = class File extends Blob {
    name: string;
    lastModified = 0;

    constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
      super(parts, options);
      this.name = name;
    }
  } as typeof File;
}

const projectId = "11111111-1111-4111-8111-111111111111";
const assetIds = Array.from(
  { length: 6 },
  (_, index) => `${String(index + 2).repeat(8)}-2222-4222-8222-${String(index + 2).repeat(12)}`,
);

function clip(
  id: string,
  startTime = 0,
  overrides: Partial<Omit<StudioClip, "id" | "startTime">> = {},
): StudioClip {
  return {
    id,
    startTime,
    offset: 0,
    duration: 2,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    ...overrides,
  };
}

function document(
  currentTime = 0,
  tracks: StudioPersistableProjectInput["tracks"] = [],
  slots: StudioPersistableProjectInput["slots"] = [],
): StudioProjectDocumentV2 {
  return serializeStudioProjectState({ currentTime, tracks, slots }).document;
}

function track(
  id: string,
  assetId = assetIds[0],
  overrides: Partial<StudioPersistableProjectInput["tracks"][number]> = {},
) {
  return {
    id,
    assetId,
    assetPersistenceStatus: "saved" as const,
    name: `${id}.wav`,
    volume: 1,
    muted: false,
    clips: [clip(`${id}-clip`)],
    ...overrides,
  };
}

function canonical(value: StudioProjectDocumentV2): string {
  return JSON.stringify(deserializeStudioProjectDocument(value));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

class FakeStudioStore {
  project: StudioPersistedProject;
  readonly assets = new Map<string, { metadata: StudioProjectAssetMetadata; blob: Blob }>();
  putCount = 0;
  downloadCount = 0;
  decodeCount = 0;
  deleteCount = 0;

  constructor(initialDocument = document()) {
    this.project = {
      id: projectId,
      name: "Без названия",
      revision: 1,
      projectData: initialDocument,
    };
  }

  upload(
    assetId: string,
    name: string,
    sourceType: "upload" | "recording",
    durationSeconds = 10,
  ): StudioProjectAssetMetadata {
    const metadata: StudioProjectAssetMetadata = {
      id: assetId,
      projectId,
      originalName: name,
      mimeType: "audio/wav",
      sizeBytes: 5,
      durationSeconds,
      sourceType,
      createdAt: "2026-08-09T00:00:00.000Z",
    };
    this.assets.set(assetId, { metadata, blob: new Blob(["audio"], { type: "audio/wav" }) });
    return metadata;
  }

  async update(input: {
    expectedRevision: number;
    name: string;
    projectData: StudioProjectDocumentV2;
  }): Promise<{ revision: number }> {
    this.putCount += 1;
    if (input.expectedRevision !== this.project.revision) {
      throw { status: 409 };
    }
    this.project = {
      ...this.project,
      name: input.name,
      projectData: input.projectData,
      revision: this.project.revision + 1,
    };
    return { revision: this.project.revision };
  }

  async download(asset: StudioProjectAssetMetadata): Promise<Blob> {
    this.downloadCount += 1;
    const stored = this.assets.get(asset.id);
    if (!stored) throw new Error("missing asset");
    return stored.blob;
  }

  async decode(_blob?: Blob, _metadata?: StudioProjectAssetMetadata): Promise<AudioBuffer> {
    void _blob;
    void _metadata;
    this.decodeCount += 1;
    return { duration: 10 } as AudioBuffer;
  }
}

function createTimers() {
  let now = 0;
  let nextId = 0;
  const scheduled = new Map<number, { at: number; callback: () => void }>();
  return {
    timers: {
      setTimeout(callback: () => void, delay: number) {
        const id = ++nextId;
        scheduled.set(id, { at: now + delay, callback });
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout(id: ReturnType<typeof setTimeout>) {
        scheduled.delete(id as unknown as number);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...scheduled]) {
        if (timer.at <= now) {
          scheduled.delete(id);
          timer.callback();
        }
      }
    },
  };
}

function createController(
  store: FakeStudioStore,
  getSnapshot: () => StudioAutosaveSnapshot,
  debounceMs = 1,
) {
  const clock = createTimers();
  const controller = new StudioAutosaveController({
    getSnapshot,
    update: (input) => store.update(input),
    timers: clock.timers,
    debounceMs,
  });
  controller.hydrate({
    revision: store.project.revision,
    name: store.project.name,
    document: store.project.projectData as StudioProjectDocumentV2,
    complete: true,
  });
  return { controller, clock };
}

function historyDocument(snapshot: {
  position: number;
  tracks: StudioTrackSnapshot[];
  slots: StudioPersistableProjectInput["slots"];
}): StudioProjectDocumentV2 {
  return document(
    snapshot.position,
    snapshot.tracks.map(({ fileName, fileSize: _fileSize, ...track }) => {
      void _fileSize;
      return { ...track, name: fileName };
    }),
    snapshot.slots,
  );
}

// Upload + save + reload, including recording provenance metadata.
{
  const store = new FakeStudioStore();
  const uploaded = store.upload(assetIds[0], "voice.wav", "upload");
  const recorded = store.upload(assetIds[1], "recording.wav", "recording");
  assert.equal(recorded.sourceType, "recording", "recording source metadata survives asset storage");

  const savedDocument = document(7, [
    track("voice", uploaded.id),
    track("recording", recorded.id, { clips: [clip("recording-clip", 4)] }),
  ], [
    { id: "voice-slot", name: "Voice", audioTrackId: "voice" },
    { id: "recording-slot", name: "Recording", audioTrackId: "recording" },
  ]);
  const snapshot = { name: "Запись", document: savedDocument };
  const { controller, clock } = createController(store, () => snapshot);
  controller.markDirty();
  clock.advance(1);
  await tick();

  assert.equal(store.putCount, 1);
  assert.equal(store.project.name, "Запись");
  assert(areStudioProjectDocumentsEqual(store.project.projectData, savedDocument));

  const hydrated = await hydrateStudioProject({
    project: store.project,
    assets: [...store.assets.values()].map(({ metadata }) => metadata),
    download: (asset) => store.download(asset),
    decode: (blob, metadata) => store.decode(blob, metadata),
  });
  assert.equal(hydrated.failures.size, 0);
  assert.equal(hydrated.assets.size, 2);
  assert.equal(hydrated.state.currentTime, 7);
}

// Splitting one track remains one referenced asset and hydrates it once.
{
  const store = new FakeStudioStore();
  const metadata = store.upload(assetIds[0], "split.wav", "upload");
  const original = clip("left", 0, { duration: 8 });
  const split = splitStudioClip(original, 3, "right");
  assert(split);
  const savedDocument = document(3, [
    track("split", metadata.id, { clips: [split.left, split.right] }),
  ]);
  const hydrated = await hydrateStudioProject({
    project: { ...store.project, projectData: savedDocument },
    assets: [metadata],
    download: (asset) => store.download(asset),
    decode: (blob, asset) => store.decode(blob, asset),
  });
  assert.equal(hydrated.state.tracks[0].clips.length, 2);
  assert.equal(store.downloadCount, 1);
  assert.equal(store.decodeCount, 1);
}

// Paste retains a trailing gap and persists the manual transport position.
{
  const source = [clip("first", 0), clip("trailing", 5)];
  const pasted = getStudioPasteClips({
    clipboard: { sourceTrackId: "track", clips: source },
    targetStartTime: 10,
    targetBufferDuration: 20,
    createClipId: (() => {
      let index = 0;
      return () => `pasted-${++index}`;
    })(),
  });
  assert.deepEqual(pasted.map((item) => item.startTime), [10, 15]);
  const savedDocument = document(15, [track("track", assetIds[0], { clips: pasted })]);
  assert.equal(savedDocument.editor.currentTime, 15);
  assert.deepEqual(savedDocument.tracks[0].clips.map((item) => item.startTime), [10, 15]);
}

// Ripple delete changes only the selected track geometry.
{
  const first = track("first", assetIds[0], { clips: [clip("remove", 0), clip("moves", 3)] });
  const untouched = track("second", assetIds[1], { clips: [clip("other", 9)] });
  const ripple = getStudioRippleDeleteResult(first.clips, "remove");
  assert(ripple);
  const before = document(0, [first, untouched]);
  const after = document(0, [{ ...first, clips: ripple.clips }, untouched]);
  assert.equal(after.tracks[0].clips[0].startTime, 1);
  assert.deepEqual(after.tracks[1], before.tracks[1]);
}

// Undo/redo snapshots become canonical documents and advance revisions sequentially.
{
  const store = new FakeStudioStore();
  const base = createStudioEditingSnapshot({
    tracks: [{
      id: "track",
      fileName: "track.wav",
      fileSize: 5,
      assetId: assetIds[0],
      assetPersistenceStatus: "saved",
      clips: [clip("track-clip")],
      volume: 1,
      muted: false,
    }],
    slots: [],
    selectedClipId: null,
    position: 0,
  });
  const moved = createStudioEditingSnapshot({
    ...base,
    tracks: [{ ...base.tracks[0], clips: [clip("track-clip", 6)] }],
    position: 6,
  });
  let history = recordStudioHistory(createStudioHistory(base), moved);
  const undone = undoStudioHistory(history);
  assert(undone.snapshot);
  history = undone.history;
  const redone = redoStudioHistory(history);
  assert(redone.snapshot);
  const undoDocument = historyDocument(undone.snapshot);
  const redoDocument = historyDocument(redone.snapshot);
  let snapshot: StudioAutosaveSnapshot = { name: "История", document: undoDocument };
  const { controller, clock } = createController(store, () => snapshot);
  controller.markDirty();
  clock.advance(1);
  await tick();
  snapshot = { name: "История", document: redoDocument };
  controller.markDirty();
  clock.advance(1);
  await tick();
  assert.equal(store.project.revision, 3);
  assert.equal(canonical(store.project.projectData as StudioProjectDocumentV2), canonical(redoDocument));
}

// Drag/trim/fade/volume/mute values are all part of the persisted document.
{
  const edited = document(11, [track("edited", assetIds[0], {
    volume: 0.35,
    muted: true,
    clips: [clip("edited-clip", 4, {
      offset: 1,
      duration: 5,
      fadeInDuration: 0.5,
      fadeOutDuration: 1.5,
    })],
  })]);
  assert.equal(canonical(edited), canonical(serializeStudioProjectState({
    currentTime: 11,
    tracks: deserializeStudioProjectDocument(edited).tracks,
    slots: [],
  }).document));
}

// A failed replacement never changes the saved document; a successful one does.
{
  const before = document(0, [track("replace", assetIds[0])]);
  const failedReplacement = before;
  const successfulReplacement = document(0, [track("replace", assetIds[1])]);
  assert(areStudioProjectDocumentsEqual(before, failedReplacement));
  assert(!areStudioProjectDocumentsEqual(before, successfulReplacement));

  const store = new FakeStudioStore(before);
  let blocked: StudioAutosaveSnapshot["blocked"] = "asset-error";
  let snapshot: StudioAutosaveSnapshot = { name: "Replace", document: successfulReplacement, blocked };
  const { controller, clock } = createController(store, () => snapshot);
  controller.markDirty();
  clock.advance(1);
  assert.equal(store.putCount, 0, "failed replacement blocks unsafe document PUT");
  blocked = undefined;
  snapshot = { name: "Replace", document: successfulReplacement, blocked };
  controller.retry();
  await tick();
  assert.equal(store.putCount, 1);
}

// Clearing a track only changes the document; no orphan asset deletion is issued.
{
  const store = new FakeStudioStore(document(0, [track("clear", assetIds[0])]));
  store.upload(assetIds[0], "orphan.wav", "upload");
  const cleared = document();
  const snapshot: StudioAutosaveSnapshot = { name: "Cleared", document: cleared };
  const { controller, clock } = createController(store, () => snapshot);
  controller.markDirty();
  clock.advance(1);
  await tick();
  assert.equal(store.deleteCount, 0);
  assert.equal(store.assets.size, 1);
}

// Five tracks with many clips hydrate every distinct referenced asset once.
{
  const store = new FakeStudioStore();
  const tracks = Array.from({ length: 5 }, (_, index) => {
    const metadata = store.upload(assetIds[index], `track-${index}.wav`, "upload");
    return track(`track-${index}`, metadata.id, {
      clips: [clip(`clip-${index}-a`, 0), clip(`clip-${index}-b`, 4), clip(`clip-${index}-c`, 8)],
    });
  });
  const hydrated = await hydrateStudioProject({
    project: { ...store.project, projectData: document(0, tracks) },
    assets: [...store.assets.values()].map(({ metadata }) => metadata),
    download: (asset) => store.download(asset),
    decode: (blob, asset) => store.decode(blob, asset),
  });
  assert.equal(hydrated.assets.size, 5);
  assert.equal(store.downloadCount, 5);
  assert.equal(store.decodeCount, 5);
}

// More than ten clips may share one asset without duplicate downloads or decodes.
{
  const store = new FakeStudioStore();
  const metadata = store.upload(assetIds[0], "fragments.wav", "upload");
  const clips = Array.from(
    { length: 12 },
    (_, index) => clip(`fragment-${index}`, index * 2),
  );
  const hydrated = await hydrateStudioProject({
    project: {
      ...store.project,
      projectData: document(0, [track("fragments", metadata.id, { clips })]),
    },
    assets: [metadata],
    download: (asset) => store.download(asset),
    decode: (blob, asset) => store.decode(blob, asset),
  });
  assert.equal(hydrated.state.tracks[0].clips.length, 12);
  assert.equal(store.downloadCount, 1);
  assert.equal(store.decodeCount, 1);
}

// Pending/error uploads block saves, then binding an asset and retrying releases one PUT.
{
  const store = new FakeStudioStore();
  let blocked: StudioAutosaveSnapshot["blocked"] = "assets";
  let snapshot: StudioAutosaveSnapshot = { name: "Upload", document: document(), blocked };
  const { controller, clock } = createController(store, () => snapshot);
  controller.markDirty();
  clock.advance(1);
  assert.equal(store.putCount, 0);
  assert.equal(controller.getState().status, "asset-uploading");
  blocked = "asset-error";
  snapshot = { name: "Upload", document: document(), blocked };
  controller.markDirty();
  assert.equal(controller.getState().status, "error");
  blocked = undefined;
  snapshot = { name: "Upload", document: document(0, [track("bound", assetIds[0])]), blocked };
  controller.retry();
  await tick();
  assert.equal(store.putCount, 1);
}

// A revision conflict leaves the remote document untouched and disables overwrite.
{
  const store = new FakeStudioStore(document(0, [track("remote", assetIds[0])]));
  const remoteDocument = store.project.projectData as StudioProjectDocumentV2;
  const localDocument = document(2, [track("local", assetIds[1])]);
  const { controller, clock } = createController(store, () => ({ name: "Local", document: localDocument }));
  store.project = { ...store.project, revision: 2 }; // Simulate another window's successful PUT.
  controller.markDirty();
  clock.advance(1);
  await tick();
  assert.equal(controller.getState().status, "conflict");
  assert(areStudioProjectDocumentsEqual(store.project.projectData, remoteDocument));
  controller.markDirty();
  clock.advance(10);
  assert.equal(store.putCount, 1);
}

// An edit made during an in-flight PUT becomes one later sequential revision, never parallel.
{
  const requests: Array<ReturnType<typeof deferred<{ revision: number }>>> = [];
  let snapshot: StudioAutosaveSnapshot = { name: "A", document: document(1) };
  const clock = createTimers();
  const controller = new StudioAutosaveController({
    getSnapshot: () => snapshot,
    timers: clock.timers,
    debounceMs: 1,
    update: () => {
      const request = deferred<{ revision: number }>();
      requests.push(request);
      return request.promise;
    },
  });
  controller.hydrate({ revision: 1, name: "Без названия", document: document(), complete: true });
  controller.markDirty();
  clock.advance(1);
  assert.equal(requests.length, 1);
  snapshot = { name: "B", document: document(2) };
  controller.markDirty();
  controller.markDirty();
  clock.advance(10);
  assert.equal(requests.length, 1);
  requests[0].resolve({ revision: 2 });
  await tick();
  clock.advance(1);
  assert.equal(requests.length, 2);
  requests[1].resolve({ revision: 3 });
  await tick();
  assert.equal(controller.getState().revision, 3);
}

// Partial/missing/unsupported projects do not enter automatic save.
{
  const store = new FakeStudioStore();
  const missingAssetDocument = document(0, [track("missing", assetIds[0])]);
  const hydration = await hydrateStudioProject({
    project: { ...store.project, projectData: missingAssetDocument },
    assets: [],
    download: (asset) => store.download(asset),
    decode: (blob, asset) => store.decode(blob, asset),
  });
  assert.equal(hydration.failures.size, 1);
  const partial = createController(store, () => ({
    name: "Partial",
    document: missingAssetDocument,
    blocked: "partial",
  }));
  partial.controller.hydrate({
    revision: 1, name: "Partial", document: missingAssetDocument, complete: false,
  });
  partial.controller.markDirty();
  partial.clock.advance(1);
  assert.equal(store.putCount, 0);
  assert.throws(
    () => deserializeStudioProjectDocument({ ...missingAssetDocument, schemaVersion: 999 }),
    /unsupported_schema_version/,
  );
}

// Manual flush and repeated current-time edits produce bounded PUTs, not playback storms.
{
  const store = new FakeStudioStore();
  let snapshot: StudioAutosaveSnapshot = { name: "Transport", document: document(1) };
  const { controller, clock } = createController(store, () => snapshot, 100);
  for (let position = 2; position <= 12; position += 1) {
    snapshot = { name: "Transport", document: document(position) };
    controller.markDirty();
  }
  clock.advance(99);
  assert.equal(store.putCount, 0);
  controller.flush();
  await tick();
  assert.equal(store.putCount, 1, "manual save flushes the latest transport position once");
  snapshot = { name: "Transport", document: document(20) };
  controller.markDirty();
  clock.advance(100);
  await tick();
  assert.equal(store.putCount, 2, "normal debounced save is one PUT");
  assert.equal((store.project.projectData as StudioProjectDocumentV2).editor.currentTime, 20);
}

// Rename is a row-level project update: the canonical document remains unchanged.
{
  const store = new FakeStudioStore(document(0, [track("rename", assetIds[0])]));
  const unchangedDocument = store.project.projectData as StudioProjectDocumentV2;
  const { controller, clock } = createController(store, () => ({ name: "Новое имя", document: unchangedDocument }));
  controller.markDirty();
  clock.advance(1);
  await tick();
  assert.equal(store.project.name, "Новое имя");
  assert(areStudioProjectDocumentsEqual(store.project.projectData, unchangedDocument));
}

// beforeunload should warn only for dirty/in-flight/error/asset-uploading states.
{
  const savedStore = new FakeStudioStore();
  const saved = createController(savedStore, () => ({ name: "Saved", document: document() }));
  assert.equal(saved.controller.getState().canWarnBeforeUnload, false);

  const dirty = createController(savedStore, () => ({ name: "Dirty", document: document(1) }));
  dirty.controller.markDirty();
  assert.equal(dirty.controller.getState().canWarnBeforeUnload, true);

  const assets = createController(savedStore, () => ({
    name: "Assets", document: document(), blocked: "assets",
  }));
  assets.controller.markDirty();
  assert.equal(assets.controller.getState().canWarnBeforeUnload, true);
}

console.log(
  "studio persistence integration unit checks passed " +
    "(in-memory only; backend/storage/RLS/real route checks require an isolated test database and are unavailable here)",
);
