BEGIN;

-- ---------------------------------------------------------------------------
-- Payments P3.0: transactional Tochka fulfillment, webhook ledger, test flags
--
-- Goals:
--   * one DB transaction for payment → order → purchase access → ledger mark
--   * repair partial success on webhook replay (no silent early-return gaps)
--   * immutable webhook inbox with stable dedup
--   * write-time is_test on orders/payments + E2E backfill
--   * cancelled order + late APPROVED → requires_review (no silent paid/access)
--
-- Does NOT: money dashboard, author splits, UTM attribution, refunds process.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Test classification columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_reason text NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_reason text NULL;

COMMENT ON COLUMN public.orders.is_test IS
  'audiolad:payments-p30; true when the commercial operation is non-real (e2e/sandbox). Not derived from buyer email.';

COMMENT ON COLUMN public.payments.is_test IS
  'audiolad:payments-p30; true when the payment is non-real money (e2e/sandbox). Write-time / server-derived only.';

CREATE INDEX IF NOT EXISTS orders_is_test_status_idx
  ON public.orders (is_test, status);

CREATE INDEX IF NOT EXISTS payments_is_test_status_idx
  ON public.payments (is_test, status);

-- ---------------------------------------------------------------------------
-- 2. Webhook event ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  provider text NOT NULL,
  dedup_key text NOT NULL,
  provider_event_id text NULL,
  provider_payment_id text NULL,
  event_type text NOT NULL,

  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_verified boolean NOT NULL DEFAULT false,

  processing_status text NOT NULL DEFAULT 'received',
  processed_at timestamptz NULL,
  processing_attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  review_reason text NULL,

  payment_id uuid NULL REFERENCES public.payments (id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders (id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_webhook_events_provider_check
    CHECK (provider IN ('tochka')),

  CONSTRAINT payment_webhook_events_processing_status_check
    CHECK (processing_status IN (
      'received',
      'processed',
      'duplicate',
      'ignored',
      'requires_review',
      'failed'
    )),

  CONSTRAINT payment_webhook_events_attempts_nonneg_check
    CHECK (processing_attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_dedup_key_uidx
  ON public.payment_webhook_events (provider, dedup_key);

CREATE INDEX IF NOT EXISTS payment_webhook_events_processing_status_idx
  ON public.payment_webhook_events (processing_status, received_at DESC);

CREATE INDEX IF NOT EXISTS payment_webhook_events_provider_payment_id_idx
  ON public.payment_webhook_events (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_webhook_events_payment_id_idx
  ON public.payment_webhook_events (payment_id)
  WHERE payment_id IS NOT NULL;

COMMENT ON TABLE public.payment_webhook_events IS
  'audiolad:payments-p30; immutable webhook inbox. Payload is a sanitized audit subset (no payer PII, no JWT).';

COMMENT ON COLUMN public.payment_webhook_events.dedup_key IS
  'Stable provider-event identity. For Tochka: transactionId when present, else acquiringInternetPayment:{operationId}:{status}:{amount}.';

COMMENT ON COLUMN public.payment_webhook_events.payload IS
  'Sanitized JSON only: webhookType, status, operationId, paymentLinkId, amount, paymentType, transactionId, customerCode, merchantId, qrcId.';

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_webhook_events FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE public.payment_webhook_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Helpers: test detection + sanitized ledger record
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payment_is_test_from_row(
  p_provider_payment_id text,
  p_provider_metadata jsonb,
  p_existing_is_test boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_existing_is_test, false)
    OR coalesce((p_provider_metadata ->> 'e2e_test') IN ('true', 't', '1'), false)
    OR (p_provider_payment_id IS NOT NULL AND p_provider_payment_id LIKE 'e2e-%');
$$;

COMMENT ON FUNCTION public.payment_is_test_from_row IS
  'audiolad:payments-p30; server-side test classification from trusted DB fields only.';

CREATE OR REPLACE FUNCTION public.record_payment_webhook_event(
  p_provider text,
  p_dedup_key text,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_event_type text,
  p_payload jsonb,
  p_signature_verified boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.payment_webhook_events%ROWTYPE;
  v_row public.payment_webhook_events%ROWTYPE;
BEGIN
  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider_required' USING ERRCODE = '22023';
  END IF;

  IF p_dedup_key IS NULL OR btrim(p_dedup_key) = '' THEN
    RAISE EXCEPTION 'dedup_key_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.payment_webhook_events AS e
  WHERE e.provider = p_provider
    AND e.dedup_key = p_dedup_key
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.payment_webhook_events AS e
    SET
      processing_attempts = e.processing_attempts + 1,
      updated_at = now(),
      processing_status = CASE
        WHEN e.processing_status = 'processed' THEN 'duplicate'
        ELSE e.processing_status
      END,
      processed_at = CASE
        WHEN e.processing_status = 'processed' THEN coalesce(e.processed_at, now())
        ELSE e.processed_at
      END
    WHERE e.id = v_existing.id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
      'id', v_row.id,
      'is_new', false,
      'processing_status', v_row.processing_status,
      'payment_id', v_row.payment_id,
      'order_id', v_row.order_id,
      'review_reason', v_row.review_reason
    );
  END IF;

  INSERT INTO public.payment_webhook_events (
    provider,
    dedup_key,
    provider_event_id,
    provider_payment_id,
    event_type,
    payload,
    signature_verified,
    processing_status,
    processing_attempts
  )
  VALUES (
    p_provider,
    p_dedup_key,
    nullif(btrim(coalesce(p_provider_event_id, '')), ''),
    nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
    p_event_type,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_signature_verified, false),
    'received',
    1
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'is_new', true,
    'processing_status', v_row.processing_status,
    'payment_id', v_row.payment_id,
    'order_id', v_row.order_id,
    'review_reason', v_row.review_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_webhook_event(
  text, text, text, text, text, jsonb, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment_webhook_event(
  text, text, text, text, text, jsonb, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_webhook_event(
  text, text, text, text, text, jsonb, boolean
) TO service_role;

COMMENT ON FUNCTION public.record_payment_webhook_event IS
  'audiolad:payments-p30; upsert webhook ledger row by (provider, dedup_key); service_role only.';

-- ---------------------------------------------------------------------------
-- 4. Transactional fulfill + repair
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fulfill_tochka_payment_transactional(
  p_webhook_event_id uuid,
  p_provider_payment_id text,
  p_payment_id uuid,
  p_provider_amount_minor bigint,
  p_provider_currency text,
  p_provider_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.payment_webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_now timestamptz := now();
  v_is_test boolean := false;
  v_test_reason text := NULL;
  v_access_before integer := 0;
  v_access_after integer := 0;
  v_grant jsonb;
  v_was_repaired boolean := false;
  v_was_already_complete boolean := false;
  v_access_inserted boolean := false;
  v_outcome text;
  v_review_reason text := NULL;
  v_payment_before text;
  v_order_before text;
  v_payment_found boolean := false;
BEGIN
  IF p_webhook_event_id IS NULL THEN
    RAISE EXCEPTION 'webhook_event_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_event
  FROM public.payment_webhook_events AS e
  WHERE e.id = p_webhook_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.provider IS DISTINCT FROM 'tochka' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'ignored',
      processed_at = v_now,
      updated_at = v_now,
      last_error = 'unsupported_provider'
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'ignored',
      'review_reason', 'unsupported_provider',
      'webhook_event_id', v_event.id,
      'processing_status', 'ignored'
    );
  END IF;

  IF v_event.processing_status IN ('processed', 'duplicate') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'already_complete',
      'was_already_complete', true,
      'was_repaired', false,
      'payment_id', v_event.payment_id,
      'order_id', v_event.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', v_event.processing_status
    );
  END IF;

  IF v_event.processing_status = 'requires_review' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', v_event.review_reason,
      'payment_id', v_event.payment_id,
      'order_id', v_event.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'was_already_complete', true,
      'was_repaired', false
    );
  END IF;

  IF p_provider_status IS DISTINCT FROM 'APPROVED' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'ignored',
      processed_at = v_now,
      updated_at = v_now,
      last_error = 'unsupported_status'
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'ignored',
      'review_reason', 'unsupported_status',
      'webhook_event_id', v_event.id,
      'processing_status', 'ignored'
    );
  END IF;

  -- Locate payment: prefer internal id, else provider operation id.
  IF p_payment_id IS NOT NULL THEN
    SELECT *
    INTO v_payment
    FROM public.payments AS p
    WHERE p.id = p_payment_id
      AND p.provider = 'tochka'
    FOR UPDATE;

    v_payment_found := FOUND;
  END IF;

  IF NOT v_payment_found
     AND p_provider_payment_id IS NOT NULL
     AND btrim(p_provider_payment_id) <> '' THEN
    SELECT *
    INTO v_payment
    FROM public.payments AS p
    WHERE p.provider = 'tochka'
      AND p.provider_payment_id = p_provider_payment_id
    FOR UPDATE;

    v_payment_found := FOUND;
  END IF;

  IF NOT v_payment_found THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'payment_not_found',
      last_error = 'payment_not_found',
      provider_payment_id = coalesce(
        provider_payment_id,
        nullif(btrim(coalesce(p_provider_payment_id, '')), '')
      )
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'payment_not_found',
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  IF p_provider_payment_id IS NOT NULL
     AND btrim(p_provider_payment_id) <> ''
     AND v_payment.provider_payment_id IS NOT NULL
     AND v_payment.provider_payment_id IS DISTINCT FROM btrim(p_provider_payment_id) THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'provider_payment_id_mismatch',
      last_error = 'provider_payment_id_mismatch',
      payment_id = v_payment.id,
      order_id = v_payment.order_id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'provider_payment_id_mismatch',
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = v_payment.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'order_not_found',
      last_error = 'order_not_found',
      payment_id = v_payment.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'order_not_found',
      'payment_id', v_payment.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  v_payment_before := v_payment.status;
  v_order_before := v_order.status;

  -- Amount / currency integrity (integer minor units only).
  IF v_payment.amount_minor IS DISTINCT FROM v_order.amount_minor
     OR v_payment.currency IS DISTINCT FROM v_order.currency
     OR v_payment.currency IS DISTINCT FROM 'RUB'
     OR p_provider_currency IS DISTINCT FROM 'RUB'
     OR p_provider_amount_minor IS NULL
     OR p_provider_amount_minor IS DISTINCT FROM v_payment.amount_minor THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'amount_or_currency_mismatch',
      last_error = 'amount_or_currency_mismatch',
      payment_id = v_payment.id,
      order_id = v_order.id,
      provider_payment_id = coalesce(v_payment.provider_payment_id, p_provider_payment_id)
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'amount_or_currency_mismatch',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', v_payment.status,
      'order_status', v_order.status,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_payment.is_test
    );
  END IF;

  -- Test classification from trusted row fields (+ provider id / e2e metadata).
  v_is_test := public.payment_is_test_from_row(
    coalesce(nullif(btrim(coalesce(p_provider_payment_id, '')), ''), v_payment.provider_payment_id),
    v_payment.provider_metadata,
    v_payment.is_test OR v_order.is_test
  );

  IF v_is_test THEN
    IF v_payment.is_test AND v_payment.test_reason IS NOT NULL THEN
      v_test_reason := v_payment.test_reason;
    ELSIF v_order.is_test AND v_order.test_reason IS NOT NULL THEN
      v_test_reason := v_order.test_reason;
    ELSIF coalesce((v_payment.provider_metadata ->> 'e2e_test') IN ('true', 't', '1'), false)
       OR coalesce(p_provider_payment_id, v_payment.provider_payment_id, '') LIKE 'e2e-%' THEN
      v_test_reason := 'e2e_test';
    ELSE
      v_test_reason := 'server_test_flag';
    END IF;
  END IF;

  -- Refunded order cannot return to paid.
  IF v_order.status = 'refunded' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'refunded_order',
      last_error = 'refunded_order',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'refunded_order',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', v_payment.status,
      'order_status', v_order.status,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  -- Cancelled / failed order + APPROVED → keep money signal, no silent paid/access.
  IF v_order.status IN ('cancelled', 'failed') THEN
    IF v_payment.status IS DISTINCT FROM 'succeeded' THEN
      IF v_payment.status NOT IN ('pending', 'failed', 'cancelled') THEN
        UPDATE public.payment_webhook_events
        SET
          processing_status = 'requires_review',
          processed_at = v_now,
          updated_at = v_now,
          review_reason = 'unsupported_payment_status',
          last_error = 'unsupported_payment_status',
          payment_id = v_payment.id,
          order_id = v_order.id
        WHERE id = v_event.id;

        RETURN jsonb_build_object(
          'ok', true,
          'outcome', 'requires_review',
          'review_reason', 'unsupported_payment_status',
          'payment_id', v_payment.id,
          'order_id', v_order.id,
          'payment_status', v_payment.status,
          'order_status', v_order.status,
          'webhook_event_id', v_event.id,
          'processing_status', 'requires_review',
          'is_test', v_is_test
        );
      END IF;

      UPDATE public.payments
      SET
        status = 'succeeded',
        provider_payment_id = coalesce(
          nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
          provider_payment_id
        ),
        confirmed_at = coalesce(confirmed_at, v_now),
        updated_at = v_now,
        is_test = v_is_test,
        test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END,
        provider_metadata = provider_metadata || jsonb_build_object(
          'provider_status', p_provider_status,
          'fulfilled_at', v_now,
          'fulfill_outcome', 'requires_review_cancelled_or_failed_order'
        )
      WHERE id = v_payment.id;
    END IF;

    UPDATE public.orders
    SET
      is_test = CASE WHEN v_is_test THEN true ELSE is_test END,
      test_reason = CASE
        WHEN v_is_test THEN coalesce(test_reason, v_test_reason)
        ELSE test_reason
      END,
      updated_at = v_now
    WHERE id = v_order.id;

    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = CASE
        WHEN v_order.status = 'cancelled' THEN 'cancelled_order_late_approved'
        ELSE 'failed_order_late_approved'
      END,
      last_error = NULL,
      payment_id = v_payment.id,
      order_id = v_order.id,
      provider_payment_id = coalesce(
        nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
        v_payment.provider_payment_id
      )
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', CASE
        WHEN v_order.status = 'cancelled' THEN 'cancelled_order_late_approved'
        ELSE 'failed_order_late_approved'
      END,
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', 'succeeded',
      'order_status', v_order.status,
      'access_granted', false,
      'access_inserted', false,
      'was_repaired', false,
      'was_already_complete', false,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  -- Payment transition: pending|failed|cancelled|succeeded → succeeded.
  IF v_payment.status = 'refunded' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'refunded_payment',
      last_error = 'refunded_payment',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'refunded_payment',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  IF v_payment.status NOT IN ('pending', 'failed', 'cancelled', 'succeeded') THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'unsupported_payment_status',
      last_error = 'unsupported_payment_status',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'unsupported_payment_status',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  IF v_order.status NOT IN ('pending', 'paid') THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'unsupported_order_status',
      last_error = 'unsupported_order_status',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'unsupported_order_status',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  SELECT count(*)::integer
  INTO v_access_before
  FROM public.user_practices AS up
  WHERE up.user_id = v_order.user_id
    AND up.practice_id = v_order.practice_id;

  -- Apply payment succeeded (idempotent).
  UPDATE public.payments
  SET
    status = 'succeeded',
    provider_payment_id = coalesce(
      nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
      provider_payment_id
    ),
    confirmed_at = coalesce(confirmed_at, v_now),
    updated_at = v_now,
    is_test = v_is_test,
    test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END,
    provider_metadata = provider_metadata || jsonb_build_object(
      'provider_status', p_provider_status,
      'fulfilled_at', v_now
    )
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  -- Apply order paid (pending → paid; paid stays paid).
  IF v_order.status = 'pending' THEN
    UPDATE public.orders
    SET
      status = 'paid',
      paid_at = coalesce(paid_at, v_now),
      updated_at = v_now,
      is_test = v_is_test,
      test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  ELSE
    UPDATE public.orders
    SET
      paid_at = coalesce(paid_at, v_now),
      updated_at = v_now,
      is_test = CASE WHEN v_is_test THEN true ELSE is_test END,
      test_reason = CASE
        WHEN v_is_test THEN coalesce(test_reason, v_test_reason)
        ELSE test_reason
      END
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  v_grant := public.grant_practice_purchase_access(v_order.id);
  v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);

  SELECT count(*)::integer
  INTO v_access_after
  FROM public.user_practices AS up
  WHERE up.user_id = v_order.user_id
    AND up.practice_id = v_order.practice_id;

  IF v_access_after < 1 THEN
    RAISE EXCEPTION 'access_grant_missing_after_fulfill' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment_before = 'succeeded'
     AND v_order_before = 'paid'
     AND v_access_before >= 1
     AND NOT v_access_inserted THEN
    v_was_already_complete := true;
    v_outcome := 'already_complete';
  ELSIF v_payment_before = 'succeeded'
     OR v_order_before = 'paid'
     OR v_access_before >= 1 THEN
    v_was_repaired := true;
    v_outcome := 'repaired';
  ELSE
    v_outcome := 'completed';
  END IF;

  UPDATE public.payment_webhook_events
  SET
    processing_status = CASE
      WHEN v_was_already_complete THEN 'duplicate'
      ELSE 'processed'
    END,
    processed_at = v_now,
    updated_at = v_now,
    last_error = NULL,
    review_reason = NULL,
    payment_id = v_payment.id,
    order_id = v_order.id,
    provider_payment_id = v_payment.provider_payment_id
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_outcome,
    'review_reason', NULL,
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'payment_status', v_payment.status,
    'order_status', v_order.status,
    'access_granted', true,
    'access_inserted', v_access_inserted,
    'access_rows', v_access_after,
    'was_repaired', v_was_repaired,
    'was_already_complete', v_was_already_complete,
    'webhook_event_id', v_event.id,
    'processing_status', CASE
      WHEN v_was_already_complete THEN 'duplicate'
      ELSE 'processed'
    END,
    'is_test', v_is_test,
    'test_reason', v_test_reason
  );
EXCEPTION
  WHEN OTHERS THEN
    -- PL/pgSQL subtransaction: main-body writes roll back; this UPDATE is kept
    -- when we RETURN (not RAISE), so the event stays retryable as `failed`.
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'failed',
      updated_at = now(),
      last_error = left(SQLERRM, 500)
    WHERE id = p_webhook_event_id
      AND processing_status NOT IN ('processed', 'duplicate', 'requires_review');

    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'failed',
      'review_reason', 'transient_or_internal_error',
      'error_code', SQLSTATE,
      'webhook_event_id', p_webhook_event_id,
      'processing_status', 'failed'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) TO service_role;

COMMENT ON FUNCTION public.fulfill_tochka_payment_transactional IS
  'audiolad:payments-p30; transactional Tochka APPROVED fulfill + repair; service_role only; never trusts client amount/user/test flags.';

-- ---------------------------------------------------------------------------
-- 5. Read-only integrity snapshot (admin/ops, not a public API)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payment_integrity_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'orders_by_status', (
      SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, count(*)::integer AS cnt
        FROM public.orders
        GROUP BY status
      ) s
    ),
    'payments_by_status', (
      SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, count(*)::integer AS cnt
        FROM public.payments
        GROUP BY status
      ) s
    ),
    'succeeded_payments', (
      SELECT count(*)::integer FROM public.payments WHERE status = 'succeeded'
    ),
    'succeeded_real', (
      SELECT count(*)::integer
      FROM public.payments
      WHERE status = 'succeeded' AND is_test = false
    ),
    'succeeded_test', (
      SELECT count(*)::integer
      FROM public.payments
      WHERE status = 'succeeded' AND is_test = true
    ),
    'paid_orders', (
      SELECT count(*)::integer FROM public.orders WHERE status = 'paid'
    ),
    'paid_orders_real', (
      SELECT count(*)::integer
      FROM public.orders
      WHERE status = 'paid' AND is_test = false
    ),
    'purchase_grants', (
      SELECT count(*)::integer
      FROM public.user_practices
      WHERE access_source = 'purchase'
    ),
    'gross_succeeded_minor', (
      SELECT coalesce(sum(amount_minor), 0)::bigint
      FROM public.payments
      WHERE status = 'succeeded'
    ),
    'gross_real_minor', (
      SELECT coalesce(sum(amount_minor), 0)::bigint
      FROM public.payments
      WHERE status = 'succeeded' AND is_test = false
    ),
    'gross_test_minor', (
      SELECT coalesce(sum(amount_minor), 0)::bigint
      FROM public.payments
      WHERE status = 'succeeded' AND is_test = true
    ),
    'duplicate_provider_payment_ids', (
      SELECT count(*)::integer
      FROM (
        SELECT provider, provider_payment_id
        FROM public.payments
        WHERE provider_payment_id IS NOT NULL
        GROUP BY provider, provider_payment_id
        HAVING count(*) > 1
      ) d
    ),
    'succeeded_without_paid_order', (
      SELECT count(*)::integer
      FROM public.payments AS p
      JOIN public.orders AS o ON o.id = p.order_id
      WHERE p.status = 'succeeded'
        AND o.status IS DISTINCT FROM 'paid'
        AND o.status NOT IN ('cancelled', 'failed')
    ),
    'succeeded_with_cancelled_or_failed_order', (
      SELECT count(*)::integer
      FROM public.payments AS p
      JOIN public.orders AS o ON o.id = p.order_id
      WHERE p.status = 'succeeded'
        AND o.status IN ('cancelled', 'failed')
    ),
    'paid_without_succeeded_payment', (
      SELECT count(*)::integer
      FROM public.orders AS o
      WHERE o.status = 'paid'
        AND NOT EXISTS (
          SELECT 1
          FROM public.payments AS p
          WHERE p.order_id = o.id
            AND p.status = 'succeeded'
        )
    ),
    'paid_without_purchase_access', (
      SELECT count(*)::integer
      FROM public.orders AS o
      WHERE o.status = 'paid'
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_practices AS up
          WHERE up.user_id = o.user_id
            AND up.practice_id = o.practice_id
            AND up.access_source = 'purchase'
        )
    ),
    'purchase_access_without_paid_order', (
      SELECT count(*)::integer
      FROM public.user_practices AS up
      WHERE up.access_source = 'purchase'
        AND NOT EXISTS (
          SELECT 1
          FROM public.orders AS o
          WHERE o.user_id = up.user_id
            AND o.practice_id = up.practice_id
            AND o.status = 'paid'
        )
    ),
    'amount_mismatches', (
      SELECT count(*)::integer
      FROM public.payments AS p
      JOIN public.orders AS o ON o.id = p.order_id
      WHERE p.amount_minor IS DISTINCT FROM o.amount_minor
         OR p.currency IS DISTINCT FROM o.currency
    ),
    'cancelled_order_pending_payment', (
      SELECT count(*)::integer
      FROM public.orders AS o
      JOIN public.payments AS p ON p.order_id = o.id
      WHERE o.status = 'cancelled'
        AND p.status = 'pending'
    ),
    'webhook_unprocessed', (
      SELECT count(*)::integer
      FROM public.payment_webhook_events
      WHERE processing_status IN ('received', 'failed')
    ),
    'webhook_requires_review', (
      SELECT count(*)::integer
      FROM public.payment_webhook_events
      WHERE processing_status = 'requires_review'
    ),
    'webhook_failed', (
      SELECT count(*)::integer
      FROM public.payment_webhook_events
      WHERE processing_status = 'failed'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.payment_integrity_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_integrity_snapshot() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_integrity_snapshot() TO service_role;

COMMENT ON FUNCTION public.payment_integrity_snapshot IS
  'audiolad:payments-p30; read-only payment integrity counters for ops/scripts; service_role only.';

-- ---------------------------------------------------------------------------
-- 6. Backfill test flags (only unambiguous markers)
-- ---------------------------------------------------------------------------

UPDATE public.payments
SET
  is_test = true,
  test_reason = CASE
    WHEN coalesce((provider_metadata ->> 'e2e_test') IN ('true', 't', '1'), false)
      THEN 'e2e_metadata'
    WHEN provider_payment_id LIKE 'e2e-%'
      THEN 'e2e_provider_payment_id'
    ELSE test_reason
  END,
  updated_at = now()
WHERE is_test = false
  AND (
    coalesce((provider_metadata ->> 'e2e_test') IN ('true', 't', '1'), false)
    OR provider_payment_id LIKE 'e2e-%'
  );

UPDATE public.orders AS o
SET
  is_test = true,
  test_reason = 'e2e_payment',
  updated_at = now()
WHERE o.is_test = false
  AND EXISTS (
    SELECT 1
    FROM public.payments AS p
    WHERE p.order_id = o.id
      AND p.is_test = true
  );

-- ---------------------------------------------------------------------------
-- 7. Zombie policy: local cancel pending payments on cancelled orders
--    (no Tochka API cancel in this migration; late APPROVED → requires_review)
-- ---------------------------------------------------------------------------

UPDATE public.payments AS p
SET
  status = 'cancelled',
  updated_at = now(),
  provider_metadata = p.provider_metadata || jsonb_build_object(
    'local_cancel_reason', 'order_cancelled_zombie_pending',
    'local_cancelled_at', now()
  )
FROM public.orders AS o
WHERE p.order_id = o.id
  AND o.status = 'cancelled'
  AND p.status = 'pending';

-- ---------------------------------------------------------------------------
-- 8. Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.payment_webhook_events') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: payment_webhook_events missing';
  END IF;

  IF to_regprocedure(
    'public.fulfill_tochka_payment_transactional(uuid,text,uuid,bigint,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: fulfill_tochka_payment_transactional missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'is_test'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: payments.is_test missing';
  END IF;
END;
$$;

COMMIT;
