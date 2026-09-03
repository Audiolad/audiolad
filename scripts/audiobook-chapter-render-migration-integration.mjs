import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const databaseUrl = process.env.AUDIOLAD_TEST_DATABASE_URL;
assert(databaseUrl, "AUDIOLAD_TEST_DATABASE_URL is required for the isolated migration test");

function psql(sql) {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-tA"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function migration(name) {
  return readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
}

const authorId = randomUUID();
const projectId = randomUUID();
const chapterId = randomUUID();
const fragmentId = randomUUID();
const snapshot = {
  version: 1,
  fragments: [{
    id: fragmentId,
    storagePath: `audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}.wav`,
    position: 1,
    mimeType: "audio/wav",
    sizeBytes: 4,
  }],
};
const snapshotJson = JSON.stringify(snapshot).replaceAll("'", "''");
const snapshotSha = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

psql(`
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  DO $$ BEGIN
    CREATE ROLE anon;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  DO $$ BEGIN
    CREATE ROLE authenticated;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  DO $$ BEGIN
    CREATE ROLE service_role;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE SCHEMA IF NOT EXISTS storage;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL,
    file_size_limit bigint NULL, allowed_mime_types text[] NULL
  );
  CREATE TABLE public.authors (id uuid PRIMARY KEY);
`);
for (const name of [
  "20260911130000_audiobook_projects_and_chapters.sql",
  "20260911140000_audiobook_chapter_fragments.sql",
  "20260914130000_audiobook_fragment_ascii_storage_keys.sql",
  "20260916120000_audiobook_chapter_render.sql",
  "20260916121000_lock_audiobook_chapter_render_snapshot.sql",
  "20260916122000_audiobook_chapter_render_cleanup_and_bytes.sql",
]) psql(migration(name));

psql(`
  INSERT INTO public.authors (id) VALUES ('${authorId}');
  INSERT INTO public.audiobook_projects (id, author_id, title) VALUES ('${projectId}', '${authorId}', 'Migration test');
  INSERT INTO public.audiobook_chapters (id, project_id, position, title) VALUES ('${chapterId}', '${projectId}', 1, 'Chapter');
  INSERT INTO public.audiobook_fragments (
    id, chapter_id, position, storage_path, original_name, mime_type, size_bytes, source_type, status
  ) VALUES (
    '${fragmentId}', '${chapterId}', 1, 'audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}.wav',
    'fragment.wav', 'audio/wav', 4, 'upload', 'active'
  );
`);

function addCompletedJob() {
  const jobId = randomUUID();
  psql(`
    INSERT INTO public.audiobook_chapter_render_jobs (
      id, project_id, chapter_id, author_id, fragment_snapshot, snapshot_sha256,
      status, output_storage_path, output_size_bytes, completed_at
    ) VALUES (
      '${jobId}', '${projectId}', '${chapterId}', '${authorId}', '${snapshotJson}'::jsonb, '${snapshotSha}',
      'completed', 'audiobooks/${authorId}/${projectId}/${chapterId}/renders/${jobId}.mp3', 1, now()
    );
  `);
  return jobId;
}

const immutableJobId = addCompletedJob();
assert.throws(() => psql(`
  UPDATE public.audiobook_chapter_render_jobs
  SET snapshot_sha256 = repeat('0', 64)
  WHERE id = '${immutableJobId}';
`), /audiobook_chapter_render_snapshot_immutable/);

psql(`DELETE FROM public.audiobook_chapter_render_jobs WHERE id = '${immutableJobId}';`);
addCompletedJob();
psql(`DELETE FROM public.audiobook_fragments WHERE id = '${fragmentId}';`);
assert.equal(psql("SELECT count(*) FROM public.audiobook_chapter_render_jobs;"), "0", "fragment deletion clears render jobs");

const chapterJobId = randomUUID();
psql(`
  INSERT INTO public.audiobook_chapter_render_jobs (
    id, project_id, chapter_id, author_id, fragment_snapshot, snapshot_sha256, status
  ) VALUES ('${chapterJobId}', '${projectId}', '${chapterId}', '${authorId}', '${snapshotJson}'::jsonb, '${snapshotSha}', 'queued');
  DELETE FROM public.audiobook_chapters WHERE id = '${chapterId}';
`);
assert.equal(psql("SELECT count(*) FROM public.audiobook_chapter_render_jobs;"), "0", "chapter deletion cascades render jobs");

const projectDeleteId = randomUUID();
const chapterDeleteId = randomUUID();
const projectJobId = randomUUID();
psql(`
  INSERT INTO public.audiobook_projects (id, author_id, title) VALUES ('${projectDeleteId}', '${authorId}', 'Project cleanup');
  INSERT INTO public.audiobook_chapters (id, project_id, position, title) VALUES ('${chapterDeleteId}', '${projectDeleteId}', 1, 'Chapter');
  INSERT INTO public.audiobook_chapter_render_jobs (
    id, project_id, chapter_id, author_id, fragment_snapshot, snapshot_sha256, status
  ) VALUES ('${projectJobId}', '${projectDeleteId}', '${chapterDeleteId}', '${authorId}', '${snapshotJson}'::jsonb, '${snapshotSha}', 'queued');
  DELETE FROM public.audiobook_projects WHERE id = '${projectDeleteId}';
`);
assert.equal(psql("SELECT count(*) FROM public.audiobook_chapter_render_jobs;"), "0", "project deletion cascades render jobs");

console.log("audiobook chapter render migration integration: ok");
