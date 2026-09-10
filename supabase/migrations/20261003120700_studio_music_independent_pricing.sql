BEGIN;

-- PR3.1: independent listener price vs Studio usage price.
-- Listener A and Studio B are independent. Existing eligible rows keep
-- pre-PR3.1 behaviour via backfill (free listener → Studio free;
-- paid listener → auto_2x_listener). Publication edits never revoke
-- studio_music_entitlements.

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS studio_music_pricing_mode text NULL;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS studio_music_price_minor bigint NULL;

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_studio_music_pricing_mode_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_studio_music_pricing_mode_check
  CHECK (
    studio_music_pricing_mode IS NULL
    OR studio_music_pricing_mode IN ('free', 'auto_2x_listener', 'fixed')
  );

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_studio_music_price_minor_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_studio_music_price_minor_check
  CHECK (
    (
      studio_music_pricing_mode IS DISTINCT FROM 'fixed'
      AND studio_music_price_minor IS NULL
    )
    OR (
      studio_music_pricing_mode = 'fixed'
      AND studio_music_price_minor IS NOT NULL
      AND studio_music_price_minor >= 4900
      AND studio_music_price_minor <= 10000000
      AND studio_music_price_minor % 100 = 0
    )
  );

COMMENT ON COLUMN public.practices.studio_music_pricing_mode IS
  'Studio-use price mode for music/release with platform_reuse_allowed: free | auto_2x_listener | fixed. Independent from listener is_free/price. NULL when not offered for Studio.';

COMMENT ON COLUMN public.practices.studio_music_price_minor IS
  'Fixed Studio-use amount in kopecks. Used only when studio_music_pricing_mode=fixed. Whole-ruble paid range 49–100000 ₽.';

UPDATE public.practices
SET
  studio_music_pricing_mode = CASE
    WHEN is_free IS TRUE OR price IS NULL OR price <= 0 THEN 'free'
    ELSE 'auto_2x_listener'
  END,
  studio_music_price_minor = NULL
WHERE deleted_at IS NULL
  AND music_usage_permission = 'platform_reuse_allowed'
  AND (product_kind = 'music' OR publication_class = 'release')
  AND studio_music_pricing_mode IS NULL;

CREATE OR REPLACE FUNCTION public.resolve_studio_music_acquisition(
  p_practice public.practices,
  p_user_id uuid DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  acquisition_status text,
  pricing_mode text,
  studio_is_free boolean,
  amount_minor bigint,
  listener_is_free boolean,
  listener_amount_minor bigint,
  base_price_minor bigint,
  promotion_price_minor bigint,
  promotion_id uuid,
  promotion_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text;
  v_resolved record;
  v_listener_minor bigint;
  v_listener_free boolean;
  v_amount bigint;
BEGIN
  IF p_practice.id IS NULL
     OR p_practice.deleted_at IS NOT NULL
     OR p_practice.status IS DISTINCT FROM 'published'
     OR NOT public.is_studio_music_publication(p_practice)
     OR p_practice.music_usage_permission IS DISTINCT FROM 'platform_reuse_allowed' THEN
    acquisition_status := 'unavailable';
    pricing_mode := p_practice.studio_music_pricing_mode;
    studio_is_free := false;
    amount_minor := NULL;
    listener_is_free := coalesce(p_practice.is_free, false)
      OR p_practice.price IS NULL
      OR p_practice.price <= 0;
    listener_amount_minor := NULL;
    base_price_minor := NULL;
    promotion_price_minor := NULL;
    promotion_id := NULL;
    promotion_type := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_mode := p_practice.studio_music_pricing_mode;
  IF v_mode IS NULL THEN
    IF p_practice.is_free IS TRUE
       OR p_practice.price IS NULL
       OR p_practice.price <= 0 THEN
      v_mode := 'free';
    ELSE
      v_mode := 'auto_2x_listener';
    END IF;
  END IF;

  SELECT *
  INTO v_resolved
  FROM public.resolve_practice_effective_price(
    p_practice.id,
    'checkout',
    NULL,
    p_user_id,
    coalesce(p_now, now())
  );

  v_listener_minor := v_resolved.final_price_minor;
  v_listener_free :=
    coalesce(v_resolved.is_free, false)
    OR v_listener_minor IS NULL
    OR v_listener_minor <= 0
    OR p_practice.is_free IS TRUE
    OR p_practice.price IS NULL
    OR p_practice.price <= 0;

  IF v_mode = 'free' THEN
    acquisition_status := 'free';
    pricing_mode := 'free';
    studio_is_free := true;
    amount_minor := NULL;
    listener_is_free := v_listener_free;
    listener_amount_minor := CASE WHEN v_listener_free THEN NULL ELSE v_listener_minor END;
    base_price_minor := v_resolved.base_price_minor;
    promotion_price_minor := v_resolved.sale_price_minor;
    promotion_id := v_resolved.promotion_id;
    promotion_type := v_resolved.promotion_type;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_mode = 'fixed' THEN
    v_amount := p_practice.studio_music_price_minor;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      acquisition_status := 'unavailable';
      pricing_mode := 'fixed';
      studio_is_free := false;
      amount_minor := NULL;
      listener_is_free := v_listener_free;
      listener_amount_minor := CASE WHEN v_listener_free THEN NULL ELSE v_listener_minor END;
      base_price_minor := v_resolved.base_price_minor;
      promotion_price_minor := v_resolved.sale_price_minor;
      promotion_id := v_resolved.promotion_id;
      promotion_type := v_resolved.promotion_type;
      RETURN NEXT;
      RETURN;
    END IF;

    acquisition_status := 'paid';
    pricing_mode := 'fixed';
    studio_is_free := false;
    amount_minor := v_amount;
    listener_is_free := v_listener_free;
    listener_amount_minor := CASE WHEN v_listener_free THEN NULL ELSE v_listener_minor END;
    base_price_minor := v_resolved.base_price_minor;
    promotion_price_minor := v_resolved.sale_price_minor;
    promotion_id := v_resolved.promotion_id;
    promotion_type := v_resolved.promotion_type;
    RETURN NEXT;
    RETURN;
  END IF;

  -- auto_2x_listener: 2 × current listener checkout effective.
  IF v_listener_minor IS NULL OR v_listener_minor <= 0 THEN
    acquisition_status := 'unavailable';
    pricing_mode := 'auto_2x_listener';
    studio_is_free := false;
    amount_minor := NULL;
    listener_is_free := true;
    listener_amount_minor := NULL;
    base_price_minor := v_resolved.base_price_minor;
    promotion_price_minor := v_resolved.sale_price_minor;
    promotion_id := v_resolved.promotion_id;
    promotion_type := v_resolved.promotion_type;
    RETURN NEXT;
    RETURN;
  END IF;

  acquisition_status := 'paid';
  pricing_mode := 'auto_2x_listener';
  studio_is_free := false;
  amount_minor := v_listener_minor * 2;
  listener_is_free := false;
  listener_amount_minor := v_listener_minor;
  base_price_minor := v_resolved.base_price_minor;
  promotion_price_minor := v_resolved.sale_price_minor;
  promotion_id := v_resolved.promotion_id;
  promotion_type := v_resolved.promotion_type;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.resolve_studio_music_acquisition(public.practices, uuid, timestamptz) IS
  'audiolad:studio-music-acquisition:v1; canonical Studio acquire price/status. free | auto_2x_listener (2 × listener checkout effective) | fixed (studio_music_price_minor). Listener promotions affect AUTO only. Does not write entitlements or user_practices.';

CREATE OR REPLACE FUNCTION public.create_studio_music_order(
  p_practice_id uuid,
  p_idempotency_key uuid,
  p_expected_amount_minor bigint DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  practice_id uuid,
  practice_slug text,
  status text,
  amount_minor bigint,
  currency text,
  order_kind text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_acquired record;
  v_listener_minor bigint;
  v_amount_minor bigint;
  v_base_price_minor bigint;
  v_promotion_price_minor bigint;
  v_promotion_id uuid;
  v_promotion_type text;
  v_idempotency_key text;
  v_existing public.orders%ROWTYPE;
  v_new_order public.orders%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required'
      USING ERRCODE = '22023';
  END IF;

  v_idempotency_key := p_idempotency_key::text;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  -- True idempotency: replay the original snapshot before live gates.
  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_user_id
       OR v_existing.practice_id IS DISTINCT FROM v_practice.id
       OR v_existing.order_kind IS DISTINCT FROM 'studio_music_license' THEN
      RAISE EXCEPTION 'idempotency_key_conflict'
        USING ERRCODE = '23505';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.practice_id,
      v_existing.practice_slug_snapshot,
      v_existing.status,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.order_kind,
      v_existing.created_at;
    RETURN;
  END IF;

  IF NOT public.is_studio_music_publication(v_practice) THEN
    RAISE EXCEPTION 'not_studio_music'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_acquire_studio_music(v_practice, v_user_id) THEN
    IF v_practice.status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'practice_not_published'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_practice.music_usage_permission IS DISTINCT FROM 'platform_reuse_allowed' THEN
      RAISE EXCEPTION 'studio_reuse_not_allowed'
        USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_acquired
  FROM public.resolve_studio_music_acquisition(
    v_practice,
    v_user_id,
    now()
  );

  IF v_acquired.acquisition_status IS DISTINCT FROM 'paid'
     OR v_acquired.amount_minor IS NULL
     OR v_acquired.amount_minor <= 0 THEN
    RAISE EXCEPTION 'practice_not_for_sale'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.has_studio_music_entitlement(v_user_id, v_practice.id) THEN
    RAISE EXCEPTION 'already_studio_entitled'
      USING ERRCODE = 'P0001';
  END IF;

  v_listener_minor := v_acquired.listener_amount_minor;
  v_amount_minor := v_acquired.amount_minor;
  v_base_price_minor := v_acquired.base_price_minor;
  v_promotion_price_minor := v_acquired.promotion_price_minor;
  v_promotion_id := v_acquired.promotion_id;
  v_promotion_type := v_acquired.promotion_type;

  IF p_expected_amount_minor IS NOT NULL
     AND p_expected_amount_minor IS DISTINCT FROM v_amount_minor THEN
    RAISE EXCEPTION 'price_changed'
      USING ERRCODE = 'P0001',
            DETAIL = format(
              'current_amount_minor=%s;listener_amount_minor=%s;base_price_minor=%s;promotion_price_minor=%s;promotion_id=%s;promotion_type=%s',
              v_amount_minor,
              coalesce(v_listener_minor, 0),
              coalesce(v_base_price_minor, 0),
              coalesce(v_promotion_price_minor::text, ''),
              coalesce(v_promotion_id::text, ''),
              coalesce(v_promotion_type, '')
            );
  END IF;

  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.user_id = v_user_id
    AND o.practice_id = v_practice.id
    AND o.status = 'pending'
    AND o.order_kind = 'studio_music_license'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.practice_id,
      v_existing.practice_slug_snapshot,
      v_existing.status,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.order_kind,
      v_existing.created_at;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      user_id,
      practice_id,
      status,
      amount_minor,
      currency,
      practice_title_snapshot,
      practice_slug_snapshot,
      price_minor_snapshot,
      base_price_minor_snapshot,
      promotion_price_minor_snapshot,
      promotion_id,
      promotion_type,
      author_id_snapshot,
      idempotency_key,
      order_kind,
      target_access_level
    )
    VALUES (
      v_user_id,
      v_practice.id,
      'pending',
      v_amount_minor,
      'RUB',
      v_practice.title,
      v_practice.slug,
      v_amount_minor,
      v_base_price_minor,
      v_promotion_price_minor,
      v_promotion_id,
      v_promotion_type,
      v_practice.author_id,
      v_idempotency_key,
      'studio_music_license',
      NULL
    )
    RETURNING * INTO v_new_order;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.idempotency_key = v_idempotency_key;

      IF FOUND THEN
        IF v_existing.user_id IS DISTINCT FROM v_user_id
           OR v_existing.practice_id IS DISTINCT FROM v_practice.id
           OR v_existing.order_kind IS DISTINCT FROM 'studio_music_license' THEN
          RAISE EXCEPTION 'idempotency_key_conflict'
            USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT
          v_existing.id,
          v_existing.practice_id,
          v_existing.practice_slug_snapshot,
          v_existing.status,
          v_existing.amount_minor,
          v_existing.currency,
          v_existing.order_kind,
          v_existing.created_at;
        RETURN;
      END IF;

      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.user_id = v_user_id
        AND o.practice_id = v_practice.id
        AND o.status = 'pending'
        AND o.order_kind = 'studio_music_license'
      ORDER BY o.created_at DESC
      LIMIT 1;

      IF FOUND THEN
        RETURN QUERY
        SELECT
          v_existing.id,
          v_existing.practice_id,
          v_existing.practice_slug_snapshot,
          v_existing.status,
          v_existing.amount_minor,
          v_existing.currency,
          v_existing.order_kind,
          v_existing.created_at;
        RETURN;
      END IF;

      RAISE;
  END;

  RETURN QUERY
  SELECT
    v_new_order.id,
    v_new_order.practice_id,
    v_new_order.practice_slug_snapshot,
    v_new_order.status,
    v_new_order.amount_minor,
    v_new_order.currency,
    v_new_order.order_kind,
    v_new_order.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_free_studio_music(
  p_practice_id uuid
)
RETURNS TABLE (
  entitlement_id uuid,
  practice_id uuid,
  grant_source text,
  order_id uuid,
  inserted boolean,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_acquired record;
  v_grant jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_studio_music_publication(v_practice) THEN
    RAISE EXCEPTION 'not_studio_music'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_acquire_studio_music(v_practice, v_user_id) THEN
    IF v_practice.status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'practice_not_published'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_practice.music_usage_permission IS DISTINCT FROM 'platform_reuse_allowed' THEN
      RAISE EXCEPTION 'studio_reuse_not_allowed'
        USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_acquired
  FROM public.resolve_studio_music_acquisition(
    v_practice,
    v_user_id,
    now()
  );

  IF v_acquired.acquisition_status IS DISTINCT FROM 'free'
     OR v_acquired.studio_is_free IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'practice_not_free'
      USING ERRCODE = 'P0002';
  END IF;

  v_grant := public.grant_studio_music_entitlement(
    v_user_id,
    v_practice.id,
    'free',
    NULL
  );

  RETURN QUERY
  SELECT
    (v_grant ->> 'id')::uuid,
    (v_grant ->> 'practice_id')::uuid,
    v_grant ->> 'grant_source',
    NULL::uuid,
    coalesce((v_grant ->> 'inserted')::boolean, false),
    (v_grant ->> 'granted_at')::timestamptz;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_studio_music_acquisition(public.practices, uuid, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_studio_music_acquisition(public.practices, uuid, timestamptz)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_studio_music_acquisition(public.practices, uuid, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_studio_music_acquisition(public.practices, uuid, timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint)
  TO authenticated;

REVOKE ALL ON FUNCTION public.acquire_free_studio_music(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_free_studio_music(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.acquire_free_studio_music(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint) IS
  'audiolad:studio-music-order:v2; pending Studio license. Amount from resolve_studio_music_acquisition (AUTO=2× listener checkout; FIXED=studio_music_price_minor). FREE must not create an order. Client expected-amount is a race detector only. Does not write user_practices. EXECUTE: authenticated.';

COMMENT ON FUNCTION public.acquire_free_studio_music(uuid) IS
  'audiolad:studio-music-free:v2; first factual acquire when Studio pricing is free (not listener is_free). Permanent entitlement, no order. Idempotent. EXECUTE: authenticated.';

DO $$
BEGIN
  IF to_regprocedure('public.resolve_studio_music_acquisition(public.practices, uuid, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: resolve_studio_music_acquisition missing';
  END IF;

  IF to_regprocedure('public.create_studio_music_order(uuid, uuid, bigint)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_studio_music_order missing';
  END IF;

  IF to_regprocedure('public.acquire_free_studio_music(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: acquire_free_studio_music missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'practices'
      AND column_name = 'studio_music_pricing_mode'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: studio_music_pricing_mode missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'practices'
      AND column_name = 'studio_music_price_minor'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: studio_music_price_minor missing';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.create_studio_music_order(uuid, uuid, bigint)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must EXECUTE create_studio_music_order';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_studio_music_order(uuid, uuid, bigint)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not EXECUTE create_studio_music_order';
  END IF;
END
$$;

COMMIT;
