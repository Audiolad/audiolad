-- Executable fulfill_tochka_payment_transactional cases.
-- Scratch database only. Applies after the fulfill migration.

CREATE OR REPLACE FUNCTION public.test_seed_upgrade_checkout(
  p_order_id uuid,
  p_payment_id uuid,
  p_event_id uuid,
  p_user_id uuid,
  p_practice_id uuid,
  p_author_id uuid,
  p_target integer,
  p_amount_minor bigint,
  p_idempotency_key text,
  p_dedup_key text,
  p_provider_payment_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.orders (
    id,
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
    p_order_id,
    p_user_id,
    p_practice_id,
    'pending',
    p_amount_minor,
    'RUB',
    'Course',
    'course-fulfill',
    p_amount_minor,
    p_author_id,
    p_idempotency_key,
    'course_upgrade',
    p_target
  );

  INSERT INTO public.payments (
    id,
    order_id,
    provider,
    provider_payment_id,
    idempotency_key,
    status,
    amount_minor,
    currency,
    provider_metadata
  )
  VALUES (
    p_payment_id,
    p_order_id,
    'tochka',
    p_provider_payment_id,
    p_idempotency_key,
    'pending',
    p_amount_minor,
    'RUB',
    '{}'::jsonb
  );

  INSERT INTO public.payment_webhook_events (
    id,
    provider,
    dedup_key,
    provider_payment_id,
    event_type,
    processing_status
  )
  VALUES (
    p_event_id,
    'tochka',
    p_dedup_key,
    p_provider_payment_id,
    'incomingPayment',
    'received'
  );
END;
$$;

DO $$
DECLARE
  author uuid := 'a2222222-2222-4222-8222-222222222222';
  buyer uuid := 'b2222222-2222-4222-8222-222222222222';
  admin_buyer uuid := 'b3333333-3333-4333-8333-333333333333';
  raise_buyer uuid := 'b4444444-4444-4444-8444-444444444444';
  course_id uuid := 'd2222222-2222-4222-8222-222222222222';
  order_a uuid := 'e2222222-2222-4222-8222-222222222221';
  pay_a uuid := 'e2222222-2222-4222-8222-222222222231';
  ev_a uuid := 'e2222222-2222-4222-8222-222222222241';
  ev_a2 uuid := 'e2222222-2222-4222-8222-222222222242';
  key_a text := 'f2222222-2222-4222-8222-222222222251';
  order_c uuid := 'e2222222-2222-4222-8222-222222222223';
  pay_c uuid := 'e2222222-2222-4222-8222-222222222233';
  ev_c uuid := 'e2222222-2222-4222-8222-222222222243';
  order_d uuid := 'e2222222-2222-4222-8222-222222222224';
  pay_d uuid := 'e2222222-2222-4222-8222-222222222234';
  ev_d uuid := 'e2222222-2222-4222-8222-222222222244';
  order_e uuid := 'e2222222-2222-4222-8222-222222222225';
  pay_e uuid := 'e2222222-2222-4222-8222-222222222235';
  ev_e uuid := 'e2222222-2222-4222-8222-222222222245';
  order_f uuid := 'e2222222-2222-4222-8222-222222222226';
  pay_f uuid := 'e2222222-2222-4222-8222-222222222236';
  ev_f uuid := 'e2222222-2222-4222-8222-222222222246';
  key_f text := 'f2222222-2222-4222-8222-222222222256';
  order_g uuid := 'e2222222-2222-4222-8222-222222222227';
  pay_g uuid := 'e2222222-2222-4222-8222-222222222237';
  ev_g uuid := 'e2222222-2222-4222-8222-222222222247';
  v_result jsonb;
  v_result2 jsonb;
  v_level integer;
  v_source text;
  v_status text;
  v_order_status text;
  v_count integer;
  v_amount bigint;
  v_target integer;
  v_id uuid;
  v_enqueued boolean;
BEGIN
  INSERT INTO auth.users (id) VALUES (buyer), (admin_buyer), (raise_buyer);
  INSERT INTO public.authors (id, name) VALUES (author, 'Fulfill Author');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, price, is_free, currency, publication_class
  ) VALUES (
    course_id, author, 'Fulfill Course', 'course-fulfill', 'published', 3333, false, 'RUB', 'course'
  );

  INSERT INTO public.practice_access_levels (
    practice_id, level, title, upgrade_price, currency
  ) VALUES
    (course_id, 1, 'L1', NULL, 'RUB'),
    (course_id, 2, 'L2', 2222, 'RUB'),
    (course_id, 3, 'L3', 1500, 'RUB');

  PERFORM public.grant_practice_access(buyer, course_id, 1, 'external_manual');

  -- A. external_manual L1 → paid L2
  PERFORM public.test_seed_upgrade_checkout(
    order_a, pay_a, ev_a, buyer, course_id, author, 2, 222200,
    key_a, 'dedup-a', 'op-a'
  );

  v_result := public.fulfill_tochka_payment_transactional(
    ev_a, 'op-a', pay_a, 222200, 'RUB', 'APPROVED'
  );

  IF coalesce(v_result ->> 'ok', 'false') IS DISTINCT FROM 'true'
     OR v_result ->> 'outcome' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'A: fulfill must complete, got %', v_result;
  END IF;

  SELECT status, access_level, access_source
  INTO v_order_status, v_level, v_source
  FROM public.orders o
  JOIN public.user_practices up
    ON up.user_id = o.user_id AND up.practice_id = o.practice_id
  WHERE o.id = order_a;

  SELECT status INTO v_status FROM public.payments WHERE id = pay_a;

  IF v_status IS DISTINCT FROM 'succeeded'
     OR v_order_status IS DISTINCT FROM 'paid'
     OR v_level IS DISTINCT FROM 2
     OR v_source IS DISTINCT FROM 'external_manual' THEN
    RAISE EXCEPTION 'A: entitlement/source mismatch status=% order=% level=% source=%',
      v_status, v_order_status, v_level, v_source;
  END IF;

  IF public.canonical_sale_qualifies(order_a) IS NOT TRUE THEN
    RAISE EXCEPTION 'A: paid upgrade must be canonical';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.finance_obligations
  WHERE obligation_type = 'payment_succeeded_accrual' AND subject_id = pay_a;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'A: expected one finance obligation, got %', v_count;
  END IF;

  v_enqueued := public.enqueue_author_sale_email(order_a);
  IF v_enqueued IS NOT TRUE THEN
    RAISE EXCEPTION 'A: author sale notification must enqueue';
  END IF;

  SELECT coalesce(sum(o.amount_minor), 0) INTO v_amount
  FROM public.orders AS o
  WHERE public.canonical_sale_qualifies(o.id);

  IF v_amount IS DISTINCT FROM 222200 THEN
    RAISE EXCEPTION 'A: sales stats must be 222200, got %', v_amount;
  END IF;

  -- B. webhook replay: same event, then a new event for the same sale
  v_result2 := public.fulfill_tochka_payment_transactional(
    ev_a, 'op-a', pay_a, 222200, 'RUB', 'APPROVED'
  );

  IF v_result2 ->> 'outcome' IS DISTINCT FROM 'already_complete' THEN
    RAISE EXCEPTION 'B: same event must be already_complete, got %', v_result2;
  END IF;

  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, provider_payment_id, event_type, processing_status
  ) VALUES (
    ev_a2, 'tochka', 'dedup-a-replay', 'op-a', 'incomingPayment', 'received'
  );

  v_result2 := public.fulfill_tochka_payment_transactional(
    ev_a2, 'op-a', pay_a, 222200, 'RUB', 'APPROVED'
  );

  IF v_result2 ->> 'outcome' IS DISTINCT FROM 'already_complete' THEN
    RAISE EXCEPTION 'B: replay event must be already_complete, got %', v_result2;
  END IF;

  SELECT access_level, access_source INTO v_level, v_source
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;

  IF v_level IS DISTINCT FROM 2 OR v_source IS DISTINCT FROM 'external_manual' THEN
    RAISE EXCEPTION 'B: replay must keep L2/external_manual';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B: replay must not add a library row';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.finance_obligations
  WHERE obligation_type = 'payment_succeeded_accrual' AND subject_id = pay_a;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B: replay must not add a second obligation';
  END IF;

  v_enqueued := public.enqueue_author_sale_email(order_a);
  IF v_enqueued IS NOT TRUE THEN
    RAISE EXCEPTION 'B: replay enqueue must still succeed';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.author_sale_email_outbox
  WHERE sale_id = order_a;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B: notification must stay one row, got %', v_count;
  END IF;

  SELECT coalesce(sum(o.amount_minor), 0) INTO v_amount
  FROM public.orders AS o
  WHERE public.canonical_sale_qualifies(o.id);

  IF v_amount IS DISTINCT FROM 222200 THEN
    RAISE EXCEPTION 'B: sales stats must stay 222200, got %', v_amount;
  END IF;

  -- H. same idempotency key after completed L2 returns original L2, not L3
  PERFORM set_config('request.jwt.claim.sub', buyer::text, true);

  SELECT order_id, target_access_level, amount_minor
  INTO v_id, v_target, v_amount
  FROM public.create_course_upgrade_order(course_id, key_a::uuid, NULL);

  IF v_id IS DISTINCT FROM order_a
     OR v_target IS DISTINCT FROM 2
     OR v_amount IS DISTINCT FROM 222200 THEN
    RAISE EXCEPTION 'H: replay key must return original L2 order, got % % %',
      v_id, v_target, v_amount;
  END IF;

  -- F. NEW key after L2 creates L2→L3 at 150000 and fulfill raises to 3
  SELECT order_id, target_access_level, amount_minor
  INTO v_id, v_target, v_amount
  FROM public.create_course_upgrade_order(course_id, key_f::uuid, NULL);

  IF v_target IS DISTINCT FROM 3 OR v_amount IS DISTINCT FROM 150000 THEN
    RAISE EXCEPTION 'F: new L2→L3 request must charge 150000, got % %',
      v_target, v_amount;
  END IF;

  INSERT INTO public.payments (
    id, order_id, provider, provider_payment_id, idempotency_key,
    status, amount_minor, currency, provider_metadata
  ) VALUES (
    pay_f, v_id, 'tochka', 'op-f', key_f, 'pending', 150000, 'RUB', '{}'::jsonb
  );

  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, provider_payment_id, event_type, processing_status
  ) VALUES (
    ev_f, 'tochka', 'dedup-f', 'op-f', 'incomingPayment', 'received'
  );

  v_result := public.fulfill_tochka_payment_transactional(
    ev_f, 'op-f', pay_f, 150000, 'RUB', 'APPROVED'
  );

  IF v_result ->> 'outcome' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'F: L2→L3 fulfill must complete, got %', v_result;
  END IF;

  SELECT access_level, access_source INTO v_level, v_source
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;

  IF v_level IS DISTINCT FROM 3 OR v_source IS DISTINCT FROM 'external_manual' THEN
    RAISE EXCEPTION 'F: L3 must keep external_manual, got % %', v_level, v_source;
  END IF;

  -- C. already-at-target before callback (admin/external grant)
  PERFORM public.grant_practice_access(admin_buyer, course_id, 1, 'admin');
  PERFORM public.test_seed_upgrade_checkout(
    order_c, pay_c, ev_c, admin_buyer, course_id, author, 2, 222200,
    'f2222222-2222-4222-8222-222222222253', 'dedup-c', 'op-c'
  );

  PERFORM public.grant_practice_access(admin_buyer, course_id, 2, 'admin');

  v_result := public.fulfill_tochka_payment_transactional(
    ev_c, 'op-c', pay_c, 222200, 'RUB', 'APPROVED'
  );

  IF v_result ->> 'outcome' IS DISTINCT FROM 'completed'
     OR coalesce((v_result ->> 'was_repaired')::boolean, true) IS NOT FALSE
     OR v_result ->> 'processing_status' IS DISTINCT FROM 'processed' THEN
    RAISE EXCEPTION 'C: already-at-target must be successful sale, got %', v_result;
  END IF;

  SELECT access_level, access_source INTO v_level, v_source
  FROM public.user_practices
  WHERE user_id = admin_buyer AND practice_id = course_id;

  IF v_level IS DISTINCT FROM 2 OR v_source IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'C: must stay admin L2, got % %', v_level, v_source;
  END IF;

  IF public.canonical_sale_qualifies(order_c) IS NOT TRUE THEN
    RAISE EXCEPTION 'C: already-at-target paid upgrade must be canonical';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.finance_obligations
  WHERE obligation_type = 'payment_succeeded_accrual' AND subject_id = pay_c;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'C: finance must accrue once, got %', v_count;
  END IF;

  IF public.enqueue_author_sale_email(order_c) IS NOT TRUE THEN
    RAISE EXCEPTION 'C: author notification must enqueue';
  END IF;

  -- G. admin L1 → paid L2 is a canonical sale and does not rewrite source
  PERFORM public.grant_practice_access(raise_buyer, course_id, 1, 'admin');
  PERFORM public.test_seed_upgrade_checkout(
    order_g, pay_g, ev_g, raise_buyer, course_id, author, 2, 222200,
    'f2222222-2222-4222-8222-222222222257', 'dedup-g', 'op-g'
  );

  v_result := public.fulfill_tochka_payment_transactional(
    ev_g, 'op-g', pay_g, 222200, 'RUB', 'APPROVED'
  );

  IF v_result ->> 'outcome' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'G: admin L1→L2 must complete, got %', v_result;
  END IF;

  SELECT access_level, access_source INTO v_level, v_source
  FROM public.user_practices
  WHERE user_id = raise_buyer AND practice_id = course_id;

  IF v_level IS DISTINCT FROM 2 OR v_source IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'G: must stay admin L2, got % %', v_level, v_source;
  END IF;

  IF public.canonical_sale_qualifies(order_g) IS NOT TRUE THEN
    RAISE EXCEPTION 'G: admin origin paid upgrade must be canonical';
  END IF;

  IF public.enqueue_author_sale_email(order_g) IS NOT TRUE THEN
    RAISE EXCEPTION 'G: admin origin must notify author';
  END IF;

  -- D. amount mismatch: no grant / no paid fulfillment
  PERFORM public.test_seed_upgrade_checkout(
    order_d, pay_d, ev_d, buyer, course_id, author, 3, 150000,
    'f2222222-2222-4222-8222-222222222254', 'dedup-d', 'op-d'
  );

  UPDATE public.user_practices
  SET access_level = 2, access_source = 'external_manual'
  WHERE user_id = buyer AND practice_id = course_id;

  v_result := public.fulfill_tochka_payment_transactional(
    ev_d, 'op-d', pay_d, 149000, 'RUB', 'APPROVED'
  );

  IF v_result ->> 'outcome' IS DISTINCT FROM 'requires_review'
     OR v_result ->> 'review_reason' IS DISTINCT FROM 'amount_or_currency_mismatch' THEN
    RAISE EXCEPTION 'D: amount mismatch must require review, got %', v_result;
  END IF;

  SELECT status INTO v_order_status FROM public.orders WHERE id = order_d;
  SELECT status INTO v_status FROM public.payments WHERE id = pay_d;
  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;

  IF v_order_status IS DISTINCT FROM 'pending'
     OR v_status IS DISTINCT FROM 'pending'
     OR v_level IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'D: mismatch must not fulfill, order=% pay=% level=%',
      v_order_status, v_status, v_level;
  END IF;

  IF public.canonical_sale_qualifies(order_d) IS NOT FALSE THEN
    RAISE EXCEPTION 'D: mismatched amount must not be canonical';
  END IF;

  UPDATE public.orders
  SET status = 'failed', updated_at = now()
  WHERE id = order_d;

  -- E. currency mismatch
  PERFORM public.test_seed_upgrade_checkout(
    order_e, pay_e, ev_e, buyer, course_id, author, 3, 150000,
    'f2222222-2222-4222-8222-222222222255', 'dedup-e', 'op-e'
  );

  v_result := public.fulfill_tochka_payment_transactional(
    ev_e, 'op-e', pay_e, 150000, 'USD', 'APPROVED'
  );

  IF v_result ->> 'outcome' IS DISTINCT FROM 'requires_review'
     OR v_result ->> 'review_reason' IS DISTINCT FROM 'amount_or_currency_mismatch' THEN
    RAISE EXCEPTION 'E: currency mismatch must require review, got %', v_result;
  END IF;

  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;

  IF v_level IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'E: currency mismatch must not raise access, got %', v_level;
  END IF;

  RAISE NOTICE 'course_upgrade_fulfill_smoke: ok';
END
$$;
