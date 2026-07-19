BEGIN;

-- ---------------------------------------------------------------------------
-- Promo pages — landing pages with 1–3 existing practices per author workspace
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.promo_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,

  internal_name text NOT NULL,
  slug text NOT NULL,

  status text NOT NULL DEFAULT 'draft',

  public_title text NOT NULL,
  public_description text NULL,

  banner_path text NULL,
  footer_text text NULL,
  cta_label text NULL,
  cta_href text NULL,

  published_at timestamptz NULL,

  created_by uuid NULL
    REFERENCES auth.users (id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT promo_pages_author_slug_unique
    UNIQUE (author_id, slug),

  CONSTRAINT promo_pages_status_check
    CHECK (status IN ('draft', 'published', 'unpublished')),

  CONSTRAINT promo_pages_slug_check
    CHECK (
      slug ~ '^[a-z0-9-]{2,64}$'
    ),

  CONSTRAINT promo_pages_internal_name_check
    CHECK (
      char_length(btrim(internal_name)) > 0
      AND char_length(internal_name) <= 120
    ),

  CONSTRAINT promo_pages_public_title_check
    CHECK (
      char_length(btrim(public_title)) > 0
      AND char_length(public_title) <= 160
    ),

  CONSTRAINT promo_pages_public_description_check
    CHECK (
      public_description IS NULL
      OR char_length(public_description) <= 2000
    ),

  CONSTRAINT promo_pages_footer_text_check
    CHECK (
      footer_text IS NULL
      OR char_length(footer_text) <= 2000
    ),

  CONSTRAINT promo_pages_cta_label_check
    CHECK (
      cta_label IS NULL
      OR (
        char_length(btrim(cta_label)) > 0
        AND char_length(cta_label) <= 80
      )
    ),

  CONSTRAINT promo_pages_cta_href_check
    CHECK (
      cta_href IS NULL
      OR (
        char_length(cta_href) <= 512
        AND cta_href ~ '^/[^/]'
        AND cta_href !~* '[[:space:]]'
        AND cta_href !~ '://'
        AND lower(cta_href) !~ '^/(auth/sign-in|auth/sign-up)(/|$)'
      )
    )
);

CREATE INDEX IF NOT EXISTS promo_pages_author_id_status_updated_idx
  ON public.promo_pages (author_id, status, updated_at DESC);

COMMENT ON TABLE public.promo_pages IS
  'Author promo landing pages referencing 1–3 existing published practices.';

COMMENT ON COLUMN public.promo_pages.banner_path IS
  'Storage object path in author-assets bucket; public URL resolved at read time.';

-- ---------------------------------------------------------------------------
-- Promo page products (ordered join, max 3)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.promo_page_products (
  promo_page_id uuid NOT NULL
    REFERENCES public.promo_pages (id) ON DELETE CASCADE,

  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE RESTRICT,

  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (promo_page_id, practice_id),

  CONSTRAINT promo_page_products_position_check
    CHECK (position >= 0 AND position <= 2),

  CONSTRAINT promo_page_products_promo_page_id_position_key
    UNIQUE (promo_page_id, position)
);

CREATE INDEX IF NOT EXISTS promo_page_products_practice_id_idx
  ON public.promo_page_products (practice_id);

COMMENT ON TABLE public.promo_page_products IS
  'Ordered practice selection for a promo page (0..2). Publish requires 1..3 rows.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_promo_pages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promo_pages_set_updated_at ON public.promo_pages;
CREATE TRIGGER promo_pages_set_updated_at
  BEFORE UPDATE ON public.promo_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_promo_pages_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_promo_page_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('audiolad.promo_page_status_bypass', true) IS DISTINCT FROM '1' THEN
      IF NEW.status = 'published' OR OLD.status = 'published' THEN
        RAISE EXCEPTION 'promo_page_status_change_requires_rpc'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promo_pages_status_change_guard ON public.promo_pages;
CREATE TRIGGER promo_pages_status_change_guard
  BEFORE UPDATE OF status
  ON public.promo_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_promo_page_status_change();

CREATE OR REPLACE FUNCTION public.is_practice_promo_page_eligible(
  p_status text,
  p_is_free boolean,
  p_is_catalog_listed boolean,
  p_guest_access_enabled boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_status = 'published'
    AND (
      (
        p_is_free IS TRUE
        AND p_is_catalog_listed IS TRUE
      )
      OR p_guest_access_enabled IS TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_promo_page_product_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  SELECT pp.author_id
  INTO v_author_id
  FROM public.promo_pages AS pp
  WHERE pp.id = NEW.promo_page_id;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'promo_page_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = NEW.practice_id
      AND p.author_id = v_author_id
  ) THEN
    RAISE EXCEPTION 'promo_page_product_owner_mismatch'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_promo_page_products_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_count
  FROM public.promo_page_products AS ppp
  WHERE ppp.promo_page_id = NEW.promo_page_id;

  IF TG_OP = 'INSERT' AND v_count >= 3 THEN
    RAISE EXCEPTION 'promo_page_products_limit_exceeded'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promo_page_products_owner_check
  ON public.promo_page_products;
CREATE TRIGGER promo_page_products_owner_check
  BEFORE INSERT OR UPDATE OF promo_page_id, practice_id
  ON public.promo_page_products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_promo_page_product_owner();

DROP TRIGGER IF EXISTS promo_page_products_limit_check
  ON public.promo_page_products;
CREATE TRIGGER promo_page_products_limit_check
  BEFORE INSERT
  ON public.promo_page_products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_promo_page_products_limit();

CREATE OR REPLACE FUNCTION public.touch_promo_page_on_products_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.promo_pages AS pp
  SET updated_at = clock_timestamp()
  WHERE pp.id = COALESCE(NEW.promo_page_id, OLD.promo_page_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS promo_page_products_touch_page
  ON public.promo_page_products;
CREATE TRIGGER promo_page_products_touch_page
  AFTER INSERT OR UPDATE OR DELETE
  ON public.promo_page_products
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_promo_page_on_products_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.promo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_page_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promo_pages_select ON public.promo_pages;
CREATE POLICY promo_pages_select
  ON public.promo_pages
  FOR SELECT
  TO authenticated
  USING (public.user_can_read_author_promotion(author_id));

DROP POLICY IF EXISTS promo_pages_insert ON public.promo_pages;
CREATE POLICY promo_pages_insert
  ON public.promo_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.user_can_read_author_promotion(author_id)
  );

DROP POLICY IF EXISTS promo_pages_update ON public.promo_pages;
CREATE POLICY promo_pages_update
  ON public.promo_pages
  FOR UPDATE
  TO authenticated
  USING (public.user_can_read_author_promotion(author_id))
  WITH CHECK (
    public.user_can_read_author_promotion(author_id)
    AND author_id = (
      SELECT pp.author_id
      FROM public.promo_pages AS pp
      WHERE pp.id = promo_pages.id
    )
  );

DROP POLICY IF EXISTS promo_page_products_select ON public.promo_page_products;
CREATE POLICY promo_page_products_select
  ON public.promo_page_products
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.promo_pages AS pp
      WHERE pp.id = promo_page_products.promo_page_id
        AND public.user_can_read_author_promotion(pp.author_id)
    )
  );

DROP POLICY IF EXISTS promo_page_products_insert ON public.promo_page_products;
CREATE POLICY promo_page_products_insert
  ON public.promo_page_products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.promo_pages AS pp
      WHERE pp.id = promo_page_products.promo_page_id
        AND public.user_can_read_author_promotion(pp.author_id)
    )
  );

DROP POLICY IF EXISTS promo_page_products_update ON public.promo_page_products;
CREATE POLICY promo_page_products_update
  ON public.promo_page_products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.promo_pages AS pp
      WHERE pp.id = promo_page_products.promo_page_id
        AND public.user_can_read_author_promotion(pp.author_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.promo_pages AS pp
      WHERE pp.id = promo_page_products.promo_page_id
        AND public.user_can_read_author_promotion(pp.author_id)
    )
  );

DROP POLICY IF EXISTS promo_page_products_delete ON public.promo_page_products;
CREATE POLICY promo_page_products_delete
  ON public.promo_page_products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.promo_pages AS pp
      WHERE pp.id = promo_page_products.promo_page_id
        AND public.user_can_read_author_promotion(pp.author_id)
    )
  );

REVOKE ALL ON public.promo_pages FROM PUBLIC;
REVOKE ALL ON public.promo_page_products FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.promo_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_page_products TO authenticated;
GRANT ALL ON public.promo_pages TO service_role;
GRANT ALL ON public.promo_page_products TO service_role;

-- ---------------------------------------------------------------------------
-- publish_promo_page — atomic publish with full validation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_promo_page(
  p_promo_page_id uuid,
  p_published_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_page public.promo_pages%ROWTYPE;
  v_product_count integer;
  v_invalid_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_page
  FROM public.promo_pages AS pp
  WHERE pp.id = p_promo_page_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_page_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_read_author_promotion(v_page.author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_page.status NOT IN ('draft', 'unpublished') THEN
    RAISE EXCEPTION 'promo_page_publish_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  IF btrim(v_page.slug) = '' OR v_page.slug !~ '^[a-z0-9-]{2,64}$' THEN
    RAISE EXCEPTION 'promo_page_slug_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(v_page.public_title)) = 0 THEN
    RAISE EXCEPTION 'promo_page_public_title_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_product_count
  FROM public.promo_page_products AS ppp
  WHERE ppp.promo_page_id = v_page.id;

  IF v_product_count < 1 OR v_product_count > 3 THEN
    RAISE EXCEPTION 'promo_page_product_count_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_invalid_count
  FROM public.promo_page_products AS ppp
  INNER JOIN public.practices AS p ON p.id = ppp.practice_id
  WHERE ppp.promo_page_id = v_page.id
    AND (
      p.author_id IS DISTINCT FROM v_page.author_id
      OR NOT public.is_practice_promo_page_eligible(
        p.status,
        p.is_free,
        p.is_catalog_listed,
        p.guest_access_enabled
      )
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'promo_page_product_not_eligible'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('audiolad.promo_page_status_bypass', '1', true);

  UPDATE public.promo_pages AS pp
  SET
    status = 'published',
    published_at = COALESCE(pp.published_at, p_published_at),
    updated_at = clock_timestamp()
  WHERE pp.id = v_page.id;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'status', 'published',
    'published_at', COALESCE(v_page.published_at, p_published_at),
    'product_count', v_product_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_promo_page(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_promo_page(uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_promo_page(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_promo_page(uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.publish_promo_page(uuid, timestamptz) IS
  'audiolad:promo-page-publish:v1; atomically validates and publishes a promo page.';

-- ---------------------------------------------------------------------------
-- unpublish_promo_page
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unpublish_promo_page(
  p_promo_page_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_page public.promo_pages%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_page
  FROM public.promo_pages AS pp
  WHERE pp.id = p_promo_page_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_page_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_read_author_promotion(v_page.author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_page.status <> 'published' THEN
    RAISE EXCEPTION 'promo_page_unpublish_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('audiolad.promo_page_status_bypass', '1', true);

  UPDATE public.promo_pages AS pp
  SET
    status = 'unpublished',
    updated_at = clock_timestamp()
  WHERE pp.id = v_page.id;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'status', 'unpublished'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unpublish_promo_page(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_promo_page(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unpublish_promo_page(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_promo_page(uuid) TO service_role;

COMMENT ON FUNCTION public.unpublish_promo_page(uuid) IS
  'audiolad:promo-page-unpublish:v1; unpublishes a promo page while preserving content.';

-- ---------------------------------------------------------------------------
-- get_public_promo_page — safe public read (no draft leak)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_promo_page(
  p_author_slug text,
  p_promo_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page public.promo_pages%ROWTYPE;
  v_author_slug text;
  v_products jsonb;
BEGIN
  IF p_author_slug IS NULL OR btrim(p_author_slug) = '' THEN
    RETURN NULL;
  END IF;

  IF p_promo_slug IS NULL OR btrim(p_promo_slug) = '' THEN
    RETURN NULL;
  END IF;

  SELECT pp.*
  INTO v_page
  FROM public.promo_pages AS pp
  INNER JOIN public.authors AS a ON a.id = pp.author_id
  WHERE a.slug = btrim(p_author_slug)
    AND pp.slug = btrim(p_promo_slug)
    AND pp.status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT a.slug
  INTO v_author_slug
  FROM public.authors AS a
  WHERE a.id = v_page.author_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'practice_id', p.id,
        'slug', p.slug,
        'title', p.title,
        'format', p.format,
        'duration_minutes', p.duration_minutes,
        'cover_url', p.cover_url,
        'cover_image', p.cover_image,
        'author_name', a.name,
        'author_slug', a.slug,
        'position', ppp.position
      )
      ORDER BY ppp.position ASC
    ),
    '[]'::jsonb
  )
  INTO v_products
  FROM public.promo_page_products AS ppp
  INNER JOIN public.practices AS p ON p.id = ppp.practice_id
  INNER JOIN public.authors AS a ON a.id = p.author_id
  WHERE ppp.promo_page_id = v_page.id
    AND public.is_practice_promo_page_eligible(
      p.status,
      p.is_free,
      p.is_catalog_listed,
      p.guest_access_enabled
    );

  IF jsonb_array_length(v_products) < 1 THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'author_slug', v_author_slug,
    'slug', v_page.slug,
    'public_title', v_page.public_title,
    'public_description', v_page.public_description,
    'banner_path', v_page.banner_path,
    'footer_text', v_page.footer_text,
    'cta_label', v_page.cta_label,
    'cta_href', v_page.cta_href,
    'published_at', v_page.published_at,
    'products', v_products
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_promo_page(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_promo_page(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_promo_page(text, text) TO service_role;

COMMENT ON FUNCTION public.get_public_promo_page(text, text) IS
  'audiolad:public-promo-page:v1; returns published promo page with guest-eligible products only.';

COMMIT;
