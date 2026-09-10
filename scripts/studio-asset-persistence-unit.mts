import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  StudioPersistenceClientError,
  attachStudioCatalogAsset,
  getStudioAssetPlaybackUrl,
  replaceStudioProjectAsset,
  retryStudioProjectAssetUpload,
  studioSignedUploadUrl,
  uploadStudioProjectAsset,
} from "../src/lib/studio/persistence-client";

const projectId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;
const file = new File(["audio"], "voice.mp3", { type: "audio/mpeg" });
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
      durationSeconds: 12,
      sourceType: "upload",
      createdAt: "2026-08-09T00:00:00.000Z",
      ...overrides,
    },
  };
}

const signedUpload = { path: "studio/a/b/c/voice.mp3", token: "signed-token" };

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

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage.audiolad.test";
const signedUploadHref = studioSignedUploadUrl(signedUpload);
let uploadedToSignedUrl = 0;

await withFetch(async (url, init) => {
  const href = String(url);
  if (href === `/api/studio/projects/${projectId}/assets`) {
    assert.equal(init?.method, "POST");
    assert.equal(
      (init?.headers as Record<string, string> | undefined)?.["Content-Type"],
      "application/json",
    );
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.sourceType, "upload");
    assert.equal(payload.sizeBytes, file.size);
    assert(!String(init?.body).includes("FormData"));
    return Response.json({ ...assetResponse(), signedUpload }, { status: 201 });
  }
  if (href === signedUploadHref) {
    assert.equal(init?.method, "PUT");
    assert.equal(init?.body, file);
    uploadedToSignedUrl += 1;
    return new Response(null, { status: 200 });
  }
  if (href.endsWith("/finalize")) {
    assert.equal(init?.method, "POST");
    return Response.json(assetResponse(), { status: 200 });
  }
  throw new Error(`unexpected fetch ${href}`);
}, async () => {
  uploadedToSignedUrl = 0;
  const asset = await uploadStudioProjectAsset({
    projectId,
    file,
    sourceType: "upload",
  });
  assert.equal(asset.id, assetId);
  assert.equal(uploadedToSignedUrl, 1);
});

await withFetch(async (url, init) => {
  const href = String(url);
  if (href.endsWith("/assets")) {
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.sourceType, "recording");
    return Response.json({
      ...assetResponse(assetId, {
        originalName: "recording.webm",
        mimeType: "audio/webm",
        sourceType: "recording",
      }),
      signedUpload,
    }, { status: 201 });
  }
  if (href === signedUploadHref) {
    return new Response(null, { status: 200 });
  }
  if (href.endsWith("/finalize")) {
    return Response.json(assetResponse(assetId, {
      originalName: "recording.webm",
      mimeType: "audio/webm",
      sourceType: "recording",
    }));
  }
  throw new Error(`unexpected fetch ${href}`);
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
await withFetch(async (url) => {
  const href = String(url);
  if (href.endsWith("/assets")) {
    independentUploads += 1;
    return Response.json({
      ...assetResponse(`22222222-2222-4222-8222-22222222222${independentUploads}`),
      signedUpload,
    }, { status: 201 });
  }
  if (href === signedUploadHref) {
    return new Response(null, { status: 200 });
  }
  return Response.json(assetResponse());
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

await withFetch(
  async () => Response.json({ error: "unsupported_mime_type" }, { status: 422 }),
  async () => {
    await assert.rejects(
      uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError &&
        error.code === "invalid_upload",
    );
  },
);

await withFetch(
  async () => Response.json({ error: "invalid_audio_duration" }, { status: 422 }),
  async () => {
    await assert.rejects(
      uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError &&
        error.code === "invalid_audio_duration",
    );
  },
);

await withFetch(
  async () => Response.json({ error: "audio_too_long" }, { status: 422 }),
  async () => {
    await assert.rejects(
      uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError &&
        error.code === "audio_too_long",
    );
  },
);

await withFetch(
  async () => Response.json({ error: "project_asset_quota_exceeded" }, { status: 413 }),
  async () => {
    await assert.rejects(
      uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError &&
        error.code === "project_asset_quota_exceeded",
    );
  },
);

await withFetch(async () => {
  throw new TypeError("offline");
}, async () => {
  await assert.rejects(
    uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
    (error: unknown) =>
      error instanceof StudioPersistenceClientError && error.code === "network_error",
  );
});

await withFetch(async (url, init) => {
  assert.equal(
    url,
    `/api/studio/projects/${projectId}/assets/${assetId}/playback`,
  );
  assert.equal(init?.cache, "no-store");
  return Response.json({
    url: "https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/a?token=t",
    expiresAt: "2026-09-06T20:00:00.000Z",
    durationSeconds: 4281.44,
  });
}, async () => {
  const signed = await getStudioAssetPlaybackUrl({ projectId, assetId });
  assert.equal(
    signed.url,
    "https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/a?token=t",
  );
  assert.equal(signed.expiresAt, Date.parse("2026-09-06T20:00:00.000Z"));
  assert.equal(signed.durationSeconds, 4281.44);
});

await withFetch(
  async () => Response.json({ error: "not_found" }, { status: 404 }),
  async () => {
    await assert.rejects(
      getStudioAssetPlaybackUrl({ projectId, assetId }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError && error.code === "asset_not_found",
    );
  },
);

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
assert.match(provider, /assetPersistenceStatus: "saved"/);
assert.match(provider, /assetId: null,\s+assetPersistenceStatus: "pending"/);
assert.match(provider, /retryTrackAssetUpload/);
assert.match(provider, /pendingReserveAssetIdsRef/);
assert.match(provider, /onReserved/);
assert.match(provider, /retryStudioProjectAssetUpload/);
assert.match(provider, /abandonStudioProjectAssetUpload/);
assert.match(provider, /assetPersistenceStatus: "error"/);
assert.match(
  provider,
  /\)\s*=>\s*\{[\s\S]*assetPersistenceStatus: "error"[\s\S]*replacementError:/,
);
assert.doesNotMatch(
  provider,
  /assetPersistenceStatus: "uploading"[\s\S]{0,80}assetUploadControllersRef\.current\.delete\(trackId\);/,
);
assert.match(provider, /assetPersistenceStatus !== "error"/);
assert.match(provider, /sourceType: "upload"/);
assert.match(provider, /assetId: track\.assetId/);
assert.match(provider, /createStudioLocalDurationError/);
assert.match(provider, /formatStudioLocalIngestError/);
assert.doesNotMatch(provider, /decodeAudioData/);
assert.doesNotMatch(provider, /file\.arrayBuffer\(|blob\.arrayBuffer\(/);
assert.match(history, /assetPersistenceStatus/);
assert.match(editor, /hasPersistenceProject && track/);
assert.match(editor, /Повторить/);
assert.match(provider, /bindSharedAssetState/);
assert.match(provider, /duplicateTrack/);
assert.match(history, /isStudioAssetStillReferenced/);
const assetRoute = await readFile(
  new URL("../src/app/api/studio/projects/[projectId]/assets/route.ts", import.meta.url),
  "utf8",
);
assert.match(assetRoute, /reserveStudioDirectUpload/);
assert.doesNotMatch(assetRoute, /probeStudioAudioDuration/);
assert.doesNotMatch(assetRoute, /formData/);
const client = await readFile(
  new URL("../src/lib/studio/persistence-client.ts", import.meta.url),
  "utf8",
);
assert.match(client, /object\/upload\/sign/);
assert.match(client, /\/finalize/);
assert.match(client, /reconcileAfterAmbiguousPut/);
assert.match(client, /alreadyUploaded/);
assert.match(client, /abandonStudioProjectAssetReplacement/);
assert.doesNotMatch(client, /formData\.set\("file"/);
assert.doesNotMatch(client, /createClient\(/);

// PUT committed, response lost: Storage accepted the File, browser saw a
// network error. Client must finalize the same reservation — no second
// reserve, no abandon of a good object.
{
  let reserveCount = 0;
  let putCount = 0;
  let finalizeCount = 0;
  let abandonCount = 0;
  await withFetch(async (url, init) => {
    const href = String(url);
    if (href === `/api/studio/projects/${projectId}/assets`) {
      reserveCount += 1;
      return Response.json({ ...assetResponse(), signedUpload }, { status: 201 });
    }
    if (href === signedUploadHref) {
      putCount += 1;
      throw new TypeError("Failed to fetch");
    }
    if (href === `/api/studio/projects/${projectId}/assets/${assetId}/finalize`) {
      finalizeCount += 1;
      return Response.json(assetResponse(), { status: 200 });
    }
    if (href.endsWith("/abandon")) {
      abandonCount += 1;
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch ${href} ${init?.method}`);
  }, async () => {
    const asset = await uploadStudioProjectAsset({
      projectId,
      file,
      sourceType: "upload",
    });
    assert.equal(asset.id, assetId);
    assert.equal(reserveCount, 1);
    assert.equal(putCount, 1);
    assert.equal(finalizeCount, 1);
    assert.equal(abandonCount, 0);
  });
}

// Missing/partial object after ambiguous PUT: keep reservation, do not
// create a duplicate, do not treat as fatal finalize.
{
  let reserveCount = 0;
  let abandonCount = 0;
  await withFetch(async (url) => {
    const href = String(url);
    if (href === `/api/studio/projects/${projectId}/assets`) {
      reserveCount += 1;
      return Response.json({ ...assetResponse(), signedUpload }, { status: 201 });
    }
    if (href === signedUploadHref) {
      throw new TypeError("connection reset");
    }
    if (href.endsWith("/finalize")) {
      return Response.json({ error: "upload_not_complete" }, { status: 409 });
    }
    if (href.endsWith("/abandon")) {
      abandonCount += 1;
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch ${href}`);
  }, async () => {
    await assert.rejects(
      uploadStudioProjectAsset({ projectId, file, sourceType: "upload" }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError && error.code === "network_error",
    );
    assert.equal(reserveCount, 1);
    assert.equal(abandonCount, 0);
  });
}

{
  let retryPuts = 0;
  let finalizeCount = 0;
  await withFetch(async (url, init) => {
    const href = String(url);
    if (href === `/api/studio/projects/${projectId}/assets/${assetId}/retry`) {
      assert.equal(init?.method, "POST");
      return Response.json({
        ...assetResponse(),
        signedUpload: null,
        alreadyUploaded: true,
      });
    }
    if (href === `/api/studio/projects/${projectId}/assets/${assetId}/finalize`) {
      finalizeCount += 1;
      return Response.json(assetResponse(), { status: 200 });
    }
    if (href === signedUploadHref) {
      retryPuts += 1;
      return new Response(null, { status: 200 });
    }
    throw new Error(`unexpected fetch ${href}`);
  }, async () => {
    const asset = await retryStudioProjectAssetUpload({
      projectId,
      assetId,
      file,
    });
    assert.equal(asset.id, assetId);
    assert.equal(retryPuts, 0);
    assert.equal(finalizeCount, 1);
  });
}

// Replacement: PUT response lost, finalize finds the pending object →
// SUCCESS. Old ready asset id is unchanged. No abandon.
{
  let replaceReserve = 0;
  let abandonCount = 0;
  await withFetch(async (url) => {
    const href = String(url);
    if (href === `/api/studio/projects/${projectId}/assets/${assetId}`) {
      replaceReserve += 1;
      return Response.json({ ...assetResponse(), signedUpload });
    }
    if (href === signedUploadHref) {
      throw new TypeError("Failed to fetch");
    }
    if (href.endsWith("/replace/finalize")) {
      return Response.json(assetResponse(), { status: 200 });
    }
    if (href.endsWith("/replace/abandon")) {
      abandonCount += 1;
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch ${href}`);
  }, async () => {
    const asset = await replaceStudioProjectAsset({ projectId, assetId, file });
    assert.equal(asset.id, assetId);
    assert.equal(replaceReserve, 1);
    assert.equal(abandonCount, 0);
  });
}

// Replacement PUT failed and object is missing/partial → abandon pending,
// do not return a replaced asset.
{
  let abandonCount = 0;
  await withFetch(async (url) => {
    const href = String(url);
    if (href === `/api/studio/projects/${projectId}/assets/${assetId}`) {
      return Response.json({ ...assetResponse(), signedUpload });
    }
    if (href === signedUploadHref) {
      throw new TypeError("connection reset");
    }
    if (href.endsWith("/replace/finalize")) {
      return Response.json({ error: "upload_not_complete" }, { status: 409 });
    }
    if (href.endsWith("/replace/abandon")) {
      abandonCount += 1;
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch ${href}`);
  }, async () => {
    await assert.rejects(
      replaceStudioProjectAsset({ projectId, assetId, file }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError && error.code === "network_error",
    );
    assert.equal(abandonCount, 1);
  });
}

{
  let abandonCount = 0;
  await withFetch(async (url) => {
    const href = String(url);
    if (href === `/api/studio/projects/${projectId}/assets/${assetId}`) {
      return Response.json({ ...assetResponse(), signedUpload });
    }
    if (href === signedUploadHref) {
      return new Response(null, { status: 200 });
    }
    if (href.endsWith("/replace/finalize")) {
      return Response.json({ error: "invalid_audio_duration" }, { status: 422 });
    }
    if (href.endsWith("/replace/abandon")) {
      abandonCount += 1;
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch ${href}`);
  }, async () => {
    await assert.rejects(
      replaceStudioProjectAsset({ projectId, assetId, file }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError &&
        error.code === "invalid_audio_duration",
    );
    assert.equal(abandonCount, 1);
  });
}

{
  const practiceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const audioItemId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await withFetch(async (url, init) => {
    const href = String(url);
    assert.equal(href, `/api/studio/projects/${projectId}/assets/catalog`);
    assert.equal(init?.method, "POST");
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(payload, { practiceId, audioItemId });
    assert.equal(Object.keys(payload).length, 2);
    return Response.json({
      asset: {
        id: assetId,
        projectId,
        originalName: "Рассвет",
        mimeType: "audio/mpeg",
        sizeBytes: 0,
        durationSeconds: 180,
        sourceType: "catalog",
        createdAt: "2026-09-10T00:00:00.000Z",
        catalogPracticeId: practiceId,
        catalogAudioItemId: audioItemId,
        available: true,
      },
    }, { status: 201 });
  }, async () => {
    const asset = await attachStudioCatalogAsset({
      projectId,
      practiceId,
      audioItemId,
    });
    assert.equal(asset.sourceType, "catalog");
    assert.equal(asset.catalogPracticeId, practiceId);
    assert.equal(asset.catalogAudioItemId, audioItemId);
    assert.equal(asset.available, true);
  });
}

{
  await withFetch(async (url) => {
    assert.equal(
      String(url),
      `/api/studio/projects/${projectId}/assets/catalog`,
    );
    return Response.json(
      {
        asset: {
          id: assetId,
          projectId,
          originalName: "leak",
          mimeType: "audio/mpeg",
          sizeBytes: 0,
          durationSeconds: 12,
          sourceType: "catalog",
          createdAt: "2026-09-10T00:00:00.000Z",
          storage_path: "practice-audio/secret.mp3",
        },
      },
      { status: 201 },
    );
  }, async () => {
    await assert.rejects(
      attachStudioCatalogAsset({
        projectId,
        practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        audioItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
      (error: unknown) =>
        error instanceof StudioPersistenceClientError &&
        error.code === "server_error",
    );
  });
}

console.log("studio asset persistence checks passed");
