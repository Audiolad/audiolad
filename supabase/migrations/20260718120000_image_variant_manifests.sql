-- Unified image variant manifests (nullable JSONB, legacy URL columns retained).

DO $$
BEGIN
  IF to_regclass('public.practices') IS NULL THEN
    RAISE EXCEPTION 'Required table public.practices does not exist';
  END IF;
END;
$$;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS cover_image jsonb;

COMMENT ON COLUMN public.practices.cover_image IS
  'Optimized cover variants manifest (ImageManifest). Legacy cover_url remains fallback.';

ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS cover_image jsonb;

COMMENT ON COLUMN public.audio_items.cover_image IS
  'Per-track optimized cover manifest when use_shared_cover is false.';

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS avatar_image jsonb,
  ADD COLUMN IF NOT EXISTS banner_image jsonb;

COMMENT ON COLUMN public.authors.avatar_image IS
  'Optimized author avatar variants manifest.';
COMMENT ON COLUMN public.authors.banner_image IS
  'Optimized author banner variants manifest.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_image jsonb;

COMMENT ON COLUMN public.profiles.avatar_image IS
  'Optimized user avatar variants manifest (private bucket paths).';

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS cover_image jsonb;

COMMENT ON COLUMN public.playlists.cover_image IS
  'Optimized playlist cover variants manifest.';
