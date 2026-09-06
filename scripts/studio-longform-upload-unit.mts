import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MAX_STUDIO_ASSET_BYTES,
  MAX_STUDIO_AUDIO_DURATION_SECONDS,
  MAX_STUDIO_PROJECT_BYTES,
  STUDIO_ASSETS_BUCKET,
  STUDIO_AUDIO_TOO_LONG_MESSAGE,
  STUDIO_ASSET_TOO_LARGE_MESSAGE,
  STUDIO_PROJECT_TOO_LARGE_MESSAGE,
  isStudioAssetSizeAllowed,
  isStudioDurationAllowed,
  studioPeaksColumnCount,
} from "../src/lib/studio/limits.ts";
import {
  validateStudioLocalDuration,
  validateStudioLocalFile,
} from "../src/lib/studio/local-file-validation.ts";
import {
  decodeStudioPeaksV1,
  encodeStudioPeaksV1,
} from "../src/lib/studio/peaks-v1.ts";
import {
  assertStudioDurationAllowed,
  StudioApiError,
  validateStudioUpload,
  validateStudioUploadMeta,
} from "../src/lib/studio/server/validation.ts";
import { generateStudioPeaksV1FromInt16 } from "../src/lib/studio/server/peaks.ts";
import { STUDIO_LIMITS } from "../src/lib/studio/server/model.ts";

assert.equal(MAX_STUDIO_AUDIO_DURATION_SECONDS, 10800);
assert.equal(MAX_STUDIO_ASSET_BYTES, 314572800);
assert.equal(MAX_STUDIO_PROJECT_BYTES, 750 * 1024 * 1024);
assert.equal(STUDIO_ASSETS_BUCKET, "studio-draft-assets");
assert.equal(STUDIO_LIMITS.maxAssetBytes, 314572800);
assert.equal(STUDIO_LIMITS.maxProjectAssetBytes, 750 * 1024 * 1024);
assert.equal(STUDIO_LIMITS.maxAudioDurationSeconds, 10800);

assert.equal(validateStudioLocalFile({
  name: "ok.mp3",
  type: "audio/mpeg",
  size: MAX_STUDIO_ASSET_BYTES,
}), null);
assert.equal(
  validateStudioLocalFile({ name: "over.mp3", type: "audio/mpeg", size: MAX_STUDIO_ASSET_BYTES + 1 }),
  STUDIO_ASSET_TOO_LARGE_MESSAGE,
);
assert.equal(validateStudioLocalDuration(10800), null);
assert.equal(validateStudioLocalDuration(10800.01), STUDIO_AUDIO_TOO_LONG_MESSAGE);
assert.ok(isStudioDurationAllowed(1));
assert.equal(isStudioDurationAllowed(10801), false);
assert.equal(isStudioAssetSizeAllowed(MAX_STUDIO_ASSET_BYTES), true);
assert.equal(isStudioAssetSizeAllowed(MAX_STUDIO_ASSET_BYTES + 1), false);

assert.throws(
  () => validateStudioUploadMeta({
    name: "voice.mp3",
    type: "audio/mpeg",
    size: MAX_STUDIO_ASSET_BYTES + 1,
  }),
  (error: unknown) =>
    error instanceof StudioApiError && error.code === "asset_too_large" && error.status === 413,
);
assert.deepEqual(
  validateStudioUpload({ name: "voice.mp3", type: "audio/mpeg", size: 12 } as File),
  { filename: "voice.mp3", mimeType: "audio/mpeg", byteSize: 12 },
);
assert.throws(
  () => assertStudioDurationAllowed(10800.1),
  (error: unknown) =>
    error instanceof StudioApiError && error.code === "audio_too_long" && error.status === 422,
);
assert.equal(assertStudioDurationAllowed(10800), 10800);

assert.equal(studioPeaksColumnCount(60), 8192);
assert.equal(studioPeaksColumnCount(10800), 32768);
assert.equal(studioPeaksColumnCount(2000), 20000);

const encoded = encodeStudioPeaksV1([-1, 0], [1, 0.5]);
assert.equal(encoded.byteLength, 8);
const decoded = decodeStudioPeaksV1(encoded);
assert.equal(decoded.columns, 2);
assert.ok(decoded.minimums[0]! < -0.99);
assert.ok(decoded.maximums[0]! > 0.99);

const generated = generateStudioPeaksV1FromInt16(
  Int16Array.from([-32000, 32000, -100, 100]),
  1,
);
assert.equal(generated.version, 1);
assert.equal(generated.columns, 8192);
assert.equal(generated.bytes.byteLength, 8192 * 4);
assert.ok(generated.bytes.byteLength <= 131072);

const migration = await readFile(
  new URL("../supabase/migrations/20260928120000_studio_longform_asset_limits.sql", import.meta.url),
  "utf8",
);
assert.match(migration, /file_size_limit = 314572800/);
assert.match(migration, /WHERE id = 'studio-draft-assets'/);
assert.match(migration, /p_size_bytes > 314572800/);
assert.match(migration, /p_duration_seconds > 10800/);
assert.match(migration, /786432000/);
assert.match(migration, /upload_state IN \('reserved', 'uploading', 'processing', 'ready'\)/);
assert.match(migration, /studio_finalize_project_asset/);
assert.match(migration, /studio_cleanup_stale_asset_uploads/);
assert.doesNotMatch(migration, /practice-audio|publication-files|user-avatars|audiobook-fragments/);

const reserveRoute = await readFile(
  new URL("../src/app/api/studio/projects/[projectId]/assets/route.ts", import.meta.url),
  "utf8",
);
assert.match(reserveRoute, /reserveStudioDirectUpload/);
assert.doesNotMatch(reserveRoute, /formData|arrayBuffer|probeStudioAudioDuration/);

const finalizeRoute = await readFile(
  new URL("../src/app/api/studio/projects/[projectId]/assets/[assetId]/finalize/route.ts", import.meta.url),
  "utf8",
);
assert.match(finalizeRoute, /finalizeStudioDirectUpload/);

const client = await readFile(
  new URL("../src/lib/studio/persistence-client.ts", import.meta.url),
  "utf8",
);
assert.match(client, /object\/upload\/sign/);
assert.match(client, /NEXT_PUBLIC_SUPABASE_URL/);
assert.doesNotMatch(client, /formData\.set\("file"/);
assert.doesNotMatch(client, /file\.arrayBuffer/);

const provider = await readFile(
  new URL("../src/components/studio/StudioAudioProvider.tsx", import.meta.url),
  "utf8",
);
assert.match(provider, /validateStudioLocalDuration/);
assert.match(provider, /MAX_STUDIO_PROJECT_BYTES/);
assert.doesNotMatch(provider, /decodeAudioData|file\.arrayBuffer/);

const workspace = await readFile(
  new URL("../src/components/studio/StudioWorkspace.tsx", import.meta.url),
  "utf8",
);
assert.match(workspace, /3 часа и 300 МБ/);
assert.doesNotMatch(workspace, /200 МБ/);

assert.equal(STUDIO_PROJECT_TOO_LARGE_MESSAGE.includes("750 МБ"), true);

const repository = await readFile(
  new URL("../src/lib/studio/server/repository.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(repository, /file\.arrayBuffer\(/);
assert.match(repository, /\.eq\("upload_state", "ready"\)/);

const directUpload = await readFile(
  new URL("../src/lib/studio/server/direct-upload.ts", import.meta.url),
  "utf8",
);
assert.match(directUpload, /createSignedUploadUrl/);
assert.match(directUpload, /probeStudioAudioFile/);
assert.match(directUpload, /audio_too_long/);
assert.match(directUpload, /asset_too_large/);
assert.match(directUpload, /failAndReleaseStudioUpload/);
assert.match(directUpload, /cleanupStaleStudioUploads/);
assert.doesNotMatch(directUpload, /file\.arrayBuffer\(/);

console.log("studio longform upload checks passed");
