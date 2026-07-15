-- List active starter practices in public catalog while keeping starter bundle grants.
-- Backup: backups/20260715_120500_catalog_starter_listing/

BEGIN;

UPDATE public.practices
SET
  is_catalog_listed = true,
  updated_at = now()
WHERE id IN (
  'c3d63131-3ef4-4dbb-8888-0a5085a456b5',
  '9b30e602-d6ff-416e-b6a9-8f926bd0e8b7',
  '41f31832-e9e2-4e22-bb05-729bbc57c815'
)
AND status = 'published';

-- ---------------------------------------------------------------------------
-- publish_audio_product v3: published products are catalog-listed by default
-- (including active starter practices).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_audio_product(
  p_practice_id uuid,
  p_published_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_first_audio_path text;
  v_total_seconds bigint;
  v_duration_minutes integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status = 'archived' THEN
    RAISE EXCEPTION 'practice_archived'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = v_practice.author_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.audio_items AS ai
  SET
    status = 'published',
    updated_at = now()
  WHERE ai.practice_id = p_practice_id;

  SELECT ai.audio_path
  INTO v_first_audio_path
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND ai.audio_path IS NOT NULL
    AND btrim(ai.audio_path) <> ''
  ORDER BY ai.position ASC
  LIMIT 1;

  SELECT COALESCE(SUM(ai.duration_seconds), 0)
  INTO v_total_seconds
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND ai.audio_path IS NOT NULL
    AND btrim(ai.audio_path) <> '';

  IF v_total_seconds > 0 THEN
    v_duration_minutes := GREATEST(1, CEIL(v_total_seconds::numeric / 60)::integer);
  ELSE
    v_duration_minutes := NULL;
  END IF;

  UPDATE public.practices AS p
  SET
    status = 'published',
    is_catalog_listed = true,
    published_at = COALESCE(p.published_at, p_published_at),
    audio_url = v_first_audio_path,
    duration_minutes = v_duration_minutes,
    updated_at = now()
  WHERE p.id = p_practice_id;
END;
$$;

COMMENT ON FUNCTION public.publish_audio_product(uuid, timestamptz) IS
  'audiolad:publish-audio-product:v3; publishes practice and audio_items; lists in catalog';

COMMIT;
