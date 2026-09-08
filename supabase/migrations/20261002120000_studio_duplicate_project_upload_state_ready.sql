BEGIN;

-- Shared-source project copies insert new studio_project_assets refs that
-- reuse immutable studio_asset_sources. After
-- 20260928120000_studio_longform_asset_limits.sql the column default became
-- 'reserved', so omitted upload_state made copies invisible to
-- listStudioAssets (ready only). Duplicated refs are already finalized
-- physical audio: mark them ready explicitly. No Storage copy, no source
-- row, no reserve/finalize or long-form limit changes. This migration is
-- RPC-only: it does not UPDATE existing rows. A data repair of already
-- reserved shared refs waits for a sealed production Storage scan.

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
  JOIN public.studio_asset_sources AS source
    ON source.id = source_asset.source_id AND source.deleted_at IS NULL;
  PERFORM 1 FROM public.studio_asset_sources
  WHERE id IN (
    SELECT source_asset.source_id
    FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
    JOIN public.studio_project_assets AS source_asset
      ON source_asset.id = requested.source_asset_id
     AND source_asset.project_id = v_source.id
     AND source_asset.deleted_at IS NULL
  )
  FOR UPDATE;
  IF v_active_size > 786432000 THEN RAISE EXCEPTION 'project_asset_quota_exceeded' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid))
     <> (SELECT count(*) FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
         JOIN public.studio_project_assets AS source_asset
           ON source_asset.id = requested.source_asset_id AND source_asset.project_id = v_source.id AND source_asset.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid))
     <> (SELECT count(*) FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
         JOIN public.studio_project_assets AS source_asset
           ON source_asset.id = requested.source_asset_id AND source_asset.project_id = v_source.id AND source_asset.deleted_at IS NULL
         JOIN public.studio_asset_sources AS source
           ON source.id = source_asset.source_id AND source.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.studio_projects (
    id, author_id, guest_session_id, name, project_data, schema_version, revision, status
  ) VALUES (p_project_id, v_source.author_id, v_source.guest_session_id, v_name, p_project_data, 2, 1, 'active')
  RETURNING * INTO v_project;
  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type,
    upload_state, upload_state_changed_at
  )
  SELECT requested.asset_id, v_project.id, source_asset.source_id, source_asset.storage_path,
    source_asset.original_name, source_asset.mime_type, source_asset.size_bytes,
    source_asset.duration_seconds, source_asset.source_type,
    'ready', now()
  FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
  JOIN public.studio_project_assets AS source_asset
    ON source_asset.id = requested.source_asset_id AND source_asset.project_id = v_source.id AND source_asset.deleted_at IS NULL;
  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) TO service_role;

COMMIT;
