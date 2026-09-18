BEGIN;

-- Slice 2: ordinary non-music author products may store WAV sources in
-- practice-audio and enqueue them into product_audio_normalize_jobs.
-- Append-only MIME. Do not change public or file_size_limit.
-- Isolated from music_transcode_jobs / Studio / Personal Materials.

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

GRANT EXECUTE ON FUNCTION public.enqueue_product_audio_normalize_job(uuid, uuid, text, text, text, bigint, text, text) TO service_role;

COMMIT;
