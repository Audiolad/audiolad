import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_MUSIC_MASTER_BYTES,
  MUSIC_MASTERS_BUCKET,
  MUSIC_STREAMS_BUCKET,
  buildMusicMasterStoragePath,
  isOwnedMusicMasterStoragePath,
  validateMusicMasterDescriptor,
} from "../src/lib/author-products/music-master-upload-contract";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const practiceId = "11111111-1111-1111-1111-111111111111";
const audioId = "22222222-2222-2222-2222-222222222222";
const assetId = "33333333-3333-3333-3333-333333333333";
const pathValue = buildMusicMasterStoragePath(practiceId, audioId, assetId);

assert.equal(MAX_MUSIC_MASTER_BYTES, 300 * 1024 * 1024);
assert.equal(validateMusicMasterDescriptor({ name: "master.WAV", type: "audio/wav", size: 1 }), null);
assert.equal(validateMusicMasterDescriptor({ name: "master.wav", type: "audio/x-wav", size: 1 }), null);
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
assert.match(server, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/);
assert.match(server, /probeStudioAudioFile/);
assert.match(server, /objectSize !== input\.fileSize/);
assert.match(server, /finalize_music_master_asset/);
assert.doesNotMatch(server, /audio_path:/);
assert.match(client, new RegExp(`from\\(MUSIC_MASTERS_BUCKET\\)`));
assert.match(client, /upsert: false/);
assert.match(form, /Загрузить WAV-мастер/);
assert.match(form, /Файл загружен\. Подготавливаем версию для прослушивания…/);
assert.match(form, /Загрузить legacy MP3/);
assert.match(legacyServer, /PRACTICE_AUDIO_BUCKET/);
assert.doesNotMatch(signedAudio, /music-masters|music-streams/);
assert.equal(MUSIC_MASTERS_BUCKET, "music-masters");
assert.equal(MUSIC_STREAMS_BUCKET, "music-streams");

console.log("music-wav-master-foundation-unit: ok");
