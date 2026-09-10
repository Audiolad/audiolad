-- Isolated Studio catalog-attach tables.
-- Scratch / local database only. Never apply to production.
-- Production-like: studio_project_assets.id uuid PRIMARY KEY with NO DEFAULT.

CREATE TABLE IF NOT EXISTS public.studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NULL REFERENCES public.authors (id) ON DELETE RESTRICT,
  guest_session_id uuid NULL,
  name text NOT NULL DEFAULT 'project',
  project_data jsonb NOT NULL DEFAULT
    '{"schemaVersion":2,"studioVersion":1,"editor":{"currentTime":0},"slots":[],"tracks":[]}'::jsonb,
  schema_version smallint NOT NULL DEFAULT 2,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT studio_projects_schema_version_check CHECK (schema_version = 2)
);

-- Applied schema from 20260809150000 + later columns. id has NO DEFAULT.
CREATE TABLE IF NOT EXISTS public.studio_project_assets (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  duration_seconds numeric NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  upload_state text NOT NULL DEFAULT 'reserved',
  upload_state_changed_at timestamptz NOT NULL DEFAULT now(),
  pending_source_id uuid NULL,
  pending_storage_path text NULL,
  pending_size_bytes bigint NULL,
  pending_original_name text NULL,
  pending_mime_type text NULL,
  pending_reserved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT studio_project_assets_source_type_check
    CHECK (source_type IN ('upload', 'recording')),
  CONSTRAINT studio_project_assets_path_check
    CHECK (
      storage_path ~ '^studio/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$'
      OR storage_path ~ '^studio/guest/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$'
    ),
  CONSTRAINT studio_project_assets_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 314572800)
);

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
