BEGIN;

-- ---------------------------------------------------------------------------
-- Shared CTA href validation — semantically aligned with TS isUnsafePromoPageCtaHref
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_safe_promo_page_cta_href(p_href text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trimmed text;
  v_lower text;
  v_normalized text;
  v_pathname text;
BEGIN
  IF p_href IS NULL THEN
    RETURN true;
  END IF;

  v_trimmed := btrim(p_href);

  IF v_trimmed = '' THEN
    RETURN true;
  END IF;

  IF char_length(v_trimmed) > 512 THEN
    RETURN false;
  END IF;

  IF left(v_trimmed, 1) <> '/' OR left(v_trimmed, 2) = '//' THEN
    RETURN false;
  END IF;

  IF v_trimmed LIKE '%\\%' THEN
    RETURN false;
  END IF;

  v_lower := lower(v_trimmed);

  IF v_lower LIKE '%://%' THEN
    RETURN false;
  END IF;

  IF v_lower LIKE 'javascript:%' OR v_lower LIKE 'data:%' THEN
    RETURN false;
  END IF;

  IF v_trimmed ~ '[[:cntrl:]]' THEN
    RETURN false;
  END IF;

  v_normalized := replace(replace(v_lower, '%2f', '/'), '%252f', '/');
  v_pathname := split_part(split_part(v_normalized, '#', 1), '?', 1);

  IF left(v_pathname, 1) <> '/' OR left(v_pathname, 2) = '//' THEN
    RETURN false;
  END IF;

  IF v_pathname ~ '^/(auth/sign-in|auth/sign-up)(/|$)' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.is_safe_promo_page_cta_href(text) IS
  'audiolad:promo-page-cta-href:v1; validates internal-only promo page CTA href.';

ALTER TABLE public.promo_pages
  DROP CONSTRAINT IF EXISTS promo_pages_cta_href_check;

ALTER TABLE public.promo_pages
  ADD CONSTRAINT promo_pages_cta_href_check
  CHECK (public.is_safe_promo_page_cta_href(cta_href));

-- ---------------------------------------------------------------------------
-- INSERT guard — only RPC with transaction-local bypass may insert promo_pages
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_promo_page_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('audiolad.promo_page_insert_bypass', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'promo_page_insert_requires_rpc'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'promo_page_insert_invalid_status'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'promo_page_insert_published_at_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'promo_page_created_by_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_can_read_author_promotion(NEW.author_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_safe_promo_page_cta_href(NEW.cta_href) THEN
    RAISE EXCEPTION 'promo_page_cta_href_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promo_pages_insert_guard ON public.promo_pages;
CREATE TRIGGER promo_pages_insert_guard
  BEFORE INSERT
  ON public.promo_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_promo_page_insert_guard();

-- ---------------------------------------------------------------------------
-- update_promo_page_draft — add shared CTA validation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_promo_page_draft(
  p_promo_page_id uuid,
  p_internal_name text,
  p_slug text,
  p_public_title text,
  p_public_description text,
  p_footer_text text,
  p_cta_label text,
  p_cta_href text,
  p_practice_ids uuid[]
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
  v_slug text;
  v_cta_href text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_promo_page_id IS NULL THEN
    RAISE EXCEPTION 'promo_page_not_found'
      USING ERRCODE = 'P0002';
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

  IF v_page.status = 'published' THEN
    RAISE EXCEPTION 'promo_page_edit_locked'
      USING ERRCODE = '42501';
  END IF;

  IF p_internal_name IS NULL OR char_length(btrim(p_internal_name)) = 0 THEN
    RAISE EXCEPTION 'promo_page_internal_name_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(p_internal_name)) > 120 THEN
    RAISE EXCEPTION 'promo_page_internal_name_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_title IS NULL OR char_length(btrim(p_public_title)) = 0 THEN
    RAISE EXCEPTION 'promo_page_public_title_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(p_public_title)) > 160 THEN
    RAISE EXCEPTION 'promo_page_public_title_too_long'
      USING ERRCODE = '22023';
  END IF;

  v_slug := lower(btrim(p_slug));

  IF v_slug IS NULL OR v_slug = '' OR v_slug !~ '^[a-z0-9-]{2,64}$' THEN
    RAISE EXCEPTION 'promo_page_slug_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_description IS NOT NULL AND char_length(p_public_description) > 2000 THEN
    RAISE EXCEPTION 'promo_page_public_description_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_footer_text IS NOT NULL AND char_length(p_footer_text) > 2000 THEN
    RAISE EXCEPTION 'promo_page_footer_text_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_cta_label IS NOT NULL AND char_length(btrim(p_cta_label)) > 80 THEN
    RAISE EXCEPTION 'promo_page_cta_label_too_long'
      USING ERRCODE = '22023';
  END IF;

  v_cta_href := NULLIF(btrim(p_cta_href), '');

  IF NOT public.is_safe_promo_page_cta_href(v_cta_href) THEN
    RAISE EXCEPTION 'promo_page_cta_href_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.promo_pages AS pp
    WHERE pp.author_id = v_page.author_id
      AND pp.slug = v_slug
      AND pp.id <> v_page.id
  ) THEN
    RAISE EXCEPTION 'promo_page_slug_taken'
      USING ERRCODE = '23505';
  END IF;

  v_product_count := public.promo_page_replace_products_core(
    v_page.id,
    v_page.author_id,
    p_practice_ids
  );

  UPDATE public.promo_pages AS pp
  SET
    internal_name = btrim(p_internal_name),
    slug = v_slug,
    public_title = btrim(p_public_title),
    public_description = NULLIF(btrim(p_public_description), ''),
    footer_text = NULLIF(btrim(p_footer_text), ''),
    cta_label = NULLIF(btrim(p_cta_label), ''),
    cta_href = v_cta_href,
    updated_at = clock_timestamp()
  WHERE pp.id = v_page.id;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'product_count', v_product_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- create_promo_page_draft — atomic create with optional 0..3 products
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_promo_page_draft(
  p_author_id uuid,
  p_internal_name text,
  p_slug text,
  p_public_title text,
  p_public_description text,
  p_footer_text text,
  p_cta_label text,
  p_cta_href text,
  p_practice_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_page_id uuid;
  v_slug text;
  v_cta_href text;
  v_product_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_can_read_author_promotion(p_author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_internal_name IS NULL OR char_length(btrim(p_internal_name)) = 0 THEN
    RAISE EXCEPTION 'promo_page_internal_name_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(p_internal_name)) > 120 THEN
    RAISE EXCEPTION 'promo_page_internal_name_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_title IS NULL OR char_length(btrim(p_public_title)) = 0 THEN
    RAISE EXCEPTION 'promo_page_public_title_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(p_public_title)) > 160 THEN
    RAISE EXCEPTION 'promo_page_public_title_too_long'
      USING ERRCODE = '22023';
  END IF;

  v_slug := lower(btrim(p_slug));

  IF v_slug IS NULL OR v_slug = '' OR v_slug !~ '^[a-z0-9-]{2,64}$' THEN
    RAISE EXCEPTION 'promo_page_slug_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_description IS NOT NULL AND char_length(p_public_description) > 2000 THEN
    RAISE EXCEPTION 'promo_page_public_description_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_footer_text IS NOT NULL AND char_length(p_footer_text) > 2000 THEN
    RAISE EXCEPTION 'promo_page_footer_text_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_cta_label IS NOT NULL AND char_length(btrim(p_cta_label)) > 80 THEN
    RAISE EXCEPTION 'promo_page_cta_label_too_long'
      USING ERRCODE = '22023';
  END IF;

  v_cta_href := NULLIF(btrim(p_cta_href), '');

  IF NOT public.is_safe_promo_page_cta_href(v_cta_href) THEN
    RAISE EXCEPTION 'promo_page_cta_href_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.promo_pages AS pp
    WHERE pp.author_id = p_author_id
      AND pp.slug = v_slug
  ) THEN
    RAISE EXCEPTION 'promo_page_slug_taken'
      USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('audiolad.promo_page_insert_bypass', '1', true);

  INSERT INTO public.promo_pages (
    author_id,
    internal_name,
    slug,
    status,
    public_title,
    public_description,
    footer_text,
    cta_label,
    cta_href,
    published_at,
    created_by
  )
  VALUES (
    p_author_id,
    btrim(p_internal_name),
    v_slug,
    'draft',
    btrim(p_public_title),
    NULLIF(btrim(p_public_description), ''),
    NULLIF(btrim(p_footer_text), ''),
    NULLIF(btrim(p_cta_label), ''),
    v_cta_href,
    NULL,
    v_user_id
  )
  RETURNING id INTO v_page_id;

  v_product_count := public.promo_page_replace_products_core(
    v_page_id,
    p_author_id,
    COALESCE(p_practice_ids, ARRAY[]::uuid[])
  );

  RETURN jsonb_build_object(
    'promo_page_id', v_page_id,
    'product_count', v_product_count,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) TO service_role;

COMMENT ON FUNCTION public.create_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) IS
  'audiolad:create-promo-page-draft:v1; atomic draft create with 0..3 eligible products.';

-- ---------------------------------------------------------------------------
-- Final privilege model — RPC-only mutations for authenticated
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS promo_pages_insert ON public.promo_pages;
DROP POLICY IF EXISTS promo_pages_update ON public.promo_pages;

REVOKE INSERT ON public.promo_pages FROM authenticated;
REVOKE UPDATE ON public.promo_pages FROM authenticated;
REVOKE DELETE ON public.promo_pages FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.promo_page_products FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.replace_promo_page_products(uuid, uuid[]) FROM authenticated;

GRANT SELECT ON public.promo_pages TO authenticated;
GRANT SELECT ON public.promo_page_products TO authenticated;

COMMIT;
