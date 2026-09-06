BEGIN;

-- Native sequential course upgrade order.
-- Server derives next level and amount from catalog + active entitlement.
-- Client amount is never accepted. already_owned is NOT used here.

CREATE OR REPLACE FUNCTION public.create_course_upgrade_order(
  p_practice_id uuid,
  p_idempotency_key uuid,
  p_expected_target_access_level integer DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  practice_id uuid,
  practice_slug text,
  status text,
  amount_minor bigint,
  currency text,
  order_kind text,
  target_access_level integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_current integer;
  v_target integer;
  v_level public.practice_access_levels%ROWTYPE;
  v_amount_minor bigint;
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_published'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.publication_class IS DISTINCT FROM 'course' THEN
    RAISE EXCEPTION 'not_course'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.viewer_can_commercially_access_practice(v_practice, v_user_id) THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.is_free IS TRUE
     OR v_practice.price IS NULL
     OR v_practice.price <= 0 THEN
    RAISE EXCEPTION 'practice_not_for_sale'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT up.access_level
  INTO v_current
  FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = v_practice.id
    AND (up.expires_at IS NULL OR up.expires_at > now());

  IF NOT FOUND OR v_current IS NULL THEN
    RAISE EXCEPTION 'not_entitled'
      USING ERRCODE = 'P0001';
  END IF;

  v_target := v_current + 1;

  IF v_target < 2 THEN
    RAISE EXCEPTION 'invalid_upgrade_target'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_target_access_level IS NOT NULL
     AND p_expected_target_access_level IS DISTINCT FROM v_target THEN
    RAISE EXCEPTION 'invalid_target_access_level'
      USING ERRCODE = '22023',
            DETAIL = format('expected=%s;current=%s', v_target, v_current);
  END IF;

  SELECT pal.*
  INTO v_level
  FROM public.practice_access_levels AS pal
  WHERE pal.practice_id = v_practice.id
    AND pal.level = v_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'upgrade_not_configured'
      USING ERRCODE = 'P0001',
            DETAIL = 'level_not_in_catalog';
  END IF;

  IF v_level.currency IS DISTINCT FROM 'RUB' THEN
    RAISE EXCEPTION 'invalid_upgrade_currency'
      USING ERRCODE = '22023';
  END IF;

  IF v_level.upgrade_price IS NULL OR v_level.upgrade_price <= 0 THEN
    RAISE EXCEPTION 'upgrade_not_configured'
      USING ERRCODE = 'P0001',
            DETAIL = 'upgrade_price_required';
  END IF;

  -- Integer RUB → kopecks. Client amount is ignored.
  v_amount_minor := (v_level.upgrade_price::bigint) * 100;

  IF v_amount_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_upgrade_price'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency replay
  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.practice_id IS DISTINCT FROM v_practice.id
       OR v_existing.order_kind IS DISTINCT FROM 'course_upgrade'
       OR v_existing.target_access_level IS DISTINCT FROM v_target THEN
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
      v_existing.target_access_level,
      v_existing.created_at;
    RETURN;
  END IF;

  -- Reuse live pending upgrade for same user+practice+target.
  -- Existing UNIQUE (user_id, practice_id) WHERE pending is the SoT
  -- against two live charges. Amount stays (config drift).
  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.user_id = v_user_id
    AND o.practice_id = v_practice.id
    AND o.status = 'pending'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.order_kind IS DISTINCT FROM 'course_upgrade'
       OR v_existing.target_access_level IS DISTINCT FROM v_target THEN
      RAISE EXCEPTION 'pending_order_exists'
        USING ERRCODE = '23505',
              HINT = format('existing_order_id=%s', v_existing.id);
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
      v_existing.target_access_level,
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
      v_practice.author_id,
      v_idempotency_key,
      'course_upgrade',
      v_target
    )
    RETURNING * INTO v_new_order;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.idempotency_key = v_idempotency_key;

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
          v_existing.target_access_level,
          v_existing.created_at;
        RETURN;
      END IF;

      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.user_id = v_user_id
        AND o.practice_id = v_practice.id
        AND o.status = 'pending'
      ORDER BY o.created_at DESC
      LIMIT 1;

      IF FOUND
         AND v_existing.order_kind = 'course_upgrade'
         AND v_existing.target_access_level IS NOT DISTINCT FROM v_target THEN
        RETURN QUERY
        SELECT
          v_existing.id,
          v_existing.practice_id,
          v_existing.practice_slug_snapshot,
          v_existing.status,
          v_existing.amount_minor,
          v_existing.currency,
          v_existing.order_kind,
          v_existing.target_access_level,
          v_existing.created_at;
        RETURN;
      END IF;

      IF FOUND THEN
        RAISE EXCEPTION 'pending_order_exists'
          USING ERRCODE = '23505',
                HINT = format('existing_order_id=%s', v_existing.id);
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
    v_new_order.target_access_level,
    v_new_order.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_course_upgrade_order(uuid, uuid, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_course_upgrade_order(uuid, uuid, integer)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.create_course_upgrade_order(uuid, uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.create_course_upgrade_order(uuid, uuid, integer) IS
  'audiolad:course-upgrade-order:v1; sequential native upgrade. Server derives current+1 and upgrade_price. Ignores client amount. Requires active entitlement. Does not use already_owned. EXECUTE: authenticated.';

DO $$
BEGIN
  IF to_regprocedure('public.create_course_upgrade_order(uuid, uuid, integer)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_course_upgrade_order missing';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.create_course_upgrade_order(uuid, uuid, integer)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must EXECUTE create_course_upgrade_order';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_course_upgrade_order(uuid, uuid, integer)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not EXECUTE create_course_upgrade_order';
  END IF;
END
$$;

COMMIT;
