BEGIN;

-- Studio persistence V1. The persisted editor envelope is schema V2.
CREATE TABLE public.studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT,
  name text NOT NULL,
  project_data jsonb NOT NULL DEFAULT
    '{"schemaVersion":2,"studioVersion":1,"editor":{"currentTime":0},"slots":[],"tracks":[]}'::jsonb,
  schema_version smallint NOT NULL DEFAULT 2,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NULL,
  deleted_at timestamptz NULL,
  CONSTRAINT studio_projects_name_length_check CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT studio_projects_schema_version_check CHECK (schema_version = 2),
  CONSTRAINT studio_projects_project_data_object_check CHECK (jsonb_typeof(project_data) = 'object'),
  CONSTRAINT studio_projects_revision_check CHECK (revision > 0),
  CONSTRAINT studio_projects_status_check CHECK (status IN ('active', 'deleted')),
  CONSTRAINT studio_projects_deleted_state_check CHECK (
    (status = 'active' AND deleted_at IS NULL)
    OR (status = 'deleted' AND deleted_at IS NOT NULL)
  )
);

CREATE INDEX studio_projects_author_updated_idx
  ON public.studio_projects (author_id, updated_at DESC);

CREATE INDEX studio_projects_author_active_updated_idx
  ON public.studio_projects (author_id, updated_at DESC)
  WHERE status = 'active';

CREATE INDEX studio_projects_deleted_gc_idx
  ON public.studio_projects (deleted_at)
  WHERE status = 'deleted';

CREATE TABLE public.studio_project_assets (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  duration_seconds numeric NULL,
  source_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT studio_project_assets_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 209715200),
  CONSTRAINT studio_project_assets_duration_check
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT studio_project_assets_source_type_check
    CHECK (source_type IN ('upload', 'recording')),
  CONSTRAINT studio_project_assets_path_check
    CHECK (storage_path ~ '^studio/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$')
);

CREATE INDEX studio_project_assets_active_project_idx
  ON public.studio_project_assets (project_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_project_assets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.studio_author_member(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.author_members AS am
      WHERE am.author_id = p_author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    );
$$;

REVOKE ALL ON FUNCTION public.studio_author_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_author_member(uuid) TO authenticated, service_role;

-- Defense-in-depth read policies. Studio writes are server-only service-role calls.
CREATE POLICY "Studio members can read projects"
  ON public.studio_projects FOR SELECT TO authenticated
  USING (public.studio_author_member(author_id));

CREATE POLICY "Studio members can read project assets"
  ON public.studio_project_assets FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.studio_projects AS sp
      WHERE sp.id = studio_project_assets.project_id
        AND sp.status = 'active'
        AND public.studio_author_member(sp.author_id)
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'studio-draft-assets',
  'studio-draft-assets',
  false,
  209715200,
  ARRAY['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac']::text[]
);

-- Intentionally no storage.objects policies: all object access is server-only.

-- This RPC is service_role-only. API code authenticates and checks membership
-- with the user session before calling it. The RPC only owns the atomic quota.
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
BEGIN
  IF p_project_id IS NULL OR p_asset_id IS NULL
    OR p_storage_path IS NULL OR p_original_name IS NULL OR p_mime_type IS NULL
    OR p_size_bytes IS NULL OR p_source_type IS NULL THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_project
  FROM public.studio_projects
  WHERE id = p_project_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_size_bytes <= 0 OR p_size_bytes > 209715200
    OR p_source_type NOT IN ('upload', 'recording')
    OR (p_duration_seconds IS NOT NULL AND p_duration_seconds < 0)
    OR p_storage_path !~ (
      '^studio/' || v_project.author_id::text || '/' || p_project_id::text
      || '/' || p_asset_id::text || '/[A-Za-z0-9._-]+$'
    ) THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(size_bytes), 0)
  INTO v_active_size
  FROM public.studio_project_assets
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  IF v_active_size + p_size_bytes > 786432000 THEN
    RAISE EXCEPTION 'project_asset_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.studio_project_assets (
    id, project_id, storage_path, original_name, mime_type, size_bytes,
    duration_seconds, source_type
  ) VALUES (
    p_asset_id, p_project_id, p_storage_path, p_original_name, p_mime_type,
    p_size_bytes, p_duration_seconds, p_source_type
  )
  RETURNING * INTO v_asset;

  RETURN v_asset;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_reserve_project_asset(
  uuid, uuid, text, text, text, bigint, text, numeric
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_reserve_project_asset(
  uuid, uuid, text, text, text, bigint, text, numeric
) TO service_role;

COMMIT;
