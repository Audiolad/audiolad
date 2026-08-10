import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  StudioPersistenceClientError,
  uploadStudioProjectAsset,
} from "../src/lib/studio/persistence-client";

const projectId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;
const file = new Blob(["audio"], { type: "audio/mpeg" }) as File;
const recordingFile = new File(["opus"], "Запись 1.webm", {
  type: "audio/webm;codecs=opus",
});

function assetResponse(
  id = assetId,
  overrides: Partial<{
    originalName: string;
    mimeType: string;
    sourceType: "upload" | "recording";
  }> = {},
) {
  return {
    asset: {
      id,
      projectId,
      originalName: "voice.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 5,
      durationSeconds: null,
      sourceType: "upload",
      createdAt: "2026-08-09T00:00:00.000Z",
      ...overrides,
    },
  };
}

async function withFetch(
  implementation: typeof fetch,
  test: () => Promise<void>,
) {
  globalThis.fetch = implementation;
  try {
    await test();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await withFetch(async (url, init) => {
  assert.equal(url, `/api/studio/projects/${projectId}/assets`);
  assert.equal(init?.method, "POST");
  assert(init?.body instanceof FormData);
  assert(init.body.get("file") instanceof Blob);
  assert.equal(init.body.get("sourceType"), "upload");
  return Response.json(assetResponse(), { status: 201 });
}, async () => {
  const asset = await uploadStudioProjectAsset({
    projectId,
    file,
    sourceType: "upload",
  });
  assert.equal(asset.id, assetId);
});

await withFetch(async (_url, init) => {
  assert(init?.body instanceof FormData);
  const uploadedRecording = init.body.get("file");
  assert(uploadedRecording instanceof File);
  assert.equal(uploadedRecording.type, "audio/webm;codecs=opus");
  assert.equal(init.body.get("sourceType"), "recording");
  return Response.json(assetResponse(assetId, {
    originalName: "recording.webm",
    mimeType: "audio/webm",
    sourceType: "recording",
  }), { status: 201 });
}, async () => {
  const asset = await uploadStudioProjectAsset({
    projectId,
    file: recordingFile,
    sourceType: "recording",
  });
  assert.equal(asset.mimeType, "audio/webm");
  assert.equal(asset.sourceType, "recording");
});

let independentUploads = 0;
await withFetch(async () => {
  independentUploads += 1;
  return Response.json(assetResponse(
    `22222222-2222-4222-8222-22222222222${independentUploads}`,
  ), { status: 201 });
}, async () => {
  const assets = await Promise.all([
    uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
    uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
  ]);
  assert.equal(assets.length, 2);
  assert.equal(independentUploads, 2);
});

for (const [status, code] of [
  [413, "asset_too_large"],
  [422, "invalid_upload"],
  [401, "unauthenticated"],
  [403, "forbidden"],
  [404, "project_not_found"],
  [500, "server_error"],
] as const) {
  await withFetch(
    async () => Response.json({ error: code }, { status }),
    async () => {
      await assert.rejects(
        uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
        (error: unknown) =>
          error instanceof StudioPersistenceClientError && error.code === code,
      );
    },
  );
}

await withFetch(async () => {
  throw new TypeError("offline");
}, async () => {
  await assert.rejects(
    uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
    (error: unknown) =>
      error instanceof StudioPersistenceClientError && error.code === "network_error",
  );
});

const provider = await readFile(
  new URL("../src/components/studio/StudioAudioProvider.tsx", import.meta.url),
  "utf8",
);
const editor = await readFile(
  new URL("../src/components/studio/StudioEditorShell.tsx", import.meta.url),
  "utf8",
);
const history = await readFile(new URL("../src/lib/studio/history.ts", import.meta.url), "utf8");

assert.match(provider, /persistenceProjectId\?: string/);
assert.match(provider, /if \(persistenceProjectId\) \{\s+for \(const track of createdTracks\)/);
assert.match(provider, /sourceType: "recording"/);
assert.match(provider, /assetUploadGenerationRef/);
assert.match(provider, /assetUploadControllersRef/);
assert.match(provider, /cancelTrackAssetUpload\(trackId\)/);
assert.match(provider, /assetId: uploadedAsset\.id/);
assert.match(provider, /assetId: null,\s+assetPersistenceStatus: "pending"/);
assert.match(provider, /retryTrackAssetUpload/);
assert.match(provider, /sourceType: "upload"/);
assert.match(provider, /assetId: track\.assetId/);
assert.match(history, /assetPersistenceStatus/);
assert.match(editor, /hasPersistenceProject && track/);
assert.match(editor, /Повторить/);

console.log("studio asset persistence checks passed");
