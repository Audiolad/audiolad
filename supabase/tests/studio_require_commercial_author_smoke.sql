-- Isolated smoke: Studio acquisition requires commercial source author.
-- Minimal stub schema for can_acquire_studio_music dependencies is created by the unit harness.
DO $$
DECLARE
  author_free uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  author_pending uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  author_onboarding uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  author_suspended uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  author_active uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  author_legacy uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  user_id uuid := '11111111-1111-1111-1111-111111111111';
  p_free uuid := '22222222-2222-2222-2222-222222222222';
  p_pending uuid := '33333333-3333-3333-3333-333333333333';
  p_onboarding uuid := '44444444-4444-4444-4444-444444444444';
  p_suspended uuid := '55555555-5555-5555-5555-555555555555';
  p_active uuid := '66666666-6666-6666-6666-666666666666';
  p_legacy uuid := '77777777-7777-7777-7777-777777777777';
  v_practice public.practices%ROWTYPE;
BEGIN
  INSERT INTO public.authors (id, access_status) VALUES
    (author_free, 'free'),
    (author_pending, 'commercial_pending'),
    (author_onboarding, 'commercial_onboarding'),
    (author_suspended, 'commercial_suspended'),
    (author_active, 'commercial_active'),
    (author_legacy, 'commercial');

  INSERT INTO public.practices (
    id, author_id, status, deleted_at, product_kind, publication_class,
    music_usage_permission, is_free, price, studio_music_pricing_mode,
    studio_music_price_minor, catalog_visibility, is_catalog_listed
  ) VALUES
    (p_free, author_free, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', false, 0, 'fixed', 49900, 'listed', true),
    (p_pending, author_pending, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', false, 0, 'fixed', 49900, 'listed', true),
    (p_onboarding, author_onboarding, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', false, 0, 'fixed', 49900, 'listed', true),
    (p_suspended, author_suspended, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', false, 0, 'fixed', 49900, 'listed', true),
    (p_active, author_active, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', false, 0, 'fixed', 49900, 'listed', true),
    (p_legacy, author_legacy, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', true, 0, 'free', NULL, 'listed', true);

  SELECT * INTO v_practice FROM public.practices WHERE id = p_free;
  IF public.can_acquire_studio_music(v_practice, user_id) THEN
    RAISE EXCEPTION 'expected free author reject';
  END IF;

  SELECT * INTO v_practice FROM public.practices WHERE id = p_pending;
  IF public.can_acquire_studio_music(v_practice, user_id) THEN
    RAISE EXCEPTION 'expected pending reject';
  END IF;

  SELECT * INTO v_practice FROM public.practices WHERE id = p_onboarding;
  IF public.can_acquire_studio_music(v_practice, user_id) THEN
    RAISE EXCEPTION 'expected onboarding reject';
  END IF;

  SELECT * INTO v_practice FROM public.practices WHERE id = p_suspended;
  IF public.can_acquire_studio_music(v_practice, user_id) THEN
    RAISE EXCEPTION 'expected suspended reject';
  END IF;

  SELECT * INTO v_practice FROM public.practices WHERE id = p_active;
  IF NOT public.can_acquire_studio_music(v_practice, user_id) THEN
    RAISE EXCEPTION 'expected commercial_active allow';
  END IF;

  SELECT * INTO v_practice FROM public.practices WHERE id = p_legacy;
  IF NOT public.can_acquire_studio_music(v_practice, user_id) THEN
    RAISE EXCEPTION 'expected legacy commercial allow';
  END IF;

  -- Existing entitlement path stays independent (can_use stub returns true for entitled).
  IF NOT public.can_use_music_in_studio(p_free, user_id) THEN
    RAISE EXCEPTION 'expected entitled use after non-commercial source';
  END IF;

  RAISE NOTICE 'studio_require_commercial_author_smoke: ok';
END $$;
