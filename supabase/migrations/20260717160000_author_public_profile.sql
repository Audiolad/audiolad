BEGIN;

-- ---------------------------------------------------------------------------
-- Author public profile fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS author_type text NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS short_bio text NULL,
  ADD COLUMN IF NOT EXISTS full_bio text NULL,
  ADD COLUMN IF NOT EXISTS banner_url text NULL,
  ADD COLUMN IF NOT EXISTS avatar_path text NULL,
  ADD COLUMN IF NOT EXISTS banner_path text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'authors_author_type_check'
  ) THEN
    ALTER TABLE public.authors
      ADD CONSTRAINT authors_author_type_check
      CHECK (author_type IN ('person', 'project', 'studio'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.authors.author_type IS
  'Public page type: person, project, or studio.';

COMMENT ON COLUMN public.authors.short_bio IS
  'Short positioning line for public author page (about 140-180 chars).';

COMMENT ON COLUMN public.authors.full_bio IS
  'Full about text for public author page with paragraph breaks.';

COMMENT ON COLUMN public.authors.banner_url IS
  'Public URL for author page banner image.';

COMMENT ON COLUMN public.authors.avatar_path IS
  'Storage object path in author-assets bucket: authors/{author_id}/avatar.{ext}';

COMMENT ON COLUMN public.authors.banner_path IS
  'Storage object path in author-assets bucket: authors/{author_id}/banner.{ext}';

-- Backfill short_bio from legacy description when empty.
UPDATE public.authors
SET short_bio = description
WHERE short_bio IS NULL
  AND description IS NOT NULL
  AND btrim(description) <> '';

-- ---------------------------------------------------------------------------
-- Author profile topics (uses platform topics catalog)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_topics (
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  topic_id uuid NOT NULL
    REFERENCES public.topics (id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (author_id, topic_id)
);

CREATE INDEX IF NOT EXISTS author_topics_author_id_position_idx
  ON public.author_topics (author_id, position);

COMMENT ON TABLE public.author_topics IS
  'Author-selected profile themes from the platform topics catalog.';

-- ---------------------------------------------------------------------------
-- Author featured products ("Рекомендуем начать")
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_featured_products (
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  product_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE CASCADE,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (author_id, product_id),
  CONSTRAINT author_featured_products_position_check
    CHECK (position >= 0 AND position < 5)
);

CREATE INDEX IF NOT EXISTS author_featured_products_author_id_position_idx
  ON public.author_featured_products (author_id, position);

CREATE UNIQUE INDEX IF NOT EXISTS author_featured_products_author_position_key
  ON public.author_featured_products (author_id, position);

COMMENT ON TABLE public.author_featured_products IS
  'Manually curated featured products for author public page (max 5).';

CREATE OR REPLACE FUNCTION public.enforce_author_featured_product_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = NEW.product_id
      AND p.author_id = NEW.author_id
  ) THEN
    RAISE EXCEPTION 'featured product must belong to the same author workspace';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_featured_products_owner_check
  ON public.author_featured_products;

CREATE TRIGGER author_featured_products_owner_check
  BEFORE INSERT OR UPDATE OF author_id, product_id
  ON public.author_featured_products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_author_featured_product_owner();

-- ---------------------------------------------------------------------------
-- RLS: authors update for members
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_featured_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Author members can update own author profile" ON public.authors;
CREATE POLICY "Author members can update own author profile"
  ON public.authors
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = authors.id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = authors.id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Public can read author topics" ON public.author_topics;
CREATE POLICY "Public can read author topics"
  ON public.author_topics
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Author members can manage author topics" ON public.author_topics;
CREATE POLICY "Author members can manage author topics"
  ON public.author_topics
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_topics.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_topics.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Public can read author featured products" ON public.author_featured_products;
CREATE POLICY "Public can read author featured products"
  ON public.author_featured_products
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Author members can manage featured products" ON public.author_featured_products;
CREATE POLICY "Author members can manage featured products"
  ON public.author_featured_products
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_featured_products.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_featured_products.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

GRANT SELECT ON TABLE public.author_topics TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.author_topics TO authenticated, service_role;

GRANT SELECT ON TABLE public.author_featured_products TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.author_featured_products TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: author-assets bucket (avatar + banner, public read)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Required table storage.buckets does not exist';
  END IF;
END;
$$;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'author-assets',
  'author-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can read author assets" ON storage.objects;
CREATE POLICY "Public can read author assets"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'author-assets');

DROP POLICY IF EXISTS "Author members can upload author assets" ON storage.objects;
CREATE POLICY "Author members can upload author assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'author-assets'
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = split_part(name, '/', 2)::uuid
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can update author assets" ON storage.objects;
CREATE POLICY "Author members can update author assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'author-assets'
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = split_part(name, '/', 2)::uuid
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    bucket_id = 'author-assets'
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = split_part(name, '/', 2)::uuid
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can delete author assets" ON storage.objects;
CREATE POLICY "Author members can delete author assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'author-assets'
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = split_part(name, '/', 2)::uuid
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

COMMIT;
