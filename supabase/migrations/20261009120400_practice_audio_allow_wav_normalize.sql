BEGIN;

-- Slice 2: ordinary non-music author products may store WAV sources in
-- practice-audio and enqueue them into product_audio_normalize_jobs.
-- Append-only MIME. Do not change public or file_size_limit.
-- Isolated from music_transcode_jobs / Studio / Personal Materials.
--
-- Also: live-routing race hardening for Draft PR #497
-- - activate_product_direct_mp3_delivery: atomic MP3 supersede of pending normalize
-- - enqueue returns jsonb with safe cleanup paths for superseded *queued* jobs

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/wav')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/wav' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/x-wav')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/x-wav' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/wave')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/wave' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/vnd.wave')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/vnd.wave' = ANY(allowed_mime_types));

ALTER TABLE public.product_audio_normalize_jobs
  DROP CONSTRAINT IF EXISTS product_audio_normalize_jobs_format_check;
ALTER TABLE public.product_audio_normalize_jobs
  ADD CONSTRAINT product_audio_normalize_jobs_format_check
  CHECK (source_format IN ('m4a', 'aac', 'wav'));

ALTER TABLE public.product_audio_normalize_jobs
  DROP CONSTRAINT IF EXISTS product_audio_normalize_jobs_source_path_check;
ALTER TABLE public.product_audio_normalize_jobs
  ADD CONSTRAINT product_audio_normalize_jobs_source_path_check
  CHECK (source_storage_path ~* '^practices/[0-9a-f-]{36}/audio-sources/[0-9a-f-]{36}-[0-9a-f-]{36}\.(m4a|aac|wav)$');

-- Return type changes from row to jsonb (cleanup plan for superseded queued jobs).
DROP FUNCTION IF EXISTS public.enqueue_product_audio_normalize_job(uuid, uuid, text, text, text, bigint, text, text);

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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.product_audio_normalize_jobs;
  v_item public.audio_items;
  v_old public.product_audio_normalize_jobs;
  v_cleanup_sources text[] := ARRAY[]::text[];
  v_cleanup_targets text[] := ARRAY[]::text[];
BEGIN
  -- Canonical lock order: audio_item → job
  IF p_source_format NOT IN ('m4a', 'aac', 'wav') THEN
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

  FOR v_old IN
    SELECT *
    FROM public.product_audio_normalize_jobs
    WHERE audio_item_id = p_audio_item_id
      AND status IN ('queued', 'processing')
    FOR UPDATE
  LOOP
    -- Queued jobs have no worker: safe to cleanup source + orphan target now.
    -- Processing jobs: worker interrupt cleanup remains authoritative (no blind delete).
    IF v_old.status = 'queued' THEN
      IF v_old.source_storage_path IS NOT NULL
        AND v_old.source_storage_path IS DISTINCT FROM v_item.audio_path
        AND v_old.source_storage_path IS DISTINCT FROM p_source_storage_path THEN
        v_cleanup_sources := array_append(v_cleanup_sources, v_old.source_storage_path);
      END IF;
      IF v_old.target_storage_path IS NOT NULL
        AND v_old.target_storage_path IS DISTINCT FROM v_item.audio_path
        AND v_old.target_storage_path IS DISTINCT FROM p_target_storage_path THEN
        v_cleanup_targets := array_append(v_cleanup_targets, v_old.target_storage_path);
      END IF;
    END IF;

    UPDATE public.product_audio_normalize_jobs
    SET status = 'superseded',
        lease_token = NULL,
        lease_expires_at = NULL,
        completed_at = COALESCE(completed_at, now()),
        error_code = 'superseded',
        error_message_safe = 'Заменено новой загрузкой.',
        updated_at = now()
    WHERE id = v_old.id;
  END LOOP;

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

  RETURN jsonb_build_object(
    'job', to_jsonb(v_job),
    'cleanup_source_paths', to_jsonb(v_cleanup_sources),
    'cleanup_target_paths', to_jsonb(v_cleanup_targets)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_product_direct_mp3_delivery(
  p_audio_item_id uuid,
  p_practice_id uuid,
  p_audio_path text,
  p_duration_seconds numeric,
  p_original_file_name text,
  p_file_size_bytes bigint,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.audio_items;
  v_old public.product_audio_normalize_jobs;
  v_previous text;
  v_cleanup_sources text[] := ARRAY[]::text[];
  v_cleanup_targets text[] := ARRAY[]::text[];
BEGIN
  -- Canonical lock order: audio_item → job
  IF p_audio_item_id IS NULL
    OR p_practice_id IS NULL
    OR p_audio_path IS NULL
    OR btrim(p_audio_path) = ''
    OR p_duration_seconds IS NULL
    OR p_duration_seconds <= 0
    OR p_file_size_bytes IS NULL
    OR p_file_size_bytes <= 0
    OR p_status IS NULL
    OR btrim(p_status) = '' THEN
    RETURN jsonb_build_object('activated', false);
  END IF;

  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = p_audio_item_id
    AND practice_id = p_practice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('activated', false);
  END IF;

  v_previous := v_item.audio_path;

  FOR v_old IN
    SELECT *
    FROM public.product_audio_normalize_jobs
    WHERE audio_item_id = p_audio_item_id
      AND status IN ('queued', 'processing')
    FOR UPDATE
  LOOP
    IF v_old.status = 'queued' THEN
      IF v_old.source_storage_path IS NOT NULL
        AND v_old.source_storage_path IS DISTINCT FROM v_previous
        AND v_old.source_storage_path IS DISTINCT FROM p_audio_path THEN
        v_cleanup_sources := array_append(v_cleanup_sources, v_old.source_storage_path);
      END IF;
      IF v_old.target_storage_path IS NOT NULL
        AND v_old.target_storage_path IS DISTINCT FROM v_previous
        AND v_old.target_storage_path IS DISTINCT FROM p_audio_path THEN
        v_cleanup_targets := array_append(v_cleanup_targets, v_old.target_storage_path);
      END IF;
    END IF;
    -- processing: mark superseded; worker interrupt cleanup is authoritative

    UPDATE public.product_audio_normalize_jobs
    SET status = 'superseded',
        lease_token = NULL,
        lease_expires_at = NULL,
        completed_at = COALESCE(completed_at, now()),
        error_code = 'superseded',
        error_message_safe = 'Заменено новой загрузкой.',
        updated_at = now()
    WHERE id = v_old.id;
  END LOOP;

  -- Failed desired pointer (or any residual) is cleared with this UPDATE.
  UPDATE public.audio_items
  SET audio_path = p_audio_path,
      duration_seconds = p_duration_seconds,
      original_file_name = p_original_file_name,
      file_size_bytes = p_file_size_bytes,
      status = p_status,
      desired_product_audio_normalize_job_id = NULL,
      updated_at = now()
  WHERE id = p_audio_item_id;

  RETURN jsonb_build_object(
    'activated', true,
    'previous_audio_path', v_previous,
    'cleanup_source_paths', to_jsonb(v_cleanup_sources),
    'cleanup_target_paths', to_jsonb(v_cleanup_targets)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_product_audio_normalize_job(uuid, uuid, text, text, text, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_product_audio_normalize_job(uuid, uuid, text, text, text, bigint, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.activate_product_direct_mp3_delivery(uuid, uuid, text, numeric, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_product_direct_mp3_delivery(uuid, uuid, text, numeric, text, bigint, text)
  TO service_role;

COMMIT;
