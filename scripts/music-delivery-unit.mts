import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadMusicMasterStatus,
  selectNewestTranscodeStatusBySource,
} from "../src/lib/author-products/products";
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
  replacePreparingNoticeAfterMusicTranscodeFailure,
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

assert.doesNotMatch(form, /MUSIC_DELIVERY_UPLOAD_LABEL/);
assert.match(form, /MUSIC_DELIVERY_REPLACE_LABEL/);
assert.match(form, /MUSIC_DELIVERY_UPLOAD_HINT/);
assert.match(form, /audio\/wav,audio\/x-wav,audio\/wave,\.wav,audio\/mpeg,\.mp3/);
assert.match(form, /resolveMusicUploadMode/);
assert.doesNotMatch(form, /Загрузить WAV-мастер/);
assert.doesNotMatch(form, /Загрузить legacy MP3/);
assert.doesNotMatch(form, /Заменить legacy MP3/);
assert.match(form, /Загрузить аудио/);
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

const statusIdx = form.indexOf("musicAuthorTrackStatusText({");
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
  MUSIC_DELIVERY_FAILED_TEXT.startsWith("Не удалось подготовить версию для прослушивания."),
  true,
);
const acceptedUploadMessage = "Файл загружен. Подготавливаем версию для прослушивания…";
assert.equal(
  replacePreparingNoticeAfterMusicTranscodeFailure(
    acceptedUploadMessage,
    acceptedUploadMessage,
    true,
  ),
  MUSIC_DELIVERY_FAILED_TEXT,
);
assert.equal(
  replacePreparingNoticeAfterMusicTranscodeFailure(
    "Черновик сохранён.",
    acceptedUploadMessage,
    true,
  ),
  "Черновик сохранён.",
);
assert.equal(
  replacePreparingNoticeAfterMusicTranscodeFailure(
    acceptedUploadMessage,
    acceptedUploadMessage,
    false,
  ),
  acceptedUploadMessage,
);
assert.equal(
  replacePreparingNoticeAfterMusicTranscodeFailure(null, acceptedUploadMessage, true),
  null,
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
assert.match(deploy, /assert_product_audio_normalize_worker_release_tree/);
assert.match(deploy, /ensure-product-audio-normalize-worker\.sh/);
assert.match(read("deploy/product-audio-normalize-worker.ecosystem.config.cjs"), /audiolad-product-audio-normalize-worker/);
assert.match(deploy, /music_transcode_worker_ecosystem_missing/);
assert.match(deploy, /ensure-music-transcode-worker\.sh/);
assert.match(deploy, /log_error "music_transcode_worker_ensure_failed"/);
assert.match(deploy, /Music transcode worker ensure failed/);
assert.doesNotMatch(deploy, /log_warn "music_transcode_worker_ensure_failed"/);
assert.match(studio, /audiolad-studio-render-worker/);
assert.match(worker, /audiolad-music-transcode-worker/);
assert.doesNotMatch(worker, /Do not add this process to/);

assert.equal(MUSIC_DELIVERY_UNSUPPORTED_TEXT.includes("WAV"), true);

// Older failed jobs must not hide a newer ready job when active delivery exists.
{
  const masters = [
    {
      id: "27e4ed87-d672-4fc6-8f38-512e58c2aaca",
      audioId: "track-a",
      streamId: "stream-a",
      readyJobId: "95b2d0d7-c6e1-4782-a7d5-5baa9383d954",
    },
    {
      id: "143ccec4-8e7f-44bf-81fd-8f23ca7e1c57",
      audioId: "track-b",
      streamId: "stream-b",
      readyJobId: "44aa09c3-fd6f-47ac-8150-fa177d1160d2",
    },
  ] as const;

  const items = masters.map((master) => ({
    id: master.audioId,
    audio_path: null,
    desired_music_master_asset_id: master.id,
    active_music_delivery_asset_id: master.streamId,
  }));

  const assets = masters.flatMap((master) => [
    {
      id: master.id,
      audio_item_id: master.audioId,
      asset_role: "master",
      lifecycle_state: "verified",
      storage_bucket: "music-masters",
      storage_path: `practices/37dc3a6b-ad83-4d74-880c-a8222537c2a9/audio/${master.audioId}/masters/${master.id}.wav`,
      created_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: master.streamId,
      audio_item_id: master.audioId,
      asset_role: "stream",
      lifecycle_state: "verified",
      storage_bucket: "music-streams",
      storage_path: `${master.audioId}/${master.id}/mp3-256.mp3`,
      created_at: "2026-09-20T00:00:00.000Z",
    },
  ]);

  const jobs = masters.flatMap((master) => [
    {
      id: `${master.id}-failed-1`,
      source_asset_id: master.id,
      status: "failed",
      created_at: "2026-08-02T00:00:00.000Z",
    },
    {
      id: `${master.id}-failed-2`,
      source_asset_id: master.id,
      status: "failed",
      created_at: "2026-08-03T00:00:00.000Z",
    },
    {
      id: `${master.id}-failed-3`,
      source_asset_id: master.id,
      status: "failed",
      created_at: "2026-08-04T00:00:00.000Z",
    },
    {
      id: master.readyJobId,
      source_asset_id: master.id,
      status: "ready",
      created_at: "2026-09-15T00:00:00.000Z",
    },
  ]);

  for (const master of masters) {
    const newestFirst = jobs
      .filter((job) => job.source_asset_id === master.id)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    const selected = selectNewestTranscodeStatusBySource(newestFirst).get(master.id);
    assert.equal(selected, "ready");
    assert.equal(
      musicCabinetStatus({
        hasLegacyAudioPath: false,
        hasActiveDelivery: true,
        lifecycleState: "verified",
        transcodeStatus: selected,
      }).text,
      MUSIC_DELIVERY_READY_TEXT,
    );
    assert.notEqual(
      musicCabinetStatus({
        hasLegacyAudioPath: false,
        hasActiveDelivery: true,
        lifecycleState: "verified",
        transcodeStatus: selected,
      }).text,
      MUSIC_DELIVERY_FAILED_TEXT,
    );
  }

  const serviceRole = {
    from(table: string) {
      let rows = (table === "music_audio_assets" ? assets : table === "music_transcode_jobs" ? jobs : []).map(
        (row) => ({ ...row }),
      );
      const chain = {
        select() {
          return chain;
        },
        in(column: string, values: readonly unknown[]) {
          const allowed = new Set(values);
          rows = rows.filter((row) => allowed.has(row[column as keyof typeof row]));
          return chain;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => row[column as keyof typeof row] === value);
          return chain;
        },
        order(column: string, options?: { ascending?: boolean }) {
          const direction = options?.ascending ? 1 : -1;
          rows = [...rows].sort((left, right) => {
            const a = String(left[column as keyof typeof left] ?? "");
            const b = String(right[column as keyof typeof right] ?? "");
            if (a < b) return -1 * direction;
            if (a > b) return 1 * direction;
            return 0;
          });
          return chain;
        },
        then(
          onFulfilled: (value: { data: typeof rows; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve({ data: rows, error: null as null }).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  const loaded = await loadMusicMasterStatus(items, { serviceRole });
  for (const master of masters) {
    const row = loaded.get(master.audioId);
    assert.equal(row?.transcodeStatus, "ready");
    assert.equal(row?.hasActiveDelivery, true);
    assert.equal(row?.lifecycleState, "verified");
    const text = musicCabinetStatus({
      hasLegacyAudioPath: false,
      hasActiveDelivery: row?.hasActiveDelivery === true,
      lifecycleState: row?.lifecycleState,
      transcodeStatus: row?.transcodeStatus,
    }).text;
    assert.equal(text, MUSIC_DELIVERY_READY_TEXT);
    assert.notEqual(text, MUSIC_DELIVERY_FAILED_TEXT);
  }
}

process.stdout.write("music-delivery-unit: ok\n");
