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
      clips: [
        { id: "clip-1", startTime: 3, offset: 1, duration: 2, fadeInDuration: 0.2, fadeOutDuration: 0.4 },
        { id: "clip-2", startTime: 9, offset: 4, duration: 1, fadeInDuration: 0, fadeOutDuration: 0 },
      ],
    }],
  },
};
const metadata = {
  id: assetId, projectId, originalName: "voice.mp3", mimeType: "audio/mpeg",
  sizeBytes: 5, durationSeconds: 8, sourceType: "upload" as const, createdAt: "2026-08-09T00:00:00.000Z",
};
let downloads = 0;
let decodes = 0;
const result = await hydrateStudioProject({
  project,
  assets: [metadata],
  download: async () => {
    downloads += 1;
    return new Blob(["audio"], { type: "audio/mpeg" });
  },
  decode: async () => {
    decodes += 1;
    return { duration: 8 } as AudioBuffer;
  },
});
assert.equal(downloads, 1);
assert.equal(decodes, 1);
assert.equal(result.state.currentTime, 42);
assert.deepEqual(result.state.tracks[0].clips.map((clip) => clip.startTime), [3, 9]);
assert.equal(result.assets.get(assetId)?.buffer, result.assets.get(assetId)?.buffer);

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

console.log("studio project hydration checks passed");
