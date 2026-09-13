-- AudioLad Classics catalog foundation.
-- Future canonical URL: /classics/{composerSlug}/{workSlug}.
-- Published slugs are stable; a rename requires a future redirect migration.

CREATE TABLE public.classical_composers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name_ru text NOT NULL,
  name_original text,
  birth_year smallint,
  death_year smallint,
  country text,
  period text,
  bio text,
  portrait_image jsonb,
  seo_title text,
  seo_description text,
  editorial_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classical_composers_slug_key UNIQUE (slug),
  CONSTRAINT classical_composers_slug_format_check CHECK (
    slug = lower(slug)
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT classical_composers_editorial_status_check CHECK (
    editorial_status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT classical_composers_birth_year_range_check CHECK (
    birth_year IS NULL OR birth_year BETWEEN 1 AND 2100
  ),
  CONSTRAINT classical_composers_death_year_range_check CHECK (
    death_year IS NULL OR death_year BETWEEN 1 AND 2100
  ),
  CONSTRAINT classical_composers_year_order_check CHECK (
    death_year IS NULL OR birth_year IS NULL OR death_year >= birth_year
  ),
  CONSTRAINT classical_composers_seo_title_length_check CHECK (
    seo_title IS NULL OR char_length(seo_title) <= 140
  ),
  CONSTRAINT classical_composers_seo_description_length_check CHECK (
    seo_description IS NULL OR char_length(seo_description) <= 300
  )
);

CREATE INDEX classical_composers_published_name_ru_id_idx
  ON public.classical_composers (name_ru, id)
  WHERE editorial_status = 'published';

CREATE TABLE public.classical_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  composer_id uuid NOT NULL REFERENCES public.classical_composers(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  title_ru text NOT NULL,
  title_original text,
  common_title text,
  catalogue_number text,
  musical_key text,
  composition_year smallint,
  form text,
  instrumentation text,
  description text,
  seo_title text,
  seo_description text,
  editorial_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classical_works_composer_slug_key UNIQUE (composer_id, slug),
  CONSTRAINT classical_works_slug_format_check CHECK (
    slug = lower(slug)
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT classical_works_editorial_status_check CHECK (
    editorial_status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT classical_works_composition_year_range_check CHECK (
    composition_year IS NULL OR composition_year BETWEEN 1 AND 2100
  ),
  CONSTRAINT classical_works_seo_title_length_check CHECK (
    seo_title IS NULL OR char_length(seo_title) <= 140
  ),
  CONSTRAINT classical_works_seo_description_length_check CHECK (
    seo_description IS NULL OR char_length(seo_description) <= 300
  )
);

CREATE INDEX classical_works_composer_title_ru_id_idx
  ON public.classical_works (composer_id, title_ru, id);

CREATE TABLE public.classical_work_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classical_work_id uuid NOT NULL REFERENCES public.classical_works(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classical_work_practices_work_practice_key UNIQUE (classical_work_id, practice_id)
);

CREATE UNIQUE INDEX classical_work_practices_one_primary_per_work_idx
  ON public.classical_work_practices (classical_work_id)
  WHERE is_primary;

CREATE INDEX classical_work_practices_practice_id_idx
  ON public.classical_work_practices (practice_id);

ALTER TABLE public.classical_composers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classical_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classical_work_practices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published classical composers"
  ON public.classical_composers
  FOR SELECT
  TO anon, authenticated
  USING (editorial_status = 'published');

CREATE POLICY "Public can read published classical works"
  ON public.classical_works
  FOR SELECT
  TO anon, authenticated
  USING (
    editorial_status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.classical_composers AS composer
      WHERE composer.id = classical_works.composer_id
        AND composer.editorial_status = 'published'
    )
  );

CREATE POLICY "Public can read visible classical work practices"
  ON public.classical_work_practices
  FOR SELECT
  TO anon, authenticated
  USING (
    public.can_current_viewer_read_practice(practice_id)
    AND EXISTS (
      SELECT 1
      FROM public.classical_works AS work
      JOIN public.classical_composers AS composer ON composer.id = work.composer_id
      WHERE work.id = classical_work_practices.classical_work_id
        AND work.editorial_status = 'published'
        AND composer.editorial_status = 'published'
    )
  );

REVOKE ALL ON TABLE public.classical_composers FROM PUBLIC;
REVOKE ALL ON TABLE public.classical_composers FROM anon, authenticated;
GRANT SELECT ON TABLE public.classical_composers TO anon, authenticated;
GRANT ALL ON TABLE public.classical_composers TO service_role;

REVOKE ALL ON TABLE public.classical_works FROM PUBLIC;
REVOKE ALL ON TABLE public.classical_works FROM anon, authenticated;
GRANT SELECT ON TABLE public.classical_works TO anon, authenticated;
GRANT ALL ON TABLE public.classical_works TO service_role;

REVOKE ALL ON TABLE public.classical_work_practices FROM PUBLIC;
REVOKE ALL ON TABLE public.classical_work_practices FROM anon, authenticated;
GRANT SELECT ON TABLE public.classical_work_practices TO anon, authenticated;
GRANT ALL ON TABLE public.classical_work_practices TO service_role;

CREATE TRIGGER classical_composers_set_updated_at
  BEFORE UPDATE ON public.classical_composers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_editorial_row_updated_at();

CREATE TRIGGER classical_works_set_updated_at
  BEFORE UPDATE ON public.classical_works
  FOR EACH ROW
  EXECUTE FUNCTION public.set_editorial_row_updated_at();

CREATE TRIGGER classical_work_practices_set_updated_at
  BEFORE UPDATE ON public.classical_work_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_editorial_row_updated_at();

COMMENT ON TABLE public.classical_composers IS
  'Editorial composer catalog for AudioLad Classics; this migration creates no author workspace.';
COMMENT ON TABLE public.classical_works IS
  'Editorial works catalog for AudioLad Classics. Before publication, the editorial write-path must ensure exactly one is_primary=true relation and a primary practice suitable for public playback. The partial unique index guarantees at most one primary; enforcing at least one before publication is a later stage.';
COMMENT ON TABLE public.classical_work_practices IS
  'Product-level classical work-to-practice bridge, not a future classical_recordings model.';
