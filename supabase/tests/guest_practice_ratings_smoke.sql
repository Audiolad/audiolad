-- Scratch-cluster assertions. Never run against production.

DO $$
DECLARE
  v_guest uuid := '11111111-1111-4111-8111-111111111111';
  v_guest_short uuid := '22222222-2222-4222-8222-222222222222';
  v_guest_gap uuid := '44444444-4444-4444-8444-444444444444';
  v_guest_link uuid := '55555555-5555-4555-8555-555555555555';
  v_user uuid := '33333333-3333-4333-8333-333333333333';
  v_practice uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_music uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_link uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_track uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_t0 timestamptz := '2026-10-23 08:00:00+00';
  v_listened bigint;
  v_accepted bigint;
  v_eligible timestamptz;
  v_changed boolean;
  v_updated timestamptz;
  v_events integer;
  v_registered integer;
  v_action text;
  v_segments jsonb;
  v_failures integer;
  v_linked_at timestamptz;
  v_linked_user uuid;
BEGIN
  INSERT INTO public.practices (id, title, product_kind) VALUES
    (v_practice, 'Тишина', 'practice'),
    (v_music, 'Ночной мотив', 'music'),
    (v_link, 'Связка', 'practice');
  INSERT INTO auth.users (id) VALUES (v_user);
  INSERT INTO public.practice_ratings (user_id, practice_id, stars)
  VALUES (v_user, v_music, 2);

  SELECT accepted_ms INTO v_accepted
  FROM public.apply_guest_listen_stats_heartbeat(
    v_guest, v_practice, v_track, 0, true, 180000, NULL, NULL, v_t0
  );
  IF v_accepted <> 0 THEN
    RAISE EXCEPTION 'first heartbeat credited %', v_accepted;
  END IF;

  SELECT real_listened_ms, accepted_ms, rating_eligible_at
  INTO v_listened, v_accepted, v_eligible
  FROM public.apply_guest_listen_stats_heartbeat(
    v_guest, v_practice, v_track, 15000, true, 180000, NULL, NULL, v_t0 + interval '10 seconds'
  );
  IF v_accepted <> 15000 OR v_listened <> 15000 OR v_eligible IS NOT NULL THEN
    RAISE EXCEPTION 'honest tick failed: % % %', v_accepted, v_listened, v_eligible;
  END IF;

  SELECT accepted_ms INTO v_accepted
  FROM public.apply_guest_listen_stats_heartbeat(
    v_guest, v_practice, v_track, 0, true, 180000, NULL, NULL, v_t0 + interval '12 seconds'
  );
  IF v_accepted <> 0 THEN
    RAISE EXCEPTION 'rewind credited %', v_accepted;
  END IF;

  SELECT accepted_ms INTO v_accepted
  FROM public.apply_guest_listen_stats_heartbeat(
    v_guest, v_practice, v_track, 15000, true, 180000, NULL, NULL, v_t0 + interval '22 seconds'
  );
  IF v_accepted <> 0 THEN
    RAISE EXCEPTION 'replay credited %', v_accepted;
  END IF;

  SELECT real_listened_ms, rating_eligible_at
  INTO v_listened, v_eligible
  FROM public.apply_guest_listen_stats_heartbeat(
    v_guest, v_practice, v_track, 30000, true, 180000, NULL, NULL, v_t0 + interval '32 seconds'
  );
  IF v_listened <> 30000 OR v_eligible IS NULL THEN
    RAISE EXCEPTION 'eligibility failed: % %', v_listened, v_eligible;
  END IF;

  PERFORM public.apply_guest_listen_stats_heartbeat(
    v_guest_gap, v_practice, v_track, 0, true, 180000, NULL, NULL, v_t0
  );
  SELECT accepted_ms INTO v_accepted
  FROM public.apply_guest_listen_stats_heartbeat(
    v_guest_gap, v_practice, v_track, 5000, true, 180000, NULL, NULL, v_t0 + interval '25 seconds'
  );
  IF v_accepted <> 0 THEN
    RAISE EXCEPTION 'gap credited %', v_accepted;
  END IF;

  SELECT accepted_ms, rating_eligible_at INTO v_accepted, v_eligible
  FROM public.apply_guest_listen_stats_heartbeat(
    v_guest_short, v_music, v_track, 0, true, 4000, 4000, NULL, v_t0
  );
  SELECT real_listened_ms, rating_eligible_at INTO v_listened, v_eligible
  FROM public.apply_guest_listen_stats_heartbeat(
    v_guest_short, v_music, v_track, 4000, true, 4000, 4000, NULL, v_t0 + interval '4 seconds'
  );
  IF v_listened <> 4000 OR v_eligible IS NULL THEN
    RAISE EXCEPTION 'short fragment failed: % %', v_listened, v_eligible;
  END IF;

  SELECT changed, updated_at INTO v_changed, v_updated
  FROM public.set_guest_practice_rating(
    v_guest, v_practice, 4, 'listen', NULL, NULL, NULL, v_t0 + interval '61 seconds'
  );
  IF v_changed IS NOT TRUE THEN
    RAISE EXCEPTION 'first vote did not change';
  END IF;

  SELECT changed INTO v_changed
  FROM public.set_guest_practice_rating(
    v_guest, v_practice, 4, 'listen', NULL, NULL, NULL, v_t0 + interval '62 seconds'
  );
  IF v_changed IS NOT FALSE OR v_updated IS DISTINCT FROM (
    SELECT updated_at FROM public.guest_practice_ratings
    WHERE guest_id = v_guest AND practice_id = v_practice
  ) THEN
    RAISE EXCEPTION 'identical resubmit changed the row';
  END IF;

  SELECT changed INTO v_changed
  FROM public.set_guest_practice_rating(
    v_guest, v_practice, 5, 'listen', NULL, NULL, NULL, v_t0 + interval '63 seconds'
  );
  IF v_changed IS NOT TRUE THEN
    RAISE EXCEPTION 're-rate did not update';
  END IF;
  IF (SELECT count(*) FROM public.guest_practice_ratings WHERE guest_id = v_guest AND practice_id = v_practice) <> 1 THEN
    RAISE EXCEPTION 're-rate created a second vote';
  END IF;

  SELECT changed INTO v_changed
  FROM public.set_guest_practice_rating(
    v_guest_short, v_music, 5, 'listen_captcha', NULL, NULL, 'smartcaptcha', v_t0 + interval '5 seconds'
  );

  PERFORM public.apply_guest_listen_stats_heartbeat(
    v_guest_link, v_link, v_track, 0, true, 4000, 4000, NULL, v_t0
  );
  PERFORM public.apply_guest_listen_stats_heartbeat(
    v_guest_link, v_link, v_track, 4000, true, 4000, 4000, NULL, v_t0 + interval '4 seconds'
  );
  PERFORM public.set_guest_practice_rating(
    v_guest_link, v_link, 3, 'listen', NULL, NULL, NULL, v_t0 + interval '5 seconds'
  );

  SELECT count(*) INTO v_registered FROM public.practice_ratings WHERE user_id = v_user;
  IF v_registered <> 1 THEN
    RAISE EXCEPTION 'registered baseline changed before claim';
  END IF;

  SELECT action INTO v_action
  FROM public.claim_guest_practice_ratings(v_guest_short, v_user, v_t0 + interval '70 seconds', false)
  WHERE practice_id = v_music;
  IF v_action <> 'superseded' THEN
    RAISE EXCEPTION 'expected superseded, got %', v_action;
  END IF;
  IF (SELECT stars FROM public.practice_ratings WHERE user_id = v_user AND practice_id = v_music) <> 2 THEN
    RAISE EXCEPTION 'account vote was overwritten';
  END IF;
  IF (SELECT count(*) FROM public.practice_ratings) <> 1 THEN
    RAISE EXCEPTION 'supersede wrote a registered row';
  END IF;

  SELECT action INTO v_action
  FROM public.claim_guest_practice_ratings(v_guest_link, v_user, v_t0 + interval '71 seconds')
  WHERE practice_id = v_link;
  IF v_action <> 'linked' THEN
    RAISE EXCEPTION 'expected linked, got %', v_action;
  END IF;
  SELECT claimed_by_user_id, superseded_at
  INTO v_linked_user, v_linked_at
  FROM public.guest_practice_ratings
  WHERE guest_id = v_guest_link AND practice_id = v_link;
  IF v_linked_user IS DISTINCT FROM v_user OR v_linked_at IS NOT NULL THEN
    RAISE EXCEPTION 'link-only did not keep the guest row private';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.practice_ratings WHERE practice_id = v_link
  ) THEN
    RAISE EXCEPTION 'link-only copied stars into practice_ratings';
  END IF;
  IF (SELECT count(*) FROM public.practice_ratings) <> 1 THEN
    RAISE EXCEPTION 'link-only changed the registered count';
  END IF;

  SELECT action INTO v_action
  FROM public.claim_guest_practice_ratings(v_guest_link, v_user, v_t0 + interval '72 seconds', true)
  WHERE practice_id = v_link;
  IF v_action IS NOT NULL THEN
    RAISE EXCEPTION 'already linked row was copied later: %', v_action;
  END IF;
  IF (SELECT count(*) FROM public.practice_ratings) <> 1 THEN
    RAISE EXCEPTION 'a later copy flag wrote practice_ratings';
  END IF;

  SELECT action INTO v_action
  FROM public.claim_guest_practice_ratings(v_guest, v_user, v_t0 + interval '73 seconds', true)
  WHERE practice_id = v_practice;
  IF v_action <> 'claimed' THEN
    RAISE EXCEPTION 'expected claimed, got %', v_action;
  END IF;

  IF (SELECT count(*) FROM public.practice_ratings WHERE user_id = v_user AND practice_id = v_practice) <> 1 THEN
    RAISE EXCEPTION 'claim duplicated the registered vote';
  END IF;
  IF (SELECT stars FROM public.practice_ratings WHERE user_id = v_user AND practice_id = v_practice) <> 5 THEN
    RAISE EXCEPTION 'copied stars are wrong';
  END IF;
  IF (SELECT stars FROM public.practice_ratings WHERE user_id = v_user AND practice_id = v_music) <> 2 THEN
    RAISE EXCEPTION 'account vote was overwritten';
  END IF;
  IF (SELECT count(*) FROM public.practice_ratings) <> 2 THEN
    RAISE EXCEPTION 'registered rows were deleted or duplicated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.guest_practice_ratings
    WHERE superseded_at IS NULL AND claimed_by_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'guest rows stayed in the active aggregate';
  END IF;

  SELECT count(*) INTO v_events
  FROM public.guest_practice_rating_events
  WHERE guest_id = v_guest AND practice_id = v_practice;
  IF v_events <> 3 THEN
    RAISE EXCEPTION 'expected first, changed, claimed; got %', v_events;
  END IF;

  v_segments := public.admin_ratings_guest_listeners(NULL, 'last_activity', 'desc', 50, 0);
  IF (v_segments -> 'segments' -> 'music' ->> 'rating_count') <> '0'
     OR (v_segments -> 'segments' -> 'practice' ->> 'rating_count') <> '0' THEN
    RAISE EXCEPTION 'superseded guests leaked into segments: %', v_segments;
  END IF;

  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM 1 FROM public.guest_practice_ratings;
    RAISE EXCEPTION 'anon read was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
  END;

  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM * FROM public.set_guest_practice_rating(
      v_guest, v_practice, 1, 'listen', NULL, NULL, NULL, v_t0
    );
    RAISE EXCEPTION 'anon execute was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
  END;

  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM public.guest_rating_listen_threshold_ms(1000);
    RAISE EXCEPTION 'anon threshold was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
  END;

  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.guest_rating_listen_threshold_ms(1000);
    RAISE EXCEPTION 'authenticated threshold was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
  END;

  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM public.record_guest_captcha_failure(v_guest, v_t0);
    RAISE EXCEPTION 'anon captcha failure was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
  END;

  v_failures := public.record_guest_captcha_failure(v_guest, v_t0);
  IF v_failures <> 1 THEN
    RAISE EXCEPTION 'first captcha failure was %', v_failures;
  END IF;
  v_failures := public.record_guest_captcha_failure(v_guest, v_t0 + interval '1 second');
  IF v_failures <> 2 THEN
    RAISE EXCEPTION 'captcha failure increment was %', v_failures;
  END IF;
  PERFORM public.reset_guest_captcha_failures(v_guest);
  IF (
    SELECT captcha_failures FROM public.guest_rating_activity WHERE guest_id = v_guest
  ) <> 0 THEN
    RAISE EXCEPTION 'captcha failures were not reset';
  END IF;
END $$;

SELECT 'guest_practice_ratings_smoke: PASS';
