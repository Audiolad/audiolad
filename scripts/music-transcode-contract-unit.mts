import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MUSIC_STREAMS_BUCKET } from "../src/lib/author-products/music-master-upload-contract";
import {
  MUSIC_STREAM_BITRATE,
  MUSIC_STREAM_MIME,
  MUSIC_TRANSCODE_FAILED_MESSAGE,
  MUSIC_TRANSCODE_MAX_ATTEMPTS,
  MUSIC_TRANSCODE_RETRY_MESSAGE,
  buildMusicStreamStoragePath,
  canReuseVerifiedStreamAsset,
  classifyMusicTranscodeError,
  durationWithinTolerance,
  isOwnedMusicStreamStoragePath,
  musicStreamOriginalFileName,
} from "../src/lib/music-transcode/contract";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(rootDir, file), "utf8");

const audioItemId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const sourceId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const storagePath = buildMusicStreamStoragePath(audioItemId, sourceId);

assert.equal(MUSIC_TRANSCODE_MAX_ATTEMPTS, 3);
assert.equal(MUSIC_STREAM_BITRATE, "256k");
assert.equal(MUSIC_STREAM_MIME, "audio/mpeg");
assert.equal(storagePath, `${audioItemId}/${sourceId}/mp3-256.mp3`);
assert.equal(isOwnedMusicStreamStoragePath(storagePath, audioItemId, sourceId), true);
assert.equal(isOwnedMusicStreamStoragePath(`${storagePath}/../x.mp3`, audioItemId, sourceId), false);
assert.equal(musicStreamOriginalFileName("Track.WAV"), "Track.mp3");
assert.equal(classifyMusicTranscodeError(new Error("source_unavailable")), "source_unavailable");
assert.equal(durationWithinTolerance(10, 10), true);
assert.equal(durationWithinTolerance(20, 10), false);

const reusable = canReuseVerifiedStreamAsset({
  id: "stream-1",
  audio_item_id: audioItemId,
  source_asset_id: sourceId,
  asset_role: "stream",
  storage_bucket: MUSIC_STREAMS_BUCKET,
  storage_path: storagePath,
  lifecycle_state: "verified",
  accepted_mime_type: MUSIC_STREAM_MIME,
  size_bytes: 4096,
  duration_seconds: 10,
}, { audioItemId, sourceAssetId: sourceId, storagePath });
assert.equal(reusable, true);
assert.equal(canReuseVerifiedStreamAsset({
  id: "stream-2",
  audio_item_id: audioItemId,
  source_asset_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  asset_role: "stream",
  storage_bucket: MUSIC_STREAMS_BUCKET,
  storage_path: storagePath,
  lifecycle_state: "verified",
  accepted_mime_type: MUSIC_STREAM_MIME,
  size_bytes: 4096,
  duration_seconds: 10,
}, { audioItemId, sourceAssetId: sourceId, storagePath }), false);
assert.equal(canReuseVerifiedStreamAsset({
  id: "stream-3",
  audio_item_id: audioItemId,
  source_asset_id: sourceId,
  asset_role: "stream",
  storage_bucket: MUSIC_STREAMS_BUCKET,
  storage_path: storagePath,
  lifecycle_state: "verified",
  accepted_mime_type: MUSIC_STREAM_MIME,
  size_bytes: 0,
  duration_seconds: 10,
}, { audioItemId, sourceAssetId: sourceId, storagePath }), false);

const runtime = read("src/lib/music-transcode/worker-runtime.ts");
assert.doesNotMatch(runtime, /\.from\("audio_items"\)/);
assert.doesNotMatch(runtime, /active_music_delivery_asset_id\s*=/);
assert.doesNotMatch(runtime, /audio_path\s*:/);
assert.match(runtime, /MUSIC_STREAMS_BUCKET/);
assert.match(runtime, /upsert: true/);
assert.match(runtime, /duplex: "half"/);
assert.match(runtime, /validatePrivateStreamObject/);
assert.match(runtime, /repairStreamAssetRow/);
assert.doesNotMatch(runtime, /createSignedUrl/);
assert.doesNotMatch(runtime, /loudnorm|dynaudnorm|volume=|loudness/);
assert.equal(MUSIC_TRANSCODE_RETRY_MESSAGE.includes("повторно"), true);
assert.equal(MUSIC_TRANSCODE_FAILED_MESSAGE.includes("Не удалось"), true);

const ffmpeg = read("src/lib/music-transcode/ffmpeg.ts");
assert.match(ffmpeg, /libmp3lame/);
assert.match(ffmpeg, /MUSIC_STREAM_BITRATE/);
assert.match(ffmpeg, /-vn/);
assert.match(ffmpeg, /probe\.bitrate == null/);
assert.doesNotMatch(ffmpeg, /loudnorm|dynaudnorm|acompressor|equalizer/);

const signed = read("src/lib/listen/signed-audio.ts");
assert.doesNotMatch(signed, /music-streams|music-masters/);

console.log("music-transcode-contract-unit: ok");
