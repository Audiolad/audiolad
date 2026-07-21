BEGIN;

-- ---------------------------------------------------------------------------
-- Promo pages security hardening — DB-enforced published immutability,
-- restricted table DML, atomic draft update RPC.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_promo_page_mutation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF current_setting('audiolad.promo_page_status_bypass', true) = '1' THEN
    IF OLD.status IN ('draft', 'unpublished') AND NEW.status = 'published' THEN
      IF NEW.author_id IS DISTINCT FROM OLD.author_id
        OR NEW.internal_name IS DISTINCT FROM OLD.internal_name
        OR NEW.slug IS DISTINCT FROM OLD.slug
        OR NEW.public_title IS DISTINCT FROM OLD.public_title
        OR NEW.public_description IS DISTINCT FROM OLD.public_description
        OR NEW.banner_path IS DISTINCT FROM OLD.banner_path
        OR NEW.footer_text IS DISTINCT FROM OLD.footer_text
        OR NEW.cta_label IS DISTINCT FROM OLD.cta_label
        OR NEW.cta_href IS DISTINCT FROM OLD.cta_href
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN
        RAISE EXCEPTION 'promo_page_publish_field_mutation_forbidden'
          USING ERRCODE = '42501';
      END IF;

      RETURN NEW;
    END IF;

    IF OLD.status = 'published' AND NEW.status = 'unpublished' THEN
      IF NEW.author_id IS DISTINCT FROM OLD.author_id
        OR NEW.internal_name IS DISTINCT FROM OLD.internal_name
        OR NEW.slug IS DISTINCT FROM OLD.slug
        OR NEW.public_title IS DISTINCT FROM OLD.public_title
        OR NEW.public_description IS DISTINCT FROM OLD.public_description
        OR NEW.banner_path IS DISTINCT FROM OLD.banner_path
        OR NEW.footer_text IS DISTINCT FROM OLD.footer_text
        OR NEW.cta_label IS DISTINCT FROM OLD.cta_label
        OR NEW.cta_href IS DISTINCT FROM OLD.cta_href
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.published_at IS DISTINCT FROM OLD.published_at
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN
        RAISE EXCEPTION 'promo_page_unpublish_field_mutation_forbidden'
          USING ERRCODE = '42501';
      END IF;

      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'promo_page_status_change_invalid'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'promo_page_edit_locked'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'promo_page_status_change_requires_rpc'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'promo_page_author_id_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'promo_page_created_by_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'promo_page_published_at_immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promo_pages_status_change_guard ON public.promo_pages;
DROP TRIGGER IF EXISTS promo_pages_mutation_guard ON public.promo_pages;
CREATE TRIGGER promo_pages_mutation_guard
  BEFORE UPDATE
  ON public.promo_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_promo_page_mutation_guard();

-- ---------------------------------------------------------------------------
-- Shared product replacement core — callable only from SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promo_page_replace_products_core(
  p_promo_page_id uuid,
  p_author_id uuid,
  p_practice_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_practice_id uuid;
  v_position integer;
  v_practice public.practices%ROWTYPE;
BEGIN
  IF p_practice_ids IS NULL THEN
    RAISE EXCEPTION 'practice_ids_required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_practice_ids) AS input_id
    WHERE input_id IS NULL
  ) THEN
    RAISE EXCEPTION 'promo_page_product_id_required'
      USING ERRCODE = '22023';
  END IF;

  v_count := COALESCE(array_length(p_practice_ids, 1), 0);

  IF v_count > 3 THEN
    RAISE EXCEPTION 'promo_page_products_limit_exceeded'
      USING ERRCODE = '23514';
  END IF;

  IF v_count > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_practice_ids) AS input_id
      GROUP BY input_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'promo_page_product_duplicate'
        USING ERRCODE = '23505';
    END IF;

    FOREACH v_practice_id IN ARRAY p_practice_ids LOOP
      SELECT p.*
      INTO v_practice
      FROM public.practices AS p
      WHERE p.id = v_practice_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'practice_not_found'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_practice.author_id IS DISTINCT FROM p_author_id THEN
        RAISE EXCEPTION 'promo_page_product_owner_mismatch'
          USING ERRCODE = '23503';
      END IF;

      IF NOT public.is_practice_promo_page_eligible(
        v_practice.status,
        v_practice.is_free,
        v_practice.is_catalog_listed,
        v_practice.guest_access_enabled
      ) THEN
        RAISE EXCEPTION 'promo_page_product_not_eligible'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.promo_page_products AS ppp
  WHERE ppp.promo_page_id = p_promo_page_id;

  v_position := 0;

  FOREACH v_practice_id IN ARRAY p_practice_ids LOOP
    INSERT INTO public.promo_page_products (
      promo_page_id,
      practice_id,
      position
    )
    VALUES (
      p_promo_page_id,
      v_practice_id,
      v_position
    );

    v_position := v_position + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.promo_page_replace_products_core(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promo_page_replace_products_core(uuid, uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.promo_page_replace_products_core(uuid, uuid, uuid[]) FROM authenticated;

-- ---------------------------------------------------------------------------
-- replace_promo_page_products — hardened wrapper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_promo_page_products(
  p_promo_page_id uuid,
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
  v_count integer;
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

  v_count := public.promo_page_replace_products_core(
    v_page.id,
    v_page.author_id,
    p_practice_ids
  );

  UPDATE public.promo_pages AS pp
  SET updated_at = clock_timestamp()
  WHERE pp.id = v_page.id;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'product_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_promo_page_products(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_promo_page_products(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_promo_page_products(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_promo_page_products(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.replace_promo_page_products(uuid, uuid[]) IS
  'audiolad:replace-promo-page-products:v2; atomic replace of 0..3 eligible products; draft/unpublished only.';

-- ---------------------------------------------------------------------------
-- update_promo_page_draft — atomic editable-field + product replacement
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

  IF p_cta_href IS NOT NULL AND char_length(p_cta_href) > 512 THEN
    RAISE EXCEPTION 'promo_page_cta_href_too_long'
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
    cta_href = NULLIF(btrim(p_cta_href), ''),
    updated_at = clock_timestamp()
  WHERE pp.id = v_page.id;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'product_count', v_product_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) TO service_role;

COMMENT ON FUNCTION public.update_promo_page_draft(uuid, text, text, text, text, text, text, text, uuid[]) IS
  'audiolad:update-promo-page-draft:v1; atomic draft/unpublished field update with product replacement.';

-- ---------------------------------------------------------------------------
-- Restrict direct table DML for authenticated role
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS promo_page_products_insert ON public.promo_page_products;
DROP POLICY IF EXISTS promo_page_products_update ON public.promo_page_products;
DROP POLICY IF EXISTS promo_page_products_delete ON public.promo_page_products;

REVOKE UPDATE ON public.promo_pages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.promo_page_products FROM authenticated;

GRANT SELECT ON public.promo_pages TO authenticated;
GRANT INSERT ON public.promo_pages TO authenticated;
GRANT SELECT ON public.promo_page_products TO authenticated;

COMMIT;
