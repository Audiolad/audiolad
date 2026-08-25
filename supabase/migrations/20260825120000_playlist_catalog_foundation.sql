BEGIN;

-- ---------------------------------------------------------------------------
-- Playlist catalog foundation (Stage 1)
--
-- Playlists stay a separate entity (class=playlist). Not a product kind.
-- Adds listing aggregates on existing public.playlists and a dedicated
-- playlist_saves table, separate from library_saves.
-- Does not DROP playlists / playlist_items. Does not list existing rows.
-- Save ≠ listen entitlement.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Listing aggregates on playlists
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS items_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS saves_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS listed_at timestamptz;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_items_count_non_negative_check;

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_items_count_non_negative_check
  CHECK (items_count >= 0);

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_duration_seconds_non_negative_check;

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_duration_seconds_non_negative_check
  CHECK (duration_seconds >= 0);

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_saves_count_non_negative_check;

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_saves_count_non_negative_check
  CHECK (saves_count >= 0);

CREATE INDEX IF NOT EXISTS playlists_listed_at_idx
  ON public.playlists (listed_at DESC, id DESC)
  WHERE listed_at IS NOT NULL;

COMMENT ON COLUMN public.playlists.items_count IS
  'Denormalized playlist_items count for the playlist catalog listing. Not entitlement.';

COMMENT ON COLUMN public.playlists.duration_seconds IS
  'Denormalized sum of item durations in seconds. Track rows use audio_items.duration_seconds; whole-product rows sum that product''s audio_items.';

COMMENT ON COLUMN public.playlists.saves_count IS
  'Denormalized count of playlist_saves. Save is a bookmark, not listen access.';

COMMENT ON COLUMN public.playlists.listed_at IS
  'When set, the playlist may appear on /playlists/catalog. NULL = not listed. Independent from visibility/published_at; listing query still requires a public published slug.';

-- ---------------------------------------------------------------------------
-- 2. playlist_saves (separate from library_saves)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.playlist_saves (
  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,
  playlist_id uuid NOT NULL
    REFERENCES public.playlists (id)
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT playlist_saves_user_playlist_unique
    UNIQUE (user_id, playlist_id)
);

CREATE INDEX IF NOT EXISTS playlist_saves_user_id_created_at_idx
  ON public.playlist_saves (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS playlist_saves_playlist_id_idx
  ON public.playlist_saves (playlist_id);

COMMENT ON TABLE public.playlist_saves IS
  'User bookmark of a playlist. Separate from library_saves. Save is not listen entitlement and does not grant access to playlist items.';

COMMENT ON COLUMN public.playlist_saves.user_id IS
  'Owner of the save. RLS: a user may only see and mutate their own rows.';

COMMENT ON COLUMN public.playlist_saves.playlist_id IS
  'Saved playlist. Does not grant playback rights to contained products.';

ALTER TABLE public.playlist_saves ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.playlist_saves FROM PUBLIC;
REVOKE ALL ON TABLE public.playlist_saves FROM anon;
REVOKE ALL ON TABLE public.playlist_saves FROM authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.playlist_saves TO authenticated;
GRANT ALL ON TABLE public.playlist_saves TO service_role;

DROP POLICY IF EXISTS "Users can view own playlist saves" ON public.playlist_saves;
CREATE POLICY "Users can view own playlist saves"
  ON public.playlist_saves
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own playlist saves" ON public.playlist_saves;
CREATE POLICY "Users can insert own playlist saves"
  ON public.playlist_saves
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own playlist saves" ON public.playlist_saves;
CREATE POLICY "Users can delete own playlist saves"
  ON public.playlist_saves
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Maintain listing aggregates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_playlist_listing_aggregates(
  p_playlist_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_items_count integer := 0;
  v_duration_seconds integer := 0;
BEGIN
  IF p_playlist_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_items_count
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = p_playlist_id;

  SELECT COALESCE(sum(item_seconds), 0)::integer
  INTO v_duration_seconds
  FROM (
    SELECT
      CASE
        WHEN pi.audio_item_id IS NOT NULL THEN COALESCE(track.duration_seconds, 0)
        ELSE COALESCE(product.total_seconds, 0)
      END AS item_seconds
    FROM public.playlist_items AS pi
    LEFT JOIN public.audio_items AS track
      ON track.id = pi.audio_item_id
    LEFT JOIN LATERAL (
      SELECT sum(COALESCE(ai.duration_seconds, 0))::integer AS total_seconds
      FROM public.audio_items AS ai
      WHERE ai.practice_id = pi.practice_id
    ) AS product ON pi.audio_item_id IS NULL
    WHERE pi.playlist_id = p_playlist_id
  ) AS durations;

  UPDATE public.playlists
  SET
    items_count = COALESCE(v_items_count, 0),
    duration_seconds = COALESCE(v_duration_seconds, 0)
  WHERE id = p_playlist_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_playlist_listing_aggregates(uuid) IS
  'Rewrites playlists.items_count and playlists.duration_seconds from playlist_items. Does not change updated_at or entitlement.';

REVOKE ALL ON FUNCTION public.refresh_playlist_listing_aggregates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_playlist_listing_aggregates(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_playlist_listing_aggregates(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_playlist_listing_aggregates(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.touch_playlist_listing_aggregates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_playlist_listing_aggregates(OLD.playlist_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.playlist_id IS DISTINCT FROM OLD.playlist_id THEN
    PERFORM public.refresh_playlist_listing_aggregates(OLD.playlist_id);
  END IF;

  PERFORM public.refresh_playlist_listing_aggregates(NEW.playlist_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlist_items_refresh_listing_aggregates
  ON public.playlist_items;

CREATE TRIGGER playlist_items_refresh_listing_aggregates
  AFTER INSERT OR UPDATE OF playlist_id, practice_id, audio_item_id OR DELETE
  ON public.playlist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_playlist_listing_aggregates();

CREATE OR REPLACE FUNCTION public.touch_playlist_saves_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.playlists
    SET saves_count = saves_count + 1
    WHERE id = NEW.playlist_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.playlists
    SET saves_count = GREATEST(saves_count - 1, 0)
    WHERE id = OLD.playlist_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS playlist_saves_touch_saves_count
  ON public.playlist_saves;

CREATE TRIGGER playlist_saves_touch_saves_count
  AFTER INSERT OR DELETE
  ON public.playlist_saves
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_playlist_saves_count();

CREATE OR REPLACE FUNCTION public.clear_playlist_listed_at_when_unlisted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM 'public'
    OR NEW.published_at IS NULL
    OR NEW.slug IS NULL
    OR btrim(NEW.slug) = ''
  THEN
    NEW.listed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlists_clear_listed_at_when_unlisted
  ON public.playlists;

CREATE TRIGGER playlists_clear_listed_at_when_unlisted
  BEFORE INSERT OR UPDATE OF visibility, published_at, slug, listed_at
  ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_playlist_listed_at_when_unlisted();

-- Existing public playlists stay unlisted. Only items/duration are backfilled.
SELECT public.refresh_playlist_listing_aggregates(p.id)
FROM public.playlists AS p;

COMMIT;
