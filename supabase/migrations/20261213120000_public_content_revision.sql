-- Content-free revision signal for public surfaces.
--
-- Browsers subscribe to this small row. Realtime carries only
-- scope / revision / updated_at. Product rows stay out of the publication.
-- public.practices keeps its default replica identity.
--
-- Triggers bump the row when public catalog data changes: the practice
-- row itself, topic links, price promotions, gallery slides, audio items,
-- an author who still has a public product, or a topic still used by one.
-- A child change bumps only when that practice is on the public surface.
-- DELETE reads the previous relation id. The revision row stores none of
-- those ids. Visitor-specific countdown starts are not a source.
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

CREATE OR REPLACE FUNCTION public.bump_public_content_revision_for_practice(p_practice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_public boolean := false;
BEGIN
  IF p_practice_id IS NULL THEN
    RETURN;
  END IF;

  SELECT public.practice_affects_public_surface(
    p.status,
    p.scheduled_publish_at,
    p.published_at,
    p.deleted_at,
    p.catalog_visibility
  )
  INTO v_public
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF COALESCE(v_public, false) THEN
    PERFORM public.touch_public_content_revision('practices');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.bump_public_content_revision_for_practice(uuid) IS
  'Bumps the content-free revision when that practice is on a public surface. Does not write the practice id.';

REVOKE ALL ON FUNCTION public.bump_public_content_revision_for_practice(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bump_public_content_revision_from_practice_relation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_column text := COALESCE(TG_ARGV[0], 'practice_id');
  v_practice_id uuid;
BEGIN
  IF TG_OP IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_practice_id := (to_jsonb(OLD) ->> v_column)::uuid;
  ELSE
    v_practice_id := (to_jsonb(NEW) ->> v_column)::uuid;
  END IF;

  PERFORM public.bump_public_content_revision_for_practice(v_practice_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bump_public_content_revision_from_practice_relation() IS
  'Bumps revision from a child row. DELETE uses the previous relation id. That id is not stored on the revision row.';

REVOKE ALL ON FUNCTION public.bump_public_content_revision_from_practice_relation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_public_content_revision_from_practice_relation() TO authenticated, service_role;

DROP TRIGGER IF EXISTS practice_topics_bump_public_content_revision ON public.practice_topics;
CREATE TRIGGER practice_topics_bump_public_content_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.practice_topics
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_practice_relation('practice_id');

DROP TRIGGER IF EXISTS practice_price_promotions_bump_public_content_revision ON public.practice_price_promotions;
CREATE TRIGGER practice_price_promotions_bump_public_content_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.practice_price_promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_practice_relation('practice_id');

DROP TRIGGER IF EXISTS publication_gallery_slides_bump_public_content_revision ON public.publication_gallery_slides;
CREATE TRIGGER publication_gallery_slides_bump_public_content_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.publication_gallery_slides
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_practice_relation('publication_id');

DROP TRIGGER IF EXISTS audio_items_bump_public_content_revision ON public.audio_items;
CREATE TRIGGER audio_items_bump_public_content_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.audio_items
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_practice_relation('practice_id');

CREATE OR REPLACE FUNCTION public.bump_public_content_revision_from_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_author_id uuid;
  v_public boolean := false;
BEGIN
  IF TG_OP IS NULL THEN
    RETURN NULL;
  END IF;

  v_author_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.id
    ELSE NEW.id
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.author_id = v_author_id
      AND public.practice_affects_public_surface(
        p.status,
        p.scheduled_publish_at,
        p.published_at,
        p.deleted_at,
        p.catalog_visibility
      )
  )
  INTO v_public;

  IF COALESCE(v_public, false) THEN
    PERFORM public.touch_public_content_revision('practices');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bump_public_content_revision_from_author() IS
  'Bumps revision when an author with at least one public product changes. DELETE uses the previous author id, which is not stored.';

REVOKE ALL ON FUNCTION public.bump_public_content_revision_from_author() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_public_content_revision_from_author() TO authenticated, service_role;

DROP TRIGGER IF EXISTS authors_bump_public_content_revision_write ON public.authors;
CREATE TRIGGER authors_bump_public_content_revision_write
  AFTER INSERT OR UPDATE ON public.authors
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_author();

DROP TRIGGER IF EXISTS authors_bump_public_content_revision_delete ON public.authors;
CREATE TRIGGER authors_bump_public_content_revision_delete
  BEFORE DELETE ON public.authors
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_author();

CREATE OR REPLACE FUNCTION public.bump_public_content_revision_from_topic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_topic_id uuid;
  v_public boolean := false;
BEGIN
  IF TG_OP IS NULL THEN
    RETURN NULL;
  END IF;

  v_topic_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.id
    ELSE NEW.id
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.practice_topics AS pt
    JOIN public.practices AS p ON p.id = pt.practice_id
    WHERE pt.topic_id = v_topic_id
      AND public.practice_affects_public_surface(
        p.status,
        p.scheduled_publish_at,
        p.published_at,
        p.deleted_at,
        p.catalog_visibility
      )
  )
  INTO v_public;

  IF COALESCE(v_public, false) THEN
    PERFORM public.touch_public_content_revision('practices');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bump_public_content_revision_from_topic() IS
  'Bumps revision when a topic used by at least one public product changes. DELETE uses the previous topic id, which is not stored.';

REVOKE ALL ON FUNCTION public.bump_public_content_revision_from_topic() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_public_content_revision_from_topic() TO authenticated, service_role;

DROP TRIGGER IF EXISTS topics_bump_public_content_revision_write ON public.topics;
CREATE TRIGGER topics_bump_public_content_revision_write
  AFTER INSERT OR UPDATE ON public.topics
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_topic();

DROP TRIGGER IF EXISTS topics_bump_public_content_revision_delete ON public.topics;
CREATE TRIGGER topics_bump_public_content_revision_delete
  BEFORE DELETE ON public.topics
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_public_content_revision_from_topic();

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
