-- t1331u (Sergey 09.11.2026, widget t1332s9582): the hall device keeps the next 10 queue tracks
-- on the device for a short internet outage (technical buffer, at most 2 hours, never past the
-- access end). The owner sees «В запасе N треков на случай пропадания интернета».
-- Additive and optional: the application reads and writes the column only when it exists
-- (42703 / PGRST204 fallback), so code and migration can ship in either order.
BEGIN;

ALTER TABLE public.business_player_now_playing
  ADD COLUMN IF NOT EXISTS buffered_count smallint NULL
    CHECK (buffered_count IS NULL OR (buffered_count >= 0 AND buffered_count <= 50));

COMMENT ON COLUMN public.business_player_now_playing.buffered_count IS
  'audiolad:business-player-live; next queue tracks the hall device holds for an outage (t1331u). Not Proof of Play.';

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Rollback (in a transaction):
-- ALTER TABLE public.business_player_now_playing DROP COLUMN IF EXISTS buffered_count;
-- NOTIFY pgrst, 'reload schema'; then COMMIT.
