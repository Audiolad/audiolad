BEGIN;

-- Hotfix: RETURNS TABLE OUT columns (promotion_id, started_at, expires_at, …)
-- clash with table columns in INSERT / ON CONFLICT / RETURNING / SELECT / WHERE.
-- Do not edit 20260823183000_price_promotion_oneshot_bind.sql. Semantics unchanged.

CREATE OR REPLACE FUNCTION public.start_practice_price_promotion(
  p_start_token text,
  p_visitor_id text,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  practice_id uuid,
  promotion_id uuid,
  started_at timestamptz,
  expires_at timestamptz,
  sale_price integer,
  reused boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_promo public.practice_price_promotions%ROWTYPE;
  v_visitor text;
  v_user uuid;
  v_now timestamptz := now();
  v_existing public.practice_price_promotion_starts%ROWTYPE;
  v_start public.practice_price_promotion_starts%ROWTYPE;
  v_expires timestamptz;
  v_inserted boolean := false;
BEGIN
  v_visitor := lower(btrim(coalesce(p_visitor_id, '')));
  v_user := coalesce(p_user_id, auth.uid());

  IF v_visitor = '' OR char_length(v_visitor) < 8 THEN
    RAISE EXCEPTION 'visitor_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_start_token IS NULL OR btrim(p_start_token) = '' THEN
    RAISE EXCEPTION 'start_token_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    promo.id,
    promo.practice_id,
    promo.name,
    promo.promotion_type,
    promo.sale_price,
    promo.starts_at,
    promo.ends_at,
    promo.duration_seconds,
    promo.is_active,
    promo.start_token,
    promo.created_at,
    promo.updated_at
  INTO v_promo
  FROM public.practice_price_promotions AS promo
  WHERE promo.start_token = btrim(p_start_token);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promotion_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_promo.is_active IS NOT TRUE
     OR v_promo.promotion_type IS DISTINCT FROM 'personal_countdown'
     OR v_promo.duration_seconds IS NULL
     OR v_promo.duration_seconds <= 0 THEN
    RAISE EXCEPTION 'promotion_not_startable'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = v_promo.practice_id
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      AND p.is_free IS NOT TRUE
      AND p.price IS NOT NULL
      AND p.price > v_promo.sale_price
  ) THEN
    RAISE EXCEPTION 'promotion_not_startable'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_user IS NOT NULL THEN
    PERFORM public.bind_practice_price_promotion_starts(v_visitor, v_user);
  END IF;

  SELECT
    s.id,
    s.promotion_id,
    s.visitor_id,
    s.user_id,
    s.started_at,
    s.expires_at,
    s.created_at
  INTO v_existing
  FROM public.practice_price_promotion_starts AS s
  WHERE s.promotion_id = v_promo.id
    AND (
      s.visitor_id = v_visitor
      OR (
        v_user IS NOT NULL
        AND s.user_id = v_user
      )
    )
  ORDER BY s.started_at ASC, s.id ASC
  LIMIT 1;

  IF FOUND THEN
    practice_id := v_promo.practice_id;
    promotion_id := v_promo.id;
    started_at := v_existing.started_at;
    expires_at := v_existing.expires_at;
    sale_price := v_promo.sale_price;
    reused := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_expires := v_now + make_interval(secs => v_promo.duration_seconds);

  BEGIN
    -- ON CONFLICT inference columns cannot be table-qualified. Execute the
    -- statement as SQL so OUT promotion_id is not substituted into the target.
    EXECUTE
      $insert$
        INSERT INTO public.practice_price_promotion_starts AS starts (
          promotion_id,
          visitor_id,
          user_id,
          started_at,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (promotion_id, visitor_id) DO NOTHING
        RETURNING
          starts.id,
          starts.promotion_id,
          starts.visitor_id,
          starts.user_id,
          starts.started_at,
          starts.expires_at,
          starts.created_at
      $insert$
    INTO v_start
    USING v_promo.id, v_visitor, v_user, v_now, v_expires;

    IF v_start.id IS NOT NULL THEN
      v_inserted := true;
    ELSE
      SELECT
        s.id,
        s.promotion_id,
        s.visitor_id,
        s.user_id,
        s.started_at,
        s.expires_at,
        s.created_at
      INTO v_start
      FROM public.practice_price_promotion_starts AS s
      WHERE s.promotion_id = v_promo.id
        AND s.visitor_id = v_visitor
      ORDER BY s.started_at ASC, s.id ASC
      LIMIT 1;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT
        s.id,
        s.promotion_id,
        s.visitor_id,
        s.user_id,
        s.started_at,
        s.expires_at,
        s.created_at
      INTO v_start
      FROM public.practice_price_promotion_starts AS s
      WHERE s.promotion_id = v_promo.id
        AND (
          s.visitor_id = v_visitor
          OR (
            v_user IS NOT NULL
            AND s.user_id = v_user
          )
        )
      ORDER BY s.started_at ASC, s.id ASC
      LIMIT 1;
  END;

  IF v_user IS NOT NULL THEN
    PERFORM public.bind_practice_price_promotion_starts(v_visitor, v_user);

    SELECT
      s.id,
      s.promotion_id,
      s.visitor_id,
      s.user_id,
      s.started_at,
      s.expires_at,
      s.created_at
    INTO v_start
    FROM public.practice_price_promotion_starts AS s
    WHERE s.promotion_id = v_promo.id
      AND (
        s.visitor_id = v_visitor
        OR s.user_id = v_user
      )
    ORDER BY s.started_at ASC, s.id ASC
    LIMIT 1;
  END IF;

  practice_id := v_promo.practice_id;
  promotion_id := v_promo.id;
  started_at := v_start.started_at;
  expires_at := v_start.expires_at;
  sale_price := v_promo.sale_price;
  reused := NOT v_inserted;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.start_practice_price_promotion(text, text, uuid) IS
  'One-shot personal countdown. Token may start many visitors; each visitor/user gets one window and it never restarts. Table columns are alias-qualified so OUT promotion_id/started_at/expires_at do not clash.';

COMMIT;
