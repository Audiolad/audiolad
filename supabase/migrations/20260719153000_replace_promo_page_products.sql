BEGIN;

-- ---------------------------------------------------------------------------
-- replace_promo_page_products — atomic product set replacement for draft pages
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
  v_practice_id uuid;
  v_position integer;
  v_practice public.practices%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_promo_page_id IS NULL THEN
    RAISE EXCEPTION 'promo_page_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_practice_ids IS NULL THEN
    RAISE EXCEPTION 'practice_ids_required'
      USING ERRCODE = '22023';
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

      IF v_practice.author_id IS DISTINCT FROM v_page.author_id THEN
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
  WHERE ppp.promo_page_id = v_page.id;

  v_position := 0;

  FOREACH v_practice_id IN ARRAY p_practice_ids LOOP
    INSERT INTO public.promo_page_products (
      promo_page_id,
      practice_id,
      position
    )
    VALUES (
      v_page.id,
      v_practice_id,
      v_position
    );

    v_position := v_position + 1;
  END LOOP;

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
  'audiolad:replace-promo-page-products:v1; atomic replace of 0..3 eligible products; draft/unpublished only.';

COMMIT;
