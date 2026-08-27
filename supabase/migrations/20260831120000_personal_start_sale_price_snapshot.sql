BEGIN;

-- Snapshot the personal-countdown sale price on first start so an in-flight
-- buyer window keeps the price they started with. Calendar promotions and
-- author promo_preview are unchanged. Do not edit earlier start/resolve
-- migrations; this file replaces the live functions.

ALTER TABLE public.practice_price_promotion_starts
  ADD COLUMN IF NOT EXISTS sale_price_snapshot integer;

UPDATE public.practice_price_promotion_starts AS starts
SET sale_price_snapshot = promo.sale_price
FROM public.practice_price_promotions AS promo
WHERE starts.promotion_id = promo.id
  AND starts.sale_price_snapshot IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.practice_price_promotion_starts
    WHERE sale_price_snapshot IS NULL
  ) THEN
    RAISE EXCEPTION 'sale_price_snapshot backfill left NULL rows';
  END IF;
END
$$;

ALTER TABLE public.practice_price_promotion_starts
  ALTER COLUMN sale_price_snapshot SET NOT NULL;

ALTER TABLE public.practice_price_promotion_starts
  DROP CONSTRAINT IF EXISTS practice_price_promotion_starts_sale_price_snapshot_check;

ALTER TABLE public.practice_price_promotion_starts
  ADD CONSTRAINT practice_price_promotion_starts_sale_price_snapshot_check
  CHECK (sale_price_snapshot >= 49 AND sale_price_snapshot <= 100000);

COMMENT ON COLUMN public.practice_price_promotion_starts.sale_price_snapshot IS
  'Integer rubles frozen on first INSERT. Reuse and bind never rewrite it. Resolver uses this, not live promotion.sale_price.';

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
    sale_price := v_existing.sale_price_snapshot;
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
          expires_at,
          sale_price_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (promotion_id, visitor_id) DO NOTHING
        RETURNING starts.*
      $insert$
    INTO v_start
    USING v_promo.id, v_visitor, v_user, v_now, v_expires, v_promo.sale_price;

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
  sale_price := v_start.sale_price_snapshot;
  reused := NOT v_inserted;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.start_practice_price_promotion(text, text, uuid) IS
  'One-shot personal countdown. First INSERT freezes sale_price_snapshot; reuse returns that snapshot and never rewrites started_at / expires_at / sale_price_snapshot.';

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
  v_effective integer;
  v_best public.practice_price_promotions%ROWTYPE;
  v_best_expires timestamptz;
  v_best_price integer;
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
  LOOP
    v_expires := NULL;
    v_effective := NULL;

    IF v_promo.promotion_type = 'calendar'
       AND v_promo.starts_at IS NOT NULL
       AND v_promo.ends_at IS NOT NULL
       AND v_promo.ends_at > v_promo.starts_at
       AND v_now >= v_promo.starts_at
       AND v_now < v_promo.ends_at
       AND v_promo.sale_price > 0
       AND v_promo.sale_price < v_practice.price THEN
      v_expires := v_promo.ends_at;
      v_effective := v_promo.sale_price;
    ELSIF v_allow_personal
          AND v_promo.promotion_type = 'personal_countdown'
          AND v_promo.duration_seconds IS NOT NULL
          AND v_promo.duration_seconds > 0 THEN
      SELECT canonical.expires_at, canonical.sale_price_snapshot
      INTO v_expires, v_effective
      FROM (
        SELECT s.started_at, s.expires_at, s.sale_price_snapshot
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
        AND v_now < canonical.expires_at
        AND canonical.sale_price_snapshot > 0
        AND canonical.sale_price_snapshot < v_practice.price;
    END IF;

    IF v_expires IS NULL OR v_effective IS NULL THEN
      CONTINUE;
    END IF;

    IF v_best.id IS NULL OR v_effective < v_best_price THEN
      v_best := v_promo;
      v_best_expires := v_expires;
      v_best_price := v_effective;
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
    sale_price := v_best_price;
    final_price := v_best_price;
    promotion_id := v_best.id;
    promotion_name := v_best.name;
    promotion_type := v_best.promotion_type;
    ends_at := v_best.ends_at;
    expires_at := v_best_expires;
    sale_price_minor := v_best_price::bigint * 100;
    final_price_minor := sale_price_minor;
  END IF;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.resolve_practice_effective_price(uuid, text, text, uuid, timestamptz) IS
  'Resolves base vs sale. Personal countdown uses start.sale_price_snapshot, not live promotion.sale_price. Name/copy stay on the live promotion row. Catalog ignores personal. Disable (is_active=false) still stops the offer. create_practice_order snapshots this resolved amount.';

COMMIT;
