import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { appendCreatedAudioItem } from "../src/lib/author-products/form-merge";
import {
  deriveAlbumTrackTitle,
  resolveAlbumTrackTitle,
  formatAlbumBatchCreateFailure,
  MAX_MUSIC_ALBUM_BATCH_FILES,
  orderAlbumBatchFiles,
  planMusicAlbumBatch,
  type AlbumBatchFile,
} from "../src/lib/author-products/music-album-batch";
import {
  emptyMusicQueue,
  enqueueReadyMusicUploads,
  finishMusicUpload,
  musicQueueBlocksTrackCreation,
  stageMusicFile,
} from "../src/lib/author-products/music-track-upload-queue";
import type { AudioItemRow } from "../src/lib/author-products/types";

function named(name: string, type = "audio/wav", size = 128): AlbumBatchFile {
  return { name, type, size };
}

function item(partial: Partial<AudioItemRow> & Pick<AudioItemRow, "id">): AudioItemRow {
  return {
    practice_id: "practice",
    title: partial.title ?? partial.id,
    description: null,
    audio_path: null,
    cover_url: null,
    duration_seconds: null,
    original_file_name: null,
    file_size_bytes: null,
    position: partial.position ?? 1,
    is_preview: false,
    status: "draft",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

assert.equal(deriveAlbumTrackTitle("01 - Morning Light.wav"), "Morning Light");
assert.equal(deriveAlbumTrackTitle("01. Morning Light.wav"), "Morning Light");
assert.equal(deriveAlbumTrackTitle("01_Morning Light.wav"), "Morning Light");
assert.equal(deriveAlbumTrackTitle("1 - Morning Light.mp3"), "Morning Light");
assert.equal(deriveAlbumTrackTitle("10 - Morning Light.wav"), "Morning Light");
assert.equal(deriveAlbumTrackTitle("2026 Mix.wav"), "2026 Mix");
assert.equal(deriveAlbumTrackTitle("100 Years.mp3"), "100 Years");
assert.equal(deriveAlbumTrackTitle("Track 01.wav"), "Track 01");
assert.equal(deriveAlbumTrackTitle("01.wav"), "01");
assert.equal(resolveAlbumTrackTitle("01 - Morning Light.wav", 4), "Morning Light");
assert.equal(resolveAlbumTrackTitle(".wav", 4), "Аудио 4");
assert.equal(resolveAlbumTrackTitle("???.mp3", 2), "Аудио 2");
assert.equal(resolveAlbumTrackTitle("", 1), "Аудио 1");

{
  const ordered = orderAlbumBatchFiles([
    named("01 - Track.wav"),
    named("02 - Track.wav"),
    named("10 - Track.wav"),
  ]);
  assert.deepEqual(
    ordered.map((file) => file.name),
    ["01 - Track.wav", "02 - Track.wav", "10 - Track.wav"],
  );
}

{
  const ordered = orderAlbumBatchFiles([
    named("1 - A.wav"),
    named("10 - B.wav"),
    named("2 - C.wav"),
  ]);
  assert.deepEqual(
    ordered.map((file) => file.name),
    ["1 - A.wav", "2 - C.wav", "10 - B.wav"],
  );
}

{
  const original = [named("01 - A.wav"), named("Summer.wav"), named("02 - B.wav")];
  const ordered = orderAlbumBatchFiles(original);
  assert.deepEqual(
    ordered.map((file) => file.name),
    original.map((file) => file.name),
  );
}

{
  const original = [
    named("2026 Mix.wav"),
    named("Summer.wav"),
    named("100 Years.mp3", "audio/mpeg"),
  ];
  assert.deepEqual(
    orderAlbumBatchFiles(original).map((file) => file.name),
    original.map((file) => file.name),
  );
}

{
  const local = [
    item({
      id: "a",
      title: "Уже есть",
      audio_path: "practices/p/audio/a.mp3",
      music_master: {
        assetId: "asset-a",
        lifecycleState: "verified",
        transcodeStatus: "ready",
        hasActiveDelivery: true,
      },
    }),
  ];
  const created = item({ id: "b", title: "Morning Light", position: 2 });
  const next = appendCreatedAudioItem(local, created);
  assert.equal(next.length, 2);
  assert.equal(next[0]?.audio_path, "practices/p/audio/a.mp3");
  assert.equal(next[0]?.music_master?.assetId, "asset-a");
  assert.equal(next[0]?.music_master?.hasActiveDelivery, true);
  assert.equal(next[1]?.id, "b");
  assert.equal(appendCreatedAudioItem(next, created).length, 2);
}

{
  const files = Array.from({ length: 31 }, (_, index) =>
    named(`${String(index + 1).padStart(2, "0")} - Track.wav`),
  );
  const plan = planMusicAlbumBatch(files);
  assert.equal(plan.accepted.length, MAX_MUSIC_ALBUM_BATCH_FILES);
  assert.equal(plan.overflow.length, 1);
  assert.equal(plan.skipped.length, 0);
}

{
  const plan = planMusicAlbumBatch([
    named("01 - A.wav"),
    named("notes.txt", "text/plain", 20),
    named("02 - B.mp3", "audio/mpeg"),
  ]);
  assert.deepEqual(
    plan.accepted.map((file) => file.name),
    ["01 - A.wav", "02 - B.mp3"],
  );
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0]?.name, "notes.txt");
}

{
  const plan = planMusicAlbumBatch([
    named("01 - A.wav"),
    named("notes.txt", "text/plain", 20),
    named("10 - C.wav"),
    named("02 - B.wav"),
  ]);
  assert.deepEqual(
    plan.accepted.map((file) => file.name),
    ["01 - A.wav", "02 - B.wav", "10 - C.wav"],
  );
  assert.deepEqual(
    plan.skipped.map((entry) => entry.name),
    ["notes.txt"],
  );
}

{
  const staged = stageMusicFile(emptyMusicQueue(), "new", "master", "01 - A.wav");
  assert.deepEqual(staged.launchIds, []);
  assert.equal(staged.snapshot.entries[0]?.phase, "ready");
  const readyOnly = stageMusicFile(emptyMusicQueue(), "ready", "legacy", "a.mp3").snapshot;
  const errored = finishMusicUpload(
    enqueueReadyMusicUploads(readyOnly, ["ready"]).snapshot,
    "ready",
    1,
    "fail",
  ).snapshot;
  assert.equal(musicQueueBlocksTrackCreation(readyOnly), false);
  assert.equal(musicQueueBlocksTrackCreation(errored), false);
  const active = enqueueReadyMusicUploads(
    stageMusicFile(emptyMusicQueue(), "up", "legacy", "a.mp3").snapshot,
    ["up"],
  ).snapshot;
  assert.equal(musicQueueBlocksTrackCreation(active), true);
  assert.equal(active.entries[0]?.phase, "uploading");
}

assert.equal(
  formatAlbumBatchCreateFailure(5, 10, "06 - Night.wav"),
  "Добавлено 5 из 10 треков. Не удалось добавить 06 - Night.wav.",
);

const formSource = readFileSync(
  new URL("../src/components/author-dashboard/AuthorProductForm.tsx", import.meta.url),
  "utf8",
);

assert.match(formSource, /Добавить треки альбома/);
assert.match(formSource, /type="file"\s+multiple/);
assert.match(formSource, /appendCreatedAudioItem\(current, payload\.audio_item!\)/);
assert.match(formSource, /appendCreatedAudioItem\(current, audioItem\)/);
assert.match(formSource, /stageMusicTrackFile\(audioItem\.id, file\)/);
assert.match(formSource, /mergeServerAudioItems\(current, payload\.product!\.audio_items\)/);
assert.match(formSource, /uploadAudio\(audioItem\.id, file, "legacy"\)/);
assert.doesNotMatch(formSource, /webkitGetAsEntry|directory/);

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf("\n  async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const albumBody = functionBody(formSource, "addAlbumTracks");
assert.match(albumBody, /planMusicAlbumBatch/);
assert.match(albumBody, /stageMusicTrackFile/);
assert.doesNotMatch(albumBody, /enqueueReadyMusicUploads/);
assert.ok(albumBody.indexOf("stageMusicTrackFile") < albumBody.indexOf("startReadyMusicUploads"));
assert.match(albumBody, /if \(stagedIds\.length > 0\)/);
assert.match(albumBody, /musicQueueBlocksTrackCreation/);
assert.match(albumBody, /failedNames/);
assert.match(albumBody, /resolveAlbumTrackTitle/);
assert.match(albumBody, /continue/);
assert.match(functionBody(formSource, "addAudioItem"), /musicQueueBlocksTrackCreation/);
assert.match(functionBody(formSource, "addAudioItem"), /PRODUCT_KIND\.MUSIC/);

console.log("music-album-batch-unit: ok");
