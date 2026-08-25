BEGIN;

-- One-shot: stamp listed_at for already-published platform editorial playlists.
-- User-owned rows stay unlisted. Existing listed_at values are kept.

UPDATE public.playlists
SET listed_at = published_at
WHERE owner_type = 'platform'
  AND is_editorial IS TRUE
  AND visibility = 'public'
  AND published_at IS NOT NULL
  AND slug IS NOT NULL
  AND btrim(slug) <> ''
  AND listed_at IS NULL;

COMMIT;
