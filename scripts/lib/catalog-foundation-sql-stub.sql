-- Minimal schema for isolated library_saves + preview window tests.
-- Never apply to production.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'track',
  is_preview boolean NOT NULL DEFAULT false
);
