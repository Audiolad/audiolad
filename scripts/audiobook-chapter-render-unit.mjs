import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260916120000_audiobook_chapter_render.sql", "utf8");
const immutableMigration = readFileSync("supabase/migrations/20260916121000_lock_audiobook_chapter_render_snapshot.sql", "utf8");
const worker = readFileSync("scripts/run-studio-render-worker.mts", "utf8");
const server = readFileSync("src/lib/audiobooks/server.ts", "utf8");
const render = readFileSync("src/lib/audiobooks/render.ts", "utf8");
const workspace = readFileSync("src/components/studio/audiobooks/AudiobookProjectWorkspace.tsx", "utf8");

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
assert.match(server, /createHash\("sha256"\)/);
assert.match(worker, /processAudiobookChapterRender/);
assert.match(worker, /snapshot_fingerprint_mismatch/);
assert.match(worker, /renderAudiobookChapterToMp3/);
assert.match(render, /-ar", "44100", "-ac", "2"/);
assert.match(render, /concat=n=\$\{normalized\.length\}:v=0:a=1/);
assert.match(workspace, /Скачать главу MP3/);
assert.match(workspace, /window\.setInterval\(refresh, 3000\)/);
console.log("audiobook chapter render contract: ok");
