-- Minimal schema for isolated playlist catalog foundation tests.
-- Never apply to production.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid
$$;

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  duration_seconds integer
);

CREATE TABLE IF NOT EXISTS public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'playlist',
  visibility text NOT NULL DEFAULT 'private',
  slug text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  audio_item_id uuid REFERENCES public.audio_items (id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1
);
