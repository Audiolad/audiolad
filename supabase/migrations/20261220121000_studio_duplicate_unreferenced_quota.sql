BEGIN;

-- Duplicated Studio projects reuse immutable source audio through shared
-- studio_project_assets refs (source_id <> id). Clearing a copied track removes
-- it from project_data but intentionally leaves the shared ref available for
-- in-session undo/history. The long-form quota previously counted every ready
-- ref, including such no-longer-used copy refs, so "clear voice -> upload new
-- voice" could fail with project_asset_quota_exceeded even though the visible
-- project was within 750 MiB.
--
-- Count:
--   * every in-flight upload, because it is consuming a reservation;
--   * every owned ready asset (source_id = id), preserving the existing storage
--     quota behaviour for ordinary uploads;
--   * a shared ready duplicate ref only while current project_data still
--     references its asset id.
-- The shared ref itself is not deleted, so undo/history remains safe.

CREATE OR REPLACE FUNCTION public.studio_reserve_project_asset(
  p_project_id uuid,
  p_asset_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_source_type text,
  p_duration_seconds numeric DEFAULT NULL
)
RETURNS public.studio_project_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.studio_projects;
  v_asset public.studio_project_assets;
  v_active_size bigint;
  v_path_ok boolean := false;
BEGIN
  -- Client duration is preflight only and is never stored as authority.
  SELECT * INTO v_project FROM public.studio_projects
  WHERE id = p_project_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_asset_id IS NULL OR p_storage_path IS NULL OR p_original_name IS NULL
    OR p_mime_type IS NULL OR p_size_bytes IS NULL OR p_source_type NOT IN ('upload', 'recording')
    OR p_size_bytes <= 0 OR p_size_bytes > 314572800 THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  IF v_project.author_id IS NOT NULL THEN
    v_path_ok := p_storage_path ~ ('^studio/' || v_project.author_id::text || '/' || p_project_id::text || '/' || p_asset_id::text || '/[A-Za-z0-9._-]+$');
  ELSIF v_project.guest_session_id IS NOT NULL THEN
    v_path_ok := p_storage_path ~ ('^studio/guest/' || v_project.guest_session_id::text || '/' || p_project_id::text || '/' || p_asset_id::text || '/[A-Za-z0-9._-]+$');
  END IF;
  IF NOT v_path_ok THEN RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023'; END IF;

  SELECT coalesce(sum(asset.size_bytes), 0) INTO v_active_size
  FROM public.studio_project_assets AS asset
  WHERE asset.project_id = p_project_id
    AND asset.deleted_at IS NULL
    AND asset.upload_state IN ('reserved', 'uploading', 'processing', 'ready')
    AND (
      asset.upload_state <> 'ready'
      OR asset.source_id = asset.id
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(v_project.project_data -> 'tracks') = 'array'
              THEN v_project.project_data -> 'tracks'
            ELSE '[]'::jsonb
          END
        ) AS track
        WHERE track ->> 'assetId' = asset.id::text
      )
    );

  IF v_active_size + p_size_bytes > 786432000 THEN
    RAISE EXCEPTION 'project_asset_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.studio_asset_sources (id, storage_path, mime_type, size_bytes, duration_seconds, source_type)
  VALUES (p_asset_id, p_storage_path, p_mime_type, p_size_bytes, NULL, p_source_type);
  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type, size_bytes,
    duration_seconds, source_type, upload_state
  ) VALUES (
    p_asset_id, p_project_id, p_asset_id, p_storage_path, p_original_name, p_mime_type,
    p_size_bytes, NULL, p_source_type, 'reserved'
  ) RETURNING * INTO v_asset;
  RETURN v_asset;
END;
$$;

COMMENT ON FUNCTION public.studio_reserve_project_asset(uuid, uuid, text, text, text, bigint, text, numeric) IS
  'audiolad:studio-reserve:v2; 750MiB quota ignores unreferenced ready shared refs from duplicated projects while preserving owned/in-flight asset accounting';

REVOKE ALL ON FUNCTION public.studio_reserve_project_asset(uuid, uuid, text, text, text, bigint, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_reserve_project_asset(uuid, uuid, text, text, text, bigint, text, numeric)
  TO service_role;

COMMIT;
