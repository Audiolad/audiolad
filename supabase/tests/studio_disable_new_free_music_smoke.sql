-- Isolated smoke: disable NEW Studio FREE; grandfather existing FREE.
-- Pre-migration seed (p1,p2,p5,p6) is inserted by studio-music-new-free-policy-sql-unit.mjs.
DO $$
DECLARE
  author_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  author_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  p1 uuid := '11111111-1111-1111-1111-111111111111';
  p2 uuid := '22222222-2222-2222-2222-222222222222';
  p3 uuid := '33333333-3333-3333-3333-333333333333';
  p4 uuid := '44444444-4444-4444-4444-444444444444';
  p5 uuid := '55555555-5555-5555-5555-555555555555';
  p6 uuid := '66666666-6666-6666-6666-666666666666';
  v_count int;
  v_mode text;
  v_perm text;
  v_is_free boolean;
  v_price numeric;
BEGIN
  -- Migration must leave pre-seeded grandfather inventory intact (no convert / delete).
  SELECT count(*) INTO v_count
  FROM public.practices
  WHERE id IN (p1, p2, p5, p6);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'grandfather_inventory_intact: expected 4 seeded rows, got %', v_count;
  END IF;

  SELECT studio_music_pricing_mode, music_usage_permission, is_free, price
    INTO v_mode, v_perm, v_is_free, v_price
  FROM public.practices WHERE id = p1;
  IF v_mode IS DISTINCT FROM 'free'
     OR v_perm IS DISTINCT FROM 'platform_reuse_allowed'
     OR v_is_free IS DISTINCT FROM true
     OR v_price IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'grandfather_inventory_intact: p1 rewritten by migration';
  END IF;

  SELECT studio_music_pricing_mode, music_usage_permission, is_free, price
    INTO v_mode, v_perm, v_is_free, v_price
  FROM public.practices WHERE id = p2;
  IF v_mode IS DISTINCT FROM 'free'
     OR v_perm IS DISTINCT FROM 'platform_reuse_allowed'
     OR v_is_free IS DISTINCT FROM true
     OR v_price IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'grandfather_inventory_intact: p2 rewritten by migration';
  END IF;

  SELECT studio_music_pricing_mode, music_usage_permission, is_free, price
    INTO v_mode, v_perm, v_is_free, v_price
  FROM public.practices WHERE id = p6;
  IF v_mode IS NOT NULL
     OR v_perm IS DISTINCT FROM 'platform_reuse_allowed'
     OR v_is_free IS DISTINCT FROM true
     OR v_price IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'grandfather_inventory_intact: p6 rewritten by migration';
  END IF;

  -- Explicit grandfathered FREE: watched-column UPDATE that stays FREE → ALLOW
  UPDATE public.practices
  SET studio_music_pricing_mode = 'free', is_free = true, price = 0
  WHERE id = p1;

  -- Legacy NULL grandfathered effective FREE → explicit FREE same author → ALLOW
  UPDATE public.practices
  SET studio_music_pricing_mode = 'free', is_free = true, price = 0
  WHERE id = p6;

  -- INSERT new explicit FREE → REJECT
  BEGIN
    INSERT INTO public.practices (
      id, author_id, title, deleted_at, music_usage_permission,
      studio_music_pricing_mode, is_free, price, product_kind, status
    ) VALUES (
      p3, author_b, 'new free', NULL, 'platform_reuse_allowed',
      'free', true, 0, 'music', 'draft'
    );
    RAISE EXCEPTION 'expected reject new FREE insert';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%studio_new_free_disabled%' THEN
        RAISE;
      END IF;
  END;

  -- INSERT new legacy NULL effective FREE → REJECT
  BEGIN
    INSERT INTO public.practices (
      id, author_id, title, deleted_at, music_usage_permission,
      studio_music_pricing_mode, is_free, price, product_kind, status
    ) VALUES (
      p3, author_b, 'new null free', NULL, 'platform_reuse_allowed',
      NULL, true, 0, 'music', 'draft'
    );
    RAISE EXCEPTION 'expected reject new legacy NULL FREE insert';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%studio_new_free_disabled%' THEN
        RAISE;
      END IF;
  END;

  -- INSERT new PAID FIXED 499 → ALLOW
  INSERT INTO public.practices (
    id, author_id, title, deleted_at, music_usage_permission,
    studio_music_pricing_mode, is_free, price, product_kind, status
  ) VALUES (
    p3, author_b, 'new paid', NULL, 'platform_reuse_allowed',
    'fixed', false, 499, 'music', 'draft'
  );

  -- PAID → FREE → REJECT
  BEGIN
    UPDATE public.practices
    SET studio_music_pricing_mode = 'free', is_free = true, price = 0
    WHERE id = p3;
    RAISE EXCEPTION 'expected reject PAID→FREE';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%studio_new_free_disabled%' THEN RAISE; END IF;
  END;

  -- FREE → PAID → ALLOW (use p1 which is still grandfathered FREE)
  UPDATE public.practices
  SET studio_music_pricing_mode = 'fixed', is_free = false, price = 499
  WHERE id = p1;

  -- after FREE→PAID, back to FREE → REJECT
  BEGIN
    UPDATE public.practices
    SET studio_music_pricing_mode = 'free', is_free = true, price = 0
    WHERE id = p1;
    RAISE EXCEPTION 'expected reject PAID→FREE after grandfather lost';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%studio_new_free_disabled%' THEN RAISE; END IF;
  END;

  -- soft-delete FREE → ALLOW (p2 still FREE)
  UPDATE public.practices SET deleted_at = now() WHERE id = p2;

  -- restore as FREE → REJECT
  BEGIN
    UPDATE public.practices SET deleted_at = NULL WHERE id = p2;
    RAISE EXCEPTION 'expected reject restore FREE';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%studio_new_free_disabled%' THEN RAISE; END IF;
  END;

  -- restore as PAID → ALLOW
  UPDATE public.practices
  SET deleted_at = NULL, studio_music_pricing_mode = 'fixed', is_free = false, price = 599
  WHERE id = p2;

  -- listen-only / permission NULL free listener draft is NOT Studio FREE → ALLOW
  INSERT INTO public.practices (
    id, author_id, title, deleted_at, music_usage_permission,
    studio_music_pricing_mode, is_free, price, product_kind, status
  ) VALUES (
    p4, author_a, 'listen only free draft', NULL, NULL,
    NULL, true, 0, 'music', 'draft'
  );

  -- grandfathered FREE author transfer while FREE → REJECT (p5 still FREE)
  BEGIN
    UPDATE public.practices SET author_id = author_b WHERE id = p5;
    RAISE EXCEPTION 'expected reject FREE author transfer';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%studio_new_free_disabled%' THEN RAISE; END IF;
  END;

  -- FREE→PAID + author transfer → ALLOW
  UPDATE public.practices
  SET author_id = author_b, studio_music_pricing_mode = 'fixed', is_free = false, price = 499
  WHERE id = p5;

  RAISE NOTICE 'studio_disable_new_free_music_smoke: ok';
END $$;
