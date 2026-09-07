-- Isolated Phase 4 course-upgrade checkout smoke.
-- Scratch database only.

DO $$
DECLARE
  author uuid := 'a1111111-1111-4111-8111-111111111111';
  buyer uuid := 'b1111111-1111-4111-8111-111111111111';
  other uuid := 'c1111111-1111-4111-8111-111111111111';
  course_id uuid := 'd1111111-1111-4111-8111-111111111111';
  plain_practice_id uuid := 'e1111111-1111-4111-8111-111111111111';
  key1 uuid := 'f1111111-1111-4111-8111-111111111111';
  key2 uuid := 'f2222222-2222-4222-8222-222222222222';
  key3 uuid := 'f3333333-3333-4333-8333-333333333333';
  key4 uuid := 'f4444444-4444-4444-8444-444444444444';
  v_id uuid;
  v_id2 uuid;
  v_amount bigint;
  v_target integer;
  v_kind text;
  v_currency text;
  v_grant jsonb;
  v_count integer;
  v_source text;
  v_author uuid;
  v_price_snap bigint;
BEGIN
  INSERT INTO auth.users (id) VALUES (buyer), (other);
  INSERT INTO public.authors (id, name) VALUES (author, 'Author');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, price, is_free, currency, publication_class
  ) VALUES
    (course_id, author, 'Course', 'course-upgrade', 'published', 3333, false, 'RUB', 'course'),
    (plain_practice_id, author, 'Practice', 'plain-practice', 'published', 3333, false, 'RUB', 'practice');

  INSERT INTO public.practice_access_levels (
    practice_id, level, title, upgrade_price, currency
  ) VALUES
    (course_id, 1, 'L1', NULL, 'RUB'),
    (course_id, 2, 'L2', 2222, 'RUB'),
    (course_id, 3, 'L3', 1500, 'RUB');

  PERFORM public.grant_practice_access(buyer, course_id, 1, 'purchase');

  PERFORM set_config('request.jwt.claim.sub', buyer::text, true);

  SELECT order_id, amount_minor, target_access_level, order_kind, currency
  INTO v_id, v_amount, v_target, v_kind, v_currency
  FROM public.create_course_upgrade_order(course_id, key1, NULL);

  SELECT author_id_snapshot, price_minor_snapshot
  INTO v_author, v_price_snap
  FROM public.orders
  WHERE id = v_id;

  IF v_kind IS DISTINCT FROM 'course_upgrade'
     OR v_target IS DISTINCT FROM 2
     OR v_amount IS DISTINCT FROM 222200
     OR v_price_snap IS DISTINCT FROM 222200
     OR v_currency IS DISTINCT FROM 'RUB'
     OR v_author IS DISTINCT FROM author THEN
    RAISE EXCEPTION 'B: upgrade order snapshot mismatch';
  END IF;

  SELECT order_id INTO v_id2
  FROM public.create_course_upgrade_order(course_id, key1, 2);

  IF v_id2 IS DISTINCT FROM v_id THEN
    RAISE EXCEPTION 'C: idempotency must reuse';
  END IF;

  SELECT order_id INTO v_id2
  FROM public.create_course_upgrade_order(course_id, key2, NULL);

  IF v_id2 IS DISTINCT FROM v_id THEN
    RAISE EXCEPTION 'C: pending reuse must not create a second live charge';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.orders AS o
  WHERE o.user_id = buyer AND o.practice_id = course_id AND o.status = 'pending';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'C: expected one pending upgrade, got %', v_count;
  END IF;

  BEGIN
    PERFORM public.create_course_upgrade_order(course_id, key3, 3);
    RAISE EXCEPTION 'E: L1 to L3 must fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%invalid_target_access_level%' THEN
        RAISE EXCEPTION 'E: expected invalid_target_access_level, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.create_course_upgrade_order(plain_practice_id, key3, NULL);
    RAISE EXCEPTION 'E: non-course must fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not_course%' THEN
        RAISE EXCEPTION 'E: expected not_course, got %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', other::text, true);
  BEGIN
    PERFORM public.create_course_upgrade_order(course_id, key3, NULL);
    RAISE EXCEPTION 'E: missing entitlement must fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not_entitled%' THEN
        RAISE EXCEPTION 'E: expected not_entitled, got %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', buyer::text, true);

  BEGIN
    DELETE FROM public.practice_access_levels
    WHERE practice_id = course_id AND level = 2;
    RAISE EXCEPTION 'J: delete of live upgrade level must fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%level_has_live_upgrade_orders%' THEN
        RAISE EXCEPTION 'J: expected level_has_live_upgrade_orders, got %', SQLERRM;
      END IF;
  END;

  UPDATE public.orders
  SET status = 'failed', updated_at = now()
  WHERE id = v_id;

  UPDATE public.practice_access_levels
  SET upgrade_price = 1800
  WHERE practice_id = course_id AND level = 2;

  SELECT order_id, amount_minor INTO v_id2, v_amount
  FROM public.create_course_upgrade_order(course_id, key3, NULL);

  IF v_id2 = v_id OR v_amount IS DISTINCT FROM 180000 THEN
    RAISE EXCEPTION 'J: retry after failed must use new price 180000, got %', v_amount;
  END IF;

  UPDATE public.orders
  SET status = 'failed', updated_at = now()
  WHERE id = v_id2;

  UPDATE public.practice_access_levels
  SET upgrade_price = 2222
  WHERE practice_id = course_id AND level = 2;

  v_grant := public.grant_practice_access(
    buyer,
    course_id,
    2,
    'purchase',
    jsonb_build_object(
      'order_id', v_id,
      'granted_via', 'course_upgrade'
    )
  );

  IF (v_grant ->> 'inserted')::boolean IS NOT FALSE
     OR (v_grant ->> 'raised')::boolean IS NOT TRUE
     OR (v_grant ->> 'access_level')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'D: first upgrade grant %', v_grant;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D: must not insert a second user_practices row';
  END IF;

  v_grant := public.grant_practice_access(
    buyer,
    course_id,
    2,
    'admin',
    jsonb_build_object('granted_via', 'course_upgrade')
  );

  IF (v_grant ->> 'raised')::boolean IS NOT FALSE
     OR (v_grant ->> 'inserted')::boolean IS NOT FALSE
     OR (v_grant ->> 'access_level')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'F: already at target %', v_grant;
  END IF;

  SELECT access_source INTO v_source
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = course_id;

  IF v_source IS DISTINCT FROM 'purchase' THEN
    RAISE EXCEPTION 'F: access_source must stay purchase';
  END IF;

  SELECT order_id, amount_minor, target_access_level
  INTO v_id2, v_amount, v_target
  FROM public.create_course_upgrade_order(course_id, key1, NULL);

  IF v_id2 IS DISTINCT FROM v_id
     OR v_target IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'H: replay of completed/failed L2 key must return original target 2, got % %',
      v_id2, v_target;
  END IF;

  SELECT order_id, amount_minor, target_access_level
  INTO v_id, v_amount, v_target
  FROM public.create_course_upgrade_order(course_id, key4, NULL);

  IF v_target IS DISTINCT FROM 3 OR v_amount IS DISTINCT FROM 150000 THEN
    RAISE EXCEPTION 'I: L2→L3 must charge 150000, got % %', v_target, v_amount;
  END IF;

  -- Entitled L1 on an unpublished course can start L2 checkout.
  -- A stranger still cannot (practice_not_published).
  DECLARE
    unpublished_buyer uuid := 'b9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9';
    unpublished_id uuid := 'd9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9';
    key5 uuid := 'f9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e1';
    key6 uuid := 'f9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e2';
  BEGIN
    INSERT INTO auth.users (id) VALUES (unpublished_buyer);
    INSERT INTO public.practices (
      id, author_id, title, slug, status, price, is_free, currency, publication_class
    ) VALUES (
      unpublished_id, author, 'Unpublished Course', 'course-upgrade-draft',
      'unpublished', 4900, false, 'RUB', 'course'
    );
    INSERT INTO public.practice_access_levels (
      practice_id, level, title, upgrade_price, currency
    ) VALUES
      (unpublished_id, 1, 'L1', NULL, 'RUB'),
      (unpublished_id, 2, 'L2', 2222, 'RUB');

    PERFORM public.grant_practice_access(unpublished_buyer, unpublished_id, 1, 'purchase');
    PERFORM set_config('request.jwt.claim.sub', unpublished_buyer::text, true);

    SELECT order_id, amount_minor, target_access_level, order_kind, currency
    INTO v_id, v_amount, v_target, v_kind, v_currency
    FROM public.create_course_upgrade_order(unpublished_id, key5, 2);

    IF v_kind IS DISTINCT FROM 'course_upgrade'
       OR v_target IS DISTINCT FROM 2
       OR v_amount IS DISTINCT FROM 222200
       OR v_currency IS DISTINCT FROM 'RUB' THEN
      RAISE EXCEPTION 'K: unpublished entitled upgrade mismatch % % % %',
        v_kind, v_target, v_amount, v_currency;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', other::text, true);
    BEGIN
      PERFORM public.create_course_upgrade_order(unpublished_id, key6, 2);
      RAISE EXCEPTION 'K: stranger must not start unpublished upgrade';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%stranger must not start unpublished upgrade%' THEN
          RAISE;
        END IF;
        IF SQLERRM NOT LIKE '%practice_not_published%' THEN
          RAISE EXCEPTION 'K: expected practice_not_published, got %', SQLERRM;
        END IF;
    END;
  END;

  RAISE NOTICE 'course_upgrade_checkout_smoke: ok';
END
$$;
