-- Per-track cover artwork for audio products.
-- Idempotent. Safe defaults preserve existing behavior.

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS use_shared_cover boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.practices.use_shared_cover IS
  'When true, playback uses practices.cover_url for every track. When false, audio_items.cover_url may override per track.';

ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS cover_url text;

COMMENT ON COLUMN public.audio_items.cover_url IS
  'Optional per-track cover. Full public Supabase URL in practice-covers bucket. Used only when practices.use_shared_cover is false.';
