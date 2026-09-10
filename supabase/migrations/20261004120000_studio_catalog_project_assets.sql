BEGIN;

-- PR4: catalog music attaches to a Studio project by reference.
-- No studio-draft-assets copy. No practice-audio path on the client.
-- Existing upload/recording rows stay valid. Forward-only.

ALTER TABLE public.studio_project_assets
  ADD COLUMN IF NOT EXISTS catalog_practice_id uuid NULL
    REFERENCES public.practices (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS catalog_audio_item_id uuid NULL
    REFERENCES public.audio_items (id) ON DELETE RESTRICT;

ALTER TABLE public.studio_project_assets
  ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE public.studio_project_assets
  ALTER COLUMN source_id DROP NOT NULL;

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_source_type_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_source_type_check
    CHECK (source_type IN ('upload', 'recording', 'catalog'));

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_path_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_path_check
    CHECK (
      (
        source_type IN ('upload', 'recording')
        AND storage_path IS NOT NULL
        AND (
          storage_path ~ '^studio/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$'
          OR storage_path ~ '^studio/guest/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$'
        )
      )
      OR (
        source_type = 'catalog'
        AND storage_path IS NULL
      )
    );

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_size_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_size_check
    CHECK (
      (
        source_type IN ('upload', 'recording')
        AND size_bytes > 0
        AND size_bytes <= 314572800
      )
      OR (
        source_type = 'catalog'
        AND size_bytes >= 0
      )
    );

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_source_kind_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_source_kind_check
    CHECK (
      (
        source_type IN ('upload', 'recording')
        AND source_id IS NOT NULL
        AND storage_path IS NOT NULL
        AND catalog_practice_id IS NULL
        AND catalog_audio_item_id IS NULL
      )
      OR (
        source_type = 'catalog'
        AND source_id IS NULL
        AND storage_path IS NULL
        AND catalog_practice_id IS NOT NULL
        AND catalog_audio_item_id IS NOT NULL
        AND pending_source_id IS NULL
        AND pending_storage_path IS NULL
        AND pending_size_bytes IS NULL
        AND pending_original_name IS NULL
        AND pending_mime_type IS NULL
        AND pending_reserved_at IS NULL
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS studio_project_assets_active_catalog_ref_uidx
  ON public.studio_project_assets (
    project_id,
    catalog_practice_id,
    catalog_audio_item_id
  )
  WHERE deleted_at IS NULL AND source_type = 'catalog';

COMMENT ON COLUMN public.studio_project_assets.catalog_practice_id IS
  'audiolad:studio-catalog-asset:v1; catalog reference only. Never a listen/user_practices grant.';
COMMENT ON COLUMN public.studio_project_assets.catalog_audio_item_id IS
  'audiolad:studio-catalog-asset:v1; must belong to catalog_practice_id. No studio-draft-assets copy.';
COMMENT ON INDEX public.studio_project_assets_active_catalog_ref_uidx IS
  'One active catalog ref per project+practice+audio_item. Soft-deleted rows do not block reattach.';

CREATE OR REPLACE FUNCTION public.studio_catalog_asset_refs_match()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source_type IS DISTINCT FROM 'catalog' THEN
    RETURN NEW;
  END IF;
  IF NEW.catalog_practice_id IS NULL OR NEW.catalog_audio_item_id IS NULL THEN
    RAISE EXCEPTION 'invalid_catalog_audio_item' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.audio_items AS ai
    WHERE ai.id = NEW.catalog_audio_item_id
      AND ai.practice_id = NEW.catalog_practice_id
  ) THEN
    RAISE EXCEPTION 'invalid_catalog_audio_item' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_catalog_asset_refs_match_trg
  ON public.studio_project_assets;
CREATE TRIGGER studio_catalog_asset_refs_match_trg
  BEFORE INSERT OR UPDATE OF source_type, catalog_practice_id, catalog_audio_item_id
  ON public.studio_project_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.studio_catalog_asset_refs_match();

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
  'audiolad:studio-catalog-attach:v1; create/reuse catalog project ref. No Storage copy. Access via can_use_music_in_studio only (never user_practices).';

REVOKE ALL ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)
  TO service_role;

-- Duplicate must copy catalog refs without inventing studio-draft-assets
-- sources. Quota still counts only uploaded/recorded bytes.
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
    upload_state, upload_state_changed_at, catalog_practice_id, catalog_audio_item_id
  )
  SELECT requested.asset_id, v_project.id, source_asset.source_id, source_asset.storage_path,
    source_asset.original_name, source_asset.mime_type, source_asset.size_bytes,
    source_asset.duration_seconds, source_asset.source_type,
    'ready', now(), source_asset.catalog_practice_id, source_asset.catalog_audio_item_id
  FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
  JOIN public.studio_project_assets AS source_asset
    ON source_asset.id = requested.source_asset_id AND source_asset.project_id = v_source.id AND source_asset.deleted_at IS NULL;
  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) TO service_role;

DO $$
BEGIN
  IF to_regclass('public.studio_project_assets_active_catalog_ref_uidx') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: studio_project_assets_active_catalog_ref_uidx missing';
  END IF;
  IF to_regprocedure('public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: attach_studio_catalog_project_asset missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.studio_project_assets'::regclass
      AND conname = 'studio_project_assets_source_kind_check'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: studio_project_assets_source_kind_check missing';
  END IF;
END
$$;

COMMIT;
