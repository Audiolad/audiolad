BEGIN;

-- PR1: studio_music_license order kind + create/free RPCs.
-- Does not overload create_practice_order. Pending uniqueness is scoped
-- by order_kind so a listener pending and a Studio pending can coexist.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_kind_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_kind_check
  CHECK (order_kind IN (
    'product_purchase',
    'course_upgrade',
    'studio_music_license'
  ));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_course_upgrade_target_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_course_upgrade_target_check
  CHECK (
    (order_kind = 'product_purchase' AND target_access_level IS NULL)
    OR (order_kind = 'course_upgrade' AND target_access_level >= 2)
    OR (order_kind = 'studio_music_license' AND target_access_level IS NULL)
  );

COMMENT ON COLUMN public.orders.order_kind IS
  'product_purchase = listener/base sale (DEFAULT). course_upgrade = sequential course access-level upgrade. studio_music_license = Studio-use license for a music publication; does not grant user_practices.';

DROP INDEX IF EXISTS public.orders_one_pending_per_user_practice_idx;

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_pending_per_user_practice_kind_idx
  ON public.orders (user_id, practice_id, order_kind)
  WHERE status = 'pending';

COMMENT ON INDEX public.orders_one_pending_per_user_practice_kind_idx IS
  'One live pending charge per (user, practice, order_kind). Listener and Studio checkouts do not share a pending slot.';

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
  v_resolved record;
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

  IF v_practice.is_free IS TRUE
     OR v_practice.price IS NULL
     OR v_practice.price <= 0 THEN
    RAISE EXCEPTION 'practice_not_for_sale'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.has_studio_music_entitlement(v_user_id, v_practice.id) THEN
    RAISE EXCEPTION 'already_studio_entitled'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_resolved
  FROM public.resolve_practice_effective_price(
    v_practice.id,
    'checkout',
    NULL,
    v_user_id,
    now()
  );

  IF v_resolved.final_price_minor IS NULL OR v_resolved.final_price_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_practice_price'
      USING ERRCODE = '22023';
  END IF;

  v_listener_minor := v_resolved.final_price_minor;
  v_amount_minor := v_listener_minor * 2;
  v_base_price_minor := v_resolved.base_price_minor;
  v_promotion_price_minor := v_resolved.sale_price_minor;
  v_promotion_id := v_resolved.promotion_id;
  v_promotion_type := v_resolved.promotion_type;

  IF v_amount_minor IS NULL OR v_amount_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_practice_price'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_amount_minor IS NOT NULL
     AND p_expected_amount_minor IS DISTINCT FROM v_amount_minor THEN
    RAISE EXCEPTION 'price_changed'
      USING ERRCODE = 'P0001',
            DETAIL = format(
              'current_amount_minor=%s;listener_amount_minor=%s;base_price_minor=%s;promotion_price_minor=%s;promotion_id=%s;promotion_type=%s',
              v_amount_minor,
              v_listener_minor,
              v_base_price_minor,
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

  IF v_practice.is_free IS DISTINCT FROM TRUE THEN
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
  'audiolad:studio-music-order:v1; pending Studio license. Amount = 2 × resolve_practice_effective_price (server snapshot). Ignores client amount except expected-amount race. Does not write user_practices. already_studio_entitled is separate from listener already_owned. EXECUTE: authenticated.';

COMMENT ON FUNCTION public.acquire_free_studio_music(uuid) IS
  'audiolad:studio-music-free:v1; first factual acquire of free + platform_reuse_allowed music. Permanent entitlement, no order. Idempotent. EXECUTE: authenticated.';

DO $$
BEGIN
  IF to_regprocedure('public.create_studio_music_order(uuid, uuid, bigint)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_studio_music_order missing';
  END IF;

  IF to_regprocedure('public.acquire_free_studio_music(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: acquire_free_studio_music missing';
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
