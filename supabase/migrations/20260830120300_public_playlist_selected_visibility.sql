BEGIN;

-- Public playlists are listed-only discovery. In particular, a public
-- playlist item must not disclose the UUID or existence of a selected_users
-- product to a viewer without practice visibility.
--
-- Owner/editor policies remain separate and continue to permit playlist
-- management regardless of the product's public catalog visibility.
DROP POLICY IF EXISTS "Anyone can select public playlist items"
  ON public.playlist_items;
CREATE POLICY "Anyone can select public playlist items"
  ON public.playlist_items
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.playlists AS pl
      WHERE pl.id = playlist_items.playlist_id
        AND pl.visibility = 'public'
        AND pl.published_at IS NOT NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.practices AS p
      WHERE p.id = playlist_items.practice_id
        AND p.status = 'published'
        AND p.deleted_at IS NULL
        AND p.catalog_visibility = 'listed'
    )
  );

COMMENT ON POLICY "Anyone can select public playlist items"
  ON public.playlist_items IS
  'Public playlist discovery exposes listed published products only; selected_users and unlisted product IDs stay private.';

COMMIT;
