BEGIN;

-- Physical audio is immutable and owned by a source. Project asset rows are
-- references, which permits copy-on-write project duplication without copying
-- the Storage object.
CREATE TABLE public.studio_asset_sources (
  id uuid PRIMARY KEY,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  duration_seconds numeric NULL,
  source_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT studio_asset_sources_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 209715200),
  CONSTRAINT studio_asset_sources_duration_check
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT studio_asset_sources_source_type_check
    CHECK (source_type IN ('upload', 'recording'))
);

ALTER TABLE public.studio_asset_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_project_assets
  ADD COLUMN source_id uuid NULL;

INSERT INTO public.studio_asset_sources (
  id, storage_path, mime_type, size_bytes, duration_seconds, source_type, created_at, deleted_at
)
SELECT id, storage_path, mime_type, size_bytes, duration_seconds, source_type, created_at, deleted_at
FROM public.studio_project_assets;

UPDATE public.studio_project_assets
SET source_id = id
WHERE source_id IS NULL;

ALTER TABLE public.studio_project_assets
  ALTER COLUMN source_id SET NOT NULL,
  ADD CONSTRAINT studio_project_assets_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES public.studio_asset_sources (id) ON DELETE RESTRICT;

-- References may share a physical source path. The unique constraint moves to
-- studio_asset_sources.storage_path; no existing asset rows or objects change.
ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT studio_project_assets_storage_path_key;

CREATE INDEX studio_project_assets_active_source_idx
  ON public.studio_project_assets (source_id)
  WHERE deleted_at IS NULL;

-- New uploads create an immutable source and its first project reference.
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
  SELECT * INTO v_project FROM public.studio_projects
  WHERE id = p_project_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_asset_id IS NULL OR p_storage_path IS NULL OR p_original_name IS NULL
    OR p_mime_type IS NULL OR p_size_bytes IS NULL OR p_source_type NOT IN ('upload', 'recording')
    OR p_size_bytes <= 0 OR p_size_bytes > 209715200
    OR (p_duration_seconds IS NOT NULL AND p_duration_seconds < 0) THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;
  IF v_project.author_id IS NOT NULL THEN
    v_path_ok := p_storage_path ~ ('^studio/' || v_project.author_id::text || '/' || p_project_id::text || '/' || p_asset_id::text || '/[A-Za-z0-9._-]+$');
  ELSIF v_project.guest_session_id IS NOT NULL THEN
    v_path_ok := p_storage_path ~ ('^studio/guest/' || v_project.guest_session_id::text || '/' || p_project_id::text || '/' || p_asset_id::text || '/[A-Za-z0-9._-]+$');
  END IF;
  IF NOT v_path_ok THEN RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(sum(size_bytes), 0) INTO v_active_size
  FROM public.studio_project_assets WHERE project_id = p_project_id AND deleted_at IS NULL;
  IF v_active_size + p_size_bytes > 786432000 THEN
    RAISE EXCEPTION 'project_asset_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.studio_asset_sources (id, storage_path, mime_type, size_bytes, duration_seconds, source_type)
  VALUES (p_asset_id, p_storage_path, p_mime_type, p_size_bytes, p_duration_seconds, p_source_type);
  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type
  ) VALUES (
    p_asset_id, p_project_id, p_asset_id, p_storage_path, p_original_name, p_mime_type, p_size_bytes, p_duration_seconds, p_source_type
  ) RETURNING * INTO v_asset;
  RETURN v_asset;
END;
$$;

-- Atomically make a fully populated project/reference graph. The API has
-- already authenticated the actor; this function derives the owner solely
-- from the locked source project and never accepts a target owner.
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
    RAISE EXCEPTION 'invalid_project' USING ERRCODE = '22023';
  END IF;
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
  INSERT INTO public.studio_projects (
    id, author_id, guest_session_id, name, project_data, schema_version, revision, status
  ) VALUES (p_project_id, v_source.author_id, v_source.guest_session_id, v_name, p_project_data, 2, 1, 'active')
  RETURNING * INTO v_project;
  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type
  )
  SELECT requested.asset_id, v_project.id, source_asset.source_id, source_asset.storage_path,
    source_asset.original_name, source_asset.mime_type, source_asset.size_bytes,
    source_asset.duration_seconds, source_asset.source_type
  FROM jsonb_to_recordset(p_asset_refs) AS requested(source_asset_id uuid, asset_id uuid)
  JOIN public.studio_project_assets AS source_asset
    ON source_asset.id = requested.source_asset_id AND source_asset.project_id = v_source.id AND source_asset.deleted_at IS NULL;
  RETURN v_project;
END;
$$;

-- Marking a reference deleted is transactional; a physical object becomes
-- eligible for removal only after its final active reference is released.
CREATE OR REPLACE FUNCTION public.release_studio_project_asset(
  p_project_id uuid,
  p_asset_id uuid
)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_source_id uuid;
BEGIN
  SELECT source_id INTO v_source_id FROM public.studio_project_assets
  WHERE id = p_asset_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.studio_asset_sources WHERE id = v_source_id FOR UPDATE;
  UPDATE public.studio_project_assets SET deleted_at = now()
  WHERE id = p_asset_id AND project_id = p_project_id AND deleted_at IS NULL;
  RETURN QUERY
  UPDATE public.studio_asset_sources AS source SET deleted_at = now()
  WHERE source.id = v_source_id AND source.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.studio_project_assets ref WHERE ref.source_id = source.id AND ref.deleted_at IS NULL)
  RETURNING source.storage_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_studio_project(
  p_project_id uuid,
  p_expected_revision integer
)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_project public.studio_projects; v_source_id uuid;
BEGIN
  SELECT * INTO v_project FROM public.studio_projects WHERE id = p_project_id
    AND status = 'active' AND revision = p_expected_revision FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_conflict' USING ERRCODE = 'P0001'; END IF;
  FOR v_source_id IN SELECT DISTINCT source_id FROM public.studio_project_assets
    WHERE project_id = p_project_id AND deleted_at IS NULL LOOP
    PERFORM 1 FROM public.studio_asset_sources WHERE id = v_source_id FOR UPDATE;
  END LOOP;
  UPDATE public.studio_project_assets SET deleted_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NULL;
  UPDATE public.studio_projects SET status = 'deleted', deleted_at = now(),
    updated_at = now(), revision = revision + 1 WHERE id = p_project_id;
  RETURN QUERY
  UPDATE public.studio_asset_sources AS source SET deleted_at = now()
  WHERE source.id IN (SELECT DISTINCT source_id FROM public.studio_project_assets WHERE project_id = p_project_id)
    AND source.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.studio_project_assets ref WHERE ref.source_id = source.id AND ref.deleted_at IS NULL)
  RETURNING source.storage_path;
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
DECLARE v_old_source_id uuid;
BEGIN
  SELECT source_id INTO v_old_source_id FROM public.studio_project_assets
  WHERE id = p_asset_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.studio_asset_sources WHERE id = v_old_source_id FOR UPDATE;
  INSERT INTO public.studio_asset_sources (id, storage_path, mime_type, size_bytes, duration_seconds, source_type)
  SELECT p_source_id, p_storage_path, p_mime_type, p_size_bytes, p_duration_seconds, source_type
  FROM public.studio_project_assets WHERE id = p_asset_id;
  UPDATE public.studio_project_assets SET source_id = p_source_id, storage_path = p_storage_path,
    original_name = p_original_name, mime_type = p_mime_type, size_bytes = p_size_bytes, duration_seconds = p_duration_seconds
  WHERE id = p_asset_id AND project_id = p_project_id;
  RETURN QUERY
  UPDATE public.studio_asset_sources AS source SET deleted_at = now()
  WHERE source.id = v_old_source_id AND source.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.studio_project_assets ref WHERE ref.source_id = source.id AND ref.deleted_at IS NULL)
  RETURNING source.storage_path;
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_studio_project_asset(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_studio_project(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_studio_project_asset(uuid, uuid, uuid, text, text, text, bigint, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_studio_project(uuid, uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_studio_project_asset(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_studio_project(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_studio_project_asset(uuid, uuid, uuid, text, text, text, bigint, numeric) TO service_role;

COMMIT;
