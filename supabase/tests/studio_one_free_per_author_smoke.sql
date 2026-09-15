-- Isolated smoke for one FREE Studio music product per author_id.
-- Expects practices table + practices_one_free_studio_music_per_author_uidx.

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
BEGIN
  -- 1) first FREE for A allowed
  INSERT INTO public.practices (id, author_id, title, deleted_at, music_usage_permission, studio_music_pricing_mode, is_free, price, product_kind, status)
  VALUES (p1, author_a, 'A free', NULL, 'platform_reuse_allowed', 'free', true, 0, 'music', 'draft');

  -- 2) second FREE for A rejected
  BEGIN
    INSERT INTO public.practices (id, author_id, title, deleted_at, music_usage_permission, studio_music_pricing_mode, is_free, price, product_kind, status)
    VALUES (p2, author_a, 'A free 2', NULL, 'platform_reuse_allowed', 'free', true, 0, 'music', 'draft');
    RAISE EXCEPTION 'expected unique violation for second FREE';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  -- 3) first FREE for B allowed
  INSERT INTO public.practices (id, author_id, title, deleted_at, music_usage_permission, studio_music_pricing_mode, is_free, price, product_kind, status)
  VALUES (p3, author_b, 'B free', NULL, 'platform_reuse_allowed', 'free', true, 0, 'music', 'published');

  -- 4) A FREE + multiple PAID allowed
  INSERT INTO public.practices (id, author_id, title, deleted_at, music_usage_permission, studio_music_pricing_mode, is_free, price, product_kind, status)
  VALUES
    (p4, author_a, 'A paid fixed', NULL, 'platform_reuse_allowed', 'fixed', false, 499, 'music', 'published'),
    (p5, author_a, 'A paid auto', NULL, 'platform_reuse_allowed', 'auto_2x_listener', false, 199, 'music', 'published');

  -- 5) changing second PAID -> FREE rejected
  BEGIN
    UPDATE public.practices
    SET studio_music_pricing_mode = 'free', is_free = true, price = 0
    WHERE id = p4;
    RAISE EXCEPTION 'expected unique violation when second product becomes FREE';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  -- 6) FREE -> PAID releases slot
  UPDATE public.practices
  SET studio_music_pricing_mode = 'fixed', is_free = false, price = 499
  WHERE id = p1;

  -- 7) after release another product may become FREE
  UPDATE public.practices
  SET studio_music_pricing_mode = 'free', is_free = true, price = 0
  WHERE id = p4;

  -- 8) same product re-save FREE allowed
  UPDATE public.practices
  SET title = 'A paid fixed now free renamed'
  WHERE id = p4 AND studio_music_pricing_mode = 'free';

  -- 9) legacy NULL + listener-free occupies slot (cannot add explicit free)
  UPDATE public.practices
  SET studio_music_pricing_mode = NULL, is_free = true, price = 0
  WHERE id = p4;

  BEGIN
    INSERT INTO public.practices (id, author_id, title, deleted_at, music_usage_permission, studio_music_pricing_mode, is_free, price, product_kind, status)
    VALUES (p6, author_a, 'A free after null', NULL, 'platform_reuse_allowed', 'free', true, 0, 'music', 'draft');
    RAISE EXCEPTION 'expected unique violation for legacy NULL free slot';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  -- soft-delete releases slot
  UPDATE public.practices SET deleted_at = now() WHERE id = p4;
  INSERT INTO public.practices (id, author_id, title, deleted_at, music_usage_permission, studio_music_pricing_mode, is_free, price, product_kind, status)
  VALUES (p6, author_a, 'A free after delete', NULL, 'platform_reuse_allowed', 'free', true, 0, 'music', 'draft');

  RAISE NOTICE 'studio_one_free_per_author_smoke: ok';
END $$;
