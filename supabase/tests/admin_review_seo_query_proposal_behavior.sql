-- Behavior tests A–J for admin_review_seo_query_proposal. Never run on production.

DO $$
DECLARE
  a1 uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  a2 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  u1 uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  q_pending uuid := '22222222-2222-4222-8222-222222222201';
  q_reject uuid := '22222222-2222-4222-8222-222222222202';
  q_idem uuid := '22222222-2222-4222-8222-222222222203';
  q_recon uuid := '22222222-2222-4222-8222-222222222204';
  q_limit uuid := '22222222-2222-4222-8222-222222222205';
  q_other uuid := '22222222-2222-4222-8222-222222222206';
  q_analyzed_reject uuid := '22222222-2222-4222-8222-222222222207';
  q_expire uuid := '22222222-2222-4222-8222-222222222208';
  q_filler uuid := '22222222-2222-4222-8222-222222222209';
  prop_pending uuid := '33333333-3333-4333-8333-333333333301';
  prop_reject uuid := '33333333-3333-4333-8333-333333333302';
  prop_idem uuid := '33333333-3333-4333-8333-333333333303';
  prop_recon uuid := '33333333-3333-4333-8333-333333333304';
  prop_limit uuid := '33333333-3333-4333-8333-333333333305';
  prop_other uuid := '33333333-3333-4333-8333-333333333306';
  prop_analyzed_reject uuid := '33333333-3333-4333-8333-333333333307';
  prop_expire uuid := '33333333-3333-4333-8333-333333333308';
  r jsonb;
  v_status text;
  v_res uuid;
  v_expires timestamptz;
  v_count integer;
  v_err text;
  v_grant boolean;
  i integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u1, 'author@example.com');
  INSERT INTO public.authors (id, name, slug) VALUES
    (a1, 'Author One', 'author-one'),
    (a2, 'Author Two', 'author-two');

  INSERT INTO public.seo_queries (id, query_text, normalized_query, source, frequency, analysis_status)
  VALUES
    (q_pending, 'музыка для спа', 'placeholder', 'wordstat', 120, 'not_analyzed'),
    (q_reject, 'купить диван', 'placeholder', 'wordstat', 50, 'not_analyzed'),
    (q_idem, 'медитация утром', 'placeholder', 'wordstat', 80, 'not_analyzed'),
    (q_recon, 'практика дыхания', 'placeholder', 'wordstat', 40, 'analyzed'),
    (q_limit, 'йога нидра', 'placeholder', 'wordstat', 30, 'not_analyzed'),
    (q_other, 'занятый запрос', 'placeholder', 'wordstat', 10, 'not_analyzed'),
    (q_analyzed_reject, 'уже одобрен', 'placeholder', 'wordstat', 5, 'analyzed'),
    (q_expire, 'после истечения', 'placeholder', 'wordstat', 15, 'not_analyzed'),
    (q_filler, 'filler base', 'placeholder', 'manual', 1, 'analyzed');

  INSERT INTO public.seo_query_proposals (id, query_id, author_id, submitted_by_user_id)
  VALUES
    (prop_pending, q_pending, a1, u1),
    (prop_reject, q_reject, a1, u1),
    (prop_idem, q_idem, a1, u1),
    (prop_recon, q_recon, a1, u1),
    (prop_limit, q_limit, a1, u1),
    (prop_other, q_other, a1, u1),
    (prop_analyzed_reject, q_analyzed_reject, a1, u1),
    (prop_expire, q_expire, a1, u1);

  -- A: approve pending → analyzed + active 7d reservation
  r := public.admin_review_seo_query_proposal(prop_pending, 'analyzed', 'music', 'Музыка', 'high');
  ASSERT r->>'decision' = 'analyzed', 'A decision';
  ASSERT r->>'analysis_status' = 'analyzed', 'A analysis';
  ASSERT r->>'reservation_id' IS NOT NULL, 'A reservation';
  ASSERT (r->>'idempotent')::boolean = false, 'A not idempotent';
  ASSERT (r->>'reconciled')::boolean = false, 'A not reconcile';
  SELECT analysis_status INTO v_status FROM public.seo_queries WHERE id = q_pending;
  ASSERT v_status = 'analyzed', 'A query status';
  SELECT id, expires_at INTO v_res, v_expires
  FROM public.seo_query_reservations
  WHERE query_id = q_pending AND status = 'active' AND author_id = a1;
  ASSERT v_res IS NOT NULL, 'A res row';
  ASSERT v_expires > now() + interval '6 days', 'A expires ~7d';
  ASSERT v_expires < now() + interval '8 days', 'A expires upper';
  RAISE NOTICE 'A PASS approve pending';

  -- B: reject → not_applicable, no reservation
  r := public.admin_review_seo_query_proposal(prop_reject, 'not_applicable', 'transactional', NULL, 'none');
  ASSERT r->>'decision' = 'not_applicable', 'B decision';
  ASSERT r->>'analysis_status' = 'not_applicable', 'B analysis';
  ASSERT r->>'reservation_id' IS NULL, 'B no reservation';
  SELECT count(*) INTO v_count FROM public.seo_query_reservations WHERE query_id = q_reject;
  ASSERT v_count = 0, 'B zero reservations';
  RAISE NOTICE 'B PASS reject';

  -- B2: reject idempotent
  r := public.admin_review_seo_query_proposal(prop_reject, 'not_applicable', NULL, NULL, NULL);
  ASSERT (r->>'idempotent')::boolean = true, 'B2 idempotent';
  RAISE NOTICE 'B2 PASS reject idempotent';

  -- C: approve then idempotent re-approve with existing reservation
  r := public.admin_review_seo_query_proposal(prop_idem, 'analyzed', 'practice', 'Медитация', 'high');
  ASSERT r->>'reservation_id' IS NOT NULL, 'C first reserve';
  r := public.admin_review_seo_query_proposal(prop_idem, 'analyzed', 'practice', 'Медитация', 'high');
  ASSERT (r->>'idempotent')::boolean = true, 'C idempotent';
  ASSERT r->>'reservation_id' IS NOT NULL, 'C still reserved';
  SELECT count(*) INTO v_count FROM public.seo_query_reservations WHERE query_id = q_idem AND status = 'active';
  ASSERT v_count = 1, 'C single active';
  RAISE NOTICE 'C PASS approve idempotent';

  -- D: reconcile analyzed + proposal + no reservation
  r := public.admin_review_seo_query_proposal(prop_recon, 'analyzed', 'practice', 'Практика', 'high');
  ASSERT (r->>'reconciled')::boolean = true, 'D reconciled';
  ASSERT r->>'analysis_status' = 'analyzed', 'D stays analyzed';
  ASSERT r->>'reservation_id' IS NOT NULL, 'D reserved';
  SELECT count(*) INTO v_count FROM public.seo_query_reservations WHERE query_id = q_recon AND status = 'active' AND author_id = a1;
  ASSERT v_count = 1, 'D one active';
  RAISE NOTICE 'D PASS reconcile';

  -- E: reservation limit (author already has 5 active: pending, idem, recon + 2 fillers)
  -- Currently a1 has: q_pending, q_idem, q_recon = 3. Add 2 more fillers to hit 5, then limit on prop_limit.
  FOR i IN 1..2 LOOP
    INSERT INTO public.seo_queries (id, query_text, normalized_query, source, frequency, analysis_status)
    VALUES (
      ('22222222-2222-4222-8222-22222222221' || i::text)::uuid,
      'filler limit ' || i::text,
      'placeholder',
      'manual',
      1,
      'analyzed'
    );
    INSERT INTO public.seo_query_reservations (query_id, author_id, product_id, reserved_at, expires_at, status)
    VALUES (
      ('22222222-2222-4222-8222-22222222221' || i::text)::uuid,
      a1,
      NULL,
      now(),
      now() + interval '7 days',
      'active'
    );
  END LOOP;
  SELECT count(*) INTO v_count FROM public.seo_query_reservations WHERE author_id = a1 AND status = 'active';
  ASSERT v_count = 5, 'E setup five active';
  BEGIN
    PERFORM public.admin_review_seo_query_proposal(prop_limit, 'analyzed', 'practice', 'Практика', 'high');
    RAISE EXCEPTION 'E expected limit error';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err NOT LIKE '%seo_reservation_limit_reached%' THEN
        RAISE;
      END IF;
  END;
  SELECT analysis_status INTO v_status FROM public.seo_queries WHERE id = q_limit;
  ASSERT v_status = 'not_analyzed', 'E query unchanged';
  RAISE NOTICE 'E PASS reservation limit';

  -- F: query already reserved by other author
  INSERT INTO public.seo_query_reservations (query_id, author_id, product_id, reserved_at, expires_at, status)
  VALUES (q_other, a2, NULL, now(), now() + interval '7 days', 'active');
  BEGIN
    PERFORM public.admin_review_seo_query_proposal(prop_other, 'analyzed', 'music', 'Музыка', 'high');
    RAISE EXCEPTION 'F expected conflict';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err NOT LIKE '%seo_query_already_reserved%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'F PASS other author reserved';

  -- G: reject when already analyzed → conflict
  BEGIN
    PERFORM public.admin_review_seo_query_proposal(prop_analyzed_reject, 'not_applicable', NULL, NULL, NULL);
    RAISE EXCEPTION 'G expected already analyzed';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err NOT LIKE '%seo_proposal_already_analyzed%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'G PASS reject on analyzed';

  -- H: invalid decision
  BEGIN
    PERFORM public.admin_review_seo_query_proposal(prop_limit, 'maybe', NULL, NULL, NULL);
    RAISE EXCEPTION 'H expected invalid decision';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err NOT LIKE '%seo_proposal_decision_invalid%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'H PASS invalid decision';

  -- I: grants — service_role has execute; authenticated revoked
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'admin_review_seo_query_proposal'
      AND grantee = 'service_role'
      AND privilege_type = 'EXECUTE'
  ) INTO v_grant;
  ASSERT v_grant, 'I service_role execute';
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'admin_review_seo_query_proposal'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) INTO v_grant;
  ASSERT NOT v_grant, 'I authenticated revoked';
  RAISE NOTICE 'I PASS grants';

  -- J: expire stale reservation then approve
  -- Free one slot for a1 by releasing a filler, then expire a stale one for q_expire path.
  -- First free limit: release one filler so a1 has capacity.
  UPDATE public.seo_query_reservations
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE query_id = '22222222-2222-4222-8222-222222222211'::uuid;

  INSERT INTO public.seo_query_reservations (query_id, author_id, product_id, reserved_at, expires_at, status)
  VALUES (q_expire, a1, NULL, now() - interval '8 days', now() - interval '1 day', 'active');
  -- Fix reserved_at < expires_at constraint: reserved_at must be before expires_at.
  -- The insert above may fail expiry_check if reserved_at > expires_at is false... 
  -- expires_at > reserved_at: now()-1d > now()-8d = true. OK.

  r := public.admin_review_seo_query_proposal(prop_expire, 'analyzed', 'practice', 'Практика', 'medium');
  ASSERT r->>'reservation_id' IS NOT NULL, 'J reserved after expire';
  ASSERT (r->>'idempotent')::boolean = false, 'J fresh';
  SELECT count(*) INTO v_count
  FROM public.seo_query_reservations
  WHERE query_id = q_expire AND status = 'active';
  ASSERT v_count = 1, 'J one active after expire';
  SELECT count(*) INTO v_count
  FROM public.seo_query_reservations
  WHERE query_id = q_expire AND status = 'released';
  ASSERT v_count = 1, 'J old released';
  RAISE NOTICE 'J PASS expire then approve';

  RAISE NOTICE 'admin_review_seo_query_proposal_behavior: ALL PASS';
END;
$$;
