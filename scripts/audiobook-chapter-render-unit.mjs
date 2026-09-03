import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260916120000_audiobook_chapter_render.sql", "utf8");
const immutableMigration = readFileSync("supabase/migrations/20260916121000_lock_audiobook_chapter_render_snapshot.sql", "utf8");
const worker = readFileSync("scripts/run-studio-render-worker.mts", "utf8");
const server = readFileSync("src/lib/audiobooks/server.ts", "utf8");
const render = readFileSync("src/lib/audiobooks/render.ts", "utf8");
const snapshot = readFileSync("src/lib/audiobooks/render-snapshot.ts", "utf8");
const storage = readFileSync("src/lib/audiobooks/storage.ts", "utf8");
const workspace = readFileSync("src/components/studio/audiobooks/AudiobookProjectWorkspace.tsx", "utf8");
const cleanupMigration = readFileSync("supabase/migrations/20260916122000_audiobook_chapter_render_cleanup_and_bytes.sql", "utf8");
const migrationFixture = readFileSync("supabase/test-baselines/studio-pre-shared-assets.sql", "utf8");
const audiobookWorker = worker.slice(
  worker.indexOf("async function processAudiobookChapterRender"),
  worker.indexOf("async function processAudiobookRenderQueuePass"),
);

for (const pattern of [
  /CREATE TABLE public\.audiobook_chapter_render_jobs/,
  /fragment_snapshot jsonb NOT NULL/,
  /snapshot_sha256 text NOT NULL/,
  /snapshot_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/,
  /audiobook-renders', 'audiobook-renders', false/,
  /ENABLE ROW LEVEL SECURITY/,
  /claim_audiobook_chapter_render_job/,
  /FOR UPDATE SKIP LOCKED/,
  /recover_stale_audiobook_chapter_render_jobs/,
]) assert.match(migration, pattern);
assert.match(immutableMigration, /audiobook_chapter_render_snapshot_immutable/);
assert.match(immutableMigration, /NEW\.snapshot_sha256 IS DISTINCT FROM OLD\.snapshot_sha256/);
assert.match(snapshot, /createAudiobookRenderSnapshot/);
assert.match(snapshot, /audiobookRenderSnapshotSha256/);
assert.match(snapshot, /isAudiobookActiveFragmentStoragePath/);
assert.doesNotMatch(snapshot, /JSON\.stringify\(canonical\) === JSON\.stringify\(snapshot\)/);
assert.match(server, /audiobookRenderSnapshotSha256/);
assert.match(server, /RENDER_ENQUEUE_ATTEMPTS = 3/);
assert.match(server, /render_enqueue_race/);
assert.match(server, /createSignedUrl\(job\.output_storage_path, 300/);
assert.match(storage, /isAudiobookChapterRenderStoragePath/);
assert.match(worker, /processAudiobookChapterRender/);
assert.match(worker, /processAudiobookRenderQueuePass/);
assert.match(worker, /processStudioRenderQueuePass/);
assert.match(worker, /Promise\.allSettled/);
assert.match(worker, /snapshot_fingerprint_mismatch/);
assert.match(worker, /renderAudiobookChapterToMp3/);
assert.match(worker, /streamStorageObjectToFile/);
assert.match(worker, /streamAudiobookFragmentToFile/);
assert.match(worker, /\.createSignedUrl\(storagePath, 1800\)/);
assert.match(worker, /await fetch\(signed\.signedUrl, \{ cache: "no-store" \}\)/);
assert.match(worker, /\.remove\(\[outputPath\]\)/);
assert.match(worker, /\.eq\("attempt_count", job\.attempt_count\)/);
assert.doesNotMatch(audiobookWorker, /\.download\(/);
assert.doesNotMatch(worker, /\.arrayBuffer\(\)|readFile\(/);
assert.match(render, /-ar", "44100", "-ac", "2"/);
assert.match(render, /"pcm_f32le"/);
assert.doesNotMatch(render, /fragment-\$\{index\}\.mp3/);
assert.match(render, /concat=n=\$\{normalized\.length\}:v=0:a=1/);
assert.match(workspace, /Скачать главу MP3/);
assert.match(workspace, /isCurrent/);
assert.match(workspace, /status === "completed" && !renderState\.isCurrent/);
assert.match(workspace, /window\.setTimeout\(refresh, 3000\)/);
assert.match(cleanupMigration, /output_size_bytes bigint/);
assert.match(cleanupMigration, /ON DELETE CASCADE/);
assert.match(cleanupMigration, /audiobook_fragments_delete_render_jobs/);
assert.match(cleanupMigration, /DELETE FROM public\.audiobook_chapter_render_jobs/);
assert.match(server, /listChapterRenderPaths\(chapterId, authorId, projectId\)/);
assert.match(server, /await removeRenderStorage\(renderPaths, \{ projectId, chapterId, fragmentId, authorId \}\)/);
assert.match(server, /isAudiobookChapterRenderStoragePath\(job\.output_storage_path, authorId, projectId, chapterId, job\.id\)/);
assert.match(migrationFixture, /CREATE TABLE public\.audiobook_projects/);
assert.match(migrationFixture, /CREATE TABLE public\.audiobook_chapters/);
assert.match(migrationFixture, /CREATE TABLE public\.audiobook_fragments/);
assert.match(workspace, /Подготовить MP3/);
assert.match(workspace, /MP3 готов\./);
assert.match(workspace, /Фрагменты изменены\. Подготовьте MP3 заново\./);
console.log("audiobook chapter render contract: ok");
