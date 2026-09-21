-- Published Aurafon retrofit: attach an SEO query to an already-published product.
-- Separate from link_seo_reservation_to_product (draft-only create-flow #518).
-- No new tables/columns. Callable only by service_role.

CREATE OR REPLACE FUNCTION public.attach_published_seo_query_to_product(
  p_product_id uuid,
  p_query_id uuid DEFAULT NULL,
  p_query_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_query public.seo_queries%ROWTYPE;
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_existing public.seo_query_reservations%ROWTYPE;
  v_normalized text;
  v_trimmed text;
  v_created boolean := false;
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF (p_query_id IS NULL AND (p_query_text IS NULL OR btrim(p_query_text) = ''))
     OR (p_query_id IS NOT NULL AND p_query_text IS NOT NULL AND btrim(p_query_text) <> '') THEN
    -- Prefer query_id when both provided: ignore text to avoid client text as SoT with id.
    NULL;
  END IF;

  IF p_query_id IS NULL AND (p_query_text IS NULL OR btrim(p_query_text) = '') THEN
    RAISE EXCEPTION 'seo_query_required' USING ERRCODE = '22023';
  END IF;

  -- Serialize per product and (later) per query.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_product_id::text, 73061));

  SELECT * INTO v_practice
  FROM public.practices
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status <> 'published' THEN
    RAISE EXCEPTION 'seo_attach_product_not_published' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve query by id or text (find-or-create).
  IF p_query_id IS NOT NULL THEN
    SELECT * INTO v_query
    FROM public.seo_queries
    WHERE id = p_query_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_query_not_found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_trimmed := btrim(p_query_text);
    v_normalized := public.normalize_seo_query(v_trimmed);
    IF v_normalized IS NULL OR v_normalized = '' THEN
      RAISE EXCEPTION 'seo_query_empty' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_query
    FROM public.seo_queries
    WHERE normalized_query = v_normalized
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.seo_queries (
        query_text,
        source,
        frequency,
        frequency_checked_at,
        analysis_status,
        intent,
        recommended_format,
        audio_fit
      ) VALUES (
        v_trimmed,
        'manual',
        NULL,
        NULL,
        'analyzed',
        CASE WHEN v_practice.product_kind = 'music' THEN 'music' ELSE NULL END,
        CASE WHEN v_practice.product_kind = 'music' THEN 'Музыка' ELSE NULL END,
        CASE WHEN v_practice.product_kind = 'music' THEN 'high' ELSE NULL END
      )
      RETURNING * INTO v_query;
      v_created := true;
    END IF;
  END IF;

  IF char_length(v_query.query_text) > 120 THEN
    RAISE EXCEPTION 'seo_query_too_long_for_product' USING ERRCODE = 'P0001';
  END IF;

  -- Ensure analyzed when attaching to a published product.
  IF v_query.analysis_status IS DISTINCT FROM 'analyzed' THEN
    UPDATE public.seo_queries
    SET analysis_status = 'analyzed', updated_at = now()
    WHERE id = v_query.id
    RETURNING * INTO v_query;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_query.id::text, 73062));
  PERFORM public.expire_seo_query_reservation(v_query.id, NULL);

  -- Idempotent: already linked to this product with matching primary.
  IF v_practice.primary_seo_query_id IS NOT DISTINCT FROM v_query.id THEN
    SELECT * INTO v_reservation
    FROM public.seo_query_reservations
    WHERE query_id = v_query.id
      AND product_id = v_practice.id
      AND status IN ('active', 'used')
    ORDER BY CASE WHEN status = 'used' THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      IF v_reservation.status = 'active' THEN
        UPDATE public.seo_query_reservations
        SET status = 'used', expires_at = NULL, product_id = v_practice.id, updated_at = now()
        WHERE id = v_reservation.id
        RETURNING * INTO v_reservation;
      END IF;

      IF v_practice.seo_primary_query IS DISTINCT FROM v_query.query_text THEN
        PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
        UPDATE public.practices
        SET seo_primary_query = v_query.query_text, updated_at = now()
        WHERE id = v_practice.id;
      END IF;

      RETURN jsonb_build_object(
        'query_id', v_query.id,
        'query_text', v_query.query_text,
        'reservation_id', v_reservation.id,
        'status', v_reservation.status,
        'created_query', v_created,
        'idempotent', true
      );
    END IF;
  END IF;

  IF v_practice.primary_seo_query_id IS NOT NULL
     AND v_practice.primary_seo_query_id IS DISTINCT FROM v_query.id THEN
    RAISE EXCEPTION 'practice_already_has_primary_seo_query' USING ERRCODE = 'P0001';
  END IF;

  -- Occupancy on this query.
  SELECT * INTO v_existing
  FROM public.seo_query_reservations
  WHERE query_id = v_query.id
    AND status IN ('active', 'used')
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'used'
       AND v_existing.product_id IS DISTINCT FROM v_practice.id THEN
      RAISE EXCEPTION 'seo_query_already_used' USING ERRCODE = 'P0001';
    END IF;

    IF v_existing.status = 'active'
       AND v_existing.author_id IS DISTINCT FROM v_practice.author_id THEN
      RAISE EXCEPTION 'seo_query_already_reserved' USING ERRCODE = 'P0001';
    END IF;

    IF v_existing.status = 'active'
       AND v_existing.product_id IS NOT NULL
       AND v_existing.product_id IS DISTINCT FROM v_practice.id THEN
      RAISE EXCEPTION 'seo_query_already_reserved' USING ERRCODE = 'P0001';
    END IF;

    -- Own active unlinked (or already pointing at this product) → used.
    UPDATE public.seo_query_reservations
    SET
      status = 'used',
      product_id = v_practice.id,
      expires_at = NULL,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_reservation;
  ELSE
    INSERT INTO public.seo_query_reservations (
      query_id,
      author_id,
      product_id,
      reserved_at,
      expires_at,
      status
    ) VALUES (
      v_query.id,
      v_practice.author_id,
      v_practice.id,
      now(),
      NULL,
      'used'
    )
    RETURNING * INTO v_reservation;
  END IF;

  PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);

  UPDATE public.practices
  SET
    primary_seo_query_id = v_query.id,
    seo_primary_query = v_query.query_text,
    updated_at = now()
  WHERE id = v_practice.id;

  RETURN jsonb_build_object(
    'query_id', v_query.id,
    'query_text', v_query.query_text,
    'reservation_id', v_reservation.id,
    'status', v_reservation.status,
    'created_query', v_created,
    'idempotent', false
  );
END;
$$;

COMMENT ON FUNCTION public.attach_published_seo_query_to_product(uuid, uuid, text) IS
  'audiolad:seo-published-attach:v1; service_role only; attaches/finds-or-creates query for published product as used reservation; syncs primary_seo_query_id + seo_primary_query atomically';

REVOKE ALL ON FUNCTION public.attach_published_seo_query_to_product(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_published_seo_query_to_product(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.attach_published_seo_query_to_product(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attach_published_seo_query_to_product(uuid, uuid, text) TO service_role;
