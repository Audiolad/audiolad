BEGIN;

-- Non-music author product M4A/AAC → MP3 normalization queue.
-- Isolated from music_transcode_jobs / Studio / Personal Materials.

CREATE TABLE public.product_audio_normalize_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id) ON DELETE CASCADE,
  source_storage_path text NOT NULL,
  source_format text NOT NULL,
  source_original_filename text NOT NULL,
  source_file_size_bytes bigint NOT NULL,
  target_storage_path text NOT NULL,
  previous_audio_path text NULL,
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
  CONSTRAINT product_audio_normalize_jobs_format_check
    CHECK (source_format IN ('m4a', 'aac')),
  CONSTRAINT product_audio_normalize_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'superseded')),
  CONSTRAINT product_audio_normalize_jobs_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT product_audio_normalize_jobs_size_check
    CHECK (source_file_size_bytes > 0 AND source_file_size_bytes <= 314572800),
  CONSTRAINT product_audio_normalize_jobs_source_path_check
    CHECK (source_storage_path ~* '^practices/[0-9a-f-]{36}/audio-sources/[0-9a-f-]{36}-[0-9a-f-]{36}\.(m4a|aac)$'),
  CONSTRAINT product_audio_normalize_jobs_target_path_check
    CHECK (target_storage_path ~* '^practices/[0-9a-f-]{36}/audio/[0-9a-f-]{36}-[0-9a-f-]{36}\.mp3$'),
  CONSTRAINT product_audio_normalize_jobs_lease_check
    CHECK (
      (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
    ),
  CONSTRAINT product_audio_normalize_jobs_ready_check
    CHECK (
      (status = 'ready' AND completed_at IS NOT NULL)
      OR status <> 'ready'
    )
);

CREATE INDEX product_audio_normalize_jobs_queued_created_idx
  ON public.product_audio_normalize_jobs (created_at)
  WHERE status = 'queued';

CREATE INDEX product_audio_normalize_jobs_audio_item_created_idx
  ON public.product_audio_normalize_jobs (audio_item_id, created_at DESC);

CREATE UNIQUE INDEX product_audio_normalize_jobs_one_active_audio_idx
  ON public.product_audio_normalize_jobs (audio_item_id)
  WHERE status IN ('queued', 'processing');

ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS desired_product_audio_normalize_job_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audio_items_desired_product_audio_normalize_job_fkey'
  ) THEN
    ALTER TABLE public.audio_items
      ADD CONSTRAINT audio_items_desired_product_audio_normalize_job_fkey
      FOREIGN KEY (desired_product_audio_normalize_job_id)
      REFERENCES public.product_audio_normalize_jobs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_desired_product_audio_normalize_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.desired_product_audio_normalize_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.product_audio_normalize_jobs AS job
    WHERE job.id = NEW.desired_product_audio_normalize_job_id
      AND job.audio_item_id = NEW.id
      AND job.status IN ('queued', 'processing', 'ready')
  ) THEN
    RAISE EXCEPTION 'invalid_desired_product_audio_normalize_job' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_desired_product_audio_normalize_job_trigger ON public.audio_items;
CREATE TRIGGER guard_desired_product_audio_normalize_job_trigger
  BEFORE INSERT OR UPDATE OF desired_product_audio_normalize_job_id ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_desired_product_audio_normalize_job();

ALTER TABLE public.product_audio_normalize_jobs ENABLE ROW LEVEL SECURITY;
-- No browser policies: service_role only via SECURITY DEFINER RPCs / server.

CREATE OR REPLACE FUNCTION public.enqueue_product_audio_normalize_job(
  p_practice_id uuid,
  p_audio_item_id uuid,
  p_source_storage_path text,
  p_source_format text,
  p_source_original_filename text,
  p_source_file_size_bytes bigint,
  p_target_storage_path text,
  p_previous_audio_path text DEFAULT NULL
)
RETURNS public.product_audio_normalize_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.product_audio_normalize_jobs;
  v_item public.audio_items;
BEGIN
  IF p_source_format NOT IN ('m4a', 'aac') THEN
    RAISE EXCEPTION 'invalid_source_format' USING ERRCODE = '22023';
  END IF;
  IF p_source_file_size_bytes IS NULL OR p_source_file_size_bytes <= 0
    OR p_source_file_size_bytes > 314572800 THEN
    RAISE EXCEPTION 'invalid_source_size' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = p_audio_item_id
    AND practice_id = p_practice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audio_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.product_audio_normalize_jobs
  SET status = 'superseded',
      lease_token = NULL,
      lease_expires_at = NULL,
      completed_at = COALESCE(completed_at, now()),
      error_code = 'superseded',
      error_message_safe = 'Заменено новой загрузкой.',
      updated_at = now()
  WHERE audio_item_id = p_audio_item_id
    AND status IN ('queued', 'processing');

  INSERT INTO public.product_audio_normalize_jobs (
    practice_id,
    audio_item_id,
    source_storage_path,
    source_format,
    source_original_filename,
    source_file_size_bytes,
    target_storage_path,
    previous_audio_path,
    status
  ) VALUES (
    p_practice_id,
    p_audio_item_id,
    p_source_storage_path,
    p_source_format,
    p_source_original_filename,
    p_source_file_size_bytes,
    p_target_storage_path,
    COALESCE(p_previous_audio_path, v_item.audio_path),
    'queued'
  )
  RETURNING * INTO v_job;

  UPDATE public.audio_items
  SET desired_product_audio_normalize_job_id = v_job.id,
      updated_at = now()
  WHERE id = p_audio_item_id;

  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_product_audio_normalize_jobs(
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
    UPDATE public.product_audio_normalize_jobs
    SET status = CASE WHEN attempt_count < p_max_attempts THEN 'queued' ELSE 'failed' END,
        lease_token = NULL,
        lease_expires_at = NULL,
        completed_at = CASE
          WHEN attempt_count < p_max_attempts THEN completed_at
          ELSE COALESCE(completed_at, now())
        END,
        error_code = CASE
          WHEN attempt_count < p_max_attempts THEN NULL
          ELSE 'worker_lease_expired'
        END,
        error_message_safe = CASE
          WHEN attempt_count < p_max_attempts THEN NULL
          ELSE 'Не удалось подготовить аудиофайл.'
        END,
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

CREATE OR REPLACE FUNCTION public.claim_product_audio_normalize_job(
  p_lease_seconds integer DEFAULT 1800,
  p_max_attempts integer DEFAULT 3
)
RETURNS public.product_audio_normalize_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.product_audio_normalize_jobs;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;

  PERFORM public.recover_stale_product_audio_normalize_jobs(p_max_attempts);

  SELECT * INTO v_job
  FROM public.product_audio_normalize_jobs
  WHERE status = 'queued' AND attempt_count < p_max_attempts
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_audio_normalize_jobs
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

CREATE OR REPLACE FUNCTION public.renew_product_audio_normalize_job_lease(
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
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;
  UPDATE public.product_audio_normalize_jobs
  SET lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp()
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;


DROP FUNCTION IF EXISTS public.complete_product_audio_normalize_job(uuid, uuid, text, integer, bigint, text, text);
DROP FUNCTION IF EXISTS public.fail_product_audio_normalize_job(uuid, uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.resolve_product_audio_normalize_job_interrupt(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.complete_product_audio_normalize_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_target_storage_path text,
  p_duration_seconds integer,
  p_file_size_bytes bigint,
  p_original_file_name text,
  p_status text DEFAULT 'draft'
)
RETURNS TABLE (
  outcome text,
  final_status text,
  cleanup_source boolean,
  cleanup_target boolean,
  cleanup_previous boolean,
  previous_audio_path text,
  source_storage_path text,
  target_storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_audio_item_id uuid;
  v_job public.product_audio_normalize_jobs;
  v_item public.audio_items;
  v_previous text;
BEGIN
  IF p_lease_token IS NULL
    OR p_target_storage_path IS NULL
    OR p_duration_seconds IS NULL
    OR p_duration_seconds <= 0
    OR p_file_size_bytes IS NULL
    OR p_file_size_bytes <= 0 THEN
    RETURN QUERY SELECT
      'invalid'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Canonical lock order: audio_item → job.
  SELECT audio_item_id INTO v_audio_item_id
  FROM public.product_audio_normalize_jobs
  WHERE id = p_job_id;
  IF v_audio_item_id IS NULL THEN
    RETURN QUERY SELECT
      'missing'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = v_audio_item_id
  FOR UPDATE;

  SELECT * INTO v_job
  FROM public.product_audio_normalize_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'missing'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Idempotent: commit succeeded earlier, client lost response.
  IF v_job.status = 'ready' THEN
    RETURN QUERY SELECT
      'already_ready'::text,
      'ready'::text,
      true,
      false,
      (v_job.previous_audio_path IS NOT NULL
        AND v_job.previous_audio_path IS DISTINCT FROM v_item.audio_path),
      v_job.previous_audio_path,
      v_job.source_storage_path,
      v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'superseded' THEN
    RETURN QUERY SELECT
      'superseded'::text, 'superseded'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'failed' THEN
    RETURN QUERY SELECT
      'failed'::text, 'failed'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'queued' THEN
    RETURN QUERY SELECT
      'expired_requeued'::text, 'queued'::text, false, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  -- status = processing
  IF v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN QUERY SELECT
      'foreign_lease'::text, 'processing'::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    -- Same token but lease expired: requeue for retry; keep source.
    UPDATE public.product_audio_normalize_jobs
    SET status = 'queued',
        lease_token = NULL,
        lease_expires_at = NULL,
        error_code = NULL,
        error_message_safe = NULL,
        updated_at = now()
    WHERE id = v_job.id;
    RETURN QUERY SELECT
      'expired_requeued'::text, 'queued'::text, false, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.target_storage_path IS DISTINCT FROM p_target_storage_path THEN
    RAISE EXCEPTION 'target_path_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_item.desired_product_audio_normalize_job_id IS DISTINCT FROM v_job.id THEN
    UPDATE public.product_audio_normalize_jobs
    SET status = 'superseded',
        lease_token = NULL,
        lease_expires_at = NULL,
        completed_at = now(),
        error_code = 'superseded',
        error_message_safe = 'Заменено новой загрузкой.',
        updated_at = now()
    WHERE id = v_job.id;
    RETURN QUERY SELECT
      'superseded'::text, 'superseded'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  v_previous := v_item.audio_path;

  UPDATE public.audio_items
  SET audio_path = p_target_storage_path,
      duration_seconds = p_duration_seconds,
      original_file_name = COALESCE(NULLIF(btrim(p_original_file_name), ''), v_item.original_file_name),
      file_size_bytes = p_file_size_bytes,
      status = CASE WHEN p_status IN ('draft', 'published') THEN p_status ELSE v_item.status END,
      desired_product_audio_normalize_job_id = NULL,
      updated_at = now()
  WHERE id = v_job.audio_item_id;

  UPDATE public.product_audio_normalize_jobs
  SET status = 'ready',
      completed_at = now(),
      lease_token = NULL,
      lease_expires_at = NULL,
      error_code = NULL,
      error_message_safe = NULL,
      updated_at = now()
  WHERE id = v_job.id;

  RETURN QUERY SELECT
    'applied'::text,
    'ready'::text,
    true,
    false,
    (v_previous IS NOT NULL AND v_previous IS DISTINCT FROM p_target_storage_path),
    v_previous,
    v_job.source_storage_path,
    v_job.target_storage_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_product_audio_normalize_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message_safe text,
  p_max_attempts integer DEFAULT 3
)
RETURNS TABLE (
  outcome text,
  final_status text,
  cleanup_source boolean,
  cleanup_target boolean,
  cleanup_previous boolean,
  previous_audio_path text,
  source_storage_path text,
  target_storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_audio_item_id uuid;
  v_job public.product_audio_normalize_jobs;
  v_item public.audio_items;
  v_permanent boolean;
BEGIN
  IF p_lease_token IS NULL THEN
    RETURN QUERY SELECT
      'invalid'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;

  SELECT audio_item_id INTO v_audio_item_id
  FROM public.product_audio_normalize_jobs
  WHERE id = p_job_id;
  IF v_audio_item_id IS NULL THEN
    RETURN QUERY SELECT
      'missing'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = v_audio_item_id
  FOR UPDATE;

  SELECT * INTO v_job
  FROM public.product_audio_normalize_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'missing'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Complete already committed; do not roll back to failed.
  IF v_job.status = 'ready' THEN
    RETURN QUERY SELECT
      'already_ready'::text,
      'ready'::text,
      true,
      false,
      (v_job.previous_audio_path IS NOT NULL
        AND v_job.previous_audio_path IS DISTINCT FROM v_item.audio_path),
      v_job.previous_audio_path,
      v_job.source_storage_path,
      v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'superseded' THEN
    RETURN QUERY SELECT
      'superseded'::text, 'superseded'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'failed' THEN
    RETURN QUERY SELECT
      'failed'::text, 'failed'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'queued' THEN
    RETURN QUERY SELECT
      'expired_requeued'::text, 'queued'::text, false, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  -- processing
  IF v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN QUERY SELECT
      'foreign_lease'::text, 'processing'::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_item.desired_product_audio_normalize_job_id IS DISTINCT FROM v_job.id THEN
    UPDATE public.product_audio_normalize_jobs
    SET status = 'superseded',
        lease_token = NULL,
        lease_expires_at = NULL,
        completed_at = now(),
        error_code = 'superseded',
        error_message_safe = 'Заменено новой загрузкой.',
        updated_at = now()
    WHERE id = v_job.id;
    RETURN QUERY SELECT
      'superseded'::text, 'superseded'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  -- Expired lease with matching token: treat as requeue/terminal without guessing.
  IF v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    IF v_job.attempt_count < p_max_attempts THEN
      UPDATE public.product_audio_normalize_jobs
      SET status = 'queued',
          lease_token = NULL,
          lease_expires_at = NULL,
          error_code = NULL,
          error_message_safe = NULL,
          updated_at = now()
      WHERE id = v_job.id;
      RETURN QUERY SELECT
        'expired_requeued'::text, 'queued'::text, false, true, false,
        NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    ELSE
      UPDATE public.product_audio_normalize_jobs
      SET status = 'failed',
          lease_token = NULL,
          lease_expires_at = NULL,
          completed_at = COALESCE(completed_at, now()),
          error_code = 'worker_lease_expired',
          error_message_safe = 'Не удалось подготовить аудиофайл.',
          updated_at = now()
      WHERE id = v_job.id;
      UPDATE public.audio_items
      SET desired_product_audio_normalize_job_id = NULL,
          updated_at = now()
      WHERE id = v_job.audio_item_id
        AND desired_product_audio_normalize_job_id = v_job.id;
      RETURN QUERY SELECT
        'failed'::text, 'failed'::text, true, true, false,
        NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    END IF;
    RETURN;
  END IF;

  v_permanent := v_job.attempt_count >= p_max_attempts;
  UPDATE public.product_audio_normalize_jobs
  SET status = CASE WHEN v_permanent THEN 'failed' ELSE 'queued' END,
      lease_token = NULL,
      lease_expires_at = NULL,
      completed_at = CASE WHEN v_permanent THEN now() ELSE completed_at END,
      error_code = COALESCE(NULLIF(btrim(p_error_code), ''), 'normalize_failed'),
      error_message_safe = CASE
        WHEN v_permanent THEN COALESCE(
          NULLIF(btrim(p_error_message_safe), ''),
          'Не удалось подготовить аудиофайл.'
        )
        ELSE 'Не удалось подготовить аудиофайл. Попробуем обработать повторно.'
      END,
      updated_at = now()
  WHERE id = v_job.id;

  IF v_permanent THEN
    UPDATE public.audio_items
    SET desired_product_audio_normalize_job_id = NULL,
        updated_at = now()
    WHERE id = v_job.audio_item_id
      AND desired_product_audio_normalize_job_id = v_job.id;
    RETURN QUERY SELECT
      'failed'::text, 'failed'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
  ELSE
    RETURN QUERY SELECT
      'queued'::text, 'queued'::text, false, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_product_audio_normalize_job(
  p_job_id uuid,
  p_lease_token uuid
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
  UPDATE public.product_audio_normalize_jobs
  SET status = 'queued',
      lease_token = NULL,
      lease_expires_at = NULL,
      attempt_count = GREATEST(0, attempt_count - 1),
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp()
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_product_audio_normalize_job_interrupt(
  p_job_id uuid,
  p_lease_token uuid,
  p_max_attempts integer DEFAULT 3
)
RETURNS TABLE (
  outcome text,
  final_status text,
  cleanup_source boolean,
  cleanup_target boolean,
  cleanup_previous boolean,
  previous_audio_path text,
  source_storage_path text,
  target_storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_audio_item_id uuid;
  v_job public.product_audio_normalize_jobs;
  v_item public.audio_items;
BEGIN
  IF p_lease_token IS NULL THEN
    RETURN QUERY SELECT
      'invalid'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;

  SELECT audio_item_id INTO v_audio_item_id
  FROM public.product_audio_normalize_jobs
  WHERE id = p_job_id;
  IF v_audio_item_id IS NULL THEN
    RETURN QUERY SELECT
      'missing'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = v_audio_item_id
  FOR UPDATE;

  SELECT * INTO v_job
  FROM public.product_audio_normalize_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'missing'::text, NULL::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_job.status = 'superseded'
    OR v_item.desired_product_audio_normalize_job_id IS DISTINCT FROM v_job.id THEN
    IF v_job.status <> 'superseded' THEN
      UPDATE public.product_audio_normalize_jobs
      SET status = 'superseded',
          lease_token = NULL,
          lease_expires_at = NULL,
          completed_at = COALESCE(completed_at, now()),
          error_code = COALESCE(error_code, 'superseded'),
          error_message_safe = COALESCE(error_message_safe, 'Заменено новой загрузкой.'),
          updated_at = now()
      WHERE id = v_job.id
        AND status IN ('queued', 'processing');
    END IF;
    RETURN QUERY SELECT
      'superseded'::text, 'superseded'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'ready' THEN
    RETURN QUERY SELECT
      'already_ready'::text,
      'ready'::text,
      true,
      false,
      (v_job.previous_audio_path IS NOT NULL
        AND v_job.previous_audio_path IS DISTINCT FROM v_item.audio_path),
      v_job.previous_audio_path,
      v_job.source_storage_path,
      v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'failed' THEN
    RETURN QUERY SELECT
      'failed'::text, 'failed'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.status = 'queued' THEN
    RETURN QUERY SELECT
      'expired_requeued'::text, 'queued'::text, false, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN QUERY SELECT
      'foreign_lease'::text, 'processing'::text, false, false, false,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_job.lease_expires_at IS NOT NULL
    AND v_job.lease_expires_at > clock_timestamp() THEN
    UPDATE public.product_audio_normalize_jobs
    SET status = 'queued',
        lease_token = NULL,
        lease_expires_at = NULL,
        attempt_count = GREATEST(0, attempt_count - 1),
        updated_at = now()
    WHERE id = v_job.id;
    RETURN QUERY SELECT
      'released'::text, 'queued'::text, false, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
    RETURN;
  END IF;

  IF v_job.attempt_count < p_max_attempts THEN
    UPDATE public.product_audio_normalize_jobs
    SET status = 'queued',
        lease_token = NULL,
        lease_expires_at = NULL,
        error_code = NULL,
        error_message_safe = NULL,
        updated_at = now()
    WHERE id = v_job.id;
    RETURN QUERY SELECT
      'expired_requeued'::text, 'queued'::text, false, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
  ELSE
    UPDATE public.product_audio_normalize_jobs
    SET status = 'failed',
        lease_token = NULL,
        lease_expires_at = NULL,
        completed_at = COALESCE(completed_at, now()),
        error_code = 'worker_lease_expired',
        error_message_safe = 'Не удалось подготовить аудиофайл.',
        updated_at = now()
    WHERE id = v_job.id;
    UPDATE public.audio_items
    SET desired_product_audio_normalize_job_id = NULL,
        updated_at = now()
    WHERE id = v_job.audio_item_id
      AND desired_product_audio_normalize_job_id = v_job.id;
    RETURN QUERY SELECT
      'failed'::text, 'failed'::text, true, true, false,
      NULL::text, v_job.source_storage_path, v_job.target_storage_path;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_product_audio_normalize_pointer_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.desired_product_audio_normalize_job_id IS DISTINCT FROM OLD.desired_product_audio_normalize_job_id
    AND (
      current_setting('role', true) IN ('anon', 'authenticated')
      OR current_user IN ('anon', 'authenticated')
    ) THEN
    RAISE EXCEPTION 'product_audio_normalize_pointer_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_product_audio_normalize_pointer_roles_trigger ON public.audio_items;
CREATE TRIGGER guard_product_audio_normalize_pointer_roles_trigger
  BEFORE UPDATE OF desired_product_audio_normalize_job_id
  ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_audio_normalize_pointer_roles();

REVOKE ALL ON FUNCTION public.enqueue_product_audio_normalize_job(uuid, uuid, text, text, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_product_audio_normalize_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_audio_normalize_job(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_product_audio_normalize_job_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_product_audio_normalize_job(uuid, uuid, text, integer, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_audio_normalize_job(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_product_audio_normalize_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_product_audio_normalize_job_interrupt(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_product_audio_normalize_job(uuid, uuid, text, text, text, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_product_audio_normalize_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_product_audio_normalize_job(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_product_audio_normalize_job_lease(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_product_audio_normalize_job(uuid, uuid, text, integer, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_product_audio_normalize_job(uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_product_audio_normalize_job(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_product_audio_normalize_job_interrupt(uuid, uuid, integer) TO service_role;

COMMIT;
