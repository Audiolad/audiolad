BEGIN;

-- ---------------------------------------------------------------------------
-- Base price + promotions
--
-- practices.price remains the integer-ruble base / list price.
-- Sale offers live in practice_price_promotions (not a second product field).
-- Orders snapshot base / promotion / final amounts at creation.
-- ---------------------------------------------------------------------------

-- 1) Order snapshot columns (history is immutable; backfill from current snapshot)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS base_price_minor_snapshot bigint,
  ADD COLUMN IF NOT EXISTS promotion_price_minor_snapshot bigint,
  ADD COLUMN IF NOT EXISTS promotion_id uuid,
  ADD COLUMN IF NOT EXISTS promotion_type text;

UPDATE public.orders
SET base_price_minor_snapshot = price_minor_snapshot
WHERE base_price_minor_snapshot IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN base_price_minor_snapshot SET NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_promotion_type_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_promotion_type_check
  CHECK (
    promotion_type IS NULL
    OR promotion_type IN ('calendar', 'personal_countdown')
  );

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_promotion_snapshot_consistency_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_promotion_snapshot_consistency_check
  CHECK (
    (
      promotion_id IS NULL
      AND promotion_type IS NULL
      AND promotion_price_minor_snapshot IS NULL
    )
    OR (
      promotion_id IS NOT NULL
      AND promotion_type IS NOT NULL
      AND promotion_price_minor_snapshot IS NOT NULL
      AND promotion_price_minor_snapshot > 0
    )
  );

COMMENT ON COLUMN public.orders.base_price_minor_snapshot IS
  'Practice base list price in kopecks at order creation.';
COMMENT ON COLUMN public.orders.promotion_price_minor_snapshot IS
  'Applied promotion sale price in kopecks at order creation; null when none.';
COMMENT ON COLUMN public.orders.promotion_id IS
  'practice_price_promotions.id used at order creation; null when none.';
COMMENT ON COLUMN public.orders.promotion_type IS
  'calendar | personal_countdown at order creation; null when none.';

-- 2) Promotions
CREATE TABLE public.practice_price_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,
  name text NOT NULL,
  promotion_type text NOT NULL,
  sale_price integer NOT NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  duration_seconds integer NULL,
  is_active boolean NOT NULL DEFAULT true,
  start_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT practice_price_promotions_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT practice_price_promotions_type_check
    CHECK (promotion_type IN ('calendar', 'personal_countdown')),
  CONSTRAINT practice_price_promotions_sale_price_check
    CHECK (sale_price >= 49 AND sale_price <= 100000),
  CONSTRAINT practice_price_promotions_calendar_window_check
    CHECK (
      promotion_type <> 'calendar'
      OR (
        starts_at IS NOT NULL
        AND ends_at IS NOT NULL
        AND ends_at > starts_at
      )
    ),
  CONSTRAINT practice_price_promotions_personal_duration_check
    CHECK (
      promotion_type <> 'personal_countdown'
      OR (
        duration_seconds IS NOT NULL
        AND duration_seconds >= 60
        AND duration_seconds <= 2592000
      )
    ),
  CONSTRAINT practice_price_promotions_start_token_check
    CHECK (char_length(start_token) BETWEEN 16 AND 64)
);

CREATE UNIQUE INDEX practice_price_promotions_start_token_uidx
  ON public.practice_price_promotions (start_token);

CREATE INDEX practice_price_promotions_practice_id_idx
  ON public.practice_price_promotions (practice_id);

CREATE INDEX practice_price_promotions_practice_active_idx
  ON public.practice_price_promotions (practice_id, is_active, promotion_type);

COMMENT ON TABLE public.practice_price_promotions IS
  'Sale promotions for a practice. Distinct from promotion_campaigns (marketing). practices.price stays the base list price.';

-- 3) Personal countdown starts
CREATE TABLE public.practice_price_promotion_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL
    REFERENCES public.practice_price_promotions (id)
    ON DELETE CASCADE,
  visitor_id text NOT NULL,
  user_id uuid NULL
    REFERENCES auth.users (id)
    ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT practice_price_promotion_starts_visitor_check
    CHECK (char_length(visitor_id) BETWEEN 8 AND 64),
  CONSTRAINT practice_price_promotion_starts_window_check
    CHECK (expires_at > started_at)
);

CREATE UNIQUE INDEX practice_price_promotion_starts_promo_visitor_uidx
  ON public.practice_price_promotion_starts (promotion_id, visitor_id);

CREATE INDEX practice_price_promotion_starts_promo_user_idx
  ON public.practice_price_promotion_starts (promotion_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX practice_price_promotion_starts_expires_idx
  ON public.practice_price_promotion_starts (promotion_id, expires_at);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_promotion_id_fkey
  FOREIGN KEY (promotion_id)
  REFERENCES public.practice_price_promotions (id)
  ON DELETE SET NULL;

COMMENT ON TABLE public.practice_price_promotion_starts IS
  'Per-visitor personal countdown windows. Catalog never uses these rows.';

-- 4) RLS
ALTER TABLE public.practice_price_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_price_promotion_starts ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_price_promotions_public_select
  ON public.practice_price_promotions
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.practices AS p
      WHERE p.id = practice_price_promotions.practice_id
        AND p.status = 'published'
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY practice_price_promotions_author_select
  ON public.practice_price_promotions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = practice_price_promotions.practice_id
        AND p.deleted_at IS NULL
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

CREATE POLICY practice_price_promotions_author_insert
  ON public.practice_price_promotions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = practice_price_promotions.practice_id
        AND p.deleted_at IS NULL
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

CREATE POLICY practice_price_promotions_author_update
  ON public.practice_price_promotions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = practice_price_promotions.practice_id
        AND p.deleted_at IS NULL
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = practice_price_promotions.practice_id
        AND p.deleted_at IS NULL
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

CREATE POLICY practice_price_promotions_author_delete
  ON public.practice_price_promotions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = practice_price_promotions.practice_id
        AND p.deleted_at IS NULL
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

-- Starts are not client-readable. SECURITY DEFINER RPCs resolve them.
REVOKE ALL ON TABLE public.practice_price_promotion_starts FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_price_promotion_starts FROM anon;
REVOKE ALL ON TABLE public.practice_price_promotion_starts FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.practice_price_promotions
  TO authenticated;
GRANT SELECT ON TABLE public.practice_price_promotions TO anon;

-- 5) Resolve effective price (mirrors src/lib/pricing/resolve.ts)
CREATE FUNCTION public.resolve_practice_effective_price(
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
STABLE
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
      SELECT s.expires_at
      INTO v_expires
      FROM public.practice_price_promotion_starts AS s
      WHERE s.promotion_id = v_promo.id
        AND v_now >= s.started_at
        AND v_now < s.expires_at
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
      ORDER BY s.expires_at DESC
      LIMIT 1;
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

REVOKE ALL ON FUNCTION public.resolve_practice_effective_price(uuid, text, text, uuid, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_practice_effective_price(uuid, text, text, uuid, timestamptz)
  TO anon, authenticated;

COMMENT ON FUNCTION public.resolve_practice_effective_price(uuid, text, text, uuid, timestamptz) IS
  'Resolves base vs sale price. Catalog surface ignores personal countdowns.';

-- 6) Universal personal-promotion start
CREATE FUNCTION public.start_practice_price_promotion(
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

  SELECT s.*
  INTO v_existing
  FROM public.practice_price_promotion_starts AS s
  WHERE s.promotion_id = v_promo.id
    AND s.visitor_id = v_visitor;

  IF FOUND AND v_existing.expires_at > v_now THEN
    IF v_user IS NOT NULL AND v_existing.user_id IS NULL THEN
      UPDATE public.practice_price_promotion_starts
      SET user_id = v_user
      WHERE id = v_existing.id
        AND user_id IS NULL
      RETURNING * INTO v_existing;
    END IF;

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

  IF FOUND THEN
    UPDATE public.practice_price_promotion_starts
    SET
      started_at = v_now,
      expires_at = v_expires,
      user_id = coalesce(v_user, user_id)
    WHERE id = v_existing.id
    RETURNING * INTO v_start;
  ELSE
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
    RETURNING * INTO v_start;
  END IF;

  practice_id := v_promo.practice_id;
  promotion_id := v_promo.id;
  started_at := v_start.started_at;
  expires_at := v_start.expires_at;
  sale_price := v_promo.sale_price;
  reused := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.start_practice_price_promotion(text, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_practice_price_promotion(text, text, uuid)
  TO anon, authenticated;

COMMENT ON FUNCTION public.start_practice_price_promotion(text, text, uuid) IS
  'Universal personal-countdown trigger. Token is not bound to a specific article or landing.';

COMMIT;
