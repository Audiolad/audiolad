BEGIN;

-- ---------------------------------------------------------------------------
-- Payments P3.3.1: refund fact layer
--
-- Goals:
--   * one append-only fact table for refunds (partial + full, multi-refund)
--   * money reserve so concurrent requests can never over-refund a payment
--   * explicit status machine with provider-driven transitions
--   * append-only finance audit trail for every state change
--   * cash-activity refund analytics that never rewrites P3.1 gross
--
-- Does NOT: author ledger, commission, payouts, provider fees, auto access
-- revoke, historical backfill. payments.status stays 'succeeded' after refund.
--
-- Reserve model (important):
--   in_flight        = requested | submitted | pending   (provider work open)
--   requires_review  = unknown provider state            (money still reserved)
--   reserved         = in_flight + requires_review
--   refundable       = payment.amount_minor - confirmed - reserved
-- A transport timeout must not release the reserve, otherwise a retry could
-- double-refund the same money.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Refund fact table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  payment_id uuid NOT NULL
    REFERENCES public.payments (id)
    ON DELETE RESTRICT,

  order_id uuid NOT NULL
    REFERENCES public.orders (id)
    ON DELETE RESTRICT,

  provider text NOT NULL,
  provider_payment_id text NULL,
  provider_refund_id text NULL,

  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',

  kind text NULL,
  status text NOT NULL DEFAULT 'requested',

  reason_code text NOT NULL,
  reason_text text NULL,
  access_effect text NOT NULL DEFAULT 'keep',

  requested_by uuid NULL
    REFERENCES auth.users (id)
    ON DELETE SET NULL,

  requested_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  confirmed_at timestamptz NULL,
  failed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  requires_review_at timestamptz NULL,

  provider_created_at timestamptz NULL,
  provider_updated_at timestamptz NULL,

  idempotency_key text NOT NULL,
  provider_request_id text NULL,
  provider_status text NULL,

  failure_code text NULL,
  failure_message_safe text NULL,

  is_test boolean NOT NULL DEFAULT false,
  metadata_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_refunds_amount_minor_positive_check
    CHECK (amount_minor > 0),

  CONSTRAINT payment_refunds_provider_check
    CHECK (provider IN ('tochka')),

  CONSTRAINT payment_refunds_status_check
    CHECK (status IN (
      'requested',
      'submitted',
      'pending',
      'succeeded',
      'failed',
      'cancelled',
      'requires_review'
    )),

  CONSTRAINT payment_refunds_kind_check
    CHECK (kind IS NULL OR kind IN ('partial', 'full')),

  CONSTRAINT payment_refunds_access_effect_check
    CHECK (access_effect IN ('keep', 'revoke', 'manual_review')),

  CONSTRAINT payment_refunds_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),

  CONSTRAINT payment_refunds_reason_code_check
    CHECK (btrim(reason_code) <> ''),

  CONSTRAINT payment_refunds_idempotency_key_check
    CHECK (btrim(idempotency_key) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_idempotency_key_uidx
  ON public.payment_refunds (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_provider_refund_id_uidx
  ON public.payment_refunds (provider, provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_refunds_payment_id_idx
  ON public.payment_refunds (payment_id);

CREATE INDEX IF NOT EXISTS payment_refunds_order_id_idx
  ON public.payment_refunds (order_id);

CREATE INDEX IF NOT EXISTS payment_refunds_status_requested_at_idx
  ON public.payment_refunds (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS payment_refunds_confirmed_at_idx
  ON public.payment_refunds (confirmed_at DESC)
  WHERE status = 'succeeded';

CREATE INDEX IF NOT EXISTS payment_refunds_is_test_status_idx
  ON public.payment_refunds (is_test, status);

CREATE INDEX IF NOT EXISTS payment_refunds_provider_payment_id_idx
  ON public.payment_refunds (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

COMMENT ON TABLE public.payment_refunds IS
  'audiolad:payments-p331; refund facts per payment (partial + full). Never mutates payments.status; access revoke is manual.';

COMMENT ON COLUMN public.payment_refunds.provider_refund_id IS
  'Provider refund operation id. Tochka: Data.orderId from POST /acquiring/v1.0/payments/{operationId}/refund.';

COMMENT ON COLUMN public.payment_refunds.kind IS
  'Snapshot at request time: full when the amount closed the remaining refundable balance, else partial.';

COMMENT ON COLUMN public.payment_refunds.access_effect IS
  'keep = entitlement untouched; manual_review = full refund needs human access decision; revoke = reserved for future manual revoke (never automatic in P3.3.1).';

COMMENT ON COLUMN public.payment_refunds.metadata_snapshot IS
  'Sanitized audit subset only: never provider tokens, never payer PII.';

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_refunds FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_refunds FROM anon, authenticated;
GRANT ALL ON TABLE public.payment_refunds TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Append-only finance audit log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  actor_user_id uuid NULL
    REFERENCES auth.users (id)
    ON DELETE SET NULL,

  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,

  reason text NULL,
  safe_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finance_audit_log_action_check
    CHECK (btrim(action) <> ''),

  CONSTRAINT finance_audit_log_entity_type_check
    CHECK (btrim(entity_type) <> '')
);

CREATE INDEX IF NOT EXISTS finance_audit_log_entity_idx
  ON public.finance_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS finance_audit_log_created_at_idx
  ON public.finance_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS finance_audit_log_actor_idx
  ON public.finance_audit_log (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_audit_log_correlation_idx
  ON public.finance_audit_log (correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON TABLE public.finance_audit_log IS
  'audiolad:payments-p331; append-only finance trail. No UPDATE/DELETE grants, sanitized snapshots only.';

ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.finance_audit_log FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_audit_log FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.finance_audit_log TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Pure helpers: statuses, transitions, settlement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payment_refund_in_flight_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['requested', 'submitted', 'pending']::text[];
$$;

COMMENT ON FUNCTION public.payment_refund_in_flight_statuses IS
  'audiolad:payments-p331; refund statuses with provider work still open.';

CREATE OR REPLACE FUNCTION public.payment_refund_reserved_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['requested', 'submitted', 'pending', 'requires_review']::text[];
$$;

COMMENT ON FUNCTION public.payment_refund_reserved_statuses IS
  'audiolad:payments-p331; statuses that still hold refundable money (in-flight + unknown provider state).';

CREATE OR REPLACE FUNCTION public.payment_refund_transition_allowed(
  p_from text,
  p_to text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from IS NULL OR p_to IS NULL THEN false
    WHEN p_from = p_to THEN true
    WHEN p_from = 'requested'
      THEN p_to IN ('submitted', 'failed', 'cancelled', 'requires_review')
    WHEN p_from = 'submitted'
      THEN p_to IN ('pending', 'succeeded', 'failed', 'requires_review')
    WHEN p_from = 'pending'
      THEN p_to IN ('succeeded', 'failed', 'cancelled', 'requires_review')
    WHEN p_from = 'requires_review'
      THEN p_to IN ('pending', 'succeeded', 'failed', 'cancelled')
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.payment_refund_transition_allowed IS
  'audiolad:payments-p331; refund status machine. succeeded/failed/cancelled are terminal; same-status is idempotent.';

CREATE OR REPLACE FUNCTION public.payment_refund_settlement_snapshot(
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH pay AS (
    SELECT
      p.id,
      p.order_id,
      p.provider,
      p.provider_payment_id,
      p.status,
      p.amount_minor,
      p.currency,
      p.is_test,
      p.confirmed_at
    FROM public.payments AS p
    WHERE p.id = p_payment_id
  ),
  agg AS (
    SELECT
      coalesce(sum(r.amount_minor) FILTER (WHERE r.status = 'succeeded'), 0)::bigint
        AS confirmed_minor,
      coalesce(sum(r.amount_minor) FILTER (
        WHERE r.status = ANY (public.payment_refund_in_flight_statuses())
      ), 0)::bigint AS in_flight_minor,
      coalesce(sum(r.amount_minor) FILTER (WHERE r.status = 'requires_review'), 0)::bigint
        AS requires_review_minor,
      count(*) FILTER (WHERE r.status = 'succeeded')::integer AS confirmed_count,
      count(*) FILTER (
        WHERE r.status = ANY (public.payment_refund_in_flight_statuses())
      )::integer AS in_flight_count,
      count(*) FILTER (WHERE r.status = 'requires_review')::integer
        AS requires_review_count,
      count(*)::integer AS refund_count
    FROM public.payment_refunds AS r
    WHERE r.payment_id = p_payment_id
  )
  SELECT jsonb_build_object(
    'found', pay.id IS NOT NULL,
    'payment_id', p_payment_id,
    'order_id', pay.order_id,
    'provider', pay.provider,
    'provider_payment_id', pay.provider_payment_id,
    'payment_status', pay.status,
    'currency', coalesce(pay.currency, 'RUB'),
    'is_test', coalesce(pay.is_test, false),
    'gross_minor', coalesce(pay.amount_minor, 0),
    'confirmed_refunded_minor', agg.confirmed_minor,
    'in_flight_minor', agg.in_flight_minor,
    'requires_review_minor', agg.requires_review_minor,
    'reserved_minor', agg.in_flight_minor + agg.requires_review_minor,
    'refundable_minor', greatest(
      0,
      coalesce(pay.amount_minor, 0)
        - agg.confirmed_minor
        - agg.in_flight_minor
        - agg.requires_review_minor
    ),
    'net_collected_minor', coalesce(pay.amount_minor, 0) - agg.confirmed_minor,
    'refund_count', agg.refund_count,
    'confirmed_count', agg.confirmed_count,
    'in_flight_count', agg.in_flight_count,
    'requires_review_count', agg.requires_review_count,
    'settlement_status', CASE
      WHEN pay.id IS NULL THEN 'requires_review'
      WHEN agg.confirmed_minor > coalesce(pay.amount_minor, 0) THEN 'requires_review'
      WHEN agg.requires_review_count > 0 THEN 'requires_review'
      WHEN agg.confirmed_minor = 0 THEN 'collected'
      WHEN agg.confirmed_minor < pay.amount_minor THEN 'partially_refunded'
      WHEN agg.confirmed_minor = pay.amount_minor THEN 'fully_refunded'
      ELSE 'requires_review'
    END
  )
  FROM agg
  LEFT JOIN pay ON true;
$$;

REVOKE ALL ON FUNCTION public.payment_refund_settlement_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_refund_settlement_snapshot(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_refund_settlement_snapshot(uuid) TO service_role;

COMMENT ON FUNCTION public.payment_refund_settlement_snapshot IS
  'audiolad:payments-p331; per-payment refund settlement (gross / confirmed / reserved / refundable); service_role only.';

CREATE OR REPLACE FUNCTION public.payment_refund_row_json(
  p_refund public.payment_refunds
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_refund.id,
    'payment_id', p_refund.payment_id,
    'order_id', p_refund.order_id,
    'provider', p_refund.provider,
    'provider_payment_id', p_refund.provider_payment_id,
    'provider_refund_id', p_refund.provider_refund_id,
    'amount_minor', p_refund.amount_minor,
    'currency', p_refund.currency,
    'kind', p_refund.kind,
    'status', p_refund.status,
    'reason_code', p_refund.reason_code,
    'reason_text', p_refund.reason_text,
    'access_effect', p_refund.access_effect,
    'requested_by', p_refund.requested_by,
    'requested_at', p_refund.requested_at,
    'submitted_at', p_refund.submitted_at,
    'confirmed_at', p_refund.confirmed_at,
    'failed_at', p_refund.failed_at,
    'cancelled_at', p_refund.cancelled_at,
    'requires_review_at', p_refund.requires_review_at,
    'provider_status', p_refund.provider_status,
    'failure_code', p_refund.failure_code,
    'failure_message_safe', p_refund.failure_message_safe,
    'idempotency_key', p_refund.idempotency_key,
    'is_test', p_refund.is_test,
    'created_at', p_refund.created_at,
    'updated_at', p_refund.updated_at
  );
$$;

COMMENT ON FUNCTION public.payment_refund_row_json IS
  'audiolad:payments-p331; safe refund projection (no metadata_snapshot, no provider secrets).';

CREATE OR REPLACE FUNCTION public.write_finance_audit_log(
  p_actor_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text,
  p_safe_snapshot jsonb,
  p_correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.finance_audit_log (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    reason,
    safe_snapshot,
    correlation_id
  )
  VALUES (
    p_actor_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    coalesce(p_safe_snapshot, '{}'::jsonb),
    nullif(btrim(coalesce(p_correlation_id, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_finance_audit_log(
  uuid, text, text, uuid, text, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_finance_audit_log(
  uuid, text, text, uuid, text, jsonb, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_finance_audit_log(
  uuid, text, text, uuid, text, jsonb, text
) TO service_role;

COMMENT ON FUNCTION public.write_finance_audit_log IS
  'audiolad:payments-p331; append-only finance audit write; service_role only.';

-- ---------------------------------------------------------------------------
-- 4. Refund lifecycle RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_payment_refund_request(
  p_payment_id uuid,
  p_amount_minor bigint,
  p_reason_code text,
  p_reason_text text,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_correlation_id text,
  p_allow_test boolean DEFAULT false,
  p_access_effect text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_existing public.payment_refunds%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_settlement jsonb;
  v_refundable bigint;
  v_confirmed bigint;
  v_reserved bigint;
  v_kind text;
  v_access_effect text;
  v_reason_code text := nullif(btrim(coalesce(p_reason_code, '')), '');
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  IF v_reason_code IS NULL THEN
    RAISE EXCEPTION 'reason_code_required' USING ERRCODE = '22023';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = '22023';
  END IF;

  IF p_access_effect IS NOT NULL
     AND p_access_effect NOT IN ('keep', 'revoke', 'manual_review') THEN
    RAISE EXCEPTION 'invalid_access_effect' USING ERRCODE = '22023';
  END IF;

  -- Serialize every refund decision for this payment on the payment row.
  SELECT *
  INTO v_payment
  FROM public.payments AS p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent replay: same key returns the original fact, no new reserve.
  SELECT *
  INTO v_existing
  FROM public.payment_refunds AS r
  WHERE r.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.payment_id IS DISTINCT FROM p_payment_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'idempotent_replay', true,
      'refund', public.payment_refund_row_json(v_existing),
      'settlement', public.payment_refund_settlement_snapshot(p_payment_id)
    );
  END IF;

  IF v_payment.status IS DISTINCT FROM 'succeeded' THEN
    RAISE EXCEPTION 'payment_not_succeeded' USING ERRCODE = '22023';
  END IF;

  IF v_payment.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'payment_not_confirmed' USING ERRCODE = '22023';
  END IF;

  IF v_payment.is_test AND NOT coalesce(p_allow_test, false) THEN
    RAISE EXCEPTION 'test_payment_refund_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_settlement := public.payment_refund_settlement_snapshot(p_payment_id);
  v_confirmed := (v_settlement ->> 'confirmed_refunded_minor')::bigint;
  v_reserved := (v_settlement ->> 'reserved_minor')::bigint;
  v_refundable := (v_settlement ->> 'refundable_minor')::bigint;

  IF v_refundable <= 0 THEN
    RAISE EXCEPTION 'no_refundable_amount' USING ERRCODE = '22023';
  END IF;

  IF p_amount_minor > v_refundable THEN
    RAISE EXCEPTION 'refund_amount_exceeds_refundable' USING ERRCODE = '22023';
  END IF;

  -- kind is a request-time snapshot: does this refund close the remaining balance?
  v_kind := CASE WHEN p_amount_minor = v_refundable THEN 'full' ELSE 'partial' END;

  -- Access effect is server-computed only (client hint ignored). Never auto-revoke.
  v_access_effect := CASE
    WHEN v_confirmed + p_amount_minor >= v_payment.amount_minor
      THEN 'manual_review'
    ELSE 'keep'
  END;

  INSERT INTO public.payment_refunds (
    payment_id,
    order_id,
    provider,
    provider_payment_id,
    amount_minor,
    currency,
    kind,
    status,
    reason_code,
    reason_text,
    access_effect,
    requested_by,
    idempotency_key,
    is_test,
    metadata_snapshot
  )
  VALUES (
    v_payment.id,
    v_payment.order_id,
    v_payment.provider,
    v_payment.provider_payment_id,
    p_amount_minor,
    v_payment.currency,
    v_kind,
    'requested',
    v_reason_code,
    nullif(btrim(coalesce(p_reason_text, '')), ''),
    v_access_effect,
    p_actor_user_id,
    v_idempotency_key,
    v_payment.is_test,
    jsonb_build_object(
      'payment_amount_minor', v_payment.amount_minor,
      'refundable_before_minor', v_refundable,
      'confirmed_before_minor', v_confirmed,
      'reserved_before_minor', v_reserved
    )
  )
  RETURNING * INTO v_refund;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'refund_requested',
    'payment_refund',
    v_refund.id,
    v_reason_code,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id,
      'amount_minor', v_refund.amount_minor,
      'currency', v_refund.currency,
      'kind', v_refund.kind,
      'access_effect', v_refund.access_effect,
      'refundable_before_minor', v_refundable,
      'is_test', v_refund.is_test
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'requested',
    'idempotent_replay', false,
    'refund', public.payment_refund_row_json(v_refund),
    'settlement', public.payment_refund_settlement_snapshot(p_payment_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_refund_request(
  uuid, bigint, text, text, text, uuid, text, boolean, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment_refund_request(
  uuid, bigint, text, text, text, uuid, text, boolean, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_refund_request(
  uuid, bigint, text, text, text, uuid, text, boolean, text
) TO service_role;

COMMENT ON FUNCTION public.create_payment_refund_request IS
  'audiolad:payments-p331; locks the payment, reserves refundable money and records a requested refund fact; service_role only.';

CREATE OR REPLACE FUNCTION public.mark_payment_refund_submitted(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_status text,
  p_provider_request_id text,
  p_safe_snapshot jsonb,
  p_correlation_id text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
  v_provider_refund_id text := nullif(btrim(coalesce(p_provider_refund_id, '')), '');
  v_now timestamptz := now();
BEGIN
  IF p_refund_id IS NULL THEN
    RAISE EXCEPTION 'refund_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_refund
  FROM public.payment_refunds AS r
  WHERE r.id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.payment_refund_transition_allowed(v_refund.status, 'submitted') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'invalid_transition',
      'error', 'invalid_transition',
      'from_status', v_refund.status,
      'to_status', 'submitted',
      'refund', public.payment_refund_row_json(v_refund),
      'settlement', public.payment_refund_settlement_snapshot(v_refund.payment_id)
    );
  END IF;

  UPDATE public.payment_refunds AS r
  SET
    status = 'submitted',
    submitted_at = coalesce(r.submitted_at, v_now),
    provider_refund_id = coalesce(v_provider_refund_id, r.provider_refund_id),
    provider_status = coalesce(
      nullif(btrim(coalesce(p_provider_status, '')), ''),
      r.provider_status
    ),
    provider_request_id = coalesce(
      nullif(btrim(coalesce(p_provider_request_id, '')), ''),
      r.provider_request_id
    ),
    provider_created_at = coalesce(r.provider_created_at, v_now),
    provider_updated_at = v_now,
    metadata_snapshot = r.metadata_snapshot || coalesce(p_safe_snapshot, '{}'::jsonb),
    updated_at = v_now
  WHERE r.id = v_refund.id
  RETURNING * INTO v_refund;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'refund_submitted',
    'payment_refund',
    v_refund.id,
    NULL,
    jsonb_build_object(
      'payment_id', v_refund.payment_id,
      'amount_minor', v_refund.amount_minor,
      'provider_refund_id', v_refund.provider_refund_id,
      'provider_status', v_refund.provider_status
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'submitted',
    'refund', public.payment_refund_row_json(v_refund),
    'settlement', public.payment_refund_settlement_snapshot(v_refund.payment_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payment_refund_submitted(
  uuid, text, text, text, jsonb, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_payment_refund_submitted(
  uuid, text, text, text, jsonb, text, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payment_refund_submitted(
  uuid, text, text, text, jsonb, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.mark_payment_refund_submitted IS
  'audiolad:payments-p331; records that the provider accepted the refund request; service_role only.';

CREATE OR REPLACE FUNCTION public.apply_payment_refund_provider_status(
  p_refund_id uuid,
  p_new_status text,
  p_provider_status text,
  p_provider_refund_id text,
  p_failure_code text,
  p_failure_message_safe text,
  p_safe_snapshot jsonb,
  p_correlation_id text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_provider_refund_id text := nullif(btrim(coalesce(p_provider_refund_id, '')), '');
  v_confirmed_other bigint;
  v_target_status text := p_new_status;
  v_failure_code text := nullif(btrim(coalesce(p_failure_code, '')), '');
  v_now timestamptz := now();
BEGIN
  IF p_refund_id IS NULL THEN
    RAISE EXCEPTION 'refund_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_target_status IS NULL
     OR v_target_status NOT IN ('pending', 'succeeded', 'failed', 'requires_review') THEN
    RAISE EXCEPTION 'unsupported_target_status' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_refund
  FROM public.payment_refunds AS r
  WHERE r.id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Lock the payment so the over-refund guard reads a stable balance.
  SELECT *
  INTO v_payment
  FROM public.payments AS p
  WHERE p.id = v_refund.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_refund.status IN ('succeeded', 'failed', 'cancelled')
     AND v_refund.status IS DISTINCT FROM v_target_status THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'ignored_terminal',
      'from_status', v_refund.status,
      'to_status', v_target_status,
      'refund', public.payment_refund_row_json(v_refund),
      'settlement', public.payment_refund_settlement_snapshot(v_refund.payment_id)
    );
  END IF;

  IF NOT public.payment_refund_transition_allowed(v_refund.status, v_target_status) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'invalid_transition',
      'error', 'invalid_transition',
      'from_status', v_refund.status,
      'to_status', v_target_status,
      'refund', public.payment_refund_row_json(v_refund),
      'settlement', public.payment_refund_settlement_snapshot(v_refund.payment_id)
    );
  END IF;

  -- Over-refund guard: confirming this row must never exceed the payment.
  IF v_target_status = 'succeeded' AND v_refund.status <> 'succeeded' THEN
    SELECT coalesce(sum(r.amount_minor), 0)::bigint
    INTO v_confirmed_other
    FROM public.payment_refunds AS r
    WHERE r.payment_id = v_refund.payment_id
      AND r.status = 'succeeded'
      AND r.id <> v_refund.id;

    IF v_confirmed_other + v_refund.amount_minor > v_payment.amount_minor THEN
      v_target_status := 'requires_review';
      v_failure_code := coalesce(v_failure_code, 'over_refund_guard');
    END IF;
  END IF;

  UPDATE public.payment_refunds AS r
  SET
    status = v_target_status,
    provider_refund_id = coalesce(v_provider_refund_id, r.provider_refund_id),
    provider_status = coalesce(
      nullif(btrim(coalesce(p_provider_status, '')), ''),
      r.provider_status
    ),
    provider_updated_at = v_now,
    confirmed_at = CASE
      WHEN v_target_status = 'succeeded' THEN coalesce(r.confirmed_at, v_now)
      ELSE r.confirmed_at
    END,
    failed_at = CASE
      WHEN v_target_status = 'failed' THEN coalesce(r.failed_at, v_now)
      ELSE r.failed_at
    END,
    requires_review_at = CASE
      WHEN v_target_status = 'requires_review' THEN coalesce(r.requires_review_at, v_now)
      ELSE r.requires_review_at
    END,
    failure_code = CASE
      WHEN v_target_status IN ('failed', 'requires_review') THEN v_failure_code
      ELSE r.failure_code
    END,
    failure_message_safe = CASE
      WHEN v_target_status IN ('failed', 'requires_review')
        THEN left(nullif(btrim(coalesce(p_failure_message_safe, '')), ''), 500)
      ELSE r.failure_message_safe
    END,
    metadata_snapshot = r.metadata_snapshot || coalesce(p_safe_snapshot, '{}'::jsonb),
    updated_at = v_now
  WHERE r.id = v_refund.id
  RETURNING * INTO v_refund;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'refund_status_' || v_target_status,
    'payment_refund',
    v_refund.id,
    v_failure_code,
    jsonb_build_object(
      'payment_id', v_refund.payment_id,
      'amount_minor', v_refund.amount_minor,
      'provider_refund_id', v_refund.provider_refund_id,
      'provider_status', v_refund.provider_status,
      'status', v_refund.status
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_target_status,
    'refund', public.payment_refund_row_json(v_refund),
    'settlement', public.payment_refund_settlement_snapshot(v_refund.payment_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_payment_refund_provider_status(
  uuid, text, text, text, text, text, jsonb, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_payment_refund_provider_status(
  uuid, text, text, text, text, text, jsonb, text, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_refund_provider_status(
  uuid, text, text, text, text, text, jsonb, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.apply_payment_refund_provider_status IS
  'audiolad:payments-p331; applies a provider-driven refund transition with over-refund guard; never touches payments.status or entitlements; service_role only.';

CREATE OR REPLACE FUNCTION public.cancel_payment_refund_request(
  p_refund_id uuid,
  p_reason_text text,
  p_actor_user_id uuid,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_refund_id IS NULL THEN
    RAISE EXCEPTION 'refund_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_refund
  FROM public.payment_refunds AS r
  WHERE r.id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_refund.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'cancelled',
      'idempotent_replay', true,
      'refund', public.payment_refund_row_json(v_refund),
      'settlement', public.payment_refund_settlement_snapshot(v_refund.payment_id)
    );
  END IF;

  -- Once the provider has the request, only the provider may end it.
  IF v_refund.status <> 'requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'not_cancellable',
      'error', 'refund_not_cancellable',
      'from_status', v_refund.status,
      'refund', public.payment_refund_row_json(v_refund),
      'settlement', public.payment_refund_settlement_snapshot(v_refund.payment_id)
    );
  END IF;

  UPDATE public.payment_refunds AS r
  SET
    status = 'cancelled',
    cancelled_at = v_now,
    updated_at = v_now
  WHERE r.id = v_refund.id
  RETURNING * INTO v_refund;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'refund_cancelled',
    'payment_refund',
    v_refund.id,
    nullif(btrim(coalesce(p_reason_text, '')), ''),
    jsonb_build_object(
      'payment_id', v_refund.payment_id,
      'amount_minor', v_refund.amount_minor
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'cancelled',
    'idempotent_replay', false,
    'refund', public.payment_refund_row_json(v_refund),
    'settlement', public.payment_refund_settlement_snapshot(v_refund.payment_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_payment_refund_request(
  uuid, text, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_payment_refund_request(
  uuid, text, uuid, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_payment_refund_request(
  uuid, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.cancel_payment_refund_request IS
  'audiolad:payments-p331; releases the reserve for a not-yet-submitted refund; service_role only.';

-- ---------------------------------------------------------------------------
-- 5. Webhook bridge: Tochka payment operation status → refund facts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_tochka_refund_webhook_status(
  p_provider_payment_id text,
  p_provider_status text,
  p_amount_minor bigint,
  p_safe_snapshot jsonb,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_provider_payment_id text := nullif(btrim(coalesce(p_provider_payment_id, '')), '');
  v_in_flight_count integer;
  v_amount_match_count integer;
  v_target_status text;
  v_applied jsonb;
  v_updated integer := 0;
BEGIN
  IF v_provider_payment_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'missing_provider_payment_id');
  END IF;

  IF p_provider_status NOT IN ('ON-REFUND', 'REFUNDED') THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'unsupported_status');
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments AS p
  WHERE p.provider = 'tochka'
    AND p.provider_payment_id = v_provider_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'payment_not_found');
  END IF;

  SELECT count(*)::integer
  INTO v_in_flight_count
  FROM public.payment_refunds AS r
  WHERE r.payment_id = v_payment.id
    AND r.status = ANY (public.payment_refund_in_flight_statuses());

  -- Refunds started outside this system are not invented as local facts.
  IF v_in_flight_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'no_in_flight_refund',
      'payment_id', v_payment.id,
      'settlement', public.payment_refund_settlement_snapshot(v_payment.id)
    );
  END IF;

  IF p_provider_status = 'ON-REFUND' THEN
    -- Provider acknowledged processing: submitted → pending, replay-safe.
    FOR v_refund IN
      SELECT *
      FROM public.payment_refunds AS r
      WHERE r.payment_id = v_payment.id
        AND r.status = 'submitted'
      ORDER BY r.requested_at
      FOR UPDATE
    LOOP
      v_applied := public.apply_payment_refund_provider_status(
        v_refund.id,
        'pending',
        p_provider_status,
        NULL,
        NULL,
        NULL,
        coalesce(p_safe_snapshot, '{}'::jsonb),
        p_correlation_id,
        NULL
      );
      v_updated := v_updated + 1;
    END LOOP;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'pending_applied',
      'updated_count', v_updated,
      'payment_id', v_payment.id,
      'settlement', public.payment_refund_settlement_snapshot(v_payment.id)
    );
  END IF;

  -- REFUNDED: only confirm when the webhook maps to exactly one local refund.
  IF p_amount_minor IS NOT NULL AND p_amount_minor > 0 THEN
    SELECT count(*)::integer
    INTO v_amount_match_count
    FROM public.payment_refunds AS r
    WHERE r.payment_id = v_payment.id
      AND r.status = ANY (public.payment_refund_in_flight_statuses())
      AND r.amount_minor = p_amount_minor;
  ELSE
    v_amount_match_count := 0;
  END IF;

  IF v_amount_match_count = 1 THEN
    SELECT *
    INTO v_refund
    FROM public.payment_refunds AS r
    WHERE r.payment_id = v_payment.id
      AND r.status = ANY (public.payment_refund_in_flight_statuses())
      AND r.amount_minor = p_amount_minor
    FOR UPDATE;

    v_target_status := 'succeeded';
  ELSIF v_in_flight_count = 1 AND coalesce(p_amount_minor, 0) <= 0 THEN
    SELECT *
    INTO v_refund
    FROM public.payment_refunds AS r
    WHERE r.payment_id = v_payment.id
      AND r.status = ANY (public.payment_refund_in_flight_statuses())
    FOR UPDATE;

    v_target_status := 'succeeded';
  ELSE
    -- Ambiguous mapping: park every open refund for a human decision,
    -- keeping the reserve so no retry can double-refund.
    FOR v_refund IN
      SELECT *
      FROM public.payment_refunds AS r
      WHERE r.payment_id = v_payment.id
        AND r.status = ANY (public.payment_refund_in_flight_statuses())
      ORDER BY r.requested_at
      FOR UPDATE
    LOOP
      v_applied := public.apply_payment_refund_provider_status(
        v_refund.id,
        'requires_review',
        p_provider_status,
        NULL,
        'webhook_refund_ambiguous',
        'Webhook REFUNDED could not be matched to a single local refund',
        coalesce(p_safe_snapshot, '{}'::jsonb),
        p_correlation_id,
        NULL
      );
      v_updated := v_updated + 1;
    END LOOP;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'webhook_refund_ambiguous',
      'updated_count', v_updated,
      'payment_id', v_payment.id,
      'settlement', public.payment_refund_settlement_snapshot(v_payment.id)
    );
  END IF;

  v_applied := public.apply_payment_refund_provider_status(
    v_refund.id,
    v_target_status,
    p_provider_status,
    NULL,
    NULL,
    NULL,
    coalesce(p_safe_snapshot, '{}'::jsonb),
    p_correlation_id,
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', coalesce(v_applied ->> 'outcome', v_target_status),
    'updated_count', 1,
    'payment_id', v_payment.id,
    'refund', v_applied -> 'refund',
    'settlement', public.payment_refund_settlement_snapshot(v_payment.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_tochka_refund_webhook_status(
  text, text, bigint, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tochka_refund_webhook_status(
  text, text, bigint, jsonb, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tochka_refund_webhook_status(
  text, text, bigint, jsonb, text
) TO service_role;

COMMENT ON FUNCTION public.apply_tochka_refund_webhook_status IS
  'audiolad:payments-p331; replay-safe ON-REFUND/REFUNDED webhook → refund facts; never creates refunds it did not request; service_role only.';

-- ---------------------------------------------------------------------------
-- 6. Admin analytics (cash activity; P3.1 gross methodology untouched)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_refund_p331_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gross_minor bigint;
  v_payment_count integer;
  v_refund_count integer := 0;
  v_refunded_minor bigint := 0;
  v_refunded_payments integer := 0;
  v_partial_payments integer := 0;
  v_full_payments integer := 0;
  v_pending_count integer := 0;
  v_pending_minor bigint := 0;
  v_review_count integer := 0;
  v_review_minor bigint := 0;
  v_failed_count integer := 0;
BEGIN
  -- Gross is read through the P3.1 base function so both panels can never drift.
  SELECT count(*)::integer, coalesce(sum(b.amount_minor), 0)::bigint
  INTO v_payment_count, v_gross_minor
  FROM public.admin_payments_p31_payment_base(
    p_from, p_to, coalesce(p_include_test, false), NULL, NULL
  ) AS b;

  SELECT
    count(*)::integer,
    coalesce(sum(r.amount_minor), 0)::bigint,
    count(DISTINCT r.payment_id)::integer
  INTO v_refund_count, v_refunded_minor, v_refunded_payments
  FROM public.payment_refunds AS r
  WHERE r.status = 'succeeded'
    AND r.confirmed_at IS NOT NULL
    AND (p_from IS NULL OR r.confirmed_at >= p_from)
    AND (p_to IS NULL OR r.confirmed_at < p_to)
    AND (coalesce(p_include_test, false) OR r.is_test = false);

  -- Lifetime settlement of the payments touched in this period.
  SELECT
    count(*) FILTER (WHERE s.confirmed_minor < s.amount_minor)::integer,
    count(*) FILTER (WHERE s.confirmed_minor >= s.amount_minor)::integer
  INTO v_partial_payments, v_full_payments
  FROM (
    SELECT
      p.id,
      p.amount_minor,
      coalesce(sum(all_r.amount_minor) FILTER (WHERE all_r.status = 'succeeded'), 0)::bigint
        AS confirmed_minor
    FROM public.payments AS p
    JOIN public.payment_refunds AS all_r ON all_r.payment_id = p.id
    WHERE EXISTS (
      SELECT 1
      FROM public.payment_refunds AS r
      WHERE r.payment_id = p.id
        AND r.status = 'succeeded'
        AND r.confirmed_at IS NOT NULL
        AND (p_from IS NULL OR r.confirmed_at >= p_from)
        AND (p_to IS NULL OR r.confirmed_at < p_to)
        AND (coalesce(p_include_test, false) OR r.is_test = false)
    )
    GROUP BY p.id, p.amount_minor
  ) AS s;

  -- Operational queues are "as of now", not period-bound.
  SELECT
    count(*) FILTER (
      WHERE r.status = ANY (public.payment_refund_in_flight_statuses())
    )::integer,
    coalesce(sum(r.amount_minor) FILTER (
      WHERE r.status = ANY (public.payment_refund_in_flight_statuses())
    ), 0)::bigint,
    count(*) FILTER (WHERE r.status = 'requires_review')::integer,
    coalesce(sum(r.amount_minor) FILTER (WHERE r.status = 'requires_review'), 0)::bigint,
    count(*) FILTER (WHERE r.status = 'failed')::integer
  INTO v_pending_count, v_pending_minor, v_review_count, v_review_minor, v_failed_count
  FROM public.payment_refunds AS r
  WHERE coalesce(p_include_test, false) OR r.is_test = false;

  RETURN jsonb_build_object(
    'currency', 'RUB',
    'include_test', coalesce(p_include_test, false),
    'payment_count', v_payment_count,
    'gross_minor', v_gross_minor,
    'refund_count', v_refund_count,
    'refunded_minor', v_refunded_minor,
    'refunded_payments', v_refunded_payments,
    'net_minor', v_gross_minor - v_refunded_minor,
    'partially_refunded_payments', v_partial_payments,
    'fully_refunded_payments', v_full_payments,
    'pending_count', v_pending_count,
    'pending_minor', v_pending_minor,
    'requires_review_count', v_review_count,
    'requires_review_minor', v_review_minor,
    'failed_count', v_failed_count,
    'notes', jsonb_build_object(
      'methodology', 'cash_activity_in_period',
      'gross', 'p31_succeeded_confirmed_at_in_period',
      'refunds', 'refund_succeeded_confirmed_at_in_period',
      'net', 'gross_minus_refunds_before_fees',
      'provider_fees', 'not_connected',
      'author_payout', 'not_connected',
      'settlement_counts', 'lifetime_settlement_of_payments_refunded_in_period',
      'queues', 'pending_and_requires_review_are_as_of_now'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_p331_summary(
  timestamptz, timestamptz, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_refund_p331_summary(
  timestamptz, timestamptz, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_p331_summary(
  timestamptz, timestamptz, boolean
) TO service_role;

COMMENT ON FUNCTION public.admin_refund_p331_summary IS
  'audiolad:payments-analytics:p331; cash-activity refund KPIs; reads P3.1 gross via admin_payments_p31_payment_base; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_refund_p331_list(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_status text DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 25), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_status IS NOT NULL AND v_status NOT IN (
    'requested', 'submitted', 'pending', 'succeeded',
    'failed', 'cancelled', 'requires_review'
  ) THEN
    v_status := NULL;
  END IF;

  SELECT count(*)::integer
  INTO v_total
  FROM public.payment_refunds AS r
  JOIN public.orders AS o ON o.id = r.order_id
  WHERE (coalesce(p_include_test, false) OR r.is_test = false)
    AND (v_status IS NULL OR r.status = v_status)
    AND (p_payment_id IS NULL OR r.payment_id = p_payment_id)
    AND (p_from IS NULL OR r.requested_at >= p_from)
    AND (p_to IS NULL OR r.requested_at < p_to)
    AND (
      v_q IS NULL
      OR o.practice_title_snapshot ILIKE '%' || v_q || '%'
      OR o.practice_slug_snapshot ILIKE '%' || v_q || '%'
      OR r.reason_code ILIKE '%' || v_q || '%'
    );

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      r.id AS refund_id,
      r.payment_id,
      r.order_id,
      r.amount_minor,
      r.currency,
      r.status,
      r.kind,
      r.reason_code,
      r.reason_text,
      r.access_effect,
      r.provider_refund_id,
      r.provider_status,
      r.failure_code,
      r.failure_message_safe,
      r.is_test,
      r.requested_by,
      r.requested_at,
      r.submitted_at,
      r.confirmed_at,
      r.failed_at,
      r.cancelled_at,
      r.requires_review_at,
      o.practice_title_snapshot AS practice_title,
      o.practice_slug_snapshot AS practice_slug,
      p.amount_minor AS payment_amount_minor,
      p.confirmed_at AS payment_confirmed_at
    FROM public.payment_refunds AS r
    JOIN public.orders AS o ON o.id = r.order_id
    JOIN public.payments AS p ON p.id = r.payment_id
    WHERE (coalesce(p_include_test, false) OR r.is_test = false)
      AND (v_status IS NULL OR r.status = v_status)
      AND (p_payment_id IS NULL OR r.payment_id = p_payment_id)
      AND (p_from IS NULL OR r.requested_at >= p_from)
      AND (p_to IS NULL OR r.requested_at < p_to)
      AND (
        v_q IS NULL
        OR o.practice_title_snapshot ILIKE '%' || v_q || '%'
        OR o.practice_slug_snapshot ILIKE '%' || v_q || '%'
        OR r.reason_code ILIKE '%' || v_q || '%'
      )
    ORDER BY r.requested_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) AS x;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'include_test', coalesce(p_include_test, false),
    'status', v_status,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_p331_list(
  timestamptz, timestamptz, boolean, text, uuid, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_refund_p331_list(
  timestamptz, timestamptz, boolean, text, uuid, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_p331_list(
  timestamptz, timestamptz, boolean, text, uuid, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_refund_p331_list IS
  'audiolad:payments-analytics:p331; paginated refund list without payer PII or provider secrets; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_refund_p331_integrity_snapshot(
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH scoped AS (
    SELECT r.*
    FROM public.payment_refunds AS r
    WHERE coalesce(p_include_test, false) OR r.is_test = false
  ),
  per_payment AS (
    SELECT
      p.id AS payment_id,
      p.amount_minor,
      coalesce(sum(s.amount_minor) FILTER (WHERE s.status = 'succeeded'), 0)::bigint
        AS confirmed_minor,
      coalesce(sum(s.amount_minor) FILTER (
        WHERE s.status = ANY (public.payment_refund_reserved_statuses())
      ), 0)::bigint AS reserved_minor
    FROM public.payments AS p
    JOIN scoped AS s ON s.payment_id = p.id
    GROUP BY p.id, p.amount_minor
  )
  SELECT jsonb_build_object(
    'include_test', coalesce(p_include_test, false),
    'refunds_total', (SELECT count(*)::integer FROM scoped),
    'refunds_by_status', (
      SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, count(*)::integer AS cnt FROM scoped GROUP BY status
      ) AS t
    ),
    'confirmed_refunded_minor', (
      SELECT coalesce(sum(amount_minor), 0)::bigint
      FROM scoped WHERE status = 'succeeded'
    ),
    'in_flight_minor', (
      SELECT coalesce(sum(amount_minor), 0)::bigint
      FROM scoped
      WHERE status = ANY (public.payment_refund_in_flight_statuses())
    ),
    'requires_review_minor', (
      SELECT coalesce(sum(amount_minor), 0)::bigint
      FROM scoped WHERE status = 'requires_review'
    ),
    -- 1. money invariants
    'over_refunded_payments', (
      SELECT count(*)::integer FROM per_payment WHERE confirmed_minor > amount_minor
    ),
    'over_reserved_payments', (
      SELECT count(*)::integer
      FROM per_payment WHERE confirmed_minor + reserved_minor > amount_minor
    ),
    'fully_refunded_payments', (
      SELECT count(*)::integer FROM per_payment WHERE confirmed_minor = amount_minor
    ),
    'partially_refunded_payments', (
      SELECT count(*)::integer
      FROM per_payment WHERE confirmed_minor > 0 AND confirmed_minor < amount_minor
    ),
    'nonpositive_amount_refunds', (
      SELECT count(*)::integer FROM scoped WHERE amount_minor <= 0
    ),
    -- 2. referential invariants
    'refunds_without_succeeded_payment', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.payments AS p ON p.id = s.payment_id
      WHERE p.status IS DISTINCT FROM 'succeeded'
    ),
    'refunds_order_mismatch', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.payments AS p ON p.id = s.payment_id
      WHERE s.order_id IS DISTINCT FROM p.order_id
    ),
    'refunds_currency_mismatch', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.payments AS p ON p.id = s.payment_id
      WHERE s.currency IS DISTINCT FROM p.currency
    ),
    'refunds_provider_mismatch', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.payments AS p ON p.id = s.payment_id
      WHERE s.provider IS DISTINCT FROM p.provider
    ),
    'refunds_test_flag_mismatch', (
      SELECT count(*)::integer
      FROM public.payment_refunds AS s
      JOIN public.payments AS p ON p.id = s.payment_id
      WHERE s.is_test IS DISTINCT FROM p.is_test
    ),
    -- 3. identity invariants
    'duplicate_provider_refund_ids', (
      SELECT count(*)::integer
      FROM (
        SELECT provider, provider_refund_id
        FROM public.payment_refunds
        WHERE provider_refund_id IS NOT NULL
        GROUP BY provider, provider_refund_id
        HAVING count(*) > 1
      ) AS d
    ),
    'succeeded_without_provider_refund_id', (
      SELECT count(*)::integer
      FROM scoped WHERE status = 'succeeded' AND provider_refund_id IS NULL
    ),
    'refunds_missing_idempotency_key', (
      SELECT count(*)::integer
      FROM scoped WHERE idempotency_key IS NULL OR btrim(idempotency_key) = ''
    ),
    -- 4. lifecycle invariants
    'succeeded_without_confirmed_at', (
      SELECT count(*)::integer
      FROM scoped WHERE status = 'succeeded' AND confirmed_at IS NULL
    ),
    'confirmed_at_without_succeeded_status', (
      SELECT count(*)::integer
      FROM scoped WHERE confirmed_at IS NOT NULL AND status <> 'succeeded'
    ),
    'terminal_without_terminal_timestamp', (
      SELECT count(*)::integer
      FROM scoped
      WHERE (status = 'failed' AND failed_at IS NULL)
         OR (status = 'cancelled' AND cancelled_at IS NULL)
         OR (status = 'requires_review' AND requires_review_at IS NULL)
    ),
    'cancelled_after_submitted', (
      SELECT count(*)::integer
      FROM scoped WHERE status = 'cancelled' AND submitted_at IS NOT NULL
    ),
    'submitted_without_submitted_at', (
      SELECT count(*)::integer
      FROM scoped
      WHERE status IN ('submitted', 'pending') AND submitted_at IS NULL
    ),
    'in_flight_older_than_24h', (
      SELECT count(*)::integer
      FROM scoped
      WHERE status = ANY (public.payment_refund_in_flight_statuses())
        AND requested_at < now() - interval '24 hours'
    ),
    'requires_review_count', (
      SELECT count(*)::integer FROM scoped WHERE status = 'requires_review'
    ),
    -- 5. P3.1 source-of-truth invariants (must stay untouched by refunds)
    'payments_with_refunded_status', (
      SELECT count(*)::integer FROM public.payments WHERE status = 'refunded'
    ),
    'refunded_payments_not_succeeded', (
      SELECT count(*)::integer
      FROM per_payment AS pp
      JOIN public.payments AS p ON p.id = pp.payment_id
      WHERE pp.confirmed_minor > 0 AND p.status IS DISTINCT FROM 'succeeded'
    ),
    'fully_refunded_with_access_kept', (
      SELECT count(*)::integer
      FROM per_payment AS pp
      JOIN public.payments AS p ON p.id = pp.payment_id
      JOIN public.orders AS o ON o.id = p.order_id
      WHERE pp.confirmed_minor >= pp.amount_minor
        AND EXISTS (
          SELECT 1
          FROM public.user_practices AS up
          WHERE up.user_id = o.user_id
            AND up.practice_id = o.practice_id
            AND up.access_source = 'purchase'
        )
    ),
    -- 6. audit invariants
    'refunds_without_audit_entry', (
      SELECT count(*)::integer
      FROM scoped AS s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.finance_audit_log AS a
        WHERE a.entity_type = 'payment_refund'
          AND a.entity_id = s.id
      )
    ),
    'audit_entries_total', (
      SELECT count(*)::integer FROM public.finance_audit_log
    ),
    'notes', jsonb_build_object(
      'access_revoke', 'manual_only_by_design',
      'fully_refunded_with_access_kept', 'informational_not_an_error',
      'payments_status', 'refunds_never_write_payments_status'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_refund_p331_integrity_snapshot(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_refund_p331_integrity_snapshot(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_p331_integrity_snapshot(boolean) TO service_role;

COMMENT ON FUNCTION public.admin_refund_p331_integrity_snapshot IS
  'audiolad:payments-analytics:p331; read-only refund integrity counters for ops/scripts; service_role only.';

-- ---------------------------------------------------------------------------
-- 7. RBAC: refunds.manage (owner + finance)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.platform_permissions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.platform_permissions (code, description) VALUES
    ('refunds.manage', 'Request and submit payment refunds')
  ON CONFLICT (code) DO NOTHING;

  IF to_regclass('public.platform_role_permissions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.platform_role_permissions (role_code, permission_code) VALUES
    ('owner', 'refunds.manage'),
    ('finance', 'refunds.manage')
  ON CONFLICT DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.payment_refunds') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: payment_refunds missing';
  END IF;

  IF to_regclass('public.finance_audit_log') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: finance_audit_log missing';
  END IF;

  IF to_regprocedure(
    'public.create_payment_refund_request(uuid,bigint,text,text,text,uuid,text,boolean,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_payment_refund_request missing';
  END IF;

  IF to_regprocedure(
    'public.apply_payment_refund_provider_status(uuid,text,text,text,text,text,jsonb,text,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: apply_payment_refund_provider_status missing';
  END IF;

  IF to_regprocedure('public.admin_refund_p331_summary(timestamptz,timestamptz,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: admin_refund_p331_summary missing';
  END IF;

  IF NOT public.payment_refund_transition_allowed('requested', 'submitted')
     OR public.payment_refund_transition_allowed('succeeded', 'failed')
     OR public.payment_refund_transition_allowed('cancelled', 'submitted') THEN
    RAISE EXCEPTION 'Post-check failed: refund status machine is wrong';
  END IF;
END;
$$;

COMMIT;
