BEGIN;

-- PR1: Studio music license fulfill branch.
-- Phase 4: replace fulfill_tochka_payment_transactional from the LATEST
-- production body (20260725190000). Additive branch only.
-- product_purchase grant path is unchanged.

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
  v_publication_class text;
  v_order_kind text;
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

  v_order_kind := coalesce(v_order.order_kind, 'product_purchase');

  IF v_order_kind = 'studio_music_license' THEN
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.studio_music_entitlements AS e
    WHERE e.user_id = v_order.user_id
      AND e.practice_id = v_order.practice_id
      AND e.revoked_at IS NULL;
  ELSE
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.user_practices AS up
    WHERE up.user_id = v_order.user_id
      AND up.practice_id = v_order.practice_id;
  END IF;

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

  v_order_kind := coalesce(v_order.order_kind, 'product_purchase');

  IF v_order_kind = 'studio_music_license' THEN
    v_grant := public.grant_studio_music_purchase_entitlement(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  ELSIF v_order_kind = 'course_upgrade' THEN
    IF v_order.target_access_level IS NULL OR v_order.target_access_level < 2 THEN
      RAISE EXCEPTION 'invalid_upgrade_target' USING ERRCODE = '22023';
    END IF;

    SELECT p.publication_class
    INTO v_publication_class
    FROM public.practices AS p
    WHERE p.id = v_order.practice_id;

    IF v_publication_class IS DISTINCT FROM 'course' THEN
      RAISE EXCEPTION 'upgrade_not_course' USING ERRCODE = '22023';
    END IF;

    -- Fulfill from immutable order snapshots (amount already matched
    -- payment/provider). Do not re-read live upgrade_price.
    v_grant := public.grant_practice_access(
      v_order.user_id,
      v_order.practice_id,
      v_order.target_access_level,
      'purchase',
      jsonb_build_object(
        'order_id', v_order.id,
        'payment_id', v_payment.id,
        'target_access_level', v_order.target_access_level,
        'granted_via', 'course_upgrade'
      )
    );
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);

    IF coalesce((v_grant ->> 'access_level')::integer, 0) < v_order.target_access_level THEN
      RAISE EXCEPTION 'access_grant_below_target' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_grant := public.grant_practice_purchase_access(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  END IF;

  IF v_order_kind = 'studio_music_license' THEN
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.studio_music_entitlements AS e
    WHERE e.user_id = v_order.user_id
      AND e.practice_id = v_order.practice_id
      AND e.revoked_at IS NULL;
  ELSE
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.user_practices AS up
    WHERE up.user_id = v_order.user_id
      AND up.practice_id = v_order.practice_id;
  END IF;

  IF v_access_after < 1 THEN
    RAISE EXCEPTION 'access_grant_missing_after_fulfill' USING ERRCODE = 'P0001';
  END IF;

  -- Success = valid payment + successful grant, not access_inserted.
  -- Upgrade typically UPDATE (inserted=false, raised=true). Existing
  -- entitlement must not classify a first upgrade as repaired/review.
  IF v_order_kind IN ('course_upgrade', 'studio_music_license') THEN
    IF v_payment_before = 'succeeded'
       AND v_order_before = 'paid' THEN
      v_was_already_complete := true;
      v_outcome := 'already_complete';
    ELSIF v_payment_before = 'succeeded'
       OR v_order_before = 'paid' THEN
      v_was_repaired := true;
      v_outcome := 'repaired';
    ELSE
      v_outcome := 'completed';
    END IF;
  ELSIF v_payment_before = 'succeeded'
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
  'audiolad:payments-p30-studio-music:v1; transactional Tochka APPROVED fulfill + repair; product_purchase uses grant_practice_purchase_access; course_upgrade grants target via grant_practice_access; studio_music_license grants studio_music_entitlements only (never user_practices); success is not access_inserted; service_role only; never trusts client amount/user/test flags.';

DO $$
BEGIN
  IF to_regprocedure(
    'public.fulfill_tochka_payment_transactional(uuid,text,uuid,bigint,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: fulfill_tochka_payment_transactional missing';
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.fulfill_tochka_payment_transactional(uuid,text,uuid,bigint,text,text)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: service_role must EXECUTE fulfill';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.fulfill_tochka_payment_transactional(uuid,text,uuid,bigint,text,text)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not EXECUTE fulfill';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.fulfill_tochka_payment_transactional(uuid,text,uuid,bigint,text,text)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not EXECUTE fulfill';
  END IF;
END
$$;

COMMIT;
