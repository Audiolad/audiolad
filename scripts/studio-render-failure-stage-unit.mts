import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CATALOG_MUSIC_UNAVAILABLE } from "../src/lib/studio/catalog-asset";
import { StudioCatalogMusicUnavailableError } from "../src/lib/studio/render/catalog-source";
import { StudioRenderDurationError } from "../src/lib/studio/render/render";
import type { StudioRenderSnapshot } from "../src/lib/studio/render/types";
import type { ClaimedStudioRenderJob } from "../src/lib/studio/render/worker";
import { StudioRenderAbandonedError } from "../src/lib/studio/render/worker";
import {
  STUDIO_RENDER_PREPARE_FAILED_MESSAGE,
  StudioRenderStageError,
  classifyStudioRenderFailure,
  executeClaimedStudioRenderJob,
  failClaimedStudioRenderJob,
  sanitizeStudioRenderErrorMessage,
  type StudioRenderExecuteDeps,
} from "../src/lib/studio/render/worker-runtime";

const REPLACE_ERROR = "Cannot read properties of undefined (reading 'replace')";

function snapshot(storagePath: string | undefined): StudioRenderSnapshot {
  return {
    project: {
      id: "project-1",
      revision: 36,
      name: "Export",
      schemaVersion: 2,
      studioVersion: 1,
    },
    tracks: [],
    assets: [{
      id: "asset-1",
      sourceType: "upload",
      storagePath: storagePath as string,
      mimeType: "audio/wav",
      durationSeconds: 1,
    }],
  };
}

function claimed(storagePath: string | undefined): ClaimedStudioRenderJob {
  return {
    id: "job-1",
    project_id: "project-1",
    guest_session_id: null,
    lease_token: "lease-1",
    project_snapshot: snapshot(storagePath),
  };
}

function stageDeps(renderToMp3?: StudioRenderExecuteDeps["renderToMp3"]): StudioRenderExecuteDeps {
  return {
    async sweepStale() {
      return {
        scanned: 0,
        removed: [],
        skippedActive: [],
        skippedFresh: [],
        skippedForeign: [],
      };
    },
    assertTimeline() {
      return 1;
    },
    async assertDiskSpace() {
      return { freeBytes: 1, requiredBytes: 1 };
    },
    async createWorkspace() {
      return mkdtemp(join(tmpdir(), "audiolad-render-stage-"));
    },
    async removeWorkspace(path: string) {
      await rm(path, { recursive: true, force: true });
    },
    ...(renderToMp3 ? { renderToMp3 } : {}),
  };
}

function storageService(download: (path: string) => Promise<{ data: { arrayBuffer(): Promise<ArrayBuffer> } | null; error: unknown }>, uploadError: unknown = null) {
  const downloads: Array<string | undefined> = [];
  const service = {
    storage: {
      from(bucket: string) {
        return {
          async download(path: string) {
            downloads.push(path);
            assert.equal(bucket, "studio-draft-assets");
            return download(path);
          },
          async upload() {
            return { error: uploadError };
          },
        };
      },
    },
    async rpc() {
      return { data: true, error: null };
    },
  };
  return { downloads, service };
}

function bytes() {
  return {
    data: {
      async arrayBuffer() {
        return Uint8Array.from([1, 2, 3]).buffer;
      },
    },
    error: null,
  };
}

async function captureFailure(error: unknown) {
  const logs: string[] = [];
  const payload: { error_code?: string; error_message_safe?: string } = {};
  const service = {
    from() {
      return {
        update(next: { error_code?: string; error_message_safe?: string }) {
          Object.assign(payload, next);
          return this;
        },
        eq() { return this; },
        select() { return this; },
        async maybeSingle() { return { data: { id: "job-1" }, error: null }; },
      };
    },
  };
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map((item) => String(item)).join(" "));
  };
  try {
    const persisted = await failClaimedStudioRenderJob(service as never, claimed("studio/a/file.wav"), error);
    return { persisted, payload, logs };
  } finally {
    console.error = original;
  }
}

async function main() {
  const missing = storageService(async () => {
    throw new Error("download should not run");
  });
  await assert.rejects(
    () => executeClaimedStudioRenderJob(
      missing.service as never,
      claimed(undefined),
      new AbortController().signal,
      60,
      stageDeps(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof StudioRenderStageError);
      assert.equal(error.stage, "asset_download");
      assert.equal(error.code, "asset_download_failed");
      assert.equal(error.message, REPLACE_ERROR);
      return true;
    },
  );
  assert.deepEqual(missing.downloads, []);

  const thrown = storageService(async () => {
    throw new TypeError(REPLACE_ERROR);
  });
  await assert.rejects(
    () => executeClaimedStudioRenderJob(
      thrown.service as never,
      claimed("studio/author/project/asset/voice.wav"),
      new AbortController().signal,
      60,
      stageDeps(),
    ),
    (error: unknown) => error instanceof StudioRenderStageError && error.code === "asset_download_failed",
  );
  assert.deepEqual(thrown.downloads, ["studio/author/project/asset/voice.wav"]);

  const aborted = new AbortController();
  aborted.abort();
  const abortedDownloads = storageService(async () => bytes());
  await assert.rejects(
    () => executeClaimedStudioRenderJob(
      abortedDownloads.service as never,
      claimed("studio/author/project/asset/voice.wav"),
      aborted.signal,
      60,
      stageDeps(),
    ),
    (error: unknown) => error instanceof StudioRenderAbandonedError,
  );
  assert.deepEqual(abortedDownloads.downloads, []);
  const abandoned = await captureFailure(new StudioRenderAbandonedError());
  assert.equal(abandoned.persisted, false);
  assert.equal(abandoned.payload.error_code, undefined);

  const production = await captureFailure(new TypeError(REPLACE_ERROR));
  assert.equal(production.persisted, true);
  assert.equal(production.payload.error_code, "asset_download_failed");
  assert.equal(production.payload.error_message_safe, STUDIO_RENDER_PREPARE_FAILED_MESSAGE);
  assert.equal(production.logs.length, 1);
  const logged = JSON.parse(production.logs[0]) as { stage: string; errorCode: string; error: string };
  assert.equal(logged.stage, "asset_download");
  assert.equal(logged.errorCode, "asset_download_failed");
  assert.equal(logged.error, REPLACE_ERROR);
  assert.doesNotMatch(production.logs[0], /token=|eyJ/);

  const ffmpeg = storageService(async () => bytes());
  await assert.rejects(
    () => executeClaimedStudioRenderJob(
      ffmpeg.service as never,
      claimed("studio/author/project/asset/voice.wav"),
      new AbortController().signal,
      60,
      stageDeps(async () => {
        throw new Error("ffmpeg exited with 1: https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/a?token=secret");
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof StudioRenderStageError);
      assert.equal(error.stage, "ffmpeg");
      assert.equal(error.code, "ffmpeg_failed");
      assert.doesNotMatch(error.message, /token=secret/);
      assert.match(error.message, /token=redacted/);
      return true;
    },
  );

  const upload = storageService(
    async () => bytes(),
    { message: "upload failed token=secret" },
  );
  await assert.rejects(
    () => executeClaimedStudioRenderJob(
      upload.service as never,
      claimed("studio/author/project/asset/voice.wav"),
      new AbortController().signal,
      60,
      stageDeps(async (_input, options) => {
        const outputPath = join(options.outputDirectory, `${options.renderId}.mp3`);
        await writeFile(outputPath, Buffer.from([1, 2, 3]));
        return {
          outputPath,
          durationSeconds: 1,
          expectedDurationSeconds: 1,
          actualDurationSeconds: 1,
          durationDeltaSeconds: 0,
          sizeBytes: 3,
          stderr: "",
        };
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof StudioRenderStageError);
      assert.equal(error.stage, "upload");
      assert.equal(error.code, "output_upload_failed");
      assert.doesNotMatch(error.message, /token=secret/);
      return true;
    },
  );

  const catalog = classifyStudioRenderFailure(new StudioCatalogMusicUnavailableError());
  assert.equal(catalog.stage, "catalog_materialize");
  assert.equal(catalog.errorCode, CATALOG_MUSIC_UNAVAILABLE);
  const duration = classifyStudioRenderFailure(new StudioRenderDurationError(2, 1));
  assert.equal(duration.stage, "ffmpeg");
  assert.equal(duration.errorCode, "render_duration_mismatch");
  assert.notEqual(duration.errorCode, "render_failed");
  assert.equal(
    sanitizeStudioRenderErrorMessage(new Error("https://audiolad.ru/file?token=abc&x=1")),
    "https://audiolad.ru/file?token=redacted&x=1",
  );

  console.log("studio-render-failure-stage-unit: ok");
}

await main();
