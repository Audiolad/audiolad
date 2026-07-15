-- Separate unpublished from archived lifecycle states.
-- Idempotent function replacements; no destructive data changes.

BEGIN;

-- ---------------------------------------------------------------------------
-- publish_audio_product v2: set catalog visibility on publish
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
  v_is_active_starter boolean;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.starter_practices AS sp
    WHERE sp.practice_id = p_practice_id
      AND sp.is_active IS TRUE
  )
  INTO v_is_active_starter;

  UPDATE public.practices AS p
  SET
    status = 'published',
    is_catalog_listed = CASE
      WHEN v_is_active_starter THEN false
      ELSE true
    END,
    published_at = COALESCE(p.published_at, p_published_at),
    audio_url = v_first_audio_path,
    duration_minutes = v_duration_minutes,
    updated_at = now()
  WHERE p.id = p_practice_id;
END;
$$;

COMMENT ON FUNCTION public.publish_audio_product(uuid, timestamptz) IS
  'audiolad:publish-audio-product:v2; publishes practice and audio_items; sets is_catalog_listed unless active starter';

-- ---------------------------------------------------------------------------
-- unpublish_audio_product v2: status unpublished (not archived)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unpublish_audio_product(
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
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

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'invalid_status_for_unpublish'
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

  UPDATE public.practices AS p
  SET
    status = 'unpublished',
    is_catalog_listed = false,
    updated_at = now()
  WHERE p.id = p_practice_id;
END;
$$;

COMMENT ON FUNCTION public.unpublish_audio_product(uuid) IS
  'audiolad:unpublish-audio-product:v2; sets status=unpublished, hides from catalog; keeps audio_items published for entitled users';

-- ---------------------------------------------------------------------------
-- archive_audio_product
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_audio_product(
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
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

  IF v_practice.status NOT IN ('published', 'unpublished') THEN
    RAISE EXCEPTION 'invalid_status_for_archive'
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

  UPDATE public.practices AS p
  SET
    status = 'archived',
    is_catalog_listed = false,
    updated_at = now()
  WHERE p.id = p_practice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_audio_product(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_audio_product(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_audio_product(uuid) TO authenticated;

COMMENT ON FUNCTION public.archive_audio_product(uuid) IS
  'audiolad:archive-audio-product:v1; moves published/unpublished product to archived; keeps entitlements';

-- ---------------------------------------------------------------------------
-- restore_archived_audio_product
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_archived_audio_product(
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
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

  IF v_practice.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'invalid_status_for_restore'
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

  UPDATE public.practices AS p
  SET
    status = 'unpublished',
    is_catalog_listed = false,
    updated_at = now()
  WHERE p.id = p_practice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_archived_audio_product(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_archived_audio_product(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_archived_audio_product(uuid) TO authenticated;

COMMENT ON FUNCTION public.restore_archived_audio_product(uuid) IS
  'audiolad:restore-archived-audio-product:v1; returns archived product to unpublished (not auto-published)';

COMMIT;
