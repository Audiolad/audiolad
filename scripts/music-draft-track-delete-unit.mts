import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  fallbackMusicTrackTitle,
  resolveAlbumTrackTitle,
} from "../src/lib/author-products/music-album-batch";
import {
  dropMusicUpload,
  emptyMusicQueue,
  enqueueReadyMusicUploads,
  finishMusicUpload,
  retryMusicUpload,
  stageMusicFile,
} from "../src/lib/author-products/music-track-upload-queue";
import {
  MUSIC_TRACK_UPLOAD_FAILED_TEXT,
  musicAuthorTrackStatusText,
} from "../src/lib/listen/music-delivery";
import {
  latestMusicUploadGeneration,
  musicDirectMp3ClaimApplies,
  musicMasterFinalizeClaimsDesired,
  musicStorageObjectKey,
  musicTrackHasServerAudio,
  readMusicTrackTeardownResult,
  staleUploadCleanupPaths,
  storageObjectsToRemove,
} from "../src/lib/author-products/music-track-lifecycle";

const form = readFileSync(
  new URL("../src/components/author-dashboard/AuthorProductForm.tsx", import.meta.url),
  "utf8",
);
const deleteRoute = readFileSync(
  new URL("../src/app/api/author/products/[id]/audio/[audioId]/route.ts", import.meta.url),
  "utf8",
);
const fileRoute = readFileSync(
  new URL("../src/app/api/author/products/[id]/audio/[audioId]/file/route.ts", import.meta.url),
  "utf8",
);
const deliveryServer = readFileSync(
  new URL("../src/lib/author-products/server/music-track-delivery.ts", import.meta.url),
  "utf8",
);

assert.equal(MUSIC_TRACK_UPLOAD_FAILED_TEXT, "Не удалось загрузить");
assert.equal(fallbackMusicTrackTitle(4), "Аудио 4");
assert.equal(resolveAlbumTrackTitle("04 - Внутренний покой.wav", 4), "Внутренний покой");
assert.equal(resolveAlbumTrackTitle(".wav", 4), "Аудио 4");

assert.equal(
  musicAuthorTrackStatusText({
    queuePhase: "error",
    hasLegacyAudioPath: false,
    hasActiveDelivery: false,
    lifecycleState: null,
    transcodeStatus: null,
  }),
  "Не удалось загрузить",
);
assert.equal(
  musicAuthorTrackStatusText({
    queuePhase: null,
    hasLegacyAudioPath: false,
    hasActiveDelivery: false,
    lifecycleState: "uploading",
    transcodeStatus: null,
  }),
  "Не удалось загрузить",
);
assert.equal(
  musicAuthorTrackStatusText({
    queuePhase: "uploading",
    hasLegacyAudioPath: false,
    hasActiveDelivery: false,
    lifecycleState: "uploading",
    transcodeStatus: null,
  }),
  "Загрузка…",
);
assert.match(form, /Повторить/);
assert.match(form, /Удалить аудио/);
assert.match(form, /musicAuthorTrackStatusText/);
assert.match(form, /phase === "error"/);

assert.equal(musicTrackHasServerAudio({ audio_path: null, music_master: { assetId: "m" } }), true);
assert.equal(musicTrackHasServerAudio({ audio_path: null }), false);
assert.equal(musicTrackHasServerAudio({ title: "" } as { audio_path?: string | null }), false);

assert.equal(musicMasterFinalizeClaimsDesired(2, 2), true);
assert.equal(musicMasterFinalizeClaimsDesired(2, 1), false);
assert.equal(musicDirectMp3ClaimApplies(0, null), true);
assert.equal(musicDirectMp3ClaimApplies(3, 3), true);
assert.equal(musicDirectMp3ClaimApplies(3, 1), false);
assert.equal(musicDirectMp3ClaimApplies(3, null), false);
assert.equal(latestMusicUploadGeneration([1, 3, 2]), 3);

const live = "practices/p/audio/new.mp3";
const stale = "practices/p/audio/old.mp3";
assert.deepEqual(staleUploadCleanupPaths({ failedPath: stale, livePaths: [live] }), [stale]);
assert.deepEqual(staleUploadCleanupPaths({ failedPath: live, livePaths: [live] }), []);
assert.deepEqual(
  storageObjectsToRemove(
    [
      { bucket: "music-masters", path: "masters/old.wav" },
      { bucket: "music-masters", path: "masters/new.wav" },
      { bucket: "music-streams", path: "" },
      { bucket: "other-bucket", path: "secret" },
    ],
    new Set([musicStorageObjectKey("music-masters", "masters/new.wav")]),
  ),
  [{ bucket: "music-masters", path: "masters/old.wav" }],
);

assert.deepEqual(
  readMusicTrackTeardownResult({
    status: "deleted",
    objects: [{ bucket: "music-masters", path: "masters/a.wav" }],
  })?.status,
  "deleted",
);
assert.equal(readMusicTrackTeardownResult({ status: "not_found", objects: [] })?.status, "not_found");
assert.equal(readMusicTrackTeardownResult({ status: "boom" }), null);

type Asset = { id: string; role: "master" | "stream"; itemId: string };
type Job = { id: string; source: string; output: string | null; status: string };
type Item = { id: string; title: string; active: string | null; desired: string | null };

function naiveDeleteItem(items: Item[], assets: Asset[], jobs: Job[], itemId: string) {
  const streams = assets.filter((asset) => asset.itemId === itemId && asset.role === "stream");
  for (const stream of streams) {
    for (const job of jobs) {
      if (job.output === stream.id && job.status === "ready") {
        throw new Error("invalid_music_transcode_ready_job");
      }
    }
  }
  return {
    items: items.filter((item) => item.id !== itemId),
    assets: assets.filter((asset) => asset.itemId !== itemId),
    jobs,
  };
}

function teardownItem(items: Item[], assets: Asset[], jobs: Job[], itemId: string) {
  const assetIds = new Set(assets.filter((asset) => asset.itemId === itemId).map((asset) => asset.id));
  const nextJobs = jobs.filter((job) => !assetIds.has(job.source) && !assetIds.has(job.output ?? ""));
  const nextAssets = assets.filter((asset) => asset.itemId !== itemId);
  return {
    items: items.filter((item) => item.id !== itemId),
    assets: nextAssets,
    jobs: nextJobs,
  };
}

{
  const items: Item[] = [
    { id: "ready", title: "Аудио 4", active: "stream", desired: "master" },
    { id: "other", title: "Сосед", active: null, desired: null },
    { id: "blank", title: "", active: null, desired: null },
  ];
  const assets: Asset[] = [
    { id: "master", role: "master", itemId: "ready" },
    { id: "stream", role: "stream", itemId: "ready" },
  ];
  const jobs: Job[] = [{ id: "job", source: "master", output: "stream", status: "ready" }];
  assert.throws(
    () => naiveDeleteItem(items, assets, jobs, "ready"),
    /invalid_music_transcode_ready_job/,
  );
  const torn = teardownItem(items, assets, jobs, "ready");
  assert.equal(torn.items.some((item) => item.id === "ready"), false);
  assert.equal(torn.items.some((item) => item.id === "other"), true);
  assert.equal(torn.jobs.length, 0);
  const untitled = teardownItem(torn.items, torn.assets, torn.jobs, "blank");
  assert.equal(untitled.items.some((item) => item.id === "blank"), false);
  assert.equal(untitled.items.some((item) => item.id === "other"), true);
}

{
  const snapshot = enqueueReadyMusicUploads(
    stageMusicFile(
      stageMusicFile(emptyMusicQueue(), "ok", "master", "ok.wav").snapshot,
      "bad",
      "master",
      "bad.wav",
    ).snapshot,
    ["ok", "bad"],
  ).snapshot;
  const bad = snapshot.entries.find((entry) => entry.audioId === "bad")!;
  const failed = finishMusicUpload(snapshot, "bad", bad.generation, "Не удалось загрузить");
  assert.equal(failed.snapshot.entries.find((entry) => entry.audioId === "bad")?.phase, "error");
  assert.equal(failed.snapshot.entries.some((entry) => entry.audioId === "ok"), true);
  const retried = retryMusicUpload(failed.snapshot, "bad");
  assert.notEqual(retried.snapshot.entries.find((entry) => entry.audioId === "bad")?.phase, "error");
  const removed = dropMusicUpload(retried.snapshot, "bad");
  assert.equal(removed.snapshot.entries.some((entry) => entry.audioId === "bad"), false);
  assert.equal(removed.snapshot.entries.some((entry) => entry.audioId === "ok"), true);
}

assert.match(deleteRoute, /teardownMusicTrackDelivery/);
assert.match(deleteRoute, /deleteItem: true/);
assert.match(deleteRoute, /!isMusic && \(await isProductAudioNormalizeInFlight/);
assert.match(fileRoute, /teardownMusicTrackDelivery/);
assert.match(fileRoute, /deleteItem: false/);
const cleanup = deliveryServer.slice(
  deliveryServer.indexOf("export async function removeMusicStorageObjectsBestEffort"),
  deliveryServer.indexOf("export async function teardownMusicTrackDelivery"),
);
assert.match(cleanup, /music_track_storage_cleanup_error/);
assert.match(cleanup, /catch \(error\)/);
assert.doesNotMatch(cleanup, /throw /);

console.log("music-draft-track-delete-unit: ok");
