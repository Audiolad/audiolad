BEGIN;

CREATE TABLE public.audiobook_chapter_render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.audiobook_projects(id) ON DELETE RESTRICT,
  chapter_id uuid NOT NULL REFERENCES public.audiobook_chapters(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE RESTRICT,
  fragment_snapshot jsonb NOT NULL,
  snapshot_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  output_storage_path text NULL,
  error_code text NULL,
  error_message_safe text NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audiobook_chapter_render_snapshot_check CHECK (jsonb_typeof(fragment_snapshot) = 'object'),
  CONSTRAINT audiobook_chapter_render_sha256_check CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT audiobook_chapter_render_status_check CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT audiobook_chapter_render_attempt_check CHECK (attempt_count >= 0 AND attempt_count <= 2),
  CONSTRAINT audiobook_chapter_render_output_check CHECK (
    (status = 'completed' AND output_storage_path IS NOT NULL AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND output_storage_path IS NULL)
  )
);
CREATE INDEX audiobook_chapter_render_queued_idx ON public.audiobook_chapter_render_jobs(created_at) WHERE status = 'queued';
CREATE INDEX audiobook_chapter_render_chapter_idx ON public.audiobook_chapter_render_jobs(chapter_id, created_at DESC);
CREATE UNIQUE INDEX audiobook_chapter_render_active_unique ON public.audiobook_chapter_render_jobs(chapter_id) WHERE status IN ('queued', 'processing');

ALTER TABLE public.audiobook_chapter_render_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audiobook_chapter_render_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.audiobook_chapter_render_jobs TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('audiobook-renders', 'audiobook-renders', false, 536870912, ARRAY['audio/mpeg']::text[])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_audiobook_chapter_render_job(p_lease_seconds integer DEFAULT 1800)
RETURNS public.audiobook_chapter_render_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job public.audiobook_chapter_render_jobs;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_job FROM public.audiobook_chapter_render_jobs
  WHERE status = 'queued' AND attempt_count < 2 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.audiobook_chapter_render_jobs SET status = 'processing', attempt_count = attempt_count + 1,
    started_at = COALESCE(started_at, now()), lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now(), error_code = NULL, error_message_safe = NULL
  WHERE id = v_job.id RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_audiobook_chapter_render_jobs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  WITH recovered AS (
    UPDATE public.audiobook_chapter_render_jobs
    SET status = CASE WHEN attempt_count < 2 THEN 'queued' ELSE 'failed' END, lease_expires_at = NULL,
      error_code = CASE WHEN attempt_count < 2 THEN NULL ELSE 'worker_lease_expired' END,
      error_message_safe = CASE WHEN attempt_count < 2 THEN NULL ELSE 'Превышено время подготовки главы.' END,
      updated_at = now()
    WHERE status = 'processing' AND lease_expires_at < now() RETURNING 1
  ) SELECT count(*) INTO v_count FROM recovered;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_audiobook_chapter_render_job(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_stale_audiobook_chapter_render_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_audiobook_chapter_render_job(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_audiobook_chapter_render_jobs() TO service_role;
COMMIT;
