import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_AUDIO_BYTES,
  getAudioUploadErrorMessage,
  validateMp3FileClient,
} from "../src/lib/author-products/limits";
import {
  ALLOWED_PRODUCT_MP3_MIME_TYPES,
  MAX_PRODUCT_AUDIO_BYTES,
  PRODUCT_AUDIO_SIZE_HINT,
  PRODUCT_AUDIO_TOO_LARGE_MESSAGE,
  buildVersionedProductAudioPath,
  canAbandonProductAudioUploadPath,
  isAllowedProductMp3Type,
  isOwnedVersionedProductAudioPath,
  shouldBlockProductAudioReplacement,
  validateProductMp3Descriptor,
  validateProductMp3FileClient,
} from "../src/lib/author-products/mp3-upload-contract";
import { isAllowedMp3File } from "../src/lib/author-products/media";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function fakeFile({
  name = "track.mp3",
  type = "audio/mpeg",
  size = 1024,
}: {
  name?: string;
  type?: string;
  size?: number;
}) {
  const file = new File(["id3"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

assert.equal(MAX_PRODUCT_AUDIO_BYTES, 300 * 1024 * 1024);
assert.equal(MAX_AUDIO_BYTES, 50 * 1024 * 1024);
assert.equal(PRODUCT_AUDIO_SIZE_HINT, "MP3 · до 300 МБ");
assert.equal(
  PRODUCT_AUDIO_TOO_LARGE_MESSAGE,
  "Размер аудиофайла не должен превышать 300 МБ.",
);
assert.deepEqual(ALLOWED_PRODUCT_MP3_MIME_TYPES, [
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/x-mp3",
  "application/octet-stream",
]);

assert.equal(
  validateMp3FileClient(fakeFile({ size: 80 * 1024 * 1024 })),
  null,
  "MP3 50–300 MiB is no longer rejected by client",
);
assert.equal(
  validateMp3FileClient(fakeFile({ size: MAX_PRODUCT_AUDIO_BYTES })),
  null,
);
assert.equal(
  validateMp3FileClient(fakeFile({ size: MAX_PRODUCT_AUDIO_BYTES + 1 })),
  PRODUCT_AUDIO_TOO_LARGE_MESSAGE,
);
assert.equal(
  validateProductMp3FileClient(fakeFile({ type: "audio/mpeg" })),
  null,
);
assert.equal(
  validateProductMp3FileClient(fakeFile({ type: "audio/mp3" })),
  null,
);
assert.equal(
  validateProductMp3FileClient(fakeFile({ type: "audio/x-mpeg" })),
  null,
);
assert.equal(
  validateProductMp3FileClient(fakeFile({ type: "audio/x-mp3" })),
  null,
);
assert.equal(
  validateProductMp3FileClient(
    fakeFile({ type: "application/octet-stream" }),
  ),
  null,
);
assert.equal(
  validateProductMp3FileClient(fakeFile({ type: "" })),
  null,
  "empty MIME + .mp3 accepted",
);
assert.equal(
  validateProductMp3FileClient(
    fakeFile({ name: "track.wav", type: "audio/mpeg" }),
  ),
  "Загрузите аудиофайл в формате MP3.",
);
assert.equal(
  validateProductMp3Descriptor({
    name: "track.m4a",
    type: "audio/mp4",
    size: 1024,
  }),
  "invalid_file_type",
);
assert.equal(isAllowedMp3File(fakeFile({ type: "audio/x-mpeg" })), true);
assert.equal(isAllowedMp3File(fakeFile({ type: "" })), true);
assert.equal(
  isAllowedMp3File(fakeFile({ name: "voice.aac", type: "audio/aac" })),
  false,
);
assert.equal(isAllowedProductMp3Type("ok.MP3", "audio/mpeg"), true);

assert.equal(
  getAudioUploadErrorMessage("invalid_file_size", 400),
  PRODUCT_AUDIO_TOO_LARGE_MESSAGE,
);
assert.equal(
  getAudioUploadErrorMessage(undefined, 413),
  PRODUCT_AUDIO_TOO_LARGE_MESSAGE,
);

const practiceId = "11111111-1111-1111-1111-111111111111";
const audioId = "22222222-2222-2222-2222-222222222222";
const otherAudioId = "33333333-3333-3333-3333-333333333333";
const versionId = "44444444-4444-4444-4444-444444444444";
const ownedPath = buildVersionedProductAudioPath(practiceId, audioId, versionId);
const livePath = `practices/${practiceId}/audio/${audioId}.mp3`;

assert.equal(isOwnedVersionedProductAudioPath(ownedPath, practiceId, audioId), true);
assert.equal(
  isOwnedVersionedProductAudioPath(livePath, practiceId, audioId),
  false,
  "legacy live path is not a versioned upload path",
);
assert.equal(
  isOwnedVersionedProductAudioPath(
    buildVersionedProductAudioPath(practiceId, otherAudioId, versionId),
    practiceId,
    audioId,
  ),
  false,
  "foreign audioId path rejected",
);
assert.equal(
  isOwnedVersionedProductAudioPath(
    `practices/${otherAudioId}/audio/${audioId}-${versionId}.mp3`,
    practiceId,
    audioId,
  ),
  false,
  "spoofed practiceId path rejected",
);
assert.equal(
  isOwnedVersionedProductAudioPath(
    `${ownedPath}/../secret.mp3`,
    practiceId,
    audioId,
  ),
  false,
);

assert.equal(shouldBlockProductAudioReplacement(true, livePath), true);
assert.equal(
  shouldBlockProductAudioReplacement(true, null),
  false,
  "first-fill of empty audio_path remains allowed",
);
assert.equal(shouldBlockProductAudioReplacement(false, livePath), false);

assert.equal(
  canAbandonProductAudioUploadPath({
    uploadPath: ownedPath,
    practiceId,
    audioId,
    liveAudioPath: livePath,
  }),
  true,
);
assert.equal(
  canAbandonProductAudioUploadPath({
    uploadPath: livePath,
    practiceId,
    audioId,
    liveAudioPath: livePath,
  }),
  false,
  "abandon cannot delete live audio_path",
);
assert.equal(
  canAbandonProductAudioUploadPath({
    uploadPath: ownedPath,
    practiceId,
    audioId,
    liveAudioPath: ownedPath,
  }),
  false,
  "abandon cannot delete the current versioned audio_path",
);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const client = read("src/lib/author-products/direct-audio-upload-client.ts");
const startRoute = read(
  "src/app/api/author/products/[id]/audio/[audioId]/upload/start/route.ts",
);
const finalizeRoute = read(
  "src/app/api/author/products/[id]/audio/[audioId]/upload/finalize/route.ts",
);
const abandonRoute = read(
  "src/app/api/author/products/[id]/audio/[audioId]/upload/abandon/route.ts",
);
const legacyRoute = read(
  "src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts",
);
const server = read("src/lib/author-products/server/direct-audio-upload.ts");
const inventory = read("src/lib/author-support/mutation-inventory.ts");
const migration = read(
  "supabase/migrations/20260930120000_practice_audio_bucket_300mib.sql",
);
const publish = read("src/lib/author-products/publish.ts");
const moderation = read("src/lib/author-products/moderation.ts");

assert.match(form, /uploadAuthorProductAudioDirect/);
assert.match(form, /validateMp3FileClient/);
assert.match(form, /applyServerProductPreservingDraft/);
assert.match(form, /PRODUCT_AUDIO_SIZE_HINT|до 300 МБ/);
assert.doesNotMatch(form, /formData\.set\("file"/);
assert.doesNotMatch(form, /file\.arrayBuffer/);
assert.doesNotMatch(
  form,
  /\/api\/author\/products\/\$\{id\}\/audio\/\$\{targetAudioId\}\/upload`/,
);

assert.match(client, /uploadToSignedUrl/);
assert.match(client, /PRACTICE_AUDIO_BUCKET/);
assert.match(client, /contentType: "audio\/mpeg"/);
assert.match(client, /upload\/start/);
assert.match(client, /upload\/finalize/);
assert.match(client, /upload\/abandon/);
assert.doesNotMatch(client, /formData\.set\("file"/);
assert.doesNotMatch(client, /file\.arrayBuffer/);
assert.doesNotMatch(client, /new FormData/);

assert.match(startRoute, /startProductAudioDirectUpload/);
assert.match(startRoute, /request\.json\(\)/);
assert.doesNotMatch(startRoute, /formData|arrayBuffer/);
assert.match(finalizeRoute, /finalizeProductAudioDirectUpload/);
assert.match(finalizeRoute, /request\.json\(\)/);
assert.doesNotMatch(finalizeRoute, /formData|arrayBuffer/);
assert.match(abandonRoute, /abandonProductAudioDirectUpload/);
assert.doesNotMatch(abandonRoute, /formData|arrayBuffer/);

assert.match(server, /createSignedUploadUrl/);
assert.match(server, /upsert: false/);
assert.match(server, /requirePracticeMutationAccess/);
assert.match(server, /getPracticeSaleLock/);
assert.match(server, /readPracticeAudioObjectInfo/);
assert.match(server, /object\.size !== input\.expectedBytes/);
assert.match(server, /upload_not_complete/);
assert.match(server, /probeStudioAudioFile/);
assert.match(server, /writeStreamToTempFile/);
assert.match(server, /removeTempFile/);
assert.match(server, /syncPracticeAudioCompatibility/);
assert.match(server, /recordAuthorSupportAudit/);
assert.match(server, /product_track_updated/);
assert.match(
  server,
  /status: practice\.status === "published" \? "published" : "draft"/,
);
assert.doesNotMatch(server, /file\.arrayBuffer/);
assert.doesNotMatch(server, /response\.arrayBuffer/);
assert.doesNotMatch(server, /Buffer\.from\(await /);

const inspectBlock = server.slice(
  server.indexOf("async function inspectUploadedProductMp3"),
  server.indexOf("export async function deletePracticeAudioPaths"),
);
assert.match(inspectBlock, /readPracticeAudioObjectInfo/);
assert.match(inspectBlock, /probeStudioAudioFile/);
assert.match(inspectBlock, /materializePracticeAudioObject/);

const finalizeBlock = server.slice(
  server.indexOf("export async function finalizeProductAudioDirectUpload"),
  server.indexOf("export async function abandonProductAudioDirectUpload"),
);
const inspectCall = finalizeBlock.indexOf("inspectUploadedProductMp3");
const dbUpdate = finalizeBlock.indexOf('.from("audio_items")');
const previousDelete = finalizeBlock.indexOf(
  "if (previousPath && previousPath !== uploadPath)",
);
const failedInspectCleanup = finalizeBlock.indexOf(
  "await deletePracticeAudioPaths([uploadPath]);",
);
assert.ok(inspectCall >= 0 && dbUpdate > inspectCall, "DB update after ffprobe");
assert.ok(
  previousDelete > dbUpdate,
  "old Storage object deleted only after successful DB update",
);
assert.ok(
  failedInspectCleanup >= 0 && failedInspectCleanup < dbUpdate,
  "failed finalize deletes only the new upload object",
);
assert.match(finalizeBlock, /shouldBlockProductAudioReplacement|assertSaleLockAllowsMutation/);
assert.match(finalizeBlock, /isOwnedVersionedProductAudioPath|requireOwnedVersionedPath/);
assert.doesNotMatch(
  finalizeBlock.slice(0, dbUpdate),
  /deletePracticeAudioPaths\(\[previousPath\]\)/,
);

const abandonBlock = server.slice(
  server.indexOf("export async function abandonProductAudioDirectUpload"),
);
assert.match(abandonBlock, /canAbandonProductAudioUploadPath/);
assert.doesNotMatch(abandonBlock, /audio_path: /);

assert.match(legacyRoute, /MAX_AUDIO_BYTES/);
assert.match(legacyRoute, /50 MiB|MAX_AUDIO_BYTES/);
assert.doesNotMatch(legacyRoute, /MAX_PRODUCT_AUDIO_BYTES/);
assert.match(legacyRoute, /file\.arrayBuffer/);

assert.match(
  inventory,
  /audio\/\[audioId\]\/upload\/start\/route\.ts/,
);
assert.match(
  inventory,
  /audio\/\[audioId\]\/upload\/finalize\/route\.ts/,
);
assert.match(
  inventory,
  /audio\/\[audioId\]\/upload\/abandon\/route\.ts/,
);

assert.match(migration, /file_size_limit = GREATEST/);
assert.match(migration, /314572800/);
assert.match(migration, /WHERE id = 'practice-audio'/);
assert.match(migration, /public IS NOT TRUE/);
assert.doesNotMatch(migration, /SET\s+allowed_mime_types/i);
assert.doesNotMatch(migration, /public\s*=\s*true/);

assert.doesNotMatch(publish, /MAX_PRODUCT_AUDIO_BYTES/);
assert.doesNotMatch(moderation, /MAX_PRODUCT_AUDIO_BYTES/);
assert.doesNotMatch(
  read("src/lib/author-products/moderation-actions.ts"),
  /direct-audio-upload/,
);

console.log("author-product-direct-audio-upload-unit: ok");
