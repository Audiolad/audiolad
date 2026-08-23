BEGIN;

-- One-shot personal countdown: never restart an expired window.
-- One (promotion, visitor) and at most one (promotion, user) start.
-- Guest cookie binds onto user_id without creating a second window.

DROP INDEX IF EXISTS public.practice_price_promotion_starts_promo_user_idx;

CREATE UNIQUE INDEX IF NOT EXISTS practice_price_promotion_starts_promo_user_uidx
  ON public.practice_price_promotion_starts (promotion_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bind_practice_price_promotion_starts(
  p_visitor_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visitor text;
  v_promo_id uuid;
  v_winner public.practice_price_promotion_starts%ROWTYPE;
BEGIN
  v_visitor := lower(btrim(coalesce(p_visitor_id, '')));

  IF v_visitor = '' OR char_length(v_visitor) < 8 OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_promo_id IN
    SELECT DISTINCT s.promotion_id
    FROM public.practice_price_promotion_starts AS s
    WHERE s.visitor_id = v_visitor
       OR s.user_id = p_user_id
  LOOP
    SELECT s.*
    INTO v_winner
    FROM public.practice_price_promotion_starts AS s
    WHERE s.promotion_id = v_promo_id
      AND (
        s.visitor_id = v_visitor
        OR s.user_id = p_user_id
      )
    ORDER BY s.started_at ASC, s.id ASC
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.practice_price_promotion_starts
    SET user_id = NULL
    WHERE promotion_id = v_promo_id
      AND user_id = p_user_id
      AND id IS DISTINCT FROM v_winner.id;

    IF v_winner.user_id IS NULL THEN
      UPDATE public.practice_price_promotion_starts
      SET user_id = p_user_id
      WHERE id = v_winner.id
        AND user_id IS NULL;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_practice_price_promotion_starts(text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bind_practice_price_promotion_starts(text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.bind_practice_price_promotion_starts(text, uuid) IS
  'Attach user_id to the earliest guest start for the cookie visitor. Never creates or extends a window.';

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

  SELECT promo.*
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

  SELECT s.*
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
    INSERT INTO public.practice_price_promotion_starts (
      promotion_id,
      visitor_id,
      user_id,
      started_at,
      expires_at
    )
    VALUES (
      v_promo.id,
      v_visitor,
      v_user,
      v_now,
      v_expires
    )
    ON CONFLICT (promotion_id, visitor_id) DO NOTHING
    RETURNING * INTO v_start;

    IF v_start.id IS NOT NULL THEN
      v_inserted := true;
    ELSE
      SELECT s.*
      INTO v_start
      FROM public.practice_price_promotion_starts AS s
      WHERE s.promotion_id = v_promo.id
        AND s.visitor_id = v_visitor
      ORDER BY s.started_at ASC, s.id ASC
      LIMIT 1;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT s.*
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

    SELECT s.*
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
  'One-shot personal countdown. Token may start many visitors; each visitor/user gets one window and it never restarts.';

CREATE OR REPLACE FUNCTION public.resolve_practice_effective_price(
  p_practice_id uuid,
  p_surface text,
  p_visitor_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  is_free boolean,
  base_price integer,
  sale_price integer,
  final_price integer,
  promotion_id uuid,
  promotion_name text,
  promotion_type text,
  ends_at timestamptz,
  expires_at timestamptz,
  base_price_minor bigint,
  sale_price_minor bigint,
  final_price_minor bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_now timestamptz := coalesce(p_now, now());
  v_allow_personal boolean := coalesce(p_surface, 'product') IS DISTINCT FROM 'catalog';
  v_promo public.practice_price_promotions%ROWTYPE;
  v_expires timestamptz;
  v_best public.practice_price_promotions%ROWTYPE;
  v_best_expires timestamptz;
BEGIN
  IF p_practice_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id IS NOT NULL
     AND p_visitor_id IS NOT NULL
     AND btrim(p_visitor_id) <> '' THEN
    PERFORM public.bind_practice_price_promotion_starts(p_visitor_id, p_user_id);
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_practice.is_free IS TRUE
     OR v_practice.price IS NULL
     OR v_practice.price <= 0 THEN
    is_free := true;
    base_price := 0;
    sale_price := NULL;
    final_price := 0;
    promotion_id := NULL;
    promotion_name := NULL;
    promotion_type := NULL;
    ends_at := NULL;
    expires_at := NULL;
    base_price_minor := 0;
    sale_price_minor := NULL;
    final_price_minor := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_promo IN
    SELECT *
    FROM public.practice_price_promotions AS promo
    WHERE promo.practice_id = p_practice_id
      AND promo.is_active IS TRUE
      AND promo.sale_price > 0
      AND promo.sale_price < v_practice.price
  LOOP
    v_expires := NULL;

    IF v_promo.promotion_type = 'calendar'
       AND v_promo.starts_at IS NOT NULL
       AND v_promo.ends_at IS NOT NULL
       AND v_promo.ends_at > v_promo.starts_at
       AND v_now >= v_promo.starts_at
       AND v_now < v_promo.ends_at THEN
      v_expires := v_promo.ends_at;
    ELSIF v_allow_personal
          AND v_promo.promotion_type = 'personal_countdown'
          AND v_promo.duration_seconds IS NOT NULL
          AND v_promo.duration_seconds > 0 THEN
      SELECT canonical.expires_at
      INTO v_expires
      FROM (
        SELECT s.started_at, s.expires_at
        FROM public.practice_price_promotion_starts AS s
        WHERE s.promotion_id = v_promo.id
          AND (
            (
              p_visitor_id IS NOT NULL
              AND btrim(p_visitor_id) <> ''
              AND s.visitor_id = lower(btrim(p_visitor_id))
            )
            OR (
              p_user_id IS NOT NULL
              AND s.user_id = p_user_id
            )
          )
        ORDER BY s.started_at ASC, s.id ASC
        LIMIT 1
      ) AS canonical
      WHERE v_now >= canonical.started_at
        AND v_now < canonical.expires_at;
    END IF;

    IF v_expires IS NULL THEN
      CONTINUE;
    END IF;

    IF v_best.id IS NULL OR v_promo.sale_price < v_best.sale_price THEN
      v_best := v_promo;
      v_best_expires := v_expires;
    END IF;
  END LOOP;

  is_free := false;
  base_price := v_practice.price;
  base_price_minor := v_practice.price::bigint * 100;

  IF v_best.id IS NULL THEN
    sale_price := NULL;
    final_price := v_practice.price;
    promotion_id := NULL;
    promotion_name := NULL;
    promotion_type := NULL;
    ends_at := NULL;
    expires_at := NULL;
    sale_price_minor := NULL;
    final_price_minor := base_price_minor;
  ELSE
    sale_price := v_best.sale_price;
    final_price := v_best.sale_price;
    promotion_id := v_best.id;
    promotion_name := v_best.name;
    promotion_type := v_best.promotion_type;
    ends_at := v_best.ends_at;
    expires_at := v_best_expires;
    sale_price_minor := v_best.sale_price::bigint * 100;
    final_price_minor := sale_price_minor;
  END IF;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.resolve_practice_effective_price(uuid, text, text, uuid, timestamptz) IS
  'Resolves base vs sale. Catalog ignores personal countdowns. Personal uses the original window only; bind guest cookie to user when both present.';

COMMIT;
