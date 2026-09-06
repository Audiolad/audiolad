-- Isolated amount/currency invariant for author_canonical_sales_base.
-- Scratch database only. Runs after fulfill smoke + 20500/20600.

DO $$
DECLARE
  author uuid := 'a2222222-2222-4222-8222-222222222222';
  buyer uuid := 'b5555555-5555-4555-8555-555555555555';
  course_id uuid := 'd2222222-2222-4222-8222-222222222222';
  order_a uuid := 'e2222222-2222-4222-8222-222222222221';
  order_g uuid := 'e2222222-2222-4222-8222-222222222227';
  order_mis uuid := 'e5555555-5555-4555-8555-555555555551';
  pay_mis uuid := 'e5555555-5555-4555-8555-555555555561';
  order_cur uuid := 'e5555555-5555-4555-8555-555555555552';
  pay_cur uuid := 'e5555555-5555-4555-8555-555555555562';
  order_ok uuid := 'e5555555-5555-4555-8555-555555555553';
  pay_ok uuid := 'e5555555-5555-4555-8555-555555555563';
  order_ref uuid := 'e5555555-5555-4555-8555-555555555554';
  pay_ref uuid := 'e5555555-5555-4555-8555-555555555564';
  v_count integer;
  v_amount integer;
  v_status text;
BEGIN
  INSERT INTO auth.users (id) VALUES (buyer);

  -- Existing fulfilled upgrades from course_upgrade_fulfill_smoke must remain
  -- visible once, independent of entitlement origin.
  SELECT count(*), max(amount_minor)
  INTO v_count, v_amount
  FROM public.author_canonical_sales_base(author, false, false) AS s
  WHERE s.sale_id = order_a;

  IF v_count <> 1 OR v_amount IS DISTINCT FROM 222200 THEN
    RAISE EXCEPTION 'projection: external_manual L2 sale missing, count=% amount=%',
      v_count, v_amount;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.author_canonical_sales_base(author, false, false) AS s
  WHERE s.sale_id = order_g;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'projection: admin L2 sale missing, count=%', v_count;
  END IF;

  -- A. succeeded payment with wrong amount is not a canonical sale
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    author_id_snapshot, paid_at, order_kind, target_access_level
  ) VALUES (
    order_mis, buyer, course_id, 'paid', 222200, 'RUB',
    'Course', 'course-fulfill', 222200, author, now(), 'course_upgrade', 2
  );

  INSERT INTO public.payments (
    id, order_id, provider, idempotency_key, status,
    amount_minor, currency, confirmed_at
  ) VALUES (
    pay_mis, order_mis, 'tochka', 'proj-mis', 'succeeded',
    1, 'RUB', now()
  );

  IF public.canonical_sale_qualifies(order_mis) IS NOT FALSE THEN
    RAISE EXCEPTION 'A: amount mismatch must not qualify';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.author_canonical_sales_base(author, false, false) AS s
  WHERE s.sale_id = order_mis;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'A: amount mismatch must be absent from author projection';
  END IF;

  -- B. succeeded payment with currency mismatch is not a canonical sale
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    author_id_snapshot, paid_at, order_kind, target_access_level
  ) VALUES (
    order_cur, buyer, course_id, 'paid', 222200, 'RUB',
    'Course', 'course-fulfill', 222200, author, now(), 'course_upgrade', 2
  );

  INSERT INTO public.payments (
    id, order_id, provider, idempotency_key, status,
    amount_minor, currency, confirmed_at
  ) VALUES (
    pay_cur, order_cur, 'tochka', 'proj-cur', 'succeeded',
    222200, 'USD', now()
  );

  IF public.canonical_sale_qualifies(order_cur) IS NOT FALSE THEN
    RAISE EXCEPTION 'B: currency mismatch must not qualify';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.author_canonical_sales_base(author, false, false) AS s
  WHERE s.sale_id = order_cur;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'B: currency mismatch must be absent from author projection';
  END IF;

  -- C. matching amount/currency appears once at 222200
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    author_id_snapshot, paid_at, order_kind, target_access_level
  ) VALUES (
    order_ok, buyer, course_id, 'paid', 222200, 'RUB',
    'Course', 'course-fulfill', 222200, author, now(), 'course_upgrade', 2
  );

  INSERT INTO public.payments (
    id, order_id, provider, idempotency_key, status,
    amount_minor, currency, confirmed_at
  ) VALUES (
    pay_ok, order_ok, 'tochka', 'proj-ok', 'succeeded',
    222200, 'RUB', now()
  );

  IF public.canonical_sale_qualifies(order_ok) IS NOT TRUE THEN
    RAISE EXCEPTION 'C: matching payment must qualify';
  END IF;

  SELECT count(*), max(amount_minor)
  INTO v_count, v_amount
  FROM public.author_canonical_sales_base(author, false, false) AS s
  WHERE s.sale_id = order_ok;

  IF v_count <> 1 OR v_amount IS DISTINCT FROM 222200 THEN
    RAISE EXCEPTION 'C: matching sale must appear once at 222200, count=% amount=%',
      v_count, v_amount;
  END IF;

  -- Replay of the same matching sale does not duplicate the projection row
  SELECT count(*) INTO v_count
  FROM public.author_canonical_sales_base(author, false, false) AS s
  WHERE s.sale_id = order_ok;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'replay: matching sale must stay one projection row';
  END IF;

  -- Refunded canonical sales still shown
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    author_id_snapshot, paid_at, order_kind, target_access_level
  ) VALUES (
    order_ref, buyer, course_id, 'refunded', 222200, 'RUB',
    'Course', 'course-fulfill', 222200, author, now(), 'course_upgrade', 2
  );

  INSERT INTO public.payments (
    id, order_id, provider, idempotency_key, status,
    amount_minor, currency, confirmed_at
  ) VALUES (
    pay_ref, order_ref, 'tochka', 'proj-ref', 'succeeded',
    222200, 'RUB', now()
  );

  IF public.canonical_sale_qualifies(order_ref) IS NOT TRUE THEN
    RAISE EXCEPTION 'refund: matching refunded upgrade must qualify';
  END IF;

  SELECT count(*), max(order_status)
  INTO v_count, v_status
  FROM public.author_canonical_sales_base(author, false, false) AS s
  WHERE s.sale_id = order_ref;

  IF v_count <> 1 OR v_status IS DISTINCT FROM 'refunded' THEN
    RAISE EXCEPTION 'refund: refunded sale must remain in projection, count=% status=%',
      v_count, v_status;
  END IF;

  RAISE NOTICE 'course_upgrade_canonical_projection_smoke: ok';
END
$$;
