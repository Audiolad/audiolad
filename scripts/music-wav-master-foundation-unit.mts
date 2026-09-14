import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { readFileSync as readFileSyncCompat } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  MAX_MUSIC_MASTER_BYTES,
  MUSIC_MASTERS_BUCKET,
  MUSIC_STREAMS_BUCKET,
  buildMusicMasterStoragePath,
  isOwnedMusicMasterStoragePath,
  validateMusicMasterDescriptor,
} from "../src/lib/author-products/music-master-upload-contract";
import { isVerifiedMusicMasterMedia } from "../src/lib/author-products/server/music-master-upload";
import { inspectAudioMediaFile } from "../src/lib/studio/server/audio-duration";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSyncCompat(path.join(root, file), "utf8");
const execFile = promisify(execFileCallback);
const practiceId = "11111111-1111-1111-1111-111111111111";
const audioId = "22222222-2222-2222-2222-222222222222";
const assetId = "33333333-3333-3333-3333-333333333333";
const pathValue = buildMusicMasterStoragePath(practiceId, audioId, assetId);

assert.equal(MAX_MUSIC_MASTER_BYTES, 300 * 1024 * 1024);
assert.equal(validateMusicMasterDescriptor({ name: "master.WAV", type: "audio/wav", size: 1 }), null);
assert.equal(validateMusicMasterDescriptor({ name: "master.wav", type: "audio/x-wav", size: 1 }), null);
assert.equal(validateMusicMasterDescriptor({ name: "master.wav", type: "application/octet-stream", size: 1 }), null);
assert.equal(validateMusicMasterDescriptor({ name: "master.mp3", type: "audio/mpeg", size: 1 }), "invalid_file_type");
assert.equal(validateMusicMasterDescriptor({ name: "master.wav", type: "audio/wav", size: MAX_MUSIC_MASTER_BYTES + 1 }), "invalid_file_size");
assert.equal(isOwnedMusicMasterStoragePath(pathValue, practiceId, audioId, assetId), true);
assert.equal(isOwnedMusicMasterStoragePath(pathValue, practiceId, "44444444-4444-4444-4444-444444444444", assetId), false);
assert.equal(isOwnedMusicMasterStoragePath(`${pathValue}/../spoof.wav`, practiceId, audioId, assetId), false);

const migration = read("supabase/migrations/20261007120000_music_wav_master_foundation.sql");
const server = read("src/lib/author-products/server/music-master-upload.ts");
const client = read("src/lib/author-products/music-master-upload-client.ts");
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const legacyServer = read("src/lib/author-products/server/direct-audio-upload.ts");
const signedAudio = read("src/lib/listen/signed-audio.ts");

assert.match(migration, /CREATE TABLE public\.music_audio_assets/);
assert.match(migration, /CREATE TABLE public\.music_transcode_jobs/);
assert.match(migration, /WHERE status IN \('queued', 'processing'\)/);
assert.match(migration, /finalize_music_master_asset/);
assert.match(migration, /music-masters/);
assert.match(migration, /music-streams/);
assert.match(migration, /false, 314572800/);
assert.match(migration, /active_music_delivery_asset_id uuid NULL/);
assert.match(migration, /asset_role = 'stream'/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*music-masters/);

assert.match(server, /practice\.product_kind/);
assert.match(server, /productKind !== "music"/);
assert.match(server, /getPracticeSaleLock/);
assert.match(server, /shouldBlockMusicAudioReplacement/);
assert.match(server, /active_music_delivery_asset_id, desired_music_master_asset_id/);
assert.match(server, /isProductContentLockedDbError/);
assert.match(server, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/);
assert.match(server, /inspectAudioMediaFile/);
assert.match(server, /isVerifiedMusicMasterMedia/);
assert.match(server, /objectSize !== input\.fileSize/);
assert.match(server, /finalize_music_master_asset/);
const finalizeBlock = server.slice(
  server.indexOf("export async function finalizeMusicMasterDirectUpload"),
  server.indexOf("export async function abandonMusicMasterDirectUpload"),
);
assert.match(finalizeBlock, /throw new MusicMasterUploadError\("invalid_file_type", 400\)/);
assert.doesNotMatch(finalizeBlock, /\.from\("audio_items"\)\s*\.update/);
assert.doesNotMatch(finalizeBlock, /audio_path:/);
assert.match(client, new RegExp(`from\\(MUSIC_MASTERS_BUCKET\\)`));
assert.match(client, /contentType: "audio\/wav"/);
assert.doesNotMatch(client, /contentType: input\.file\.type/);
assert.match(client, /upsert: false/);
assert.match(form, /MUSIC_DELIVERY_UPLOAD_LABEL/);
assert.match(form, /musicCabinetStatus/);
assert.doesNotMatch(form, /Загрузить WAV-мастер/);
assert.doesNotMatch(form, /Загрузить legacy MP3/);
assert.match(legacyServer, /PRACTICE_AUDIO_BUCKET/);
assert.match(signedAudio, /resolveMusicListenSource/);
assert.doesNotMatch(signedAudio, /from\("music-masters"\)/);
assert.equal(MUSIC_MASTERS_BUCKET, "music-masters");
assert.equal(MUSIC_STREAMS_BUCKET, "music-streams");

const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "audiolad-wav-master-"));
try {
  const wavPath = path.join(fixtureDirectory, "real.wav");
  const mp3SourcePath = path.join(fixtureDirectory, "real.mp3");
  const mp3Path = path.join(fixtureDirectory, "renamed.wav");
  const videoPath = path.join(fixtureDirectory, "video.mp4");
  await execFile("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100",
    "-t", "0.1", "-c:a", "pcm_s16le", wavPath,
  ]);
  await execFile("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100",
    "-t", "0.1", "-c:a", "libmp3lame", mp3SourcePath,
  ]);
  await copyFile(mp3SourcePath, mp3Path);
  await execFile("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=1",
    "-t", "0.1", "-an", "-c:v", "mpeg4", videoPath,
  ]);

  const wav = await inspectAudioMediaFile(wavPath);
  const renamedMp3 = await inspectAudioMediaFile(mp3Path);
  const videoOnly = await inspectAudioMediaFile(videoPath);
  assert.ok(wav?.formatNames.includes("wav"));
  assert.equal(wav?.hasAudioStream, true);
  assert.equal(isVerifiedMusicMasterMedia(wav), true, "real WAV accepted");
  assert.equal(isVerifiedMusicMasterMedia(renamedMp3), false, "MP3 renamed .wav rejected");
  assert.equal(videoOnly?.hasAudioStream, false);
  assert.equal(isVerifiedMusicMasterMedia(videoOnly), false, "video-only media rejected");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log("music-wav-master-foundation-unit: ok");
