-- Content-free revision signal for public surfaces.
--
-- Browsers subscribe to this small row. Realtime carries only
-- scope / revision / updated_at. Product rows stay out of the publication.
-- public.practices keeps its default replica identity.
--
-- A trigger bumps the row when a practice change can affect a public
-- surface: first public publish, scheduled go-live, unpublish, removal of
-- a public product, listed/unlisted transitions into or out of the public
-- surface, and field changes (title, cover, price, and the rest of the
-- row) on a product that is already public. Topic links bump the same row
-- when the parent is on that surface.
--
-- The revision row stays readable after the product itself no longer
-- passes public SELECT, so the signal still arrives.
-- This migration is not applied to production by the live-sync change.

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_content_revision (
  scope text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_content_revision_scope_check
    CHECK (scope IN ('practices', 'catalog'))
);

COMMENT ON TABLE public.public_content_revision IS
  'Invalidation counter for public surfaces. No product id, slug, title, cover, price, or visibility.';

ALTER TABLE public.public_content_revision REPLICA IDENTITY DEFAULT;

INSERT INTO public.public_content_revision (scope, revision)
VALUES ('practices', 0)
ON CONFLICT (scope) DO NOTHING;

ALTER TABLE public.public_content_revision ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_content_revision FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_content_revision TO anon, authenticated;

DROP POLICY IF EXISTS public_content_revision_select ON public.public_content_revision;
CREATE POLICY public_content_revision_select
  ON public.public_content_revision
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.practice_affects_public_surface(
  p_status text,
  p_scheduled_publish_at timestamptz,
  p_published_at timestamptz,
  p_deleted_at timestamptz,
  p_catalog_visibility text,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_deleted_at IS NULL
    AND p_catalog_visibility IN ('listed', 'unlisted')
    AND public.practice_is_publicly_available(
      p_status,
      p_scheduled_publish_at,
      p_published_at,
      p_at
    );
$$;

COMMENT ON FUNCTION public.practice_affects_public_surface(text, timestamptz, timestamptz, timestamptz, text, timestamptz) IS
  'True when a practice row is on a public surface (listed or unlisted and publicly available).';

REVOKE ALL ON FUNCTION public.practice_affects_public_surface(text, timestamptz, timestamptz, timestamptz, text, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_public_content_revision(p_scope text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.public_content_revision
  SET revision = revision + 1,
      updated_at = now()
  WHERE scope = p_scope;
END;
$$;

COMMENT ON FUNCTION public.touch_public_content_revision(text) IS
  'Increments the content-free revision row. Does not write product fields.';

REVOKE ALL ON FUNCTION public.touch_public_content_revision(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bump_public_content_revision_from_practice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_public boolean := false;
  v_new_public boolean := false;
BEGIN
  IF TG_OP IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_public := public.practice_affects_public_surface(
      OLD.status,
      OLD.scheduled_publish_at,
      OLD.published_at,
      OLD.deleted_at,
      OLD.catalog_visibility
    );
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_new_public := public.practice_affects_public_surface(
      NEW.status,
      NEW.scheduled_publish_at,
      NEW.published_at,
      NEW.deleted_at,
      NEW.catalog_visibility
    );
  END IF;

  IF v_old_public OR v_new_public THEN
    PERFORM public.touch_public_content_revision('practices');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bump_public_content_revision_from_practice() IS
  'Bumps the public revision when the previous or next practice row is on a public surface. Unpublish still bumps because the previous row counts.';

REVOKE ALL ON FUNCTION public.bump_public_content_revision_from_practice() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_public_content_revision_from_practice() TO authenticated, service_role;

DROP TRIGGER IF EXISTS practices_bump_public_content_revision ON public.practices;
CREATE TRIGGER practices_bump_public_content_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_practice();

CREATE OR REPLACE FUNCTION public.bump_public_content_revision_from_practice_topic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid;
  v_public boolean := false;
BEGIN
  IF TG_OP IS NULL THEN
    RETURN NULL;
  END IF;

  v_practice_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.practice_id
    ELSE NEW.practice_id
  END;

  SELECT public.practice_affects_public_surface(
    p.status,
    p.scheduled_publish_at,
    p.published_at,
    p.deleted_at,
    p.catalog_visibility
  )
  INTO v_public
  FROM public.practices AS p
  WHERE p.id = v_practice_id;

  IF COALESCE(v_public, false) THEN
    PERFORM public.touch_public_content_revision('practices');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bump_public_content_revision_from_practice_topic() IS
  'Bumps the same content-free revision when topic links change on a public product. The practice id is not written to the revision row.';

REVOKE ALL ON FUNCTION public.bump_public_content_revision_from_practice_topic() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_public_content_revision_from_practice_topic() TO authenticated, service_role;

DROP TRIGGER IF EXISTS practice_topics_bump_public_content_revision ON public.practice_topics;
CREATE TRIGGER practice_topics_bump_public_content_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.practice_topics
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_practice_topic();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'public_content_revision'
  )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.public_content_revision;
  END IF;
END
$$;

COMMIT;
