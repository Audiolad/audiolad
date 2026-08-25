-- Playlist catalog popular keyset index (Stage 5A.2).
-- Does not change saves_count trigger, listing columns, or RLS.

CREATE INDEX IF NOT EXISTS playlists_saves_count_listed_at_idx
  ON public.playlists (saves_count DESC, listed_at DESC, id DESC)
  WHERE listed_at IS NOT NULL;

COMMENT ON INDEX public.playlists_saves_count_listed_at_idx IS
  'Playlist catalog popular keyset: saves_count DESC, listed_at DESC, id DESC. Listed rows only.';
