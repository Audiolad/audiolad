BEGIN;

-- Video export originally assumed every playable track lived in
-- practice-audio. Modern music albums point at a verified stream asset in
-- music-streams instead, while audio_items.audio_path remains NULL.
ALTER TABLE public.product_video_render_jobs
  ADD COLUMN IF NOT EXISTS source_audio_bucket text;

UPDATE public.product_video_render_jobs
SET source_audio_bucket = 'practice-audio'
WHERE source_audio_bucket IS NULL;

ALTER TABLE public.product_video_render_jobs
  ALTER COLUMN source_audio_bucket SET NOT NULL,
  DROP CONSTRAINT IF EXISTS product_video_render_jobs_source_audio_bucket_check;

ALTER TABLE public.product_video_render_jobs
  ADD CONSTRAINT product_video_render_jobs_source_audio_bucket_check
    CHECK (source_audio_bucket IN ('practice-audio', 'music-streams'));

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
  v_source_audio_bucket text;
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

  SELECT CASE
      WHEN stream.id IS NOT NULL
        AND stream.asset_role = 'stream'
        AND stream.lifecycle_state = 'verified'
        AND stream.storage_bucket = 'music-streams'
        AND stream.storage_path = p_source_audio_path
        AND NULLIF(btrim(stream.storage_path), '') IS NOT NULL
        THEN 'music-streams'
      WHEN a.audio_path = p_source_audio_path
        AND NULLIF(btrim(a.audio_path), '') IS NOT NULL
        THEN 'practice-audio'
      ELSE NULL
    END
  INTO v_source_audio_bucket
  FROM public.audio_items a
  LEFT JOIN public.music_audio_assets stream
    ON stream.id = a.active_music_delivery_asset_id
   AND stream.audio_item_id = a.id
  WHERE a.id = p_audio_item_id
    AND a.practice_id = p_practice_id;

  IF v_source_audio_bucket IS NULL THEN
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
    source_audio_bucket,
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
    v_source_audio_bucket,
    p_source_audio_path,
    p_source_cover_path,
    v_output_path,
    'queued'
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_product_video_render_job(
  uuid, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_product_video_render_job(
  uuid, uuid, uuid, text, text, text
) TO service_role;

COMMIT;
