-- Isolated smoke: commercial acquire gate + entitlement use path.
DO $$
DECLARE
  author_commercial uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  author_free uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  author_suspended uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  practice_paid uuid := '11111111-1111-4111-8111-111111111111';
  practice_free_studio uuid := '22222222-2222-4222-8222-222222222222';
  practice_legacy uuid := '33333333-3333-4333-8333-333333333333';
  buyer uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_practice public.practices;
BEGIN
  INSERT INTO public.authors (id, access_status) VALUES
    (author_commercial, 'commercial_active'),
    (author_free, 'free'),
    (author_suspended, 'commercial_suspended');

  INSERT INTO public.practices (
    id, author_id, status, deleted_at, product_kind, publication_class,
    music_usage_permission, is_free, price, studio_music_pricing_mode,
    studio_music_price_minor, catalog_visibility, is_catalog_listed
  ) VALUES
    (practice_paid, author_commercial, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', false, 500, 'fixed', 49900, 'listed', true),
    (practice_free_studio, author_commercial, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', true, 0, 'free', NULL, 'listed', true),
    (practice_legacy, author_free, 'published', NULL, 'music', 'release',
     'platform_reuse_allowed', false, 500, 'fixed', 49900, 'listed', true);

  -- Existing entitlement for free-author track (historical grant).
  INSERT INTO public.studio_music_entitlements (
    user_id, practice_id, grant_source, revoked_at
  ) VALUES (buyer, practice_legacy, 'purchase', NULL);

  SELECT * INTO v_practice FROM public.practices WHERE id = practice_paid;
  IF NOT public.can_acquire_studio_music(v_practice, buyer) THEN
    RAISE EXCEPTION 'expected commercial paid acquire true';
  END IF;

  SELECT * INTO v_practice FROM public.practices WHERE id = practice_legacy;
  IF public.can_acquire_studio_music(v_practice, buyer) THEN
    RAISE EXCEPTION 'expected non-commercial acquire false';
  END IF;

  -- Paid checkout path stub must refuse non-commercial source.
  BEGIN
    PERFORM public.create_studio_music_order(practice_legacy, gen_random_uuid(), NULL);
    RAISE EXCEPTION 'expected create_studio_music_order reject';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%studio_music_not_acquirable%'
         AND SQLERRM NOT LIKE '%not_acquirable%' THEN
        RAISE;
      END IF;
  END;

  -- Free acquire path stub must refuse non-commercial (even grandfathered FREE row
  -- after author lost commercial status — NEW grant only).
  UPDATE public.authors SET access_status = 'free' WHERE id = author_commercial;
  SELECT * INTO v_practice FROM public.practices WHERE id = practice_free_studio;
  IF public.can_acquire_studio_music(v_practice, buyer) THEN
    RAISE EXCEPTION 'expected free acquire false after author non-commercial';
  END IF;
  BEGIN
    PERFORM public.acquire_free_studio_music(practice_free_studio);
    RAISE EXCEPTION 'expected acquire_free_studio_music reject';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%studio_music_not_acquirable%'
         AND SQLERRM NOT LIKE '%not_acquirable%' THEN
        RAISE;
      END IF;
  END;

  -- Existing entitlement remains usable via production-order can_use(user, practice).
  IF NOT public.can_use_music_in_studio(buyer, practice_legacy) THEN
    RAISE EXCEPTION 'expected entitlement use true after source free';
  END IF;

  -- Suspended source + entitlement still usable.
  UPDATE public.authors SET access_status = 'commercial_suspended' WHERE id = author_free;
  IF NOT public.can_use_music_in_studio(buyer, practice_legacy) THEN
    RAISE EXCEPTION 'expected entitlement use true after source suspended';
  END IF;

  RAISE NOTICE 'studio_require_commercial_author_smoke: ok';
END $$;
