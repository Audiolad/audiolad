import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MAX_CONCURRENT_MUSIC_UPLOADS,
  emptyMusicQueue,
  enqueueReadyMusicUploads,
  finishMusicUpload,
  musicUploadActiveCount,
  retryMusicUpload,
  stageMusicFile,
  type MusicQueueSnapshot,
} from "../src/lib/author-products/music-track-upload-queue";

function stageReady(snapshot: MusicQueueSnapshot, ids: string[]): MusicQueueSnapshot {
  return ids.reduce(
    (current, id) => stageMusicFile(current, id, "legacy", `${id}.mp3`).snapshot,
    snapshot,
  );
}

assert.equal(MAX_CONCURRENT_MUSIC_UPLOADS, 3);

{
  let snapshot = emptyMusicQueue();
  const ids = Array.from({ length: 10 }, (_, index) => `t${index + 1}`);
  snapshot = stageMusicFile(snapshot, ids[0]!, "legacy", "01.mp3").snapshot;
  assert.equal(musicUploadActiveCount(snapshot), 0);
  assert.equal(snapshot.entries.every((entry) => entry.phase === "ready"), true);
  snapshot = stageReady(snapshot, ids.slice(1));
  assert.equal(musicUploadActiveCount(snapshot), 0);
  assert.equal(snapshot.entries.length, 10);
  const started = enqueueReadyMusicUploads(snapshot, ids);
  assert.equal(musicUploadActiveCount(started.snapshot), 3);
  assert.equal(started.launchIds.length, 3);
  assert.equal(
    started.snapshot.entries.filter((entry) => entry.phase === "queued").length,
    7,
  );
  const next = finishMusicUpload(started.snapshot, started.launchIds[0]!, 1);
  assert.equal(next.ignored, false);
  assert.equal(next.launchIds.length, 1);
  assert.equal(musicUploadActiveCount(next.snapshot), 3);
}

{
  const staged = stageReady(emptyMusicQueue(), ["a", "b", "c", "d", "e"]);
  const started = enqueueReadyMusicUploads(staged, ["a", "b", "c", "d", "e"]);
  assert.equal(musicUploadActiveCount(started.snapshot), 3);
  assert.equal(
    started.snapshot.entries.filter((entry) => entry.phase === "queued").length,
    2,
  );
  const none = enqueueReadyMusicUploads(emptyMusicQueue(), []);
  assert.deepEqual(none.launchIds, []);
}

{
  const staged = stageMusicFile(emptyMusicQueue(), "one", "master", "01.wav");
  assert.deepEqual(staged.launchIds, []);
  const started = enqueueReadyMusicUploads(staged.snapshot, ["one"]);
  assert.deepEqual(started.launchIds, ["one"]);
  assert.equal(started.snapshot.entries[0]?.phase, "uploading");
}

{
  const ready = stageMusicFile(emptyMusicQueue(), "a", "legacy", "old.mp3").snapshot;
  const replaced = stageMusicFile(ready, "a", "master", "new.wav");
  assert.equal(replaced.snapshot.entries[0]?.phase, "ready");
  assert.equal(replaced.snapshot.entries[0]?.fileName, "new.wav");
  assert.deepEqual(replaced.launchIds, []);
  const started = enqueueReadyMusicUploads(replaced.snapshot, ["a"]);
  assert.deepEqual(started.launchIds, ["a"]);
}

{
  const queued = enqueueReadyMusicUploads(
    stageReady(emptyMusicQueue(), ["a", "b", "c", "d"]),
    ["a", "b", "c", "d"],
  ).snapshot;
  assert.equal(queued.entries.find((entry) => entry.audioId === "d")?.phase, "queued");
  const replaced = stageMusicFile(queued, "d", "legacy", "replaced.mp3");
  assert.equal(replaced.snapshot.entries.find((entry) => entry.audioId === "d")?.phase, "queued");
  assert.equal(
    replaced.snapshot.entries.find((entry) => entry.audioId === "d")?.fileName,
    "replaced.mp3",
  );
}

{
  const started = enqueueReadyMusicUploads(
    stageReady(emptyMusicQueue(), ["a", "b", "c", "d"]),
    ["a", "b", "c", "d"],
  );
  const failed = finishMusicUpload(started.snapshot, "a", 1, "fail");
  assert.equal(failed.snapshot.entries.find((entry) => entry.audioId === "a")?.phase, "error");
  assert.equal(failed.launchIds.length, 1);
  assert.equal(musicUploadActiveCount(failed.snapshot), 3);
  const retried = retryMusicUpload(failed.snapshot, "a");
  assert.equal(
    retried.snapshot.entries.find((entry) => entry.audioId === "a")?.phase === "queued" ||
      retried.snapshot.entries.find((entry) => entry.audioId === "a")?.phase === "uploading",
    true,
  );
  assert.equal(retried.launchIds.length >= 0, true);
}

const formSource = readFileSync(
  new URL("../src/components/author-dashboard/AuthorProductForm.tsx", import.meta.url),
  "utf8",
);

assert.match(formSource, /Подготавливаем треки/);
assert.match(formSource, /Создано \{albumBatchProgress\.created\} из \{albumBatchProgress\.total\}/);
assert.match(formSource, /setAlbumBatchProgress\(\{ created: 0, total: plan\.accepted\.length \}\)/);
assert.match(formSource, /setAlbumBatchProgress\(null\)/);
assert.match(formSource, /animate-spin/);
assert.match(formSource, /startReadyMusicUploads\(\[audioItem\.id\]\)/);
assert.match(formSource, /Продолжить загрузку/);
assert.match(formSource, /musicQueueRef\.current/);
assert.match(formSource, /uploadAudio\(audioItem\.id, file, "legacy"\)/);
assert.doesNotMatch(
  formSource,
  /productKind === PRODUCT_KIND\.MUSIC[\s\S]{0,220}uploadAudio\(audioItem\.id, file, "legacy"\)/,
);

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf("\n  async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const albumBody = functionBody(formSource, "addAlbumTracks");
const loopStart = albumBody.indexOf("for (const file of plan.accepted)");
const loopEnd = albumBody.indexOf("} catch");
const startCall = albumBody.indexOf("startReadyMusicUploads(stagedIds)");
const progressSet = albumBody.indexOf("setAlbumBatchProgress({ created: 0");
const emptyReturn = albumBody.indexOf("plan.accepted.length === 0");
assert.ok(loopStart >= 0 && startCall > loopEnd);
assert.ok(emptyReturn >= 0 && emptyReturn < progressSet);
assert.ok(progressSet < albumBody.indexOf("ensurePracticeId"));
assert.doesNotMatch(albumBody.slice(loopStart, loopEnd), /startReadyMusicUploads/);
assert.match(albumBody, /setAlbumBatchProgress\(null\)/);

console.log("music-upload-autostart-unit: ok");
