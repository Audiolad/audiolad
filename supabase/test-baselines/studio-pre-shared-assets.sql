-- TEST-ONLY STUDIO BASELINE
-- DO NOT APPLY TO PRODUCTION.
-- Canonical sources: baseline/0001_core_schema.sql,
-- 20260714180000_unified_audio_product_foundation.sql (author_members only),
-- 20260809150000_studio_persistence_v1.sql,
-- 20260812180000_studio_render_export_v2.sql,
-- 20260817190000_studio_guest_mode.sql, 20260819183000_studio_guest_handoff.sql.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
  description text, avatar_url text, created_at timestamptz DEFAULT now(), access_status text NOT NULL DEFAULT 'free'
);
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email text, full_name text,
  role text NOT NULL DEFAULT 'listener', created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.author_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_members_role_check CHECK (role IN ('owner','editor')),
  CONSTRAINT author_members_author_user_unique UNIQUE(author_id,user_id)
);
CREATE INDEX IF NOT EXISTS author_members_author_id_idx ON public.author_members(author_id);
CREATE INDEX IF NOT EXISTS author_members_user_id_idx ON public.author_members(user_id);
CREATE TABLE public.studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid NULL REFERENCES public.authors(id) ON DELETE RESTRICT,
  guest_session_id uuid NULL, name text NOT NULL, project_data jsonb NOT NULL DEFAULT '{"schemaVersion":2,"studioVersion":1,"editor":{"currentTime":0},"slots":[],"tracks":[]}'::jsonb,
  schema_version smallint NOT NULL DEFAULT 2, revision integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_opened_at timestamptz NULL, deleted_at timestamptz NULL,
  CONSTRAINT studio_projects_name_length_check CHECK(char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT studio_projects_schema_version_check CHECK(schema_version=2), CONSTRAINT studio_projects_project_data_object_check CHECK(jsonb_typeof(project_data)='object'),
  CONSTRAINT studio_projects_revision_check CHECK(revision>0), CONSTRAINT studio_projects_status_check CHECK(status IN('active','deleted')),
  CONSTRAINT studio_projects_deleted_state_check CHECK((status='active' AND deleted_at IS NULL) OR(status='deleted' AND deleted_at IS NOT NULL)),
  CONSTRAINT studio_projects_owner_xor_check CHECK((author_id IS NOT NULL AND guest_session_id IS NULL) OR(author_id IS NULL AND guest_session_id IS NOT NULL))
);
CREATE TABLE public.studio_guest_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, free_render_consumed_at timestamptz NULL,
 free_render_project_id uuid NULL, free_render_job_id uuid NULL, CONSTRAINT studio_guest_sessions_token_hash_len_check CHECK(char_length(token_hash)=64)
);
ALTER TABLE public.studio_projects ADD CONSTRAINT studio_projects_guest_session_id_fkey FOREIGN KEY(guest_session_id) REFERENCES public.studio_guest_sessions(id) ON DELETE RESTRICT;
CREATE TABLE public.studio_project_assets (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.studio_projects(id) ON DELETE RESTRICT, storage_path text NOT NULL UNIQUE,
 original_name text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL, duration_seconds numeric NULL, source_type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz NULL,
 CONSTRAINT studio_project_assets_size_check CHECK(size_bytes>0 AND size_bytes<=209715200),
 CONSTRAINT studio_project_assets_duration_check CHECK(duration_seconds IS NULL OR duration_seconds>=0),
 CONSTRAINT studio_project_assets_source_type_check CHECK(source_type IN('upload','recording')),
 CONSTRAINT studio_project_assets_path_check CHECK(storage_path ~ '^studio/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$' OR storage_path ~ '^studio/guest/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$')
);
CREATE TABLE public.studio_render_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.studio_projects(id) ON DELETE RESTRICT,
 author_id uuid NULL REFERENCES public.authors(id) ON DELETE RESTRICT, guest_session_id uuid NULL REFERENCES public.studio_guest_sessions(id) ON DELETE RESTRICT,
 project_revision integer NOT NULL, project_snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'queued', output_storage_path text NULL,
 error_code text NULL,error_message_safe text NULL,attempt_count integer NOT NULL DEFAULT 0,lease_expires_at timestamptz NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz NULL,completed_at timestamptz NULL,
 CONSTRAINT studio_render_jobs_owner_xor_check CHECK((author_id IS NOT NULL AND guest_session_id IS NULL) OR(author_id IS NULL AND guest_session_id IS NOT NULL))
);
CREATE TABLE public.studio_guest_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token_hash text NOT NULL UNIQUE,guest_session_id uuid NOT NULL REFERENCES public.studio_guest_sessions(id) ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES public.studio_projects(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,used_at timestamptz NULL
);
CREATE TABLE public.audiobook_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE RESTRICT,
 title text NOT NULL, book_author_name text NULL, narrator_name text NULL, status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT audiobook_projects_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
 CONSTRAINT audiobook_projects_status_check CHECK (status = 'active')
);
CREATE TABLE public.audiobook_chapters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.audiobook_projects(id) ON DELETE CASCADE,
 position integer NOT NULL, title text NOT NULL, status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT audiobook_chapters_position_check CHECK (position >= 1),
 CONSTRAINT audiobook_chapters_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
 CONSTRAINT audiobook_chapters_status_check CHECK (status = 'draft'),
 CONSTRAINT audiobook_chapters_project_position_key UNIQUE (project_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE TABLE public.audiobook_fragments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chapter_id uuid NOT NULL REFERENCES public.audiobook_chapters(id) ON DELETE CASCADE,
 position integer NOT NULL, storage_path text NOT NULL UNIQUE, original_name text NOT NULL, mime_type text NOT NULL,
 size_bytes bigint NOT NULL, duration_seconds numeric NULL, source_type text NOT NULL, status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT audiobook_fragments_position_check CHECK (position >= 1),
 CONSTRAINT audiobook_fragments_size_check CHECK (size_bytes > 0 AND size_bytes <= 209715200),
 CONSTRAINT audiobook_fragments_mime_check CHECK (mime_type IN ('audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac')),
 CONSTRAINT audiobook_fragments_source_check CHECK (source_type IN ('upload', 'recording')),
 CONSTRAINT audiobook_fragments_status_check CHECK (status IN ('uploading','active')),
 CONSTRAINT audiobook_fragments_chapter_position_key UNIQUE (chapter_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX studio_project_assets_active_project_idx ON public.studio_project_assets(project_id,created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX studio_projects_guest_active_updated_idx ON public.studio_projects(guest_session_id,updated_at DESC) WHERE status='active' AND guest_session_id IS NOT NULL;
ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_project_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_guest_sessions ENABLE ROW LEVEL SECURITY;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('studio-draft-assets','studio-draft-assets',false,209715200,ARRAY['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/aac','audio/webm']::text[]),
 ('studio-renders','studio-renders',false,536870912,ARRAY['audio/mpeg']::text[]),
 ('audiobook-fragments','audiobook-fragments',false,209715200,ARRAY['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac']::text[]) ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.studio_author_member(p_author_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.author_members am WHERE am.author_id=p_author_id AND am.user_id=auth.uid() AND am.role IN('owner','editor')) $$;
CREATE POLICY "Studio members can read projects" ON public.studio_projects FOR SELECT TO authenticated USING(public.studio_author_member(author_id));
CREATE POLICY "Studio members can read project assets" ON public.studio_project_assets FOR SELECT TO authenticated USING(deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.studio_projects sp WHERE sp.id=studio_project_assets.project_id AND sp.status='active' AND public.studio_author_member(sp.author_id)));
COMMIT;
