BEGIN;

-- ---------------------------------------------------------------------------
-- create_practice_order
--
-- Safe pending-order creation for authenticated users.
-- Does NOT create payments, does NOT grant access, does NOT mark orders paid.
--
-- Price model (verified against baseline / test DB):
--   practices.price = integer rubles (nullable, default 0)
--   orders.amount_minor / price_minor_snapshot = kopecks (price * 100)
--
-- Idempotency:
--   orders.idempotency_key is text; function accepts uuid and stores ::text
--   Global UNIQUE on idempotency_key (partial, WHERE NOT NULL)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.create_practice_order(
  p_practice_slug text,
  p_idempotency_key uuid
)
RETURNS TABLE (
  order_id uuid,
  practice_id uuid,
  practice_slug text,
  status text,
  amount_minor bigint,
  currency text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_price_minor bigint;
  v_idempotency_key text;
  v_existing public.orders%ROWTYPE;
  v_new_order public.orders%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_slug IS NULL OR btrim(p_practice_slug) = '' THEN
    RAISE EXCEPTION 'practice_slug_required'
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
  WHERE p.slug = p_practice_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_published'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.is_free IS TRUE
     OR v_practice.price IS NULL
     OR v_practice.price <= 0 THEN
    RAISE EXCEPTION 'practice_not_for_sale'
      USING ERRCODE = 'P0002';
  END IF;

  v_price_minor := v_practice.price::bigint * 100;

  IF v_price_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_practice_price'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_practices AS up
    WHERE up.user_id = v_user_id
      AND up.practice_id = v_practice.id
      AND (up.expires_at IS NULL OR up.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'already_owned'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.practice_id IS DISTINCT FROM v_practice.id THEN
      RAISE EXCEPTION 'idempotency_key_practice_mismatch'
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
      idempotency_key
    )
    VALUES (
      v_user_id,
      v_practice.id,
      'pending',
      v_price_minor,
      'RUB',
      v_practice.title,
      v_practice.slug,
      v_price_minor,
      v_idempotency_key
    )
    RETURNING * INTO v_new_order;

  EXCEPTION
    WHEN unique_violation THEN
      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.idempotency_key = v_idempotency_key;

      IF FOUND THEN
        IF v_existing.user_id IS DISTINCT FROM v_user_id THEN
          RAISE EXCEPTION 'idempotency_key_conflict'
            USING ERRCODE = '23505';
        END IF;

        IF v_existing.practice_id IS DISTINCT FROM v_practice.id THEN
          RAISE EXCEPTION 'idempotency_key_practice_mismatch'
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
          v_existing.created_at;
        RETURN;
      END IF;

      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.user_id = v_user_id
        AND o.practice_id = v_practice.id
        AND o.status = 'pending';

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
    v_new_order.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_practice_order(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_practice_order(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_practice_order(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_practice_order(text, uuid) IS
  'audiolad:create-order:v1; creates pending order from published paid practice; user_id from auth.uid(); price from practices.price (rubles to kopecks); idempotent by idempotency_key; does not create payments or grant access';

-- ---------------------------------------------------------------------------
-- Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.create_practice_order(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_practice_order was not created';
  END IF;

  IF has_function_privilege('authenticated', 'public.create_practice_order(text,uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must have EXECUTE on create_practice_order';
  END IF;

  IF has_function_privilege('anon', 'public.create_practice_order(text,uuid)', 'EXECUTE') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not have EXECUTE on create_practice_order';
  END IF;
END;
$$;

COMMIT;
