BEGIN;

-- Durable, server-managed render queue for the current revisioned Studio V2
-- project model. Applying this migration alone does not start a worker.
CREATE TABLE public.studio_render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE RESTRICT,
  project_revision integer NOT NULL,
  project_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  output_storage_path text NULL,
  error_code text NULL,
  error_message_safe text NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  CONSTRAINT studio_render_jobs_revision_check CHECK (project_revision > 0),
  CONSTRAINT studio_render_jobs_snapshot_object_check CHECK (jsonb_typeof(project_snapshot) = 'object'),
  CONSTRAINT studio_render_jobs_status_check CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT studio_render_jobs_attempt_count_check CHECK (attempt_count >= 0 AND attempt_count <= 2),
  CONSTRAINT studio_render_jobs_output_state_check CHECK (
    (status = 'completed' AND output_storage_path IS NOT NULL AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND output_storage_path IS NULL)
  )
);

CREATE INDEX studio_render_jobs_queued_created_idx
  ON public.studio_render_jobs (created_at)
  WHERE status = 'queued';
CREATE INDEX studio_render_jobs_project_revision_created_idx
  ON public.studio_render_jobs (project_id, project_revision, created_at DESC);
CREATE UNIQUE INDEX studio_render_jobs_active_revision_unique
  ON public.studio_render_jobs (project_id, project_revision)
  WHERE status IN ('queued', 'processing');
CREATE UNIQUE INDEX studio_render_jobs_completed_revision_unique
  ON public.studio_render_jobs (project_id, project_revision)
  WHERE status = 'completed';

ALTER TABLE public.studio_render_jobs ENABLE ROW LEVEL SECURITY;
-- Intentionally no client policies: user APIs authorize first, then use the
-- service role. This also keeps snapshots and storage paths private.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('studio-renders', 'studio-renders', false, 536870912, ARRAY['audio/mpeg']::text[]);
-- 512 MiB is over 6 hours at 192 kbps and materially below the draft-asset
-- project quota. No direct storage.objects policies are created.

CREATE OR REPLACE FUNCTION public.claim_studio_render_job(p_lease_seconds integer DEFAULT 1800)
RETURNS public.studio_render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.studio_render_jobs;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job
  FROM public.studio_render_jobs
  WHERE status = 'queued' AND attempt_count < 2
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.studio_render_jobs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, now()),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now(),
      error_code = NULL,
      error_message_safe = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_studio_render_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  WITH recovered AS (
    UPDATE public.studio_render_jobs
    SET status = CASE WHEN attempt_count < 2 THEN 'queued' ELSE 'failed' END,
        lease_expires_at = NULL,
        error_code = CASE WHEN attempt_count < 2 THEN NULL ELSE 'worker_lease_expired' END,
        error_message_safe = CASE WHEN attempt_count < 2 THEN NULL ELSE 'Превышено время выполнения задачи рендеринга.' END,
        updated_at = now()
    WHERE status = 'processing' AND lease_expires_at < now()
    RETURNING 1
  ) SELECT count(*) INTO v_count FROM recovered;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_studio_render_job(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_stale_studio_render_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_studio_render_job(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_studio_render_jobs() TO service_role;

COMMIT;
