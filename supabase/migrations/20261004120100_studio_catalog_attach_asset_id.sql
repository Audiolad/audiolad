BEGIN;

-- PR4.1 hotfix: catalog attach INSERT must set id.
-- studio_project_assets.id is uuid PRIMARY KEY with no column default
-- (20260809150000). Upload/recording already pass a client UUID.
-- Do NOT add a table-level DEFAULT. Forward-only. Does not rewrite
-- 20261004120000_studio_catalog_project_assets.sql.

CREATE OR REPLACE FUNCTION public.attach_studio_catalog_project_asset(
  p_project_id uuid,
  p_user_id uuid,
  p_practice_id uuid,
  p_audio_item_id uuid,
  p_original_name text,
  p_mime_type text,
  p_duration_seconds numeric
)
RETURNS public.studio_project_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.studio_projects;
  v_asset public.studio_project_assets;
  v_item public.audio_items;
BEGIN
  IF p_project_id IS NULL OR p_user_id IS NULL
    OR p_practice_id IS NULL OR p_audio_item_id IS NULL
    OR p_original_name IS NULL OR btrim(p_original_name) = ''
    OR p_mime_type IS NULL OR btrim(p_mime_type) = ''
    OR p_duration_seconds IS NULL
    OR p_duration_seconds <= 0
    OR p_duration_seconds > 10800
  THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_project
  FROM public.studio_projects
  WHERE id = p_project_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = p_audio_item_id;
  IF NOT FOUND OR v_item.practice_id IS DISTINCT FROM p_practice_id THEN
    RAISE EXCEPTION 'invalid_catalog_audio_item' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_use_music_in_studio(p_user_id, p_practice_id) THEN
    RAISE EXCEPTION 'catalog_music_forbidden' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_asset
  FROM public.studio_project_assets
  WHERE project_id = p_project_id
    AND source_type = 'catalog'
    AND catalog_practice_id = p_practice_id
    AND catalog_audio_item_id = p_audio_item_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF FOUND THEN
    RETURN v_asset;
  END IF;

  INSERT INTO public.studio_project_assets (
    id,
    project_id,
    source_id,
    storage_path,
    original_name,
    mime_type,
    size_bytes,
    duration_seconds,
    source_type,
    upload_state,
    upload_state_changed_at,
    catalog_practice_id,
    catalog_audio_item_id
  ) VALUES (
    gen_random_uuid(),
    p_project_id,
    NULL,
    NULL,
    p_original_name,
    p_mime_type,
    0,
    p_duration_seconds,
    'catalog',
    'ready',
    now(),
    p_practice_id,
    p_audio_item_id
  )
  RETURNING * INTO v_asset;
  RETURN v_asset;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_asset
    FROM public.studio_project_assets
    WHERE project_id = p_project_id
      AND source_type = 'catalog'
      AND catalog_practice_id = p_practice_id
      AND catalog_audio_item_id = p_audio_item_id
      AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    RETURN v_asset;
END;
$$;

COMMENT ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric) IS
  'audiolad:studio-catalog-attach:v1; create/reuse catalog project ref. No Storage copy. Access via can_use_music_in_studio only (never user_practices). INSERT sets id=gen_random_uuid() because studio_project_assets.id has no column default.';

REVOKE ALL ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: attach_studio_catalog_project_asset missing';
  END IF;
  IF position('gen_random_uuid()' IN pg_get_functiondef(
    'public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'Post-check failed: attach INSERT must set id via gen_random_uuid()';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'studio_project_assets'
      AND column_name = 'id'
      AND column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Post-check failed: studio_project_assets.id must not gain a column default';
  END IF;
END
$$;

COMMIT;
