BEGIN;

-- Studio long-form user-audio limits. Touches ONLY studio-draft-assets and
-- Studio project/source asset rows. Other product buckets stay unchanged.

UPDATE storage.buckets
SET file_size_limit = 314572800
WHERE id = 'studio-draft-assets';

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_size_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 314572800);

ALTER TABLE public.studio_asset_sources
  DROP CONSTRAINT IF EXISTS studio_asset_sources_size_check;
ALTER TABLE public.studio_asset_sources
  ADD CONSTRAINT studio_asset_sources_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 314572800);

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_duration_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_duration_check
    CHECK (
      duration_seconds IS NULL
      OR (duration_seconds >= 0 AND duration_seconds <= 10800)
    );

ALTER TABLE public.studio_asset_sources
  DROP CONSTRAINT IF EXISTS studio_asset_sources_duration_check;
ALTER TABLE public.studio_asset_sources
  ADD CONSTRAINT studio_asset_sources_duration_check
    CHECK (
      duration_seconds IS NULL
      OR (duration_seconds >= 0 AND duration_seconds <= 10800)
    );

ALTER TABLE public.studio_project_assets
  ADD COLUMN IF NOT EXISTS upload_state text;

UPDATE public.studio_project_assets
SET upload_state = 'ready'
WHERE upload_state IS NULL;

ALTER TABLE public.studio_project_assets
  ALTER COLUMN upload_state SET DEFAULT 'reserved',
  ALTER COLUMN upload_state SET NOT NULL;

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_upload_state_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_upload_state_check
    CHECK (upload_state IN ('reserved', 'uploading', 'processing', 'ready', 'failed'));

ALTER TABLE public.studio_project_assets
  ADD COLUMN IF NOT EXISTS upload_state_changed_at timestamptz;

UPDATE public.studio_project_assets
SET upload_state_changed_at = coalesce(created_at, now())
WHERE upload_state_changed_at IS NULL;

ALTER TABLE public.studio_project_assets
  ALTER COLUMN upload_state_changed_at SET DEFAULT now(),
  ALTER COLUMN upload_state_changed_at SET NOT NULL;

ALTER TABLE public.studio_project_assets
  ADD COLUMN IF NOT EXISTS pending_source_id uuid,
  ADD COLUMN IF NOT EXISTS pending_storage_path text,
  ADD COLUMN IF NOT EXISTS pending_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS pending_original_name text,
  ADD COLUMN IF NOT EXISTS pending_mime_type text,
  ADD COLUMN IF NOT EXISTS pending_reserved_at timestamptz;

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_pending_replacement_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_pending_replacement_check
    CHECK (
      (
        pending_source_id IS NULL
        AND pending_storage_path IS NULL
        AND pending_size_bytes IS NULL
        AND pending_original_name IS NULL
        AND pending_mime_type IS NULL
        AND pending_reserved_at IS NULL
      )
      OR (
        pending_source_id IS NOT NULL
        AND pending_storage_path IS NOT NULL
        AND pending_size_bytes > 0
        AND pending_size_bytes <= 314572800
        AND pending_original_name IS NOT NULL
        AND pending_mime_type IS NOT NULL
        AND pending_reserved_at IS NOT NULL
      )
    );

ALTER TABLE public.studio_asset_sources
  ADD COLUMN IF NOT EXISTS peaks_version smallint,
  ADD COLUMN IF NOT EXISTS peaks_columns integer,
  ADD COLUMN IF NOT EXISTS peaks_data bytea;

ALTER TABLE public.studio_asset_sources
  DROP CONSTRAINT IF EXISTS studio_asset_sources_peaks_v1_check;
ALTER TABLE public.studio_asset_sources
  ADD CONSTRAINT studio_asset_sources_peaks_v1_check
    CHECK (
      (peaks_version IS NULL AND peaks_columns IS NULL AND peaks_data IS NULL)
      OR (
        peaks_version = 1
        AND peaks_columns BETWEEN 8192 AND 32768
        AND peaks_data IS NOT NULL
        AND octet_length(peaks_data) = peaks_columns * 4
      )
    );

CREATE INDEX IF NOT EXISTS studio_project_assets_stale_upload_idx
  ON public.studio_project_assets (upload_state, upload_state_changed_at)
  WHERE deleted_at IS NULL
    AND upload_state IN ('reserved', 'uploading', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS studio_project_assets_stale_pending_idx
  ON public.studio_project_assets (pending_reserved_at)
  WHERE deleted_at IS NULL
    AND pending_source_id IS NOT NULL;

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
  SELECT coalesce(sum(size_bytes), 0) INTO v_active_size
  FROM public.studio_project_assets
  WHERE project_id = p_project_id
    AND deleted_at IS NULL
    AND upload_state IN ('reserved', 'uploading', 'processing', 'ready');
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

CREATE OR REPLACE FUNCTION public.studio_set_project_asset_upload_state(
  p_project_id uuid,
  p_asset_id uuid,
  p_upload_state text
)
RETURNS public.studio_project_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset public.studio_project_assets;
BEGIN
  IF p_upload_state NOT IN ('reserved', 'uploading', 'processing', 'ready', 'failed') THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  UPDATE public.studio_project_assets
  SET upload_state = p_upload_state,
      upload_state_changed_at = now()
  WHERE id = p_asset_id
    AND project_id = p_project_id
    AND deleted_at IS NULL
  RETURNING * INTO v_asset;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN v_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.studio_finalize_project_asset(
  p_project_id uuid,
  p_asset_id uuid,
  p_size_bytes bigint,
  p_duration_seconds numeric,
  p_peaks_version smallint DEFAULT NULL,
  p_peaks_columns integer DEFAULT NULL,
  p_peaks_data bytea DEFAULT NULL
)
RETURNS public.studio_project_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset public.studio_project_assets;
BEGIN
  SELECT * INTO v_asset
  FROM public.studio_project_assets
  WHERE id = p_asset_id AND project_id = p_project_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_asset.upload_state = 'ready'
    AND v_asset.size_bytes = p_size_bytes
    AND v_asset.duration_seconds IS NOT DISTINCT FROM p_duration_seconds THEN
    RETURN v_asset;
  END IF;
  IF v_asset.upload_state NOT IN ('reserved', 'uploading', 'processing') THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 314572800
    OR p_duration_seconds IS NULL OR p_duration_seconds <= 0 OR p_duration_seconds > 10800 THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;

  UPDATE public.studio_asset_sources
  SET size_bytes = p_size_bytes,
      duration_seconds = p_duration_seconds,
      peaks_version = p_peaks_version,
      peaks_columns = p_peaks_columns,
      peaks_data = p_peaks_data
  WHERE id = v_asset.source_id AND deleted_at IS NULL;

  UPDATE public.studio_project_assets
  SET size_bytes = p_size_bytes,
      duration_seconds = p_duration_seconds,
      upload_state = 'ready',
      upload_state_changed_at = now()
  WHERE id = p_asset_id AND project_id = p_project_id
  RETURNING * INTO v_asset;
  RETURN v_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.studio_reserve_project_asset_replacement(
  p_project_id uuid,
  p_asset_id uuid,
  p_source_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint
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
  SELECT * INTO v_project FROM public.studio_projects
  WHERE id = p_project_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_asset FROM public.studio_project_assets
  WHERE id = p_asset_id AND project_id = p_project_id AND deleted_at IS NULL
    AND upload_state = 'ready'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_source_id IS NULL OR p_storage_path IS NULL OR p_original_name IS NULL
    OR p_mime_type IS NULL OR p_size_bytes IS NULL
    OR p_size_bytes <= 0 OR p_size_bytes > 314572800 THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  IF v_project.author_id IS NOT NULL THEN
    v_path_ok := p_storage_path ~ ('^studio/' || v_project.author_id::text || '/' || p_project_id::text || '/' || p_source_id::text || '/[A-Za-z0-9._-]+$');
  ELSIF v_project.guest_session_id IS NOT NULL THEN
    v_path_ok := p_storage_path ~ ('^studio/guest/' || v_project.guest_session_id::text || '/' || p_project_id::text || '/' || p_source_id::text || '/[A-Za-z0-9._-]+$');
  END IF;
  IF NOT v_path_ok THEN RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(sum(size_bytes), 0) INTO v_active_size
  FROM public.studio_project_assets
  WHERE project_id = p_project_id
    AND deleted_at IS NULL
    AND upload_state IN ('reserved', 'uploading', 'processing', 'ready');
  IF v_active_size - v_asset.size_bytes + p_size_bytes > 786432000 THEN
    RAISE EXCEPTION 'project_asset_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.studio_project_assets
  SET pending_source_id = p_source_id,
      pending_storage_path = p_storage_path,
      pending_size_bytes = p_size_bytes,
      pending_original_name = p_original_name,
      pending_mime_type = p_mime_type,
      pending_reserved_at = now()
  WHERE id = p_asset_id AND project_id = p_project_id
  RETURNING * INTO v_asset;
  RETURN v_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.studio_clear_project_asset_replacement(
  p_project_id uuid,
  p_asset_id uuid
)
RETURNS public.studio_project_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset public.studio_project_assets;
BEGIN
  UPDATE public.studio_project_assets
  SET pending_source_id = NULL,
      pending_storage_path = NULL,
      pending_size_bytes = NULL,
      pending_original_name = NULL,
      pending_mime_type = NULL,
      pending_reserved_at = NULL
  WHERE id = p_asset_id AND project_id = p_project_id AND deleted_at IS NULL
  RETURNING * INTO v_asset;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN v_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.studio_fail_project_asset(
  p_project_id uuid,
  p_asset_id uuid
)
RETURNS public.studio_project_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset public.studio_project_assets;
BEGIN
  UPDATE public.studio_project_assets
  SET upload_state = 'failed',
      upload_state_changed_at = now()
  WHERE id = p_asset_id
    AND project_id = p_project_id
    AND deleted_at IS NULL
    AND upload_state <> 'ready'
  RETURNING * INTO v_asset;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN v_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.studio_cleanup_stale_asset_uploads(
  p_max_age interval DEFAULT interval '2 hours'
)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset record;
BEGIN
  -- State-aware TTLs. p_max_age is ignored: created_at would kill a slow
  -- 300 MiB PUT still in uploading. Ready rows are never released here.
  FOR v_asset IN
    SELECT id, project_id
    FROM public.studio_project_assets
    WHERE deleted_at IS NULL
      AND upload_state <> 'ready'
      AND (
        (upload_state = 'reserved' AND upload_state_changed_at < now() - interval '30 minutes')
        OR (upload_state = 'uploading' AND upload_state_changed_at < now() - interval '8 hours')
        OR (upload_state = 'processing' AND upload_state_changed_at < now() - interval '45 minutes')
        OR (upload_state = 'failed' AND upload_state_changed_at < now() - interval '15 minutes')
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    RETURN QUERY
    SELECT released.storage_path
    FROM public.release_studio_project_asset(v_asset.project_id, v_asset.id) AS released;
  END LOOP;

  FOR v_asset IN
    SELECT id, project_id, pending_storage_path
    FROM public.studio_project_assets
    WHERE deleted_at IS NULL
      AND upload_state = 'ready'
      AND pending_source_id IS NOT NULL
      AND pending_reserved_at IS NOT NULL
      AND pending_reserved_at < now() - interval '8 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_asset.pending_storage_path IS NOT NULL THEN
      storage_path := v_asset.pending_storage_path;
      RETURN NEXT;
    END IF;
    PERFORM public.studio_clear_project_asset_replacement(v_asset.project_id, v_asset.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_studio_project_asset(
  p_project_id uuid,
  p_asset_id uuid,
  p_source_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds numeric
)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_source_id uuid;
  v_active_size bigint;
  v_current_size bigint;
BEGIN
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 314572800
    OR p_duration_seconds IS NULL OR p_duration_seconds <= 0 OR p_duration_seconds > 10800 THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  SELECT source_id, size_bytes INTO v_old_source_id, v_current_size
  FROM public.studio_project_assets
  WHERE id = p_asset_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.studio_asset_sources WHERE id = v_old_source_id FOR UPDATE;
  SELECT coalesce(sum(size_bytes), 0) INTO v_active_size
  FROM public.studio_project_assets
  WHERE project_id = p_project_id
    AND deleted_at IS NULL
    AND upload_state IN ('reserved', 'uploading', 'processing', 'ready');
  IF v_active_size - coalesce(v_current_size, 0) + p_size_bytes > 786432000 THEN
    RAISE EXCEPTION 'project_asset_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.studio_asset_sources (id, storage_path, mime_type, size_bytes, duration_seconds, source_type)
  SELECT p_source_id, p_storage_path, p_mime_type, p_size_bytes, p_duration_seconds, source_type
  FROM public.studio_project_assets WHERE id = p_asset_id;
  UPDATE public.studio_project_assets SET source_id = p_source_id, storage_path = p_storage_path,
    original_name = p_original_name, mime_type = p_mime_type, size_bytes = p_size_bytes,
    duration_seconds = p_duration_seconds, upload_state = 'ready'
  WHERE id = p_asset_id AND project_id = p_project_id;
  RETURN QUERY
  UPDATE public.studio_asset_sources AS source SET deleted_at = now()
  WHERE source.id = v_old_source_id AND source.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.studio_project_assets ref WHERE ref.source_id = source.id AND ref.deleted_at IS NULL)
  RETURNING source.storage_path;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_reserve_project_asset(uuid, uuid, text, text, text, bigint, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.studio_set_project_asset_upload_state(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.studio_finalize_project_asset(uuid, uuid, bigint, numeric, smallint, integer, bytea) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.studio_fail_project_asset(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.studio_cleanup_stale_asset_uploads(interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.studio_reserve_project_asset_replacement(uuid, uuid, uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.studio_clear_project_asset_replacement(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_studio_project_asset(uuid, uuid, uuid, text, text, text, bigint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_reserve_project_asset(uuid, uuid, text, text, text, bigint, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_set_project_asset_upload_state(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_finalize_project_asset(uuid, uuid, bigint, numeric, smallint, integer, bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_fail_project_asset(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_cleanup_stale_asset_uploads(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_reserve_project_asset_replacement(uuid, uuid, uuid, text, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_clear_project_asset_replacement(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_studio_project_asset(uuid, uuid, uuid, text, text, text, bigint, numeric) TO service_role;

COMMIT;
