import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { hydrateStudioProject } from "../src/lib/studio/hydration";

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
let downloads = 0;
let decodes = 0;
const result = await hydrateStudioProject({
  project,
  assets: [metadata],
  download: async () => {
    downloads += 1;
    return new Blob(["audio"], { type: "audio/webm" });
  },
  decode: async () => {
    decodes += 1;
    return { duration: 8 } as AudioBuffer;
  },
});
assert.equal(downloads, 1);
assert.equal(decodes, 1);
assert.equal(result.assets.get(assetId)?.file.type, "audio/webm");
assert.equal(result.assets.get(assetId)?.metadata.sourceType, "recording");
assert.equal(result.state.currentTime, 42);
assert.equal(result.state.tracks[0].voicePreset, "trance");
assert.deepEqual(result.state.tracks[0].clips.map((clip) => clip.startTime), [3, 9]);
assert.equal(result.assets.get(assetId)?.buffer, result.assets.get(assetId)?.buffer);

const mp4Hydration = await hydrateStudioProject({
  project,
  assets: [{ ...metadata, originalName: "recording.m4a", mimeType: "audio/mp4" }],
  download: async () => new Blob(["audio"], { type: "audio/mp4" }),
  decode: async () => ({ duration: 8 } as AudioBuffer),
});
assert.equal(mp4Hydration.assets.get(assetId)?.file.type, "audio/mp4");
assert.equal(mp4Hydration.assets.get(assetId)?.metadata.sourceType, "recording");

const provider = await readFile(
  new URL("../src/components/studio/StudioAudioProvider.tsx", import.meta.url), "utf8",
);
const shell = await readFile(
  new URL("../src/components/studio/PersistedStudioProjectShell.tsx", import.meta.url), "utf8",
);
const route = await readFile(
  new URL("../src/app/(studio)/studio/project/[projectId]/page.tsx", import.meta.url), "utf8",
);
assert.match(provider, /hydratePersistedProject/);
assert.match(provider, /decodePersistedAsset/);
assert.match(provider, /assetPersistenceStatus: "saved"/);
assert.match(shell, /controller\.abort/);
assert.match(shell, /Загрузка аудио: \$\{progress\.completed\}\/\$\{progress\.total\}/);
assert.match(shell, /persistenceProjectId=\{projectId\}/);
assert.match(route, /requireStudioAuthorAccess\(`\/studio\/project\/\$\{projectId\}`\)/);
assert.match(shell, /persistedHydration=\{hydration\}/);

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
let sharedDownloads = 0;
const sharedHydration = await hydrateStudioProject({
  project: sharedProject,
  assets: [metadata],
  download: async () => {
    sharedDownloads += 1;
    return new Blob(["audio"], { type: "audio/webm" });
  },
  decode: async () => ({ duration: 8 } as AudioBuffer),
});
assert.equal(sharedHydration.state.tracks.length, 2);
assert.equal(sharedHydration.state.tracks[0].assetId, assetId);
assert.equal(sharedHydration.state.tracks[1].assetId, assetId);
assert.equal(sharedDownloads, 1);
assert.equal(sharedHydration.assets.size, 1);

console.log("studio project hydration checks passed");
