import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  mergeAudioReorderPreservingLocalMedia,
  applyMusicAudioItemDeletion,
  patchAudioItemAfterMusicMasterFinalize,
  patchAudioItemFromUpload,
} from "../src/lib/author-products/form-merge";
import {
  MAX_CONCURRENT_MUSIC_UPLOADS,
  dropMusicUpload,
  emptyMusicQueue,
  enqueueReadyMusicUploads,
  finishMusicUpload,
  musicUploadActiveCount,
  retryMusicUpload,
  stageMusicFile,
  type MusicQueueSnapshot,
  type MusicUploadKind,
} from "../src/lib/author-products/music-track-upload-queue";
import type { AudioItemRow } from "../src/lib/author-products/types";

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

function stageAll(
  ids: Array<{ id: string; kind: MusicUploadKind }>,
): MusicQueueSnapshot {
  return ids.reduce(
    (snapshot, entry) =>
      stageMusicFile(snapshot, entry.id, entry.kind, `${entry.id}.bin`).snapshot,
    emptyMusicQueue(),
  );
}

const formSource = readFileSync(
  new URL("../src/components/author-dashboard/AuthorProductForm.tsx", import.meta.url),
  "utf8",
);

assert.equal(MAX_CONCURRENT_MUSIC_UPLOADS, 3);

{
  const ready = stageAll([{ id: "a", kind: "legacy" }]);
  const started = enqueueReadyMusicUploads(ready, ["a"]);
  assert.deepEqual(started.launchIds, ["a"]);
  assert.equal(musicUploadActiveCount(started.snapshot), 1);
}

{
  const ready = stageAll([
    { id: "a", kind: "master" },
    { id: "b", kind: "legacy" },
    { id: "c", kind: "master" },
  ]);
  const started = enqueueReadyMusicUploads(ready, ["a", "b", "c"]);
  assert.equal(started.launchIds.length, 3);
  assert.equal(musicUploadActiveCount(started.snapshot), 3);
  assert.deepEqual(
    started.snapshot.entries.map((entry) => entry.kind),
    ["master", "legacy", "master"],
  );
}

{
  const ids = Array.from({ length: 10 }, (_, index) => ({
    id: `t${index}`,
    kind: (index % 2 === 0 ? "master" : "legacy") as MusicUploadKind,
  }));
  let snapshot = stageAll(ids);
  let step = enqueueReadyMusicUploads(
    snapshot,
    ids.map((entry) => entry.id),
  );
  snapshot = step.snapshot;
  const seen = new Set(step.launchIds);
  assert.equal(musicUploadActiveCount(snapshot), 3);
  while (snapshot.entries.some((entry) => entry.phase === "queued" || entry.phase === "uploading")) {
    const active = snapshot.entries.find((entry) => entry.phase === "uploading");
    assert.ok(active);
    step = finishMusicUpload(snapshot, active.audioId, active.generation);
    snapshot = step.snapshot;
    assert.ok(musicUploadActiveCount(snapshot) <= 3);
    for (const id of step.launchIds) {
      assert.equal(seen.has(id), false);
      seen.add(id);
    }
  }
  assert.equal(seen.size, 10);
}

{
  let snapshot = stageAll([
    { id: "a", kind: "legacy" },
    { id: "b", kind: "master" },
  ]);
  snapshot = enqueueReadyMusicUploads(snapshot, ["a", "b"]).snapshot;
  const failed = snapshot.entries.find((entry) => entry.audioId === "a")!;
  const step = finishMusicUpload(snapshot, "a", failed.generation, "boom");
  assert.equal(step.snapshot.entries.find((entry) => entry.audioId === "a")?.phase, "error");
  assert.equal(step.snapshot.entries.find((entry) => entry.audioId === "b")?.phase, "uploading");
  const retried = retryMusicUpload(step.snapshot, "a");
  assert.equal(retried.launchIds.includes("b"), false);
  assert.deepEqual(retried.launchIds, ["a"]);
}

{
  const ready = stageAll([
    { id: "a", kind: "legacy" },
    { id: "b", kind: "legacy" },
  ]);
  const first = enqueueReadyMusicUploads(ready, ["a", "b"]);
  const second = enqueueReadyMusicUploads(first.snapshot, ["a", "b"]);
  assert.deepEqual(second.launchIds, []);
  assert.equal(musicUploadActiveCount(second.snapshot), 2);
}

{
  let snapshot = stageAll([
    { id: "a", kind: "legacy" },
    { id: "b", kind: "legacy" },
    { id: "c", kind: "legacy" },
    { id: "d", kind: "master" },
  ]);
  snapshot = enqueueReadyMusicUploads(snapshot, ["a", "b", "c", "d"]).snapshot;
  const replaced = stageMusicFile(snapshot, "d", "legacy", "d-new.mp3");
  assert.equal(replaced.snapshot.entries.find((entry) => entry.audioId === "d")?.phase, "queued");
  assert.equal(replaced.snapshot.entries.find((entry) => entry.audioId === "d")?.kind, "legacy");
  assert.equal(replaced.snapshot.entries.find((entry) => entry.audioId === "d")?.fileName, "d-new.mp3");
}

{
  const snapshot = enqueueReadyMusicUploads(
    stageAll([{ id: "a", kind: "legacy" }, { id: "b", kind: "legacy" }]),
    ["a", "b"],
  ).snapshot;
  const dropped = dropMusicUpload(snapshot, "a");
  assert.equal(dropped.wasUploading, true);
  assert.equal(dropped.snapshot.entries.some((entry) => entry.audioId === "a"), false);
  const generation = dropped.generation ?? 0;
  const late = finishMusicUpload(dropped.snapshot, "a", generation);
  assert.equal(late.ignored, true);
  assert.equal(late.snapshot.entries.some((entry) => entry.audioId === "a"), false);
}

{
  const local = [
    item({ id: "a", title: "Локальное A", position: 2, audio_path: null }),
    item({
      id: "b",
      title: "Локальное B",
      position: 1,
      audio_path: "practices/p/audio/b.mp3",
      duration_seconds: 9,
    }),
  ];
  const serverA = item({
    id: "a",
    title: "Сервер A",
    position: 1,
    audio_path: "practices/p/audio/a.mp3",
    duration_seconds: 4,
    original_file_name: "a.mp3",
    file_size_bytes: 10,
    status: "draft",
    updated_at: "now",
  });
  const patched = patchAudioItemFromUpload(local, "a", serverA);
  assert.equal(patched[0]?.audio_path, "practices/p/audio/a.mp3");
  assert.equal(patched[0]?.title, "Локальное A");
  assert.equal(patched[0]?.position, 2);
  assert.equal(patched[1]?.audio_path, "practices/p/audio/b.mp3");
  assert.equal(patched[1]?.title, "Локальное B");
  assert.equal(patched[1]?.position, 1);
}

{
  const local = [
    item({ id: "a", title: "A", music_master: null }),
    item({
      id: "b",
      title: "B",
      audio_path: "practices/p/audio/b.mp3",
      position: 2,
    }),
  ];
  const patched = patchAudioItemAfterMusicMasterFinalize(local, "a", {
    assetId: "asset-a",
    lifecycleState: "verified",
    transcodeStatus: "processing",
  });
  assert.equal(patched[0]?.music_master?.assetId, "asset-a");
  assert.equal(patched[0]?.music_master?.lifecycleState, "verified");
  assert.equal(patched[0]?.music_master?.transcodeStatus, "processing");
  assert.equal(patched[0]?.title, "A");
  assert.equal(patched[1]?.audio_path, "practices/p/audio/b.mp3");
  assert.equal(patched[1]?.music_master, undefined);
}

{
  const local = [
    item({ id: "a", title: "Новый A", position: 2, audio_path: "a.mp3" }),
    item({ id: "b", title: "Новый B", position: 1, audio_path: "b.mp3" }),
  ];
  const server = [
    item({ id: "b", title: "Старый B", position: 1, audio_path: null }),
    item({ id: "a", title: "Старый A", position: 2, audio_path: null }),
  ];
  const merged = mergeAudioReorderPreservingLocalMedia(local, server);
  assert.equal(merged.find((entry) => entry.id === "a")?.audio_path, "a.mp3");
  assert.equal(merged.find((entry) => entry.id === "a")?.title, "Новый A");
  assert.equal(merged.find((entry) => entry.id === "a")?.position, 2);
  assert.equal(merged.find((entry) => entry.id === "b")?.audio_path, "b.mp3");
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf("\n  async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

{
  const deleteItem = functionBody(formSource, "deleteAudioItem");
  const lengthGuard = deleteItem.indexOf("audioItems.length <= 1");
  const confirm = deleteItem.indexOf("window.confirm");
  const forget = deleteItem.indexOf("forgetMusicTrack");
  assert.ok(lengthGuard >= 0 && lengthGuard < forget);
  assert.ok(confirm >= 0 && confirm < forget);
  const deleteFile = functionBody(formSource, "deleteAudioFile");
  assert.ok(deleteFile.indexOf("window.confirm") < deleteFile.indexOf("forgetMusicTrack"));
  assert.match(deleteFile, /productKind === PRODUCT_KIND\.MUSIC\) \{\s*forgetMusicTrack/);
}

{
  const ready = stageMusicFile(emptyMusicQueue(), "a", "legacy", "a.mp3").snapshot;
  assert.equal(dropMusicUpload(ready, "a").snapshot.entries.length, 0);
  const queued = enqueueReadyMusicUploads(
    stageAll([
      { id: "a", kind: "legacy" },
      { id: "b", kind: "legacy" },
      { id: "c", kind: "legacy" },
      { id: "d", kind: "legacy" },
    ]),
    ["a", "b", "c", "d"],
  ).snapshot;
  assert.equal(queued.entries.find((entry) => entry.audioId === "d")?.phase, "queued");
  const droppedQueued = dropMusicUpload(queued, "d");
  assert.equal(droppedQueued.wasUploading, false);
  assert.equal(droppedQueued.snapshot.entries.some((entry) => entry.audioId === "d"), false);
  const errored = finishMusicUpload(
    enqueueReadyMusicUploads(stageAll([{ id: "a", kind: "legacy" }]), ["a"]).snapshot,
    "a",
    1,
    "fail",
  ).snapshot;
  assert.equal(errored.entries[0]?.phase, "error");
  assert.equal(dropMusicUpload(errored, "a").snapshot.entries.length, 0);
  const uploading = enqueueReadyMusicUploads(stageAll([{ id: "a", kind: "legacy" }]), ["a"]).snapshot;
  const droppedUploading = dropMusicUpload(uploading, "a");
  assert.equal(droppedUploading.wasUploading, true);
  assert.equal(
    finishMusicUpload(droppedUploading.snapshot, "a", droppedUploading.generation ?? 0).ignored,
    true,
  );
}

{
  const local = [
    item({ id: "a", title: "A", position: 1, audio_path: "old-a.mp3" }),
    item({
      id: "b",
      title: "Новый B",
      position: 2,
      audio_path: "new-b.mp3",
      duration_seconds: 12,
    }),
  ];
  const staleServer = [
    item({ id: "b", title: "Старый B", position: 1, audio_path: null, duration_seconds: null }),
  ];
  const next = applyMusicAudioItemDeletion(local, "a", staleServer);
  assert.equal(next.some((entry) => entry.id === "a"), false);
  assert.equal(next[0]?.id, "b");
  assert.equal(next[0]?.audio_path, "new-b.mp3");
  assert.equal(next[0]?.title, "Новый B");
  assert.equal(next[0]?.position, 1);
  assert.equal(next[0]?.duration_seconds, 12);
}

{
  const reorderSource = readFileSync(
    new URL("../src/components/author-dashboard/useAudioItemsReorder.ts", import.meta.url),
    "utf8",
  );
  assert.match(reorderSource, /preserveLocalMedia = false/);
  assert.match(reorderSource, /preserveLocalMedia\s*\?/);
  assert.match(reorderSource, /mergeServerAudioItems\(current, payload\.product!\.audio_items\)/);
  assert.match(formSource, /preserveLocalMedia: form\.productKind === PRODUCT_KIND\.MUSIC/);
}

assert.match(formSource, /Загрузить все треки/);
assert.match(formSource, /stageMusicTrackFile\(audioItem\.id, file\)/);
assert.match(formSource, /uploadAudio\(audioItem\.id, file, "legacy"\)/);
assert.match(formSource, /audio\/wav,audio\/x-wav,audio\/wave,\.wav,audio\/mpeg,\.mp3/);
assert.match(formSource, /uploadMusicMasterDirect\(/);
assert.match(formSource, /uploadAuthorProductAudioDirect\(/);
assert.doesNotMatch(
  formSource,
  /productKind === PRODUCT_KIND\.MUSIC[\s\S]{0,180}uploadAudio\(audioItem\.id, file, mode\)/,
);

console.log("music-track-upload-queue-unit: ok");
