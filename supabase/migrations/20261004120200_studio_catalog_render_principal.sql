BEGIN;

-- PR5: store the user whose lawful Studio right was used to attach
-- catalog music. Background render cannot re-check without this principal.
-- Forward-only. Does not rewrite 20261004120000 or 20261004120100.
-- No global backfill by guessing project owner / current renderer / buyer.

ALTER TABLE public.studio_project_assets
  ADD COLUMN IF NOT EXISTS catalog_access_user_id uuid NULL
    REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_catalog_access_user_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_catalog_access_user_check
    CHECK (
      source_type = 'catalog'
      OR catalog_access_user_id IS NULL
    );

COMMENT ON COLUMN public.studio_project_assets.catalog_access_user_id IS
  'audiolad:studio-catalog-render:v1; user whose lawful Studio right (can_use_music_in_studio) was used to attach this catalog asset. Not listener buyer, not automatic project owner, not current renderer. NULL only for legacy pre-PR5 rows.';

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
    IF v_asset.catalog_access_user_id IS NULL THEN
      UPDATE public.studio_project_assets
      SET catalog_access_user_id = p_user_id
      WHERE id = v_asset.id
        AND catalog_access_user_id IS NULL
        AND deleted_at IS NULL
      RETURNING * INTO v_asset;
    END IF;
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
    catalog_audio_item_id,
    catalog_access_user_id
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
    p_audio_item_id,
    p_user_id
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
      AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    IF v_asset.catalog_access_user_id IS NULL
      AND public.can_use_music_in_studio(p_user_id, p_practice_id)
    THEN
      UPDATE public.studio_project_assets
      SET catalog_access_user_id = p_user_id
      WHERE id = v_asset.id
        AND catalog_access_user_id IS NULL
        AND deleted_at IS NULL
      RETURNING * INTO v_asset;
    END IF;
    RETURN v_asset;
END;
$$;

COMMENT ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric) IS
  'audiolad:studio-catalog-attach:v2; create/reuse catalog project ref. Stores catalog_access_user_id=p_user_id on insert. Idempotent reuse never overwrites a set principal. Legacy NULL principal is adopted only when current p_user_id passes can_use_music_in_studio. No Storage copy. Never user_practices.';

REVOKE ALL ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)
  TO service_role;

-- Duplicate copies the stored attach principal. It does not invent a new
-- renderer/owner principal and does not copy practice-audio into draft assets.
CREATE OR REPLACE FUNCTION public.duplicate_studio_project(
  p_source_project_id uuid,
  p_project_id uuid,
  p_project_data jsonb,
  p_asset_refs jsonb
)
RETURNS public.studio_projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.studio_projects;
  v_project public.studio_projects;
  v_name text;
  v_index integer := 1;
  v_active_size bigint;
BEGIN
  SELECT * INTO v_source FROM public.studio_projects
  WHERE id = p_source_project_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_project_id IS NULL OR p_project_data IS NULL OR jsonb_typeof(p_asset_refs) <> 'array' THEN
    RAISE EXCEPTION 'invalid_project' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(v_source.author_id::text, v_source.guest_session_id::text), 0));
  IF v_source.guest_session_id IS NOT NULL AND (
    SELECT count(*) FROM public.studio_projects
    WHERE guest_session_id = v_source.guest_session_id AND status = 'active'
  ) >= 3 THEN RAISE EXCEPTION 'guest_project_limit' USING ERRCODE = 'P0001'; END IF;
  v_name := v_source.name || ' — копия';
  WHILE EXISTS (
    SELECT 1 FROM public.studio_projects
    WHERE status = 'active' AND author_id IS NOT DISTINCT FROM v_source.author_id
      AND guest_session_id IS NOT DISTINCT FROM v_source.guest_session_id
      AND name = v_name
  ) LOOP
    v_index := v_index + 1;
    v_name := v_source.name || ' — копия ' || v_index;
  END LOOP;
  SELECT coalesce(sum(source_asset.size_bytes), 0) INTO v_active_size
  FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
  JOIN public.studio_project_assets AS source_asset
    ON source_asset.id = requested.source_asset_id
   AND source_asset.project_id = v_source.id
   AND source_asset.deleted_at IS NULL
   AND source_asset.source_type IN ('upload', 'recording');
  PERFORM 1 FROM public.studio_asset_sources
  WHERE id IN (
    SELECT source_asset.source_id
    FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
    JOIN public.studio_project_assets AS source_asset
      ON source_asset.id = requested.source_asset_id
     AND source_asset.project_id = v_source.id
     AND source_asset.deleted_at IS NULL
     AND source_asset.source_id IS NOT NULL
  )
  FOR UPDATE;
  IF v_active_size > 786432000 THEN RAISE EXCEPTION 'project_asset_quota_exceeded' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid))
     <> (SELECT count(*) FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
         JOIN public.studio_project_assets AS source_asset
           ON source_asset.id = requested.source_asset_id AND source_asset.project_id = v_source.id AND source_asset.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
    JOIN public.studio_project_assets AS source_asset
      ON source_asset.id = requested.source_asset_id
     AND source_asset.project_id = v_source.id
     AND source_asset.deleted_at IS NULL
    WHERE source_asset.source_type IN ('upload', 'recording')
      AND NOT EXISTS (
        SELECT 1 FROM public.studio_asset_sources AS source
        WHERE source.id = source_asset.source_id AND source.deleted_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
    JOIN public.studio_project_assets AS source_asset
      ON source_asset.id = requested.source_asset_id
     AND source_asset.project_id = v_source.id
     AND source_asset.deleted_at IS NULL
    WHERE source_asset.source_type = 'catalog'
      AND (
        source_asset.catalog_practice_id IS NULL
        OR source_asset.catalog_audio_item_id IS NULL
        OR source_asset.source_id IS NOT NULL
        OR source_asset.storage_path IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.studio_projects (
    id, author_id, guest_session_id, name, project_data, schema_version, revision, status
  ) VALUES (p_project_id, v_source.author_id, v_source.guest_session_id, v_name, p_project_data, 2, 1, 'active')
  RETURNING * INTO v_project;
  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type,
    upload_state, upload_state_changed_at, catalog_practice_id, catalog_audio_item_id, catalog_access_user_id
  )
  SELECT requested.asset_id, v_project.id, source_asset.source_id, source_asset.storage_path,
    source_asset.original_name, source_asset.mime_type, source_asset.size_bytes,
    source_asset.duration_seconds, source_asset.source_type,
    'ready', now(), source_asset.catalog_practice_id, source_asset.catalog_audio_item_id,
    source_asset.catalog_access_user_id
  FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
  JOIN public.studio_project_assets AS source_asset
    ON source_asset.id = requested.source_asset_id AND source_asset.project_id = v_source.id AND source_asset.deleted_at IS NULL;
  RETURN v_project;
END;
$$;

COMMENT ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) IS
  'audiolad:studio-duplicate:v2; copies catalog refs and catalog_access_user_id. Does not invent a renderer/owner principal or copy practice-audio.';

REVOKE ALL ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'studio_project_assets'
      AND column_name = 'catalog_access_user_id'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: catalog_access_user_id missing';
  END IF;
  IF to_regprocedure('public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: attach_studio_catalog_project_asset missing';
  END IF;
  IF position('catalog_access_user_id' IN pg_get_functiondef(
    'public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'Post-check failed: attach must persist catalog_access_user_id';
  END IF;
  IF position('gen_random_uuid()' IN pg_get_functiondef(
    'public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'Post-check failed: attach INSERT must set id via gen_random_uuid()';
  END IF;
  IF position('catalog_access_user_id' IN pg_get_functiondef(
    'public.duplicate_studio_project(uuid, uuid, jsonb, jsonb)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'Post-check failed: duplicate must copy catalog_access_user_id';
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
