-- Commentability follows product type, not the catalog shelf.
-- practices.catalog_section = 'music' is a shelf. It is not product_kind.
-- Older published practices on that shelf were hidden from the review form.
-- This replaces the function only. It does not UPDATE, INSERT, or DELETE
-- any practice row.
--
-- Rollback:
--   Recreate public.practice_accepts_listener_comments(uuid) from
--   20270124140000_practice_listener_comments.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.practice_accepts_listener_comments(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = p_practice_id
      AND p.deleted_at IS NULL
      AND p.status = 'published'
      AND COALESCE(p.product_kind, 'practice') = 'practice'
      AND (
        (p.published_at IS NOT NULL AND p.published_at <= now())
        OR p.scheduled_publish_at IS NULL
        OR p.scheduled_publish_at <= now()
      )
  );
$$;

COMMENT ON FUNCTION public.practice_accepts_listener_comments(uuid) IS
  'True for a publicly available practice (product_kind practice, including a null kind). The catalog shelf is ignored. Music and audio_post are false.';

REVOKE ALL ON FUNCTION public.practice_accepts_listener_comments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_accepts_listener_comments(uuid) TO anon, authenticated, service_role;

COMMIT;
