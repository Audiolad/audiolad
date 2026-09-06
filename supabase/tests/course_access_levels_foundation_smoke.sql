-- Isolated smoke for course access levels + monotonic grants.
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  buyer uuid := '11111111-1111-4111-8111-111111111111';
  other uuid := '22222222-2222-4222-8222-222222222222';
  author uuid := '33333333-3333-4333-8333-333333333333';
  legacy_practice uuid := 'c1111111-1111-4111-8111-111111111111';
  course_id uuid := 'c2222222-2222-4222-8222-222222222222';
  course_legacy uuid := 'c3333333-3333-4333-8333-333333333333';
  lesson_id uuid := 'd1111111-1111-4111-8111-111111111111';
  order_id uuid := 'e1111111-1111-4111-8111-111111111111';
  v_level integer;
  v_count integer;
  v_result jsonb;
  v_raised boolean;
  v_detail text;
  v_sqlstate text;
BEGIN
  -- -------------------------------------------------------------------------
  -- Migration defaults: pre-existing rows become Level 1 without backfill
  -- -------------------------------------------------------------------------
  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = legacy_practice;
  IF v_level IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'existing user_practices must default to access_level=1, got %', v_level;
  END IF;

  SELECT required_access_level INTO v_level
  FROM public.course_lessons
  WHERE id = lesson_id;
  IF v_level IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'existing course_lessons must default to required_access_level=1, got %', v_level;
  END IF;

  SELECT count(*) INTO v_count FROM public.practice_access_levels;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'migration must not mass-insert Level 1 catalog rows, got %', v_count;
  END IF;

  -- -------------------------------------------------------------------------
  -- CHECK: reject level 0 / negative on new columns and catalog
  -- -------------------------------------------------------------------------
  v_raised := false;
  BEGIN
    INSERT INTO public.user_practices (user_id, practice_id, access_source, access_level)
    VALUES (other, legacy_practice, 'admin', 0);
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'user_practices.access_level=0 must fail';
  END IF;

  v_raised := false;
  BEGIN
    UPDATE public.course_lessons SET required_access_level = 0 WHERE id = lesson_id;
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'course_lessons.required_access_level=0 must fail';
  END IF;

  v_raised := false;
  BEGIN
    INSERT INTO public.practice_access_levels (practice_id, level, title)
    VALUES (course_id, 0, 'Invalid');
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'practice_access_levels.level=0 must fail';
  END IF;

  v_raised := false;
  BEGIN
    INSERT INTO public.practice_access_levels (
      practice_id, level, title, upgrade_price
    ) VALUES (course_id, 2, 'L2', -1);
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'negative upgrade_price must fail';
  END IF;

  -- -------------------------------------------------------------------------
  -- Legacy product without catalog: L1 works, L2+ rejected
  -- -------------------------------------------------------------------------
  v_result := public.grant_practice_access(other, legacy_practice, 1, 'admin');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 1
     OR (v_result ->> 'inserted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'legacy none→1 failed: %', v_result;
  END IF;

  v_raised := false;
  v_detail := NULL;
  BEGIN
    PERFORM public.grant_practice_access(other, legacy_practice, 2, 'admin');
  EXCEPTION WHEN others THEN
    v_raised := true;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_sqlstate = RETURNED_SQLSTATE;
  END;
  IF NOT v_raised OR v_detail IS DISTINCT FROM 'course_only' THEN
    RAISE EXCEPTION 'L2 on legacy non-course must be course_only, got detail=% sqlstate=%', v_detail, v_sqlstate;
  END IF;

  -- Course without catalog: L1 ok, L2 rejected as legacy_level_1_only
  v_result := public.grant_practice_access(other, course_legacy, 1, 'free_claim');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'course without catalog none→1 failed: %', v_result;
  END IF;

  v_raised := false;
  v_detail := NULL;
  BEGIN
    PERFORM public.grant_practice_access(other, course_legacy, 2, 'admin');
  EXCEPTION WHEN others THEN
    v_raised := true;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  IF NOT v_raised OR v_detail IS DISTINCT FROM 'legacy_level_1_only' THEN
    RAISE EXCEPTION 'L2 on course without catalog must be legacy_level_1_only, got %', v_detail;
  END IF;

  -- -------------------------------------------------------------------------
  -- Configure L2 only (no L1 catalog row). Higher includes lower conceptually.
  -- -------------------------------------------------------------------------
  INSERT INTO public.practice_access_levels (practice_id, level, title, upgrade_price)
  VALUES (course_id, 2, 'Полный доступ', 1500);

  v_result := public.grant_practice_access(buyer, course_id, 2, 'admin');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 2
     OR (v_result ->> 'inserted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'none→2 for course with L2 failed: %', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'none→2 must create exactly one entitlement row, got %', v_count;
  END IF;

  -- 2→1 no downgrade
  v_result := public.grant_practice_access(buyer, course_id, 1, 'purchase');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 2
     OR (v_result ->> 'raised')::boolean IS NOT FALSE
     OR (v_result ->> 'inserted')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION '2→1 must keep 2: %', v_result;
  END IF;

  -- 2→2 idempotent, still one row
  v_result := public.grant_practice_access(buyer, course_id, 2, 'admin');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 2
     OR (v_result ->> 'inserted')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION '2→2 must be idempotent: %', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'repeat grant must not duplicate rows, got %', v_count;
  END IF;

  -- Trusted service_role/admin UPDATE may lower (no table-wide trigger).
  -- grantAccess(..., 1) on L2 must still keep 2.
  UPDATE public.user_practices
  SET access_level = 1
  WHERE user_id = buyer AND practice_id = course_id;
  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;
  IF v_level IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'trusted UPDATE 2→1 must be possible, got %', v_level;
  END IF;

  v_result := public.grant_practice_access(buyer, course_id, 2, 'admin');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 're-grant L2 after trusted lower failed: %', v_result;
  END IF;
  v_result := public.grant_practice_access(buyer, course_id, 1, 'purchase');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'grantAccess L1 on L2 must keep 2, got %', v_result;
  END IF;

  -- 1→2 raise for a fresh user
  v_result := public.grant_practice_access(other, course_id, 1, 'purchase');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'other none→1 failed: %', v_result;
  END IF;
  v_result := public.grant_practice_access(other, course_id, 2, 'admin');
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 2
     OR (v_result ->> 'raised')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '1→2 raise failed: %', v_result;
  END IF;

  -- Invalid / nonexistent level
  v_raised := false;
  v_detail := NULL;
  BEGIN
    PERFORM public.grant_practice_access(other, course_id, 3, 'admin');
  EXCEPTION WHEN others THEN
    v_raised := true;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  IF NOT v_raised OR v_detail IS DISTINCT FROM 'level_not_in_catalog' THEN
    RAISE EXCEPTION 'nonexistent L3 must be rejected, got %', v_detail;
  END IF;

  v_raised := false;
  v_detail := NULL;
  BEGIN
    PERFORM public.grant_practice_access(other, course_id, 0, 'admin');
  EXCEPTION WHEN others THEN
    v_raised := true;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  IF NOT v_raised OR v_detail IS DISTINCT FROM 'level_must_be_gte_1' THEN
    RAISE EXCEPTION 'grant level 0 must be rejected, got %', v_detail;
  END IF;

  v_raised := false;
  v_detail := NULL;
  BEGIN
    PERFORM public.grant_practice_access(other, course_id, -2, 'admin');
  EXCEPTION WHEN others THEN
    v_raised := true;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  IF NOT v_raised OR v_detail IS DISTINCT FROM 'level_must_be_gte_1' THEN
    RAISE EXCEPTION 'grant negative level must be rejected, got %', v_detail;
  END IF;

  -- Duplicate catalog row
  v_raised := false;
  BEGIN
    INSERT INTO public.practice_access_levels (practice_id, level, title)
    VALUES (course_id, 2, 'Duplicate');
  EXCEPTION WHEN unique_violation THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'duplicate (practice_id, level) must fail';
  END IF;

  -- -------------------------------------------------------------------------
  -- Native purchase path still grants L1 and does not duplicate / downgrade
  -- -------------------------------------------------------------------------
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, paid_at
  ) VALUES (
    order_id, buyer, legacy_practice, 'paid', 29900, now()
  );

  v_result := public.grant_practice_purchase_access(order_id);
  IF (v_result ->> 'inserted')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'purchase wrapper on existing L1 row must be idempotent: %', v_result;
  END IF;
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'purchase wrapper must report access_level=1, got %', v_result;
  END IF;

  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = legacy_practice;
  IF v_level IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'native purchase path must keep L1, got %', v_level;
  END IF;

  -- Purchase on a new user/practice (course_legacy, other already has L1 —
  -- use author as buyer of legacy course via a second order)
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, paid_at
  ) VALUES (
    'e2222222-2222-4222-8222-222222222222',
    author,
    course_legacy,
    'paid',
    49000,
    now()
  );

  v_result := public.grant_practice_purchase_access(
    'e2222222-2222-4222-8222-222222222222'
  );
  IF (v_result ->> 'inserted')::boolean IS NOT TRUE
     OR (v_result ->> 'access_level')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'native purchase none→L1 failed: %', v_result;
  END IF;

  -- Purchase after L2 must keep 2
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, paid_at
  ) VALUES (
    'e3333333-3333-4333-8333-333333333333',
    buyer,
    course_id,
    'paid',
    99000,
    now()
  );
  v_result := public.grant_practice_purchase_access(
    'e3333333-3333-4333-8333-333333333333'
  );
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'purchase wrapper must not downgrade L2: %', v_result;
  END IF;

  -- Unpaid order is still rejected
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor
  ) VALUES (
    'e4444444-4444-4444-8444-444444444444',
    other,
    legacy_practice,
    'pending',
    29900
  );
  v_raised := false;
  BEGIN
    PERFORM public.grant_practice_purchase_access(
      'e4444444-4444-4444-8444-444444444444'
    );
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'unpaid order must not grant access';
  END IF;

  -- -------------------------------------------------------------------------
  -- RLS / privileges: client cannot raise entitlement
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', buyer::text, false);
  EXECUTE 'SET ROLE authenticated';

  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;
  IF v_level IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'buyer must be able to read own access_level, got %', v_level;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_practices
  WHERE user_id = other;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'buyer must not read another user entitlement';
  END IF;

  v_raised := false;
  BEGIN
    UPDATE public.user_practices SET access_level = 1 WHERE user_id = buyer;
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'authenticated UPDATE L2→L1 must fail';
  END IF;

  v_raised := false;
  BEGIN
    INSERT INTO public.user_practices (user_id, practice_id, access_source, access_level)
    VALUES (buyer, course_legacy, 'admin', 2);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'authenticated INSERT user_practices must fail';
  END IF;

  v_raised := false;
  BEGIN
    PERFORM public.grant_practice_access(buyer, course_id, 2, 'admin');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE grant_practice_access';
  END IF;

  v_raised := false;
  BEGIN
    PERFORM public.grant_practice_purchase_access(order_id);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE grant_practice_purchase_access';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', author::text, false);
  EXECUTE 'SET ROLE authenticated';

  v_raised := false;
  BEGIN
    INSERT INTO public.practice_access_levels (practice_id, level, title)
    VALUES (course_id, 3, 'Author forged L3');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'author must not INSERT practice_access_levels';
  END IF;

  v_raised := false;
  BEGIN
    PERFORM public.grant_practice_access(buyer, course_id, 2, 'admin');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'author must not client-side grant paid levels';
  END IF;

  RESET ROLE;

  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;
  IF v_level IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'entitlement must still be 2 after RLS probes, got %', v_level;
  END IF;

  -- -----------------------------------------------------------------------
  -- access_source: existing values + external_manual; no upgrade source
  -- -----------------------------------------------------------------------
  INSERT INTO auth.users (id) VALUES ('66666666-6666-4666-8666-666666666666');

  FOREACH v_detail IN ARRAY ARRAY[
    'starter',
    'free_claim',
    'purchase',
    'gift',
    'subscription',
    'program',
    'admin',
    'external_manual'
  ]
  LOOP
    INSERT INTO public.user_practices (
      user_id, practice_id, access_source
    ) VALUES (
      '66666666-6666-4666-8666-666666666666',
      legacy_practice,
      v_detail
    );
    DELETE FROM public.user_practices
    WHERE user_id = '66666666-6666-4666-8666-666666666666';
  END LOOP;

  v_raised := false;
  BEGIN
    INSERT INTO public.user_practices (user_id, practice_id, access_source)
    VALUES (
      '66666666-6666-4666-8666-666666666666',
      legacy_practice,
      'upgrade'
    );
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'access_source=upgrade must be rejected';
  END IF;

  v_result := public.grant_practice_access(
    '66666666-6666-4666-8666-666666666666',
    course_id,
    2,
    'external_manual'
  );
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 2
     OR (v_result ->> 'inserted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'external_manual none→2 failed: %', v_result;
  END IF;

  SELECT access_source INTO v_detail
  FROM public.user_practices
  WHERE user_id = '66666666-6666-4666-8666-666666666666'
    AND practice_id = course_id;
  IF v_detail IS DISTINCT FROM 'external_manual' THEN
    RAISE EXCEPTION 'external_manual source not stored, got %', v_detail;
  END IF;

  v_result := public.grant_practice_access(
    '66666666-6666-4666-8666-666666666666',
    course_legacy,
    1,
    'gift'
  );
  IF (v_result ->> 'access_level')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'legacy gift grant failed: %', v_result;
  END IF;

  v_raised := false;
  v_detail := NULL;
  BEGIN
    PERFORM public.grant_practice_access(
      '66666666-6666-4666-8666-666666666666',
      course_legacy,
      1,
      'upgrade'
    );
  EXCEPTION WHEN others THEN
    v_raised := true;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  IF NOT v_raised OR v_detail IS DISTINCT FROM 'invalid_access_source' THEN
    RAISE EXCEPTION 'grant upgrade source must be rejected, got %', v_detail;
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.grant_practice_access(uuid, uuid, integer, text, jsonb)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'service_role must EXECUTE grant_practice_access';
  END IF;
  IF has_function_privilege(
    'service_role',
    'public.grant_practice_purchase_access(uuid)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'service_role must EXECUTE grant_practice_purchase_access';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.grant_practice_purchase_access(uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE grant_practice_purchase_access';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.grant_practice_purchase_access(uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'anon must not EXECUTE grant_practice_purchase_access';
  END IF;

  RAISE NOTICE 'course-access-levels-foundation smoke passed';
END;
$$;
