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
} from "../src/lib/studio/limits";
import {
  validateStudioLocalDuration,
  validateStudioLocalFile,
} from "../src/lib/studio/local-file-validation";
import {
  decodeStudioPeaksV1,
  encodeStudioPeaksV1,
} from "../src/lib/studio/peaks-v1";
import {
  assertStudioDurationAllowed,
  StudioApiError,
  validateStudioUpload,
  validateStudioUploadMeta,
} from "../src/lib/studio/server/validation";
import { generateStudioPeaksV1FromInt16 } from "../src/lib/studio/server/peaks";
import { STUDIO_LIMITS } from "../src/lib/studio/server/model";
import {
  isStudioPendingReplacementStale,
  isStudioUploadStale,
} from "../src/lib/studio/upload-stale";

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
assert.match(directUpload, /alreadyUploaded: true/);
assert.match(directUpload, /abandonStudioDirectReplacement/);
assert.match(directUpload, /readStudioStorageObjectInfo/);
assert.doesNotMatch(directUpload, /file\.arrayBuffer\(/);
assert.doesNotMatch(directUpload, /generateStudioPeaksV1FromFile/);
assert.match(directUpload, /peaks: null/);

const inspectBlock = directUpload.slice(
  directUpload.indexOf("async function inspectUploadedAudio"),
  directUpload.indexOf("async function deleteStoragePaths"),
);
assert.match(inspectBlock, /upload_not_complete/);
assert.doesNotMatch(inspectBlock, /generateStudioPeaks/);

assert.match(migration, /upload_state_changed_at/);
assert.match(migration, /pending_reserved_at/);
assert.match(migration, /interval '8 hours'/);
assert.match(migration, /interval '30 minutes'/);
assert.match(migration, /interval '45 minutes'/);
assert.match(migration, /interval '15 minutes'/);
assert.match(migration, /upload_state <> 'ready'/);
assert.match(migration, /p_max_age is ignored/);
assert.doesNotMatch(migration, /created_at < now\(\)/);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.studio_reserve_project_asset\([\s\S]*FROM PUBLIC, anon, authenticated/,
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.studio_cleanup_stale_asset_uploads\(interval\) FROM PUBLIC, anon, authenticated/,
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.replace_studio_project_asset\([\s\S]*FROM PUBLIC, anon, authenticated/,
);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.studio_finalize_project_asset\([\s\S]*TO service_role/,
);
assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO (PUBLIC|anon|authenticated)/);
assert.match(migration, /AND upload_state <> 'ready'/);

const cleanupSql = migration.slice(
  migration.indexOf("studio_cleanup_stale_asset_uploads"),
  migration.indexOf("CREATE OR REPLACE FUNCTION public.replace_studio_project_asset"),
);
assert.match(cleanupSql, /upload_state = 'reserved' AND upload_state_changed_at < now\(\) - interval '30 minutes'/);
assert.match(cleanupSql, /upload_state = 'uploading' AND upload_state_changed_at < now\(\) - interval '8 hours'/);
assert.match(cleanupSql, /upload_state = 'processing' AND upload_state_changed_at < now\(\) - interval '45 minutes'/);
assert.match(cleanupSql, /upload_state = 'failed' AND upload_state_changed_at < now\(\) - interval '15 minutes'/);
assert.match(cleanupSql, /pending_reserved_at < now\(\) - interval '8 hours'/);
assert.match(cleanupSql, /studio_clear_project_asset_replacement/);
assert.match(cleanupSql, /upload_state <> 'ready'/);
assert.doesNotMatch(
  cleanupSql,
  /release_studio_project_asset\([^)]+\)[\s\S]{0,80}upload_state = 'ready'/,
);

const failSql = migration.slice(
  migration.indexOf("studio_fail_project_asset"),
  migration.indexOf("studio_cleanup_stale_asset_uploads"),
);
assert.match(failSql, /upload_state <> 'ready'/);

const now = new Date("2026-09-06T18:00:00.000Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
assert.equal(
  isStudioUploadStale({
    uploadState: "reserved",
    stateChangedAt: hoursAgo(0.6),
    now,
  }),
  true,
  "old abandoned reserve is stale",
);
assert.equal(
  isStudioUploadStale({
    uploadState: "uploading",
    stateChangedAt: hoursAgo(2),
    now,
  }),
  false,
  "active long-form 300 MiB PUT at 2h is not stale",
);
assert.equal(
  isStudioUploadStale({
    uploadState: "uploading",
    stateChangedAt: hoursAgo(3),
    now,
  }),
  false,
  "active long-form upload at 3h is not stale",
);
assert.equal(
  isStudioUploadStale({
    uploadState: "uploading",
    stateChangedAt: hoursAgo(8.1),
    now,
  }),
  true,
  "upload abandoned after 8h is stale",
);
assert.equal(
  isStudioUploadStale({
    uploadState: "failed",
    stateChangedAt: hoursAgo(0.3),
    now,
  }),
  true,
  "failed upload is cleaned",
);
assert.equal(
  isStudioUploadStale({
    uploadState: "ready",
    stateChangedAt: hoursAgo(48),
    now,
  }),
  false,
  "ready asset is never cleaned",
);
assert.equal(
  isStudioPendingReplacementStale({
    pendingReservedAt: hoursAgo(2),
    now,
  }),
  false,
);
assert.equal(
  isStudioPendingReplacementStale({
    pendingReservedAt: hoursAgo(8.1),
    now,
  }),
  true,
);

assert.match(provider, /retryStudioProjectAssetUpload/);
assert.match(provider, /abandonStudioProjectAssetUpload/);
assert.match(provider, /pendingReserveAssetIdsRef/);

console.log("studio longform upload checks passed");
