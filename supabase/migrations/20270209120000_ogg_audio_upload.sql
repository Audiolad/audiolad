BEGIN;

-- Canonical Ogg source MIME only; descriptor aliases never reach Storage.
-- Preserve existing quotas and unrestricted (NULL) MIME policies.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/ogg')
WHERE id IN ('practice-audio', 'studio-draft-assets', 'music-masters', 'music-analyzer-runs')
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/ogg' = ANY(allowed_mime_types));

ALTER TABLE public.product_audio_normalize_jobs
  DROP CONSTRAINT IF EXISTS product_audio_normalize_jobs_format_check;
ALTER TABLE public.product_audio_normalize_jobs
  ADD CONSTRAINT product_audio_normalize_jobs_format_check
  CHECK (source_format IN ('m4a', 'aac', 'wav', 'ogg'));

ALTER TABLE public.product_audio_normalize_jobs
  DROP CONSTRAINT IF EXISTS product_audio_normalize_jobs_source_path_check;
ALTER TABLE public.product_audio_normalize_jobs
  ADD CONSTRAINT product_audio_normalize_jobs_source_path_check
  CHECK (source_storage_path ~* '^practices/[0-9a-f-]{36}/audio-sources/[0-9a-f-]{36}-[0-9a-f-]{36}\.(m4a|aac|wav|ogg)$');

-- Passport analysis copies verified Ogg masters; its worker already decodes
-- non-WAV inputs through ffmpeg to PCM before DSP/PANNs.
ALTER TABLE public.music_analyzer_runs
  DROP CONSTRAINT IF EXISTS music_analyzer_runs_mime_check;
ALTER TABLE public.music_analyzer_runs
  ADD CONSTRAINT music_analyzer_runs_mime_check
  CHECK (mime_type IN ('audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg'));

-- Same signature and privileges; preserve supersession and cleanup semantics.
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
  IF p_source_format NOT IN ('m4a', 'aac', 'wav', 'ogg') THEN
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

REVOKE ALL ON FUNCTION public.enqueue_product_audio_normalize_job(uuid, uuid, text, text, text, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_product_audio_normalize_job(uuid, uuid, text, text, text, bigint, text, text)
  TO service_role;

COMMIT;
