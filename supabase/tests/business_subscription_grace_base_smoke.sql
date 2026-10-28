-- Disposable smoke for 20270207150000_business_subscription_grace_base.sql.
-- No Tochka HTTP. Rolls back.
-- Grace is interval '3 days' (3×24h), the same length as BUSINESS_GRACE_DAYS.
-- A payment at exactly previous_end + 3 days is already outside: music stopped,
-- so period_start is paid_at.
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION pg_temp.business_grace_pay(
  p_email text,
  p_paid_at timestamptz,
  p_trial_end timestamptz,
  p_seed_paid_until timestamptz
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
  v_order uuid;
  v_payment uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
  v_hash text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_user, p_email);
  INSERT INTO public.business_organizations (id, name) VALUES (v_org, left(p_email, 80));
  INSERT INTO public.business_organization_members (organization_id, user_id, role)
  VALUES (v_org, v_user, 'owner');

  v_hash := public.business_subscription_email_hash(p_email);
  IF p_trial_end IS NOT NULL THEN
    INSERT INTO public.access_grants (email_hash, user_id, kind, starts_at, ends_at, source)
    VALUES (
      v_hash,
      v_user,
      'business_new_client',
      p_trial_end - interval '30 days',
      p_trial_end,
      'trial'
    );
  END IF;
  IF p_seed_paid_until IS NOT NULL THEN
    INSERT INTO public.access_paid_periods (email_hash, user_id, kind, paid_until)
    VALUES (v_hash, v_user, 'business_new_client', p_seed_paid_until);
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('audiolad.author_support_token_hash', '', true);
  SET LOCAL ROLE authenticated;
  PERFORM * FROM public.accept_business_offer(
    'b2b-terms',
    'r8-2026-10-18',
    '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a'
  );
  SELECT o.order_id INTO v_order
  FROM public.create_business_subscription_order(v_key) AS o;
  RESET ROLE;

  INSERT INTO public.payments (
    id, order_id, provider, idempotency_key, status, amount_minor, currency,
    provider_metadata, confirmed_at
  ) VALUES (
    v_payment, v_order, 'tochka', 'pay-' || v_payment::text, 'pending', 79900, 'RUB',
    '{}'::jsonb, p_paid_at
  );
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, provider_payment_id, event_type, processing_status, signature_verified
  ) VALUES (
    v_event, 'tochka', 'tochka:tx:grace-' || v_payment::text, 'op-' || v_payment::text,
    'acquiringInternetPayment', 'received', true
  );
  PERFORM public.fulfill_tochka_payment_transactional(
    v_event, 'op-' || v_payment::text, v_payment, 79900, 'RUB', 'APPROVED'
  );
  RETURN v_order;
END;
$$;

DO $$
DECLARE
  v_anchor timestamptz := timestamptz '2026-11-22 12:00:00+00';
  v_order uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_paid timestamptz;
  v_count integer;
  v_payment uuid;
  v_event uuid := gen_random_uuid();
  v_replay jsonb;
BEGIN
  -- Pay before the current end: the next 30 days start at that end.
  v_order := pg_temp.business_grace_pay(
    'grace-before@example.test',
    v_anchor,
    NULL,
    v_anchor + interval '10 days'
  );
  SELECT period_start, period_end INTO v_start, v_end
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor + interval '10 days'
     OR v_end IS DISTINCT FROM v_start + interval '30 days' THEN
    RAISE EXCEPTION 'before end start % end %', v_start, v_end;
  END IF;

  -- Grace day 1: 12 hours after the previous end. period_start is that end.
  v_order := pg_temp.business_grace_pay(
    'grace-day1@example.test',
    v_anchor + interval '12 hours',
    NULL,
    v_anchor
  );
  SELECT period_start, period_end INTO v_start, v_end
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor
     OR v_end IS DISTINCT FROM v_anchor + interval '30 days' THEN
    RAISE EXCEPTION 'grace day 1 start % end %', v_start, v_end;
  END IF;

  -- Grace day 2: two days after the previous end. 28 days remain from payment.
  v_order := pg_temp.business_grace_pay(
    'grace-day2@example.test',
    v_anchor + interval '2 days',
    NULL,
    v_anchor
  );
  SELECT period_start, period_end INTO v_start, v_end
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor
     OR v_end IS DISTINCT FROM v_anchor + interval '30 days'
     OR v_end - (v_anchor + interval '2 days') IS DISTINCT FROM interval '28 days' THEN
    RAISE EXCEPTION 'grace day 2 start % end %', v_start, v_end;
  END IF;

  -- Replay of that order does not open a second period and does not move the end.
  SELECT id INTO v_payment FROM public.payments WHERE order_id = v_order;
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, provider_payment_id, event_type, processing_status, signature_verified
  ) VALUES (
    v_event, 'tochka', 'tochka:tx:grace-replay-' || v_payment::text, 'op-' || v_payment::text,
    'acquiringInternetPayment', 'received', true
  );
  PERFORM public.fulfill_tochka_payment_transactional(
    v_event, 'op-' || v_payment::text, v_payment, 79900, 'RUB', 'APPROVED'
  );
  v_replay := public.apply_business_subscription_for_order(v_order);
  SELECT count(*) INTO v_count FROM public.business_subscription_periods WHERE order_id = v_order;
  SELECT period_start, period_end INTO v_start, v_end
  FROM public.business_subscription_periods WHERE order_id = v_order;
  SELECT paid_until INTO v_paid
  FROM public.access_paid_periods
  WHERE user_id = (SELECT user_id FROM public.orders WHERE id = v_order)
    AND kind = 'business_new_client';
  IF v_count <> 1
     OR v_start IS DISTINCT FROM v_anchor
     OR v_end IS DISTINCT FROM v_anchor + interval '30 days'
     OR v_paid IS DISTINCT FROM v_end
     OR (v_replay->>'already')::boolean IS DISTINCT FROM true
     OR (v_replay->>'inserted')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'replay moved the period count % start % end % paid % replay %',
      v_count, v_start, v_end, v_paid, v_replay;
  END IF;

  -- Grace day 3: the last second of the 3×24h window still anchors to the end.
  v_order := pg_temp.business_grace_pay(
    'grace-day3@example.test',
    v_anchor + interval '3 days' - interval '1 second',
    NULL,
    v_anchor
  );
  SELECT period_start, period_end INTO v_start, v_end
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor
     OR v_end IS DISTINCT FROM v_anchor + interval '30 days' THEN
    RAISE EXCEPTION 'grace day 3 start % end %', v_start, v_end;
  END IF;

  -- After grace, including the exact instant music stops: start at paid_at.
  v_order := pg_temp.business_grace_pay(
    'grace-after@example.test',
    v_anchor + interval '3 days',
    NULL,
    v_anchor
  );
  SELECT period_start, period_end INTO v_start, v_end
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor + interval '3 days'
     OR v_end IS DISTINCT FROM v_start + interval '30 days' THEN
    RAISE EXCEPTION 'after grace start % end %', v_start, v_end;
  END IF;

  v_order := pg_temp.business_grace_pay(
    'grace-after-later@example.test',
    v_anchor + interval '5 days',
    NULL,
    v_anchor
  );
  SELECT period_start INTO v_start
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor + interval '5 days' THEN
    RAISE EXCEPTION 'later after grace start %', v_start;
  END IF;

  -- Trial end inside grace, no paid_until yet.
  v_order := pg_temp.business_grace_pay(
    'grace-trial@example.test',
    v_anchor + interval '1 day',
    v_anchor,
    NULL
  );
  SELECT period_start, period_end INTO v_start, v_end
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor
     OR v_end IS DISTINCT FROM v_anchor + interval '30 days' THEN
    RAISE EXCEPTION 'trial grace start % end %', v_start, v_end;
  END IF;
  IF (
    SELECT ends_at FROM public.access_grants
    WHERE user_id = (SELECT user_id FROM public.orders WHERE id = v_order)
  ) IS DISTINCT FROM v_anchor THEN
    RAISE EXCEPTION 'payment moved the trial end';
  END IF;

  -- An older paid_until does not hide a later trial that is still in grace.
  v_order := pg_temp.business_grace_pay(
    'grace-trial-later@example.test',
    v_anchor + interval '1 day',
    v_anchor,
    v_anchor - interval '10 days'
  );
  SELECT period_start INTO v_start
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor THEN
    RAISE EXCEPTION 'later trial in grace start %', v_start;
  END IF;

  -- After that later end's grace has expired, payment time wins.
  v_order := pg_temp.business_grace_pay(
    'grace-trial-expired@example.test',
    v_anchor + interval '5 days',
    v_anchor,
    v_anchor - interval '10 days'
  );
  SELECT period_start INTO v_start
  FROM public.business_subscription_periods WHERE order_id = v_order;
  IF v_start IS DISTINCT FROM v_anchor + interval '5 days' THEN
    RAISE EXCEPTION 'expired later end start %', v_start;
  END IF;

  RAISE NOTICE 'business_subscription_grace_base_smoke: ok';
END $$;

ROLLBACK;
