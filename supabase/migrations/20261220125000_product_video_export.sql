BEGIN;

-- Private author product video assets: 16:9 / 9:16 covers and MP4 export queue.
-- Initial feature gate is enforced by application API for the three owner workspaces.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'product-video-assets',
  'product-video-assets',
  false,
  2147483648,
  ARRAY['image/webp', 'video/mp4']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.product_video_assets (
  practice_id uuid PRIMARY KEY REFERENCES public.practices(id) ON DELETE CASCADE,
  landscape_cover_path text NULL,
  portrait_cover_path text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_video_assets_landscape_path_check
    CHECK (
      landscape_cover_path IS NULL
      OR landscape_cover_path ~* '^practices/[0-9a-f-]{36}/video-covers/landscape_16_9/[0-9a-f-]{36}\\.webp$'
    ),
  CONSTRAINT product_video_assets_portrait_path_check
    CHECK (
      portrait_cover_path IS NULL
      OR portrait_cover_path ~* '^practices/[0-9a-f-]{36}/video-covers/portrait_9_16/[0-9a-f-]{36}\\.webp$'
    )
);

ALTER TABLE public.product_video_assets ENABLE ROW LEVEL SECURITY;
-- No browser policies. Author APIs authenticate first and use service_role.

CREATE TABLE public.product_video_render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id) ON DELETE CASCADE,
  orientation text NOT NULL,
  source_audio_path text NOT NULL,
  source_cover_path text NOT NULL,
  output_storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  lease_token uuid NULL,
  lease_expires_at timestamptz NULL,
  error_code text NULL,
  error_message_safe text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NULL,
  completed_at timestamptz NULL,
  CONSTRAINT product_video_render_jobs_orientation_check
    CHECK (orientation IN ('landscape_16_9', 'portrait_9_16')),
  CONSTRAINT product_video_render_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'superseded')),
  CONSTRAINT product_video_render_jobs_attempt_check
    CHECK (attempt_count >= 0),
  CONSTRAINT product_video_render_jobs_lease_check
    CHECK (
      (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
    ),
  CONSTRAINT product_video_render_jobs_output_path_check
    CHECK (
      output_storage_path ~* '^practices/[0-9a-f-]{36}/video/[0-9a-f-]{36}/(landscape_16_9|portrait_9_16)/[0-9a-f-]{36}\\.mp4$'
    )
);

ALTER TABLE public.product_video_render_jobs ENABLE ROW LEVEL SECURITY;
-- No browser policies. service_role only.

CREATE INDEX product_video_render_jobs_queued_created_idx
  ON public.product_video_render_jobs (created_at)
  WHERE status = 'queued';

CREATE INDEX product_video_render_jobs_audio_orientation_created_idx
  ON public.product_video_render_jobs (audio_item_id, orientation, created_at DESC);

CREATE UNIQUE INDEX product_video_render_jobs_one_active_idx
  ON public.product_video_render_jobs (audio_item_id, orientation)
  WHERE status IN ('queued', 'processing');

CREATE OR REPLACE FUNCTION public.enqueue_product_video_render_job(
  p_practice_id uuid,
  p_author_id uuid,
  p_audio_item_id uuid,
  p_orientation text,
  p_source_audio_path text,
  p_source_cover_path text
)
RETURNS public.product_video_render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.product_video_render_jobs;
  v_job_id uuid := gen_random_uuid();
  v_output_path text;
BEGIN
  IF p_orientation NOT IN ('landscape_16_9', 'portrait_9_16') THEN
    RAISE EXCEPTION 'invalid_orientation' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practices p
    WHERE p.id = p_practice_id
      AND p.author_id = p_author_id
  ) THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audio_items a
    WHERE a.id = p_audio_item_id
      AND a.practice_id = p_practice_id
      AND a.audio_path = p_source_audio_path
      AND a.audio_path IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'audio_item_not_ready' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.product_video_render_jobs
  SET status = 'superseded',
      lease_token = NULL,
      lease_expires_at = NULL,
      completed_at = COALESCE(completed_at, now()),
      error_code = 'superseded',
      error_message_safe = 'Заменено новым заданием.',
      updated_at = now()
  WHERE audio_item_id = p_audio_item_id
    AND orientation = p_orientation
    AND status IN ('queued', 'processing');

  v_output_path :=
    'practices/' || p_practice_id::text ||
    '/video/' || p_audio_item_id::text ||
    '/' || p_orientation ||
    '/' || v_job_id::text || '.mp4';

  INSERT INTO public.product_video_render_jobs (
    id,
    practice_id,
    author_id,
    audio_item_id,
    orientation,
    source_audio_path,
    source_cover_path,
    output_storage_path,
    status
  )
  VALUES (
    v_job_id,
    p_practice_id,
    p_author_id,
    p_audio_item_id,
    p_orientation,
    p_source_audio_path,
    p_source_cover_path,
    v_output_path,
    'queued'
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_product_video_render_jobs(
  p_max_attempts integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;

  WITH recovered AS (
    UPDATE public.product_video_render_jobs
    SET status = CASE WHEN attempt_count < p_max_attempts THEN 'queued' ELSE 'failed' END,
        lease_token = NULL,
        lease_expires_at = NULL,
        error_code = CASE WHEN attempt_count < p_max_attempts THEN NULL ELSE 'worker_lease_expired' END,
        error_message_safe = CASE WHEN attempt_count < p_max_attempts THEN NULL ELSE 'Не удалось создать видео.' END,
        completed_at = CASE WHEN attempt_count < p_max_attempts THEN completed_at ELSE COALESCE(completed_at, now()) END,
        updated_at = now()
    WHERE status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= clock_timestamp()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM recovered;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_product_video_render_job(
  p_lease_seconds integer DEFAULT 1800,
  p_max_attempts integer DEFAULT 3
)
RETURNS public.product_video_render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.product_video_render_jobs;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;

  PERFORM public.recover_stale_product_video_render_jobs(p_max_attempts);

  SELECT * INTO v_job
  FROM public.product_video_render_jobs
  WHERE status = 'queued'
    AND attempt_count < p_max_attempts
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_video_render_jobs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      claimed_at = COALESCE(claimed_at, now()),
      lease_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      error_code = NULL,
      error_message_safe = NULL,
      updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_product_video_render_job_lease(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 1800
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_lease_token IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.product_video_render_jobs
  SET lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at > clock_timestamp()
  RETURNING 1 INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_product_video_render_job(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_product_video_render_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_video_render_job(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_product_video_render_job_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_product_video_render_job(uuid, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_product_video_render_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_product_video_render_job(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_product_video_render_job_lease(uuid, uuid, integer) TO service_role;

COMMIT;
