import assert from "node:assert/strict";

import {
  buildS3ObjectUrl,
  presignS3ObjectUrl,
} from "../src/lib/music-storage/s3-signing";
import {
  musicStorageLocation,
  newMusicMasterStorageProvider,
  readMusicStorageProvider,
} from "../src/lib/music-storage/server";

const config = {
  endpoint: "https://s3.example.test",
  region: "ru-1",
  accessKeyId: "test-access",
  secretAccessKey: "test-secret",
  forcePathStyle: true,
};

assert.equal(
  buildS3ObjectUrl(config, "private masters", "album/a b.wav").toString(),
  "https://s3.example.test/private%20masters/album/a%20b.wav",
);

const signed = new URL(presignS3ObjectUrl({
  config,
  bucket: "masters",
  key: "album/master.wav",
  method: "GET",
  expiresSeconds: 120,
  now: new Date("2026-11-26T12:34:56.000Z"),
}));
assert.equal(signed.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
assert.equal(
  signed.searchParams.get("X-Amz-Credential"),
  "test-access/20261126/ru-1/s3/aws4_request",
);
assert.equal(signed.searchParams.get("X-Amz-Date"), "20261126T123456Z");
assert.equal(signed.searchParams.get("X-Amz-Expires"), "120");
assert.match(signed.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
assert(!signed.toString().includes("test-secret"));

assert.equal(readMusicStorageProvider(null), "supabase_file");
assert.equal(readMusicStorageProvider("unknown"), "supabase_file");
assert.equal(readMusicStorageProvider("timeweb_s3"), "timeweb_s3");
assert.deepEqual(musicStorageLocation({
  storage_provider: null,
  storage_bucket: "music-masters",
  storage_path: "a.wav",
}), {
  provider: "supabase_file",
  bucket: "music-masters",
  path: "a.wav",
});
assert.equal(newMusicMasterStorageProvider({}), "supabase_file");
assert.equal(
  newMusicMasterStorageProvider({ MUSIC_MASTERS_UPLOAD_PROVIDER: "timeweb_s3" }),
  "timeweb_s3",
);
assert.throws(
  () => newMusicMasterStorageProvider({ MUSIC_MASTERS_UPLOAD_PROVIDER: "other" }),
  /unsupported_music_storage_provider/,
);

console.log("music storage provider unit: ok");
