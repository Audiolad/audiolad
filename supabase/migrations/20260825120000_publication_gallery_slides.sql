BEGIN;

-- ---------------------------------------------------------------------------
-- Phase 1A: publication gallery slides (one table for all publication classes)
--
-- publication_id = practices.id. No PracticeGallery / CourseGallery tables.
-- Extra 1:1 slides for the catalog card swipe. Cover stays on practices.
-- Storage reuses practice-covers: practices/{id}/gallery/{slideId}/...
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.publication_gallery_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  publication_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  image_url text NOT NULL,
  image_manifest jsonb NOT NULL,

  position integer NOT NULL,
  alt text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT publication_gallery_slides_position_check
    CHECK (position >= 0 AND position < 30),

  CONSTRAINT publication_gallery_slides_image_url_check
    CHECK (char_length(btrim(image_url)) > 0),

  CONSTRAINT publication_gallery_slides_alt_check
    CHECK (
      alt IS NULL
      OR (
        char_length(alt) <= 200
        AND alt !~ E'[\r\n]'
      )
    )
);

CREATE INDEX IF NOT EXISTS publication_gallery_slides_publication_position_idx
  ON public.publication_gallery_slides (publication_id, position, id);

COMMENT ON TABLE public.publication_gallery_slides IS
  'Ordered 1:1 showcase slides for a publication (practices.id). One table for every class. Not a content type.';

COMMENT ON COLUMN public.publication_gallery_slides.publication_id IS
  'Publication id = practices.id. Gallery attaches to the publication row, not to practice/course/release/post as separate tables.';

COMMENT ON COLUMN public.publication_gallery_slides.image_url IS
  'Public URL in practice-covers, same pattern as practices.cover_url.';

COMMENT ON COLUMN public.publication_gallery_slides.image_manifest IS
  'ImageManifest JSON, same shape as practices.cover_image.';

COMMENT ON COLUMN public.publication_gallery_slides.position IS
  'Display order, 0-based. Catalog reads ordered by position, then id. Cap 30 slides.';

CREATE OR REPLACE FUNCTION public.set_publication_gallery_slides_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS publication_gallery_slides_set_updated_at
  ON public.publication_gallery_slides;
CREATE TRIGGER publication_gallery_slides_set_updated_at
  BEFORE UPDATE ON public.publication_gallery_slides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_publication_gallery_slides_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_publication_gallery_slide_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  slide_count integer;
BEGIN
  SELECT count(*)
    INTO slide_count
  FROM public.publication_gallery_slides
  WHERE publication_id = NEW.publication_id;

  IF slide_count >= 30 THEN
    RAISE EXCEPTION 'publication_gallery_slide_limit_exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS publication_gallery_slides_enforce_limit
  ON public.publication_gallery_slides;
CREATE TRIGGER publication_gallery_slides_enforce_limit
  BEFORE INSERT ON public.publication_gallery_slides
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_publication_gallery_slide_limit();

ALTER TABLE public.publication_gallery_slides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.publication_gallery_slides FROM PUBLIC;
REVOKE ALL ON TABLE public.publication_gallery_slides FROM anon;
REVOKE ALL ON TABLE public.publication_gallery_slides FROM authenticated;

GRANT SELECT ON TABLE public.publication_gallery_slides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.publication_gallery_slides TO authenticated;
GRANT ALL ON TABLE public.publication_gallery_slides TO service_role;

DROP POLICY IF EXISTS "Public can read published publication gallery slides"
  ON public.publication_gallery_slides;
CREATE POLICY "Public can read published publication gallery slides"
  ON public.publication_gallery_slides
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      WHERE p.id = publication_gallery_slides.publication_id
        AND p.status = 'published'
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can read publication gallery slides"
  ON public.publication_gallery_slides;
CREATE POLICY "Author members can read publication gallery slides"
  ON public.publication_gallery_slides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_gallery_slides.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can insert publication gallery slides"
  ON public.publication_gallery_slides;
CREATE POLICY "Author members can insert publication gallery slides"
  ON public.publication_gallery_slides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_gallery_slides.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can update publication gallery slides"
  ON public.publication_gallery_slides;
CREATE POLICY "Author members can update publication gallery slides"
  ON public.publication_gallery_slides
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_gallery_slides.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_gallery_slides.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can delete publication gallery slides"
  ON public.publication_gallery_slides;
CREATE POLICY "Author members can delete publication gallery slides"
  ON public.publication_gallery_slides
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_gallery_slides.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

COMMIT;
