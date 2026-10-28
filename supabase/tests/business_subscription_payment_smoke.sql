-- Disposable smoke for 20270205120000_business_subscription_payment.sql.
-- No Tochka HTTP. Rolls back.
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_manager uuid := gen_random_uuid();
  v_trial uuid := gen_random_uuid();
  v_test uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_org_trial uuid := gen_random_uuid();
  v_org_test uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
  v_key2 uuid := gen_random_uuid();
  v_order uuid;
  v_order2 uuid;
  v_payment uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
  v_event2 uuid := gen_random_uuid();
  v_trial_order uuid;
  v_trial_payment uuid := gen_random_uuid();
  v_trial_event uuid := gen_random_uuid();
  v_test_order uuid;
  v_test_payment uuid := gen_random_uuid();
  v_test_event uuid := gen_random_uuid();
  v_hash text;
  v_trial_hash text;
  v_test_hash text;
  v_trial_end timestamptz;
  v_result jsonb;
  v_paid timestamptz;
  v_period_end timestamptz;
  v_opens boolean;
  v_count integer;
  v_accepted boolean;
  v_obligation uuid;
BEGIN
  IF has_function_privilege('anon', 'public.create_business_subscription_order(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_business_offer(text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.apply_business_subscription_for_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privilege: point/anon must not pay and clients must not apply periods';
  END IF;
  IF has_table_privilege('authenticated', 'public.business_offer_acceptances', 'INSERT')
     OR has_table_privilege('anon', 'public.business_subscription_periods', 'SELECT') THEN
    RAISE EXCEPTION 'privilege: direct table access';
  END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_owner, 'cafe-owner@example.test'),
    (v_manager, 'cafe-manager@example.test'),
    (v_trial, 'cafe-trial-pay@example.test'),
    (v_test, 'cafe-test-pay@example.test');
  INSERT INTO public.business_organizations (id, name) VALUES
    (v_org, 'Кафе владельца'),
    (v_org_trial, 'Кафе подарка'),
    (v_org_test, 'Кафе теста');
  INSERT INTO public.business_organization_members (organization_id, user_id, role) VALUES
    (v_org, v_owner, 'owner'),
    (v_org, v_manager, 'manager'),
    (v_org_trial, v_trial, 'owner'),
    (v_org_test, v_test, 'owner');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM set_config('audiolad.author_support_token_hash', 'support-proof', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.accept_business_offer(
      'b2b-terms',
      'r8-2026-10-18',
      '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a'
    );
    RAISE EXCEPTION 'support mode accepted an offer';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%support_mode_consent_forbidden%' THEN
        RAISE;
      END IF;
  END;
  RESET ROLE;
  PERFORM set_config('audiolad.author_support_token_hash', '', true);

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.create_business_subscription_order(gen_random_uuid());
    RAISE EXCEPTION 'manager created an order';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%not_organization_owner%' THEN
        RAISE;
      END IF;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.create_business_subscription_order(v_key);
    RAISE EXCEPTION 'order without acceptance';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%offer_acceptance_required%' THEN
        RAISE;
      END IF;
  END;
  BEGIN
    PERFORM * FROM public.accept_business_offer('b2b-terms', 'r8-2026-10-18', repeat('a', 64));
    RAISE EXCEPTION 'unknown offer accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE '%offer_document_unknown%' THEN
        RAISE;
      END IF;
  END;
  SELECT a.already_accepted
  INTO v_accepted
  FROM public.accept_business_offer(
    'b2b-terms',
    'r8-2026-10-18',
    '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a'
  ) AS a;
  IF v_accepted THEN
    RAISE EXCEPTION 'first acceptance looked stored';
  END IF;
  SELECT a.already_accepted
  INTO v_accepted
  FROM public.accept_business_offer(
    'b2b-terms',
    'r6.1-2026-10-18',
    'a3e74c3a6b06bd6c8e29ecc6e832984a7a2f7f5af75c44252c7ba1a85c98bc88'
  ) AS a;
  IF NOT v_accepted THEN
    RAISE EXCEPTION 'second acceptance replaced the account row';
  END IF;
  IF (SELECT count(*) FROM public.business_offer_acceptance_for_caller()) <> 1 THEN
    RAISE EXCEPTION 'acceptance is not one row per account';
  END IF;

  SELECT o.order_id INTO v_order
  FROM public.create_business_subscription_order(v_key) AS o;
  SELECT o.order_id INTO v_order2
  FROM public.create_business_subscription_order(v_key2) AS o;
  IF v_order IS NULL OR v_order IS DISTINCT FROM v_order2 THEN
    RAISE EXCEPTION 'pending order was not reused: % %', v_order, v_order2;
  END IF;
  RESET ROLE;

  IF (
    SELECT amount_minor FROM public.orders WHERE id = v_order
  ) IS DISTINCT FROM 79900
     OR (SELECT author_id_snapshot FROM public.orders WHERE id = v_order) IS NOT NULL
     OR (SELECT practice_id FROM public.orders WHERE id = v_order) IS NOT NULL
     OR (SELECT practice_title_snapshot FROM public.orders WHERE id = v_order)
          IS DISTINCT FROM 'АудиоЛад Бизнес – доступ на 30 дней' THEN
    RAISE EXCEPTION 'order snapshot is not the platform month';
  END IF;

  INSERT INTO public.payments (
    id, order_id, provider, idempotency_key, status, amount_minor, currency, provider_metadata
  ) VALUES (
    v_payment, v_order, 'tochka', 'pay-' || v_payment::text, 'pending', 79900, 'RUB', '{}'::jsonb
  );
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, provider_payment_id, event_type, processing_status, signature_verified
  ) VALUES (
    v_event, 'tochka', 'tochka:tx:biz-sub-1', 'op-biz-1', 'acquiringInternetPayment', 'received', true
  );

  v_result := public.fulfill_tochka_payment_transactional(
    v_event, 'op-biz-1', v_payment, 79900, 'RUB', 'APPROVED'
  );
  IF v_result->>'outcome' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'first fulfill %', v_result;
  END IF;

  SELECT p.period_end, p.opens_access, ap.paid_until
  INTO v_period_end, v_opens, v_paid
  FROM public.business_subscription_periods AS p
  LEFT JOIN public.access_paid_periods AS ap
    ON ap.email_hash = p.email_hash AND ap.kind = p.kind
  WHERE p.order_id = v_order;
  IF NOT v_opens OR v_paid IS DISTINCT FROM v_period_end
     OR v_period_end IS DISTINCT FROM (
       SELECT period_start + interval '30 days'
       FROM public.business_subscription_periods WHERE order_id = v_order
     ) THEN
    RAISE EXCEPTION 'period window % paid %', v_period_end, v_paid;
  END IF;

  v_result := public.fulfill_tochka_payment_transactional(
    v_event, 'op-biz-1', v_payment, 79900, 'RUB', 'APPROVED'
  );
  IF v_result->>'outcome' IS DISTINCT FROM 'already_complete' THEN
    RAISE EXCEPTION 'same event replay %', v_result;
  END IF;

  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, provider_payment_id, event_type, processing_status, signature_verified
  ) VALUES (
    v_event2, 'tochka', 'tochka:tx:biz-sub-2', 'op-biz-1', 'acquiringInternetPayment', 'received', true
  );
  v_result := public.fulfill_tochka_payment_transactional(
    v_event2, 'op-biz-1', v_payment, 79900, 'RUB', 'APPROVED'
  );
  SELECT count(*) INTO v_count FROM public.business_subscription_periods WHERE order_id = v_order;
  SELECT paid_until INTO v_paid
  FROM public.access_paid_periods
  WHERE user_id = v_owner AND kind = 'business_new_client';
  IF v_count <> 1 OR v_paid IS DISTINCT FROM v_period_end THEN
    RAISE EXCEPTION 'second event extended access count % paid % result %', v_count, v_paid, v_result;
  END IF;

  v_result := public.ensure_author_sale_accrual(v_payment, 'smoke', NULL);
  IF v_result->>'outcome' IS DISTINCT FROM 'skipped'
     OR v_result->>'result_code' IS DISTINCT FROM 'platform_business_subscription' THEN
    RAISE EXCEPTION 'royalty queue %', v_result;
  END IF;
  SELECT id INTO v_obligation
  FROM public.finance_obligations
  WHERE obligation_type = 'payment_succeeded_accrual'
    AND subject_id = v_payment;
  IF v_obligation IS NOT NULL THEN
    v_result := public.process_finance_obligation(v_obligation);
    IF v_result->>'status' IS DISTINCT FROM 'skipped'
       OR v_result->>'result_code' IS DISTINCT FROM 'platform_business_subscription' THEN
      RAISE EXCEPTION 'obligation not skipped %', v_result;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.author_ledger_entries WHERE payment_id = v_payment
  ) THEN
    RAISE EXCEPTION 'author ledger row was written';
  END IF;

  v_hash := public.business_subscription_email_hash('cafe-owner@example.test');
  IF (
    SELECT email_hash FROM public.business_subscription_periods WHERE order_id = v_order
  ) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'email hash mismatch';
  END IF;

  -- Payment during a live gift keeps the gift end and adds 30 days after it.
  v_trial_hash := public.business_subscription_email_hash('cafe-trial-pay@example.test');
  v_trial_end := clock_timestamp() + interval '10 days';
  INSERT INTO public.access_grants (
    email_hash, user_id, kind, starts_at, ends_at, source
  ) VALUES (
    v_trial_hash, v_trial, 'business_new_client', clock_timestamp(), v_trial_end, 'trial'
  );
  PERFORM set_config('request.jwt.claim.sub', v_trial::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM * FROM public.accept_business_offer(
    'b2b-terms',
    'r8-2026-10-18',
    '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a'
  );
  SELECT o.order_id INTO v_trial_order
  FROM public.create_business_subscription_order(gen_random_uuid()) AS o;
  RESET ROLE;
  INSERT INTO public.payments (
    id, order_id, provider, idempotency_key, status, amount_minor, currency, provider_metadata
  ) VALUES (
    v_trial_payment, v_trial_order, 'tochka', 'pay-' || v_trial_payment::text, 'pending', 79900, 'RUB', '{}'::jsonb
  );
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, provider_payment_id, event_type, processing_status, signature_verified
  ) VALUES (
    v_trial_event, 'tochka', 'tochka:tx:biz-trial', 'op-biz-trial', 'acquiringInternetPayment', 'received', true
  );
  v_result := public.fulfill_tochka_payment_transactional(
    v_trial_event, 'op-biz-trial', v_trial_payment, 79900, 'RUB', 'APPROVED'
  );
  SELECT period_start, period_end INTO v_paid, v_period_end
  FROM public.business_subscription_periods WHERE order_id = v_trial_order;
  IF v_paid IS DISTINCT FROM v_trial_end
     OR v_period_end IS DISTINCT FROM v_trial_end + interval '30 days' THEN
    RAISE EXCEPTION 'trial extension start % end % gift % result %', v_paid, v_period_end, v_trial_end, v_result;
  END IF;
  IF (
    SELECT ends_at FROM public.access_grants WHERE user_id = v_trial
  ) IS DISTINCT FROM v_trial_end THEN
    RAISE EXCEPTION 'payment shortened the gift';
  END IF;

  -- A test payment must not open the cabinet clock.
  v_test_hash := public.business_subscription_email_hash('cafe-test-pay@example.test');
  PERFORM set_config('request.jwt.claim.sub', v_test::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM * FROM public.accept_business_offer(
    'b2b-terms',
    'r8-2026-10-18',
    '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a'
  );
  SELECT o.order_id INTO v_test_order
  FROM public.create_business_subscription_order(gen_random_uuid()) AS o;
  RESET ROLE;
  UPDATE public.orders SET is_test = true, test_reason = 'smoke' WHERE id = v_test_order;
  INSERT INTO public.payments (
    id, order_id, provider, idempotency_key, status, amount_minor, currency,
    provider_metadata, is_test, test_reason
  ) VALUES (
    v_test_payment, v_test_order, 'tochka', 'pay-' || v_test_payment::text, 'pending', 79900, 'RUB',
    '{}'::jsonb, true, 'smoke'
  );
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, provider_payment_id, event_type, processing_status, signature_verified
  ) VALUES (
    v_test_event, 'tochka', 'tochka:tx:biz-test', 'op-biz-test', 'acquiringInternetPayment', 'received', true
  );
  PERFORM public.fulfill_tochka_payment_transactional(
    v_test_event, 'op-biz-test', v_test_payment, 79900, 'RUB', 'APPROVED'
  );
  SELECT opens_access INTO v_opens
  FROM public.business_subscription_periods WHERE order_id = v_test_order;
  IF v_opens IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'test payment opened access';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.access_paid_periods WHERE email_hash = v_test_hash
  ) THEN
    RAISE EXCEPTION 'test payment wrote paid_until';
  END IF;

  IF public.order_sale_accrual_ready(v_order)->>'code' IS DISTINCT FROM 'platform_business_subscription' THEN
    RAISE EXCEPTION 'checkout gate would block the platform sale';
  END IF;

  RAISE NOTICE 'business_subscription_payment_smoke: ok';
END $$;

ROLLBACK;
