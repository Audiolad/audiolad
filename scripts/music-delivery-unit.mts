import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MUSIC_DELIVERY_EMPTY_TEXT,
  MUSIC_DELIVERY_FAILED_TEXT,
  MUSIC_DELIVERY_PREPARING_TEXT,
  MUSIC_DELIVERY_PREPARING_WITH_CURRENT_TEXT,
  MUSIC_DELIVERY_READY_TEXT,
  MUSIC_DELIVERY_UNSUPPORTED_TEXT,
  hasPlayableAuthorAudioPreview,
  hasValidatedMusicPublishSource,
  musicCabinetStatus,
  resolveMusicCatalogPreviewMode,
  resolveMusicListenSource,
  resolveMusicUploadMode,
} from "../src/lib/listen/music-delivery";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const signed = read("src/lib/listen/signed-audio.ts");
const preview = read("src/app/api/author/products/[id]/audio/[audioId]/preview/route.ts");
const deploy = read("deploy/scripts/deploy.sh");
const ecosystem = read("deploy/music-transcode-worker.ecosystem.config.cjs");
const ensure = read("deploy/scripts/ensure-music-transcode-worker.sh");
const studio = read("deploy/studio-render-worker.ecosystem.config.cjs");
const worker = read("scripts/run-music-transcode-worker.mts");
const products = read("src/lib/author-products/products.ts");

assert.match(form, /MUSIC_DELIVERY_UPLOAD_LABEL/);
assert.match(form, /MUSIC_DELIVERY_REPLACE_LABEL/);
assert.match(form, /MUSIC_DELIVERY_UPLOAD_HINT/);
assert.match(form, /audio\/wav,audio\/x-wav,audio\/wave,\.wav,audio\/mpeg,\.mp3/);
assert.match(form, /resolveMusicUploadMode/);
assert.doesNotMatch(form, /Загрузить WAV-мастер/);
assert.doesNotMatch(form, /Загрузить legacy MP3/);
assert.doesNotMatch(form, /Заменить legacy MP3/);
assert.match(form, /Загрузить MP3/);
assert.match(form, /hasPlayableAuthorAudioPreview/);
assert.match(form, /authorAudioPreviewFingerprint/);
assert.match(form, /audioPreviewSourceKey/);
assert.match(form, /audioPreviewFingerprints/);
assert.match(form, /AUDIO_PREVIEW_SOFT_ERROR/);
assert.match(form, /<audio/);
assert.match(form, /controls/);
assert.doesNotMatch(form, /music-masters/);
assert.doesNotMatch(preview, /music-masters/);
assert.match(preview, /resolveMusicListenSource/);
assert.match(preview, /MUSIC_STREAMS|music-streams|source\.bucket/);
assert.doesNotMatch(form, /eslint-disable-next-line react-hooks\/exhaustive-deps/);

const statusIdx = form.indexOf("musicCabinetStatus({");
const playerIdx = form.indexOf("<audio");
const hintIdx = form.indexOf("? MUSIC_DELIVERY_UPLOAD_HINT");
const replaceIdx = form.lastIndexOf("MUSIC_DELIVERY_REPLACE_LABEL");
assert.ok(statusIdx > 0 && playerIdx > statusIdx, "A/B player after status");
assert.ok(hintIdx > playerIdx, "hint after player");
assert.ok(replaceIdx > hintIdx, "buttons after hint");
assert.match(form, /audioItemHasPlayablePreview\(audioItem\) && practiceId/);
assert.match(products, /Active stream can remain after desired master is cleared/);

assert.equal(resolveMusicUploadMode({ name: "a.wav", type: "audio/wav" }), "master");
assert.equal(resolveMusicUploadMode({ name: "a.mp3", type: "audio/mpeg" }), "legacy");
assert.equal(resolveMusicUploadMode({ name: "a.flac", type: "audio/flac" }), null);

assert.equal(
  musicCabinetStatus({
    hasLegacyAudioPath: false,
    hasActiveDelivery: false,
    lifecycleState: null,
    transcodeStatus: null,
  }).text,
  MUSIC_DELIVERY_EMPTY_TEXT,
);
assert.equal(
  musicCabinetStatus({
    hasLegacyAudioPath: false,
    hasActiveDelivery: false,
    lifecycleState: "verified",
    transcodeStatus: "queued",
  }).text,
  MUSIC_DELIVERY_PREPARING_TEXT,
);
assert.equal(
  musicCabinetStatus({
    hasLegacyAudioPath: true,
    hasActiveDelivery: true,
    lifecycleState: "verified",
    transcodeStatus: "processing",
  }).text,
  MUSIC_DELIVERY_PREPARING_WITH_CURRENT_TEXT,
);
assert.equal(
  musicCabinetStatus({
    hasLegacyAudioPath: false,
    hasActiveDelivery: true,
    lifecycleState: "verified",
    transcodeStatus: "ready",
  }).text,
  MUSIC_DELIVERY_READY_TEXT,
);
assert.equal(
  musicCabinetStatus({
    hasLegacyAudioPath: false,
    hasActiveDelivery: false,
    lifecycleState: "verified",
    transcodeStatus: "failed",
  }).text,
  MUSIC_DELIVERY_FAILED_TEXT,
);
assert.equal(
  musicCabinetStatus({
    hasLegacyAudioPath: false,
    hasActiveDelivery: false,
    lifecycleState: "verified",
    transcodeStatus: "ready",
  }).kind,
  "preparing",
);
assert.equal(
  musicCabinetStatus({
    hasLegacyAudioPath: true,
    hasActiveDelivery: false,
    lifecycleState: null,
    transcodeStatus: null,
  }).kind,
  "ready",
);
assert.equal(hasPlayableAuthorAudioPreview({ audioPath: "a.mp3" }), true);
assert.equal(hasPlayableAuthorAudioPreview({ activeMusicDeliveryAssetId: "stream-1" }), false);
assert.equal(hasPlayableAuthorAudioPreview({ hasActiveDelivery: true }), true);
assert.equal(hasPlayableAuthorAudioPreview({ audioPath: "  " }), false);
assert.equal(hasPlayableAuthorAudioPreview({}), false);
assert.equal(
  hasValidatedMusicPublishSource({ audioPath: null, hasActiveDelivery: false }),
  false,
);
assert.equal(
  hasValidatedMusicPublishSource({
    audioPath: null,
    hasActiveDelivery: true,
  }),
  true,
);
assert.match(products, /loadValidatedActiveMusicDeliveryItemIds/);
const validatedHelper = read("src/lib/listen/validated-active-music-delivery.ts");
assert.match(validatedHelper, /isVerifiedMusicStreamAsset/);

const stream = {
  audioItemId: "item-1",
  assetRole: "stream",
  lifecycleState: "verified",
  storageBucket: "music-streams",
  storagePath: "item-1/master-1/mp3-256.mp3",
};
assert.deepEqual(
  resolveMusicListenSource({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: "legacy/track.mp3",
    activeStream: stream,
  }),
  { kind: "stream", bucket: "music-streams", path: stream.storagePath },
);
assert.deepEqual(
  resolveMusicListenSource({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: "legacy/track.mp3",
    activeStream: { ...stream, lifecycleState: "rejected" },
  }),
  { kind: "legacy", bucket: "practice-audio", path: "legacy/track.mp3" },
);
assert.deepEqual(
  resolveMusicListenSource({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: null,
    activeStream: { ...stream, storageBucket: "music-masters" },
  }),
  { kind: "missing" },
);
assert.deepEqual(
  resolveMusicListenSource({
    productKind: "practice",
    audioItemId: "item-1",
    audioPath: "legacy/track.mp3",
    activeStream: stream,
  }),
  { kind: "legacy", bucket: "practice-audio", path: "legacy/track.mp3" },
);
assert.equal(
  resolveMusicCatalogPreviewMode({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: "legacy/track.mp3",
    activeStream: stream,
  }),
  "clip",
);
assert.deepEqual(
  resolveMusicCatalogPreviewMode({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: null,
    activeStream: stream,
  }),
  { kind: "stream", bucket: "music-streams", path: stream.storagePath },
);


assert.deepEqual(
  resolveMusicListenSource({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: "legacy/replaced-b.mp3",
    activeStream: null,
  }),
  { kind: "legacy", bucket: "practice-audio", path: "legacy/replaced-b.mp3" },
);
assert.deepEqual(
  resolveMusicListenSource({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: "legacy/old.mp3",
    activeStream: stream,
  }),
  { kind: "stream", bucket: "music-streams", path: stream.storagePath },
);

assert.match(signed, /resolveMusicListenSource/);
assert.match(read("src/lib/listen/music-delivery.ts"), /MUSIC_STREAMS_BUCKET/);
assert.doesNotMatch(signed, /from\("music-masters"\)/);
assert.match(preview, /resolveMusicListenSource/);
assert.match(products, /desired_music_master_asset_id/);
assert.match(products, /hasActiveDelivery/);
assert.match(products, /Current direct-MP3 mode/);
assert.match(read("src/lib/author-products/server/direct-audio-upload.ts"), /activate_music_direct_mp3_delivery/);

assert.match(ecosystem, /name: "audiolad-music-transcode-worker"/);
assert.match(ecosystem, /cwd: "\/var\/www\/audiolad-deploy\/current"/);
assert.match(ecosystem, /args: "scripts\/run-music-transcode-worker\.mts"/);
assert.match(ensure, /audiolad-music-transcode-worker/);
assert.match(ensure, /pm2_status|jlist/);
assert.match(ensure, /music_transcode_worker_already_online/);
assert.match(ensure, /music_transcode_worker_recover/);
assert.match(ensure, /music_transcode_worker_not_online/);
assert.match(deploy, /assert_music_transcode_worker_release_tree/);
assert.match(deploy, /music_transcode_worker_ecosystem_missing/);
assert.match(deploy, /ensure-music-transcode-worker\.sh/);
assert.match(deploy, /log_error "music_transcode_worker_ensure_failed"/);
assert.match(deploy, /Music transcode worker ensure failed/);
assert.doesNotMatch(deploy, /log_warn "music_transcode_worker_ensure_failed"/);
assert.match(studio, /audiolad-studio-render-worker/);
assert.match(worker, /audiolad-music-transcode-worker/);
assert.doesNotMatch(worker, /Do not add this process to/);

assert.equal(MUSIC_DELIVERY_UNSUPPORTED_TEXT.includes("WAV"), true);
process.stdout.write("music-delivery-unit: ok\n");
