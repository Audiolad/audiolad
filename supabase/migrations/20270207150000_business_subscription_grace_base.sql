BEGIN;

-- ---------------------------------------------------------------------------
-- Business subscription grace anchor (Sergey, 2026-10-28).
-- Additive only. Replaces apply_business_subscription_for_order.
-- Does not edit 20270205130000. Does not call Tochka. Does not apply itself.
--
-- One period per order stays. A replay of the same order returns the stored
-- row and does not move paid_until.
--
-- The contractual end is the later of the free-trial ends_at and paid_until.
-- A payment before that end, or during the 3×24h grace after it, starts the
-- next 30×24h at that end. Example: paid on grace day 2 (two days after the
-- end) leaves 28 days from the payment.
--
-- Assumption: a payment at or after the exact instant
-- contractual_end + 3×24h (music already stopped; cabinet mode offer) starts
-- the new 30 days at paid_at. The window is half-open, the same test as
-- isInsideGrace in src/lib/access-grants/policy.ts:
--   paid_at < contractual_end + interval '3 days'
-- interval '3 days' is BUSINESS_GRACE_DAYS in src/lib/business/plan.ts.
-- The cabinet countdown and the reminder letters (3×24h after the same end)
-- use that constant. Grace is still not stored on paid_until.
--
-- Rollback is not executed by this file. Only if this migration is the latest
-- change and Sergey confirms: restore the function body of
-- apply_business_subscription_for_order from
-- supabase/migrations/20270205130000_business_subscription_payment.sql.
-- Do not drop business_subscription_periods, orders, payments, access_grants
-- or access_paid_periods.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_business_subscription_for_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_existing public.business_subscription_periods%ROWTYPE;
  v_grant public.access_grants%ROWTYPE;
  v_email text;
  v_hash text;
  v_kind text := 'business_new_client';
  v_paid_at timestamptz;
  v_trial_end timestamptz;
  v_paid_until timestamptz;
  v_contractual timestamptz;
  v_base timestamptz;
  v_end timestamptz;
  v_opens boolean;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_order.order_kind, '') IS DISTINCT FROM 'business_subscription' THEN
    RAISE EXCEPTION 'invalid_order_kind' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'order_not_paid' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.amount_minor IS DISTINCT FROM 79900 OR v_order.currency IS DISTINCT FROM 'RUB' THEN
    RAISE EXCEPTION 'subscription_amount_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.business_subscription_periods AS s
  WHERE s.order_id = v_order.id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'already', true,
      'opens_access', v_existing.opens_access,
      'period_end', v_existing.period_end
    );
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments AS p
  WHERE p.order_id = v_order.id
    AND p.provider = 'tochka'
    AND p.status = 'succeeded'
    AND p.amount_minor = 79900
    AND p.currency = 'RUB'
  ORDER BY p.confirmed_at NULLS LAST, p.created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_succeeded' USING ERRCODE = 'P0001';
  END IF;

  v_paid_at := coalesce(v_payment.confirmed_at, v_order.paid_at, clock_timestamp());
  v_opens := NOT (coalesce(v_order.is_test, false) OR coalesce(v_payment.is_test, false));

  SELECT u.email
  INTO v_email
  FROM auth.users AS u
  WHERE u.id = v_order.user_id;

  v_hash := public.business_subscription_email_hash(v_email);
  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'subscription_payer_email_missing' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('access_grants:' || v_kind, 0));

  SELECT *
  INTO v_grant
  FROM public.resolve_access_grant(v_hash, v_order.user_id, v_kind)
  LIMIT 1;

  IF FOUND THEN
    v_trial_end := v_grant.ends_at;
  END IF;

  SELECT max(p.paid_until)
  INTO v_paid_until
  FROM public.access_paid_periods AS p
  WHERE p.kind = v_kind
    AND (p.email_hash = v_hash OR p.user_id = v_order.user_id);

  -- Later of the gift end and paid_until. GREATEST would turn a null into null.
  v_contractual := v_trial_end;
  IF v_paid_until IS NOT NULL AND (v_contractual IS NULL OR v_paid_until > v_contractual) THEN
    v_contractual := v_paid_until;
  END IF;

  -- 3×24h, twin of BUSINESS_GRACE_DAYS / isInsideGrace. The end instant itself
  -- is already grace. The exact instant end + 3 days is outside: music stopped.
  IF v_contractual IS NOT NULL AND v_paid_at < v_contractual + interval '3 days' THEN
    v_base := v_contractual;
  ELSE
    v_base := v_paid_at;
  END IF;
  v_end := v_base + interval '30 days';

  INSERT INTO public.business_subscription_periods (
    order_id,
    user_id,
    email_hash,
    kind,
    period_start,
    period_end,
    amount_minor,
    opens_access,
    applied_at
  ) VALUES (
    v_order.id,
    v_order.user_id,
    v_hash,
    v_kind,
    v_base,
    v_end,
    79900,
    v_opens,
    v_paid_at
  );

  IF v_opens THEN
    INSERT INTO public.access_paid_periods AS ap (
      email_hash,
      user_id,
      kind,
      paid_until
    ) VALUES (
      v_hash,
      v_order.user_id,
      v_kind,
      v_end
    )
    ON CONFLICT (email_hash, kind) DO UPDATE
    SET
      paid_until = GREATEST(ap.paid_until, EXCLUDED.paid_until),
      updated_at = clock_timestamp()
    WHERE ap.paid_until < EXCLUDED.paid_until;

    INSERT INTO public.access_grant_events (
      email_hash,
      user_id,
      kind,
      event_name,
      occurred_at
    )
    SELECT v_hash, v_order.user_id, v_kind, 'subscription_renewed', v_paid_at
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.access_grant_events AS e
      WHERE e.email_hash = v_hash
        AND e.kind = v_kind
        AND e.event_name = 'subscription_renewed'
    );
  END IF;

  RETURN jsonb_build_object(
    'inserted', true,
    'already', false,
    'opens_access', v_opens,
    'period_end', v_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_business_subscription_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_business_subscription_for_order(uuid) TO service_role;

COMMENT ON FUNCTION public.apply_business_subscription_for_order(uuid) IS
  'audiolad:business-subscription; webhook fulfillment only. One 30x24h period per order. Inside the 3x24h grace the period starts at the previous contractual end; after grace it starts at paid_at. Replay does not extend paid_until. Test payments do not open the cabinet clock.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.apply_business_subscription_for_order(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.apply_business_subscription_for_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: clients must not apply a business period';
  END IF;
END $$;

COMMIT;
