import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/migrations/20260812180000_studio_render_export_v2.sql", import.meta.url),
  "utf8",
);

for (const pattern of [
  /CREATE TABLE public\.studio_render_jobs/,
  /author_id uuid NOT NULL REFERENCES public\.authors\(id\) ON DELETE RESTRICT/,
  /project_revision integer NOT NULL/,
  /project_snapshot jsonb NOT NULL/,
  /status IN \('queued', 'processing', 'completed', 'failed'\)/,
  /attempt_count >= 0 AND attempt_count <= 2/,
  /studio_render_jobs_queued_created_idx/,
  /studio_render_jobs_project_revision_created_idx/,
  /studio_render_jobs_active_revision_unique/,
  /WHERE status IN \('queued', 'processing'\)/,
  /studio_render_jobs_completed_revision_unique/,
  /WHERE status = 'completed'/,
  /'studio-renders', 'studio-renders', false, 536870912, ARRAY\['audio\/mpeg'\]/,
  /ALTER TABLE public\.studio_render_jobs ENABLE ROW LEVEL SECURITY/,
  /Intentionally no client policies/,
  /CREATE OR REPLACE FUNCTION public\.claim_studio_render_job/,
  /FOR UPDATE SKIP LOCKED/,
  /attempt_count = attempt_count \+ 1/,
  /CREATE OR REPLACE FUNCTION public\.recover_stale_studio_render_jobs/,
  /attempt_count < 2 THEN 'queued' ELSE 'failed'/,
  /worker_lease_expired/,
  /GRANT EXECUTE ON FUNCTION public\.claim_studio_render_job\(integer\) TO service_role/,
]) {
  assert.match(sql, pattern);
}

assert.doesNotMatch(sql, /20260808163000_studio_render_export_v1/);
console.log("studio render jobs schema contract: ok");
