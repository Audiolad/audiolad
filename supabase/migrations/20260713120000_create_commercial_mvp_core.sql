BEGIN;

-- ---------------------------------------------------------------------------
-- Commercial MVP core: orders, payments, purchase grant
--
-- Product decisions (2026-07-13):
--   - Seller: ИП Сергей
--   - One practice per order; currency RUB only; refunds manual
--   - practices = catalog + current list price (integer rubles today)
--   - user_practices = entitlement / library (unchanged)
--   - Legacy public.purchases is NOT used by this commerce flow
--
-- Money model:
--   amount_minor BIGINT = kopecks (100 RUB => 10000)
--   price_minor_snapshot = immutable list price at order creation (kopecks)
--   At MVP checkout creation both values are equal; snapshot is audit-only.
--
-- Migration model: one-shot incremental migration (not re-runnable).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. orders
-- ---------------------------------------------------------------------------

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE RESTRICT,

  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'pending',

  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',

  practice_title_snapshot text NOT NULL,
  practice_slug_snapshot text NOT NULL,
  price_minor_snapshot bigint NOT NULL,

  idempotency_key text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL,

  CONSTRAINT orders_amount_minor_positive_check
    CHECK (amount_minor > 0),

  CONSTRAINT orders_price_minor_snapshot_positive_check
    CHECK (price_minor_snapshot > 0),

  CONSTRAINT orders_currency_rub_check
    CHECK (currency = 'RUB'),

  CONSTRAINT orders_status_check
    CHECK (status IN (
      'pending',
      'paid',
      'cancelled',
      'failed',
      'refunded'
    )),

  CONSTRAINT orders_paid_at_consistency_check
    CHECK (status <> 'paid' OR paid_at IS NOT NULL),

  CONSTRAINT orders_cancelled_at_consistency_check
    CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),

  CONSTRAINT orders_failed_at_consistency_check
    CHECK (status <> 'failed' OR failed_at IS NOT NULL),

  CONSTRAINT orders_refunded_at_consistency_check
    CHECK (status <> 'refunded' OR refunded_at IS NOT NULL)
);

CREATE UNIQUE INDEX orders_idempotency_key_unique_idx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX orders_one_pending_per_user_practice_idx
  ON public.orders (user_id, practice_id)
  WHERE status = 'pending';

CREATE INDEX orders_user_id_created_at_idx
  ON public.orders (user_id, created_at DESC);

CREATE INDEX orders_practice_id_idx
  ON public.orders (practice_id);

CREATE INDEX orders_status_idx
  ON public.orders (status);

COMMENT ON TABLE public.orders IS
  'Commercial MVP orders: one user, one practice, snapshot pricing. Legacy public.purchases is not used.';

COMMENT ON COLUMN public.orders.amount_minor IS
  'Payable amount in kopecks (canonical charge amount for this order).';

COMMENT ON COLUMN public.orders.price_minor_snapshot IS
  'Practice list price in kopecks at order creation (immutable audit snapshot).';

-- ---------------------------------------------------------------------------
-- 2. payments
-- ---------------------------------------------------------------------------

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id uuid NOT NULL
    REFERENCES public.orders (id)
    ON DELETE RESTRICT,

  provider text NOT NULL,
  provider_payment_id text NULL,

  idempotency_key text NOT NULL,

  status text NOT NULL DEFAULT 'pending',

  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',

  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL,

  CONSTRAINT payments_amount_minor_positive_check
    CHECK (amount_minor > 0),

  CONSTRAINT payments_currency_rub_check
    CHECK (currency = 'RUB'),

  CONSTRAINT payments_status_check
    CHECK (status IN (
      'pending',
      'succeeded',
      'cancelled',
      'failed',
      'refunded'
    )),

  CONSTRAINT payments_succeeded_confirmed_at_check
    CHECK (status <> 'succeeded' OR confirmed_at IS NOT NULL),

  CONSTRAINT payments_failed_at_consistency_check
    CHECK (status <> 'failed' OR failed_at IS NOT NULL),

  CONSTRAINT payments_refunded_at_consistency_check
    CHECK (status <> 'refunded' OR refunded_at IS NOT NULL)
);

CREATE UNIQUE INDEX payments_provider_payment_id_unique_idx
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX payments_provider_idempotency_key_unique_idx
  ON public.payments (provider, idempotency_key);

CREATE INDEX payments_order_id_idx
  ON public.payments (order_id);

CREATE INDEX payments_status_idx
  ON public.payments (status);

CREATE INDEX payments_created_at_idx
  ON public.payments (created_at DESC);

COMMENT ON TABLE public.payments IS
  'Provider payment attempts linked to orders. provider_metadata is server-only.';

COMMENT ON COLUMN public.payments.provider_metadata IS
  'Raw provider payload; must not be exposed to clients via RLS/API.';

-- ---------------------------------------------------------------------------
-- 3. grant_practice_purchase_access
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.grant_practice_purchase_access(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  locked_order public.orders%ROWTYPE;
  inserted_count integer;
  existing_count integer;
BEGIN
  SELECT *
  INTO locked_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF locked_order.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Order % is not paid (status=%)', p_order_id, locked_order.status;
  END IF;

  SELECT count(*)
  INTO existing_count
  FROM public.user_practices AS up
  WHERE up.user_id = locked_order.user_id
    AND up.practice_id = locked_order.practice_id;

  INSERT INTO public.user_practices (
    user_id,
    practice_id,
    access_source,
    metadata
  )
  VALUES (
    locked_order.user_id,
    locked_order.practice_id,
    'purchase',
    jsonb_build_object(
      'order_id', locked_order.id,
      'granted_via', 'grant_practice_purchase_access'
    )
  )
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'order_id', locked_order.id,
    'user_id', locked_order.user_id,
    'practice_id', locked_order.practice_id,
    'inserted', inserted_count = 1,
    'library_rows_before', existing_count,
    'library_rows_after', existing_count + inserted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_practice_purchase_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_practice_purchase_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_practice_purchase_access(uuid) FROM authenticated;

COMMENT ON FUNCTION public.grant_practice_purchase_access(uuid) IS
  'audiolad:purchase-grant:v1; grants library access for a paid order; idempotent via user_practices unique; reads user/practice only from order row';

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON public.orders
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.orders FROM PUBLIC;
REVOKE ALL ON TABLE public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.orders FROM authenticated;
GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

REVOKE ALL ON TABLE public.payments FROM PUBLIC;
REVOKE ALL ON TABLE public.payments FROM anon, authenticated;
GRANT ALL ON TABLE public.payments TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Legacy purchases note (table unchanged)
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.purchases IS
  'Legacy placeholder. Commercial MVP uses public.orders + public.payments instead; do not write new purchase flow here.';

-- ---------------------------------------------------------------------------
-- 6. Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: public.orders was not created';
  END IF;

  IF to_regclass('public.payments') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: public.payments was not created';
  END IF;

  IF to_regprocedure('public.grant_practice_purchase_access(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: grant_practice_purchase_access was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'Users can view own orders'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: orders SELECT policy missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: payments must not have client policies in MVP';
  END IF;
END;
$$;

COMMIT;
