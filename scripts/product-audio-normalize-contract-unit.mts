import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_PRODUCT_MP3_MIME_TYPES,
  PRODUCT_AUDIO_DELIVERY_BITRATE,
  PRODUCT_AUDIO_DELIVERY_BITRATE_KBPS,
  PRODUCT_AUDIO_SIZE_HINT,
  PRODUCT_AUDIO_WRONG_TYPE_MESSAGE,
  buildVersionedProductAudioPath,
  buildVersionedProductAudioSourcePath,
  canAbandonProductAudioUploadPath,
  detectProductAudioSourceFormat,
  isAllowedProductAudioSourceType,
  isAllowedProductMp3Type,
  isOwnedVersionedProductAudioPath,
  isOwnedVersionedProductAudioSourcePath,
  validateProductAudioSourceDescriptor,
  validateProductMp3Descriptor,
  validateProductMp3FileClient,
} from "../src/lib/author-products/product-audio-upload-contract";
import { validateProductSourceProbe } from "../src/lib/product-audio-normalize/source-validation";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const practiceId = "11111111-1111-4111-8111-111111111111";
const audioId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";

assert.equal(PRODUCT_AUDIO_DELIVERY_BITRATE_KBPS, 192);
assert.equal(PRODUCT_AUDIO_DELIVERY_BITRATE, "192k");
assert.equal(PRODUCT_AUDIO_SIZE_HINT, "MP3 · до 300 МБ");
assert.equal(PRODUCT_AUDIO_WRONG_TYPE_MESSAGE, "Загрузите аудиофайл в формате MP3.");
assert.ok(ALLOWED_PRODUCT_MP3_MIME_TYPES.includes("application/octet-stream"));

assert.equal(detectProductAudioSourceFormat("track.mp3"), "mp3");
assert.equal(detectProductAudioSourceFormat("track.M4A"), "m4a");
assert.equal(detectProductAudioSourceFormat("track.AAC"), "aac");
assert.equal(detectProductAudioSourceFormat("track.wav"), null);

assert.equal(validateProductMp3Descriptor({ name: "a.mp3", type: "audio/mpeg", size: 10 }), null);
assert.equal(validateProductMp3Descriptor({ name: "a.m4a", type: "audio/mp4", size: 10 }), "invalid_file_type");
assert.equal(validateProductMp3FileClient({ name: "a.m4a", type: "audio/mp4", size: 10 }), PRODUCT_AUDIO_WRONG_TYPE_MESSAGE);

assert.equal(validateProductAudioSourceDescriptor({ name: "a.mp3", type: "audio/mpeg", size: 10 }), null);
assert.equal(validateProductAudioSourceDescriptor({ name: "a.m4a", type: "audio/mp4", size: 10 }), null);
assert.equal(validateProductAudioSourceDescriptor({ name: "a.m4a", type: "audio/x-m4a", size: 10 }), null);
assert.equal(validateProductAudioSourceDescriptor({ name: "a.aac", type: "audio/aac", size: 10 }), null);
assert.equal(validateProductAudioSourceDescriptor({ name: "a.AAC", type: "audio/x-aac", size: 10 }), null);
assert.equal(validateProductAudioSourceDescriptor({ name: "a.m4a", type: "application/octet-stream", size: 10 }), null);
assert.equal(validateProductAudioSourceDescriptor({ name: "a.mp3", type: "audio/mp4", size: 10 }), "invalid_file_type");
assert.equal(validateProductAudioSourceDescriptor({ name: "a.wav", type: "audio/wav", size: 10 }), "invalid_file_type");
assert.equal(validateProductAudioSourceDescriptor({ name: "a.m4a", type: "audio/mpeg", size: 10 }), "invalid_file_type");
assert.equal(isAllowedProductMp3Type("x.mp3", "audio/mpeg"), true);
assert.equal(isAllowedProductAudioSourceType("x.m4a", "audio/mp4"), true);

const delivery = buildVersionedProductAudioPath(practiceId, audioId, versionId);
const sourceM4a = buildVersionedProductAudioSourcePath(practiceId, audioId, versionId, "m4a");
const sourceAac = buildVersionedProductAudioSourcePath(practiceId, audioId, versionId, "aac");
assert.match(delivery, /\.mp3$/);
assert.match(sourceM4a, /audio-sources\/.*\.m4a$/);
assert.match(sourceAac, /audio-sources\/.*\.aac$/);
assert.equal(isOwnedVersionedProductAudioPath(delivery, practiceId, audioId), true);
assert.equal(isOwnedVersionedProductAudioSourcePath(sourceM4a, practiceId, audioId), true);
assert.equal(isOwnedVersionedProductAudioPath(sourceM4a, practiceId, audioId), false);
assert.equal(
  canAbandonProductAudioUploadPath({
    uploadPath: sourceM4a,
    practiceId,
    audioId,
    liveAudioPath: delivery,
  }),
  true,
);

assert.equal(
  validateProductSourceProbe("m4a", {
    formatNames: ["mov", "mp4", "m4a"],
    durationSeconds: 12,
    hasAudioStream: true,
    hasVideoStream: false,
    audioCodecNames: ["aac"],
  }),
  "ok",
);
assert.equal(
  validateProductSourceProbe("m4a", {
    formatNames: ["wav"],
    durationSeconds: 12,
    hasAudioStream: true,
    hasVideoStream: false,
    audioCodecNames: ["pcm_s16le"],
  }),
  "container_mismatch",
);
assert.equal(
  validateProductSourceProbe("m4a", {
    formatNames: ["mp4"],
    durationSeconds: 12,
    hasAudioStream: true,
    hasVideoStream: true,
    audioCodecNames: ["aac"],
  }),
  "has_video",
);
assert.equal(
  validateProductSourceProbe("aac", {
    formatNames: ["aac"],
    durationSeconds: 3,
    hasAudioStream: true,
    hasVideoStream: false,
    audioCodecNames: ["aac"],
  }),
  "ok",
);

assert.equal(
  validateProductSourceProbe("aac", {
    formatNames: ["mp4", "mov"],
    durationSeconds: 3,
    hasAudioStream: true,
    hasVideoStream: false,
    audioCodecNames: ["aac"],
  }),
  "container_mismatch",
  "AAC codec inside MP4 renamed .aac must reject",
);

const form = readFileSync(path.join(root, "src/components/author-dashboard/AuthorProductForm.tsx"), "utf8");
assert.ok(form.includes("audio/mpeg") || form.includes(".mp3"), "UI still MP3-oriented");
assert.equal(form.toLowerCase().includes('accept=".m4a'), false);
assert.equal(form.toLowerCase().includes('accept=".aac'), false);
assert.equal(/accept=["'][^"']*\.m4a/.test(form), false);
assert.equal(/accept=["'][^"']*\.aac/.test(form), false);

const personal = readFileSync(path.join(root, "src/lib/personal-materials/audio-format.ts"), "utf8");
assert.match(personal, /m4a/i);
const musicContract = readFileSync(path.join(root, "src/lib/music-transcode/contract.ts"), "utf8");
assert.match(musicContract, /MUSIC_STREAM_BITRATE/);
assert.doesNotMatch(musicContract, /product_audio_normalize/);


const directUpload = readFileSync(path.join(root, "src/lib/author-products/server/direct-audio-upload.ts"), "utf8");
assert.match(directUpload, /validateProductMp3Descriptor/);
assert.match(directUpload, /live author upload stays MP3-only/);
assert.equal(/validateProductAudioSourceDescriptor/.test(directUpload), false, "live start/finalize must not accept M4A/AAC in Slice 1");

const runtime = readFileSync(path.join(root, "src/lib/product-audio-normalize/worker-runtime.ts"), "utf8");
assert.match(runtime, /upsert:\s*false/);
assert.equal(/upsert:\s*true/.test(runtime), false, "stale worker must not overwrite another attempt");

console.log("product-audio-normalize-contract-unit: ok");
