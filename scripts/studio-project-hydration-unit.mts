import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  classifyStudioHydrationFailure,
  collectInitialHydrationAssetIds,
  createStudioHydrationTimeout,
  getHydratedTrackLoadState,
  hydrateStudioProject,
  loadPersistedStudioAsset,
  STUDIO_PROJECT_HYDRATION_TIMEOUT_MESSAGE,
  STUDIO_PROJECT_HYDRATION_TIMEOUT_MS,
} from "../src/lib/studio/hydration";
import type { StudioProjectAssetMetadata } from "../src/lib/studio/persistence-client";

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
const assetId = "22222222-2222-4222-8222-222222222222";
const project = {
  id: projectId,
  name: "Монтаж",
  revision: 3,
  projectData: {
    schemaVersion: 2,
    studioVersion: 1,
    editor: { currentTime: 42 },
    slots: [{ id: "slot-1", name: "Голос", audioTrackId: "track-1" }],
    tracks: [{
      id: "track-1", assetId, name: "Голос", volume: 0.6, muted: true,
      voicePreset: "space",
      clips: [
        { id: "clip-1", startTime: 3, offset: 1, duration: 2, fadeInDuration: 0.2, fadeOutDuration: 0.4 },
        { id: "clip-2", startTime: 9, offset: 4, duration: 1, fadeInDuration: 0, fadeOutDuration: 0 },
      ],
    }],
  },
};
const metadata = {
  id: assetId, projectId, originalName: "recording.webm", mimeType: "audio/webm",
  sizeBytes: 5, durationSeconds: 8, sourceType: "recording" as const, createdAt: "2026-08-09T00:00:00.000Z",
};
function signedPlayback(asset: StudioProjectAssetMetadata, expiresAt = Date.now() + 14_400_000) {
  return {
    url: `https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/${asset.id}?token=test`,
    expiresAt,
    durationSeconds: asset.durationSeconds,
  };
}

let signs = 0;
const decodes = 0;
const result = await hydrateStudioProject({
  project,
  assets: [metadata],
  signPlayback: async (asset) => {
    signs += 1;
    return signedPlayback(asset);
  },
});
assert.equal(signs, 1);
assert.equal(decodes, 0);
assert.equal(
  result.assets.get(assetId)?.playbackUrl,
  `https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/${assetId}?token=test`,
);
assert.equal(result.assets.get(assetId)?.duration, 8);
assert.equal(result.assets.get(assetId)?.metadata.sourceType, "recording");
assert.equal(result.state.currentTime, 42);
assert.equal(result.state.tracks[0].voicePreset, "trance");
assert.deepEqual(result.state.tracks[0].clips.map((clip) => clip.startTime), [3, 9]);
assert.equal(result.assets.get(assetId)?.playbackUrl, result.assets.get(assetId)?.playbackUrl);

const reopened = await hydrateStudioProject({
  project,
  assets: [metadata],
  signPlayback: async (asset) => signedPlayback(asset, Date.now() + 14_400_000),
});
assert.match(
  reopened.assets.get(assetId)?.playbackUrl ?? "",
  /\/storage\/v1\/object\/sign\/studio-draft-assets\//,
);
assert.notEqual(reopened.assets.get(assetId)?.playbackUrl, undefined);
assert.equal(
  typeof reopened.assets.get(assetId)?.expiresAt === "number" &&
    (reopened.assets.get(assetId)?.expiresAt ?? 0) > Date.now(),
  true,
);

const mp4Hydration = await hydrateStudioProject({
  project,
  assets: [{ ...metadata, originalName: "recording.m4a", mimeType: "audio/mp4" }],
  signPlayback: async (asset) => signedPlayback(asset),
});
assert.equal(mp4Hydration.assets.get(assetId)?.metadata.mimeType, "audio/mp4");
assert.equal(mp4Hydration.assets.get(assetId)?.metadata.sourceType, "recording");
assert.equal(mp4Hydration.assets.get(assetId)?.duration, 8);

const provider = await readFile(
  new URL("../src/components/studio/StudioAudioProvider.tsx", import.meta.url), "utf8",
);
const shell = await readFile(
  new URL("../src/components/studio/PersistedStudioProjectShell.tsx", import.meta.url), "utf8",
);
const editor = await readFile(
  new URL("../src/components/studio/StudioEditorShell.tsx", import.meta.url), "utf8",
);
const timeline = await readFile(
  new URL("../src/components/studio/StudioTimeline.tsx", import.meta.url), "utf8",
);
const route = await readFile(
  new URL("../src/app/(studio)/studio/project/[projectId]/page.tsx", import.meta.url), "utf8",
);
assert.match(provider, /hydratePersistedProject/);
assert.doesNotMatch(provider, /decodePersistedAsset/);
assert.doesNotMatch(provider, /decodeAudioData/);
assert.doesNotMatch(provider, /file\.arrayBuffer\(|blob\.arrayBuffer\(/);
assert.match(provider, /createMediaElementSource/);
assert.match(provider, /createLocalStudioPlaybackAsset/);
assert.match(provider, /getStudioAssetPlaybackUrl/);
assert.match(provider, /assetPersistenceStatus: "saved"/);
assert.match(shell, /controller\.abort/);
assert.match(shell, /Загрузка аудио: \$\{progress\.completed\}\/\$\{progress\.total\}/);
assert.match(shell, /persistenceProjectId=\{projectId\}/);
assert.match(route, /requireStudioEditorAccess\(`\/studio\/project\/\$\{projectId\}`\)/);
assert.match(shell, /persistedHydration=\{hydration\}/);
assert.match(shell, /createStudioHydrationTimeout/);
assert.match(shell, /classifyStudioHydrationFailure/);
assert.match(shell, /STUDIO_PROJECT_HYDRATION_TIMEOUT_MESSAGE/);
assert.match(shell, /collectInitialHydrationAssetIds/);
assert.doesNotMatch(shell, /30_000/);
assert.equal(STUDIO_PROJECT_HYDRATION_TIMEOUT_MS, 120_000);
assert.match(provider, /getHydratedTrackLoadState/);
assert.match(provider, /ensurePersistedTrackAsset/);
assert.match(provider, /getStudioAssetPlaybackUrl/);
assert.doesNotMatch(shell, /downloadStudioProjectAsset/);
assert.match(shell, /signPlayback/);
assert.match(shell, /getStudioAssetPlaybackUrl/);
assert.match(provider, /item\.clips\.length === 0/);
assert.match(provider, /if \(!track \|\| track\.isReplacing\)/);
assert.doesNotMatch(provider, /if \(!track \|\| !runtime \|\| track\.isReplacing\)/);
assert.match(editor, /existingTrackId/);
assert.match(editor, /replaceTrackAudio\(existingTrackId, file\)/);
assert.match(timeline, /track\.clips\.length === 0 \? renderEmpty/);
assert.match(timeline, /track\.hasAudio && track\.buffer/);

const sharedProject = {
  ...project,
  projectData: {
    ...project.projectData,
    slots: [
      { id: "slot-1", name: "Музыка 1", audioTrackId: "track-1", trackKind: "music" as const },
      { id: "slot-2", name: "Музыка 2", audioTrackId: "track-2", trackKind: "music" as const },
    ],
    tracks: [
      project.projectData.tracks[0],
      {
        ...project.projectData.tracks[0],
        id: "track-2",
        name: "Музыка 2",
        clips: [
          { id: "clip-3", startTime: 0, offset: 0, duration: 2, fadeInDuration: 0, fadeOutDuration: 0 },
        ],
      },
    ],
  },
};
let sharedSigns = 0;
const sharedHydration = await hydrateStudioProject({
  project: sharedProject,
  assets: [metadata],
  signPlayback: async (asset) => {
    sharedSigns += 1;
    return signedPlayback(asset);
  },
});
assert.equal(sharedHydration.state.tracks.length, 2);
assert.equal(sharedHydration.state.tracks[0].assetId, assetId);
assert.equal(sharedHydration.state.tracks[1].assetId, assetId);
assert.equal(sharedSigns, 1);
assert.equal(sharedHydration.assets.size, 1);

const emptyAssetId = "33333333-3333-4333-8333-333333333333";
const musicAssetId = "44444444-4444-4444-8444-444444444444";
const voiceAssetId = "55555555-5555-4555-8555-555555555555";
const emptyMetadata = {
  ...metadata,
  id: emptyAssetId,
  originalName: "empty-voice.webm",
  sizeBytes: 8_000_000,
  durationSeconds: 505,
};
const musicMetadata = {
  ...metadata,
  id: musicAssetId,
  originalName: "music.mp3",
  mimeType: "audio/mpeg",
  sourceType: "upload" as const,
};
const voiceMetadata = {
  ...metadata,
  id: voiceAssetId,
  originalName: "voice.webm",
};
const olgaLikeProject = {
  ...project,
  projectData: {
    ...project.projectData,
    slots: [
      { id: "slot-empty", name: "Голос", audioTrackId: "track-empty", trackKind: "voice" as const },
      { id: "slot-music", name: "Музыка", audioTrackId: "track-music", trackKind: "music" as const },
      { id: "slot-voice", name: "Голос 2", audioTrackId: "track-voice", trackKind: "voice" as const },
    ],
    tracks: [
      {
        id: "track-empty",
        assetId: emptyAssetId,
        name: "Голос",
        volume: 1,
        muted: false,
        trackKind: "voice" as const,
        voicePreset: "none",
        clips: [],
      },
      {
        id: "track-music",
        assetId: musicAssetId,
        name: "Музыка",
        volume: 0.4,
        muted: false,
        trackKind: "music" as const,
        voicePreset: "none",
        clips: [
          { id: "clip-music", startTime: 0, offset: 0, duration: 4, fadeInDuration: 0, fadeOutDuration: 0 },
        ],
      },
      {
        id: "track-voice",
        assetId: voiceAssetId,
        name: "Голос 2",
        volume: 1,
        muted: false,
        trackKind: "voice" as const,
        voicePreset: "none",
        clips: [
          { id: "clip-voice", startTime: 1, offset: 0, duration: 3, fadeInDuration: 0, fadeOutDuration: 0 },
        ],
      },
    ],
  },
};
const signedAssetIds: string[] = [];
const olgaHydration = await hydrateStudioProject({
  project: olgaLikeProject,
  assets: [emptyMetadata, musicMetadata, voiceMetadata],
  signPlayback: async (asset) => {
    signedAssetIds.push(asset.id);
    return signedPlayback(asset);
  },
});
assert.deepEqual(
  collectInitialHydrationAssetIds(olgaLikeProject.projectData.tracks).sort(),
  [musicAssetId, voiceAssetId].sort(),
);
assert.deepEqual(signedAssetIds.sort(), [musicAssetId, voiceAssetId].sort());
assert.equal(olgaHydration.assets.has(emptyAssetId), false);
assert.equal(olgaHydration.assets.has(musicAssetId), true);
assert.equal(olgaHydration.assets.has(voiceAssetId), true);
assert.equal(olgaHydration.failures.size, 0);
assert.equal(olgaHydration.assetMetadata.get(emptyAssetId)?.originalName, "empty-voice.webm");
assert.deepEqual(
  getHydratedTrackLoadState({ clipsLength: 0, hasAsset: false }),
  { status: "ready", replacementError: null },
);
assert.deepEqual(
  getHydratedTrackLoadState({ clipsLength: 1, hasAsset: true }),
  { status: "ready", replacementError: null },
);
assert.deepEqual(
  getHydratedTrackLoadState({ clipsLength: 1, hasAsset: false }),
  { status: "error", replacementError: "Не удалось загрузить аудио дорожки." },
);

const lazyAsset = await loadPersistedStudioAsset({
  metadata: emptyMetadata,
  signPlayback: async (asset) => signedPlayback(asset),
});
assert.equal(lazyAsset.metadata.id, emptyAssetId);
assert.equal(lazyAsset.duration, 505);
assert.match(lazyAsset.playbackUrl, /studio-draft-assets/);

let abortedSigns = 0;
const abortController = new AbortController();
abortController.abort();
await assert.rejects(
  () => loadPersistedStudioAsset({
    metadata: emptyMetadata,
    signal: abortController.signal,
    signPlayback: async (asset) => {
      abortedSigns += 1;
      return signedPlayback(asset);
    },
  }),
  (error: unknown) => error instanceof DOMException && error.name === "AbortError",
);
assert.equal(abortedSigns, 0);

const scheduled: Array<{ fn: () => void; ms: number }> = [];
let timeoutAborted = false;
let cleared = false;
const hydrationTimeout = createStudioHydrationTimeout({
  abort: () => {
    timeoutAborted = true;
  },
  setTimeoutFn: (fn, ms) => {
    scheduled.push({ fn, ms });
    return 1;
  },
  clearTimeoutFn: () => {
    cleared = true;
  },
});
assert.equal(scheduled.length, 1);
assert.equal(scheduled[0].ms, 120_000);
assert.equal(hydrationTimeout.didTimeOut(), false);
assert.equal(timeoutAborted, false);
assert.equal(
  classifyStudioHydrationFailure({ unmounted: false, timedOut: false }),
  null,
);
hydrationTimeout.cancel();
assert.equal(cleared, true);
assert.equal(hydrationTimeout.didTimeOut(), false);
assert.equal(
  classifyStudioHydrationFailure({
    unmounted: true,
    timedOut: hydrationTimeout.didTimeOut(),
    aborted: true,
  }),
  "unmount",
);

let hardLimitAborted = false;
const hardLimitTimeout = createStudioHydrationTimeout({
  abort: () => {
    hardLimitAborted = true;
  },
  setTimeoutFn: (fn, ms) => {
    scheduled.push({ fn, ms });
    return 2;
  },
  clearTimeoutFn: () => {},
});
assert.equal(scheduled[1].ms, STUDIO_PROJECT_HYDRATION_TIMEOUT_MS);
assert.equal(hardLimitAborted, false);
scheduled[1].fn();
assert.equal(hardLimitTimeout.didTimeOut(), true);
assert.equal(hardLimitAborted, true);
assert.equal(
  classifyStudioHydrationFailure({
    unmounted: false,
    timedOut: hardLimitTimeout.didTimeOut(),
    aborted: true,
  }),
  "timeout",
);
assert.equal(
  classifyStudioHydrationFailure({
    unmounted: true,
    timedOut: true,
    aborted: true,
  }),
  "unmount",
);
assert.match(STUDIO_PROJECT_HYDRATION_TIMEOUT_MESSAGE, /Загрузка аудио заняла слишком много времени/);

await assert.rejects(
  () => loadPersistedStudioAsset({
    metadata: { ...emptyMetadata, durationSeconds: null },
    signPlayback: async (asset) => ({
      url: `https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/${asset.id}?token=test`,
      expiresAt: Date.now() + 14_400_000,
      durationSeconds: null,
    }),
  }),
  (error: unknown) => error instanceof Error && /повреждён/.test(error.message),
);

const missingDurationHydration = await hydrateStudioProject({
  project,
  assets: [{ ...metadata, durationSeconds: null }],
  signPlayback: async (asset) => ({
    url: `https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/${asset.id}?token=test`,
    expiresAt: Date.now() + 14_400_000,
    durationSeconds: null,
  }),
});
assert.equal(missingDurationHydration.assets.size, 0);
assert.equal(missingDurationHydration.failures.size, 1);

{
  let catalogSigns = 0;
  const catalogAssetId = "33333333-3333-4333-8333-333333333333";
  const catalogHydration = await hydrateStudioProject({
    project: {
      ...project,
      projectData: {
        ...project.projectData,
        slots: [{
          id: "slot-1",
          name: "Музыка",
          audioTrackId: "track-catalog",
          trackKind: "music",
        }],
        tracks: [{
          id: "track-catalog",
          assetId: catalogAssetId,
          name: "Музыка",
          volume: 1,
          muted: false,
          trackKind: "music",
          clips: [{
            id: "clip-catalog",
            startTime: 0,
            offset: 0,
            duration: 12,
            fadeInDuration: 0,
            fadeOutDuration: 0,
          }],
        }],
      },
    },
    assets: [{
      id: catalogAssetId,
      projectId,
      originalName: "Рассвет",
      mimeType: "audio/mpeg",
      sizeBytes: 0,
      durationSeconds: 12,
      sourceType: "catalog",
      createdAt: "2026-09-10T00:00:00.000Z",
      catalogPracticeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      catalogAudioItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      available: false,
    }],
    signPlayback: async () => {
      catalogSigns += 1;
      throw new Error("should not sign unavailable catalog");
    },
  });
  assert.equal(catalogSigns, 0);
  assert.equal(catalogHydration.assets.size, 0);
  assert.equal(catalogHydration.failures.size, 1);
  assert.match(
    catalogHydration.failures.get(catalogAssetId)?.message ?? "",
    /Музыка из каталога недоступна/,
  );
}

console.log("studio project hydration checks passed");
