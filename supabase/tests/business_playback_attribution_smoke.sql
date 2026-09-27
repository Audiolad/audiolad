-- Isolated smoke for Business Playback Attribution (A3).
-- Scratch DB only. Never production.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  v_author_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_practice_id uuid;
  audio_id uuid;
  audio_id2 uuid;
  v_boot jsonb;
  v_org uuid;
  v_loc uuid;
  v_zone uuid;
  v_zone2 uuid;
  v_create jsonb;
  v_create2 jsonb;
  v_player uuid;
  v_player2 uuid;
  v_cred text;
  v_cred2 text;
  v_session uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_session2 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_session_p2 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  v_event1 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_event2 uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_event3 uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_event4 uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_event5 uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  v_event6 uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff';
  v_event7 uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111';
  v_event8 uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-222222222222';
  v_hb jsonb;
  v_cons record;
  cnt integer;
  admin_sum bigint;
  author_sum bigint;
  consumer_sum bigint;
  raised boolean;
  v_err text;
  v_zone_old uuid;
  v_zone_new uuid;
  v_fact_zone uuid;
  v_before timestamptz;
  v_after timestamptz;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (user_a, 'a@example.com');
  INSERT INTO public.authors (id, name, slug) VALUES (v_author_id, 'Auth', 'auth-a');

  INSERT INTO public.practices (id, author_id, title, slug, product_kind)
  VALUES (gen_random_uuid(), v_author_id, 'Music 1', 'music-1', 'music')
  RETURNING id INTO v_practice_id;

  INSERT INTO public.audio_items (id, practice_id, title, audio_path, position)
  VALUES (gen_random_uuid(), v_practice_id, 'A1', 'a1.mp3', 1)
  RETURNING id INTO audio_id;

  INSERT INTO public.audio_items (id, practice_id, title, audio_path, position)
  VALUES (gen_random_uuid(), v_practice_id, 'A2', 'a2.mp3', 2)
  RETURNING id INTO audio_id2;

  -- Case 1: existing consumer apply still works
  SELECT * INTO v_cons FROM public.apply_playback_usage_heartbeat(
    gen_random_uuid(), 'consumer:key:1', 1, user_a, NULL, NULL,
    v_practice_id, audio_id, 0, NULL, NULL, 'advance', clock_timestamp()
  );
  IF v_cons.accepted_ms <> 0 THEN RAISE EXCEPTION 'Case1: baseline should be 0'; END IF;

  SELECT * INTO v_cons FROM public.apply_playback_usage_heartbeat(
    gen_random_uuid(), 'consumer:key:1', 2, user_a, NULL, NULL,
    v_practice_id, audio_id, 5000, NULL, NULL, 'advance', clock_timestamp() + interval '5 seconds'
  );
  IF v_cons.accepted_ms <= 0 THEN RAISE EXCEPTION 'Case1: expected positive consumer accept'; END IF;

  -- Case 2/3: consumer fact usage_kind + NULL B2B attribution
  SELECT count(*) INTO cnt FROM public.playback_usage_facts
  WHERE listening_key = 'consumer:key:1'
    AND usage_kind = 'consumer'
    AND organization_id IS NULL
    AND location_id IS NULL
    AND zone_id IS NULL
    AND player_id IS NULL;
  IF cnt < 1 THEN RAISE EXCEPTION 'Case2/3: consumer fact missing or has B2B cols'; END IF;

  -- Bootstrap org / players
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_boot := public.create_business_organization_with_location(
    'Org A', 'Loc A', 'cafe', 'RU', 'Europe/Moscow'
  );
  v_org := (v_boot->>'organization_id')::uuid;
  v_loc := (v_boot->>'location_id')::uuid;
  v_zone := (v_boot->>'zone_id')::uuid;

  RESET ROLE;
  INSERT INTO public.business_zones (location_id, name, is_default, status)
  VALUES (v_loc, 'Zone 2', false, 'active') RETURNING id INTO v_zone2;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_create := public.create_business_player(v_org, 'P1');
  v_player := (v_create->>'player_id')::uuid;
  v_cred := v_create->>'credential';
  PERFORM public.assign_business_player_to_zone(v_player, v_zone);

  v_create2 := public.create_business_player(v_org, 'P2');
  v_player2 := (v_create2->>'player_id')::uuid;
  v_cred2 := v_create2->>'credential';

  -- Case 9: no active assignment → reject
  RESET ROLE;
  EXECUTE 'SET ROLE anon';
  raised := false;
  BEGIN
    PERFORM public.apply_business_playback_usage_heartbeat(
      v_cred2, v_event1, v_session2, 1, audio_id, 0
    );
  EXCEPTION WHEN OTHERS THEN raised := true; v_err := SQLERRM;
  END;
  IF NOT raised OR position('player_not_assigned' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case9: expected player_not_assigned, got %', v_err;
  END IF;

  -- Case 10: invalid credential
  raised := false;
  BEGIN
    PERFORM public.apply_business_playback_usage_heartbeat(
      repeat('0', 64), v_event1, v_session, 1, audio_id, 0
    );
  EXCEPTION WHEN OTHERS THEN raised := true; v_err := SQLERRM;
  END;
  IF NOT raised OR position('invalid_player_credential' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case10: expected invalid_player_credential, got %', v_err;
  END IF;

  -- Case 4–7 / 19–22: valid B2B accept + attribution + NULL royalty/billing/legacy
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, v_event1, v_session, 1, audio_id, 0, NULL, NULL, 'advance'
  );
  IF coalesce(v_hb->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Case4 baseline failed %', v_hb;
  END IF;

  -- Wall-cap needs real elapsed >= media_delta/1.5 (B2B RPC uses server clock_timestamp).
  PERFORM pg_sleep(3);
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, v_event2, v_session, 2, audio_id, 4000, NULL, NULL, 'advance'
  );
  IF coalesce((v_hb->>'accepted_ms')::bigint, 0) <= 0 THEN
    RAISE EXCEPTION 'Case4: expected accepted_ms > 0 got %', v_hb;
  END IF;

  RESET ROLE;
  SELECT count(*) INTO cnt FROM public.playback_usage_facts
  WHERE client_event_id = v_event2
    AND usage_kind = 'business'
    AND organization_id = v_org
    AND location_id = v_loc
    AND zone_id = v_zone
    AND player_id = v_player
    AND practice_id = v_practice_id
    AND author_id_snapshot = v_author_id
    AND royalty_eligible_ms IS NULL
    AND billing_period_start IS NULL
    AND business_account_id IS NULL
    AND venue_id IS NULL;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case5-7/19-22: B2B fact attribution mismatch cnt=%', cnt; END IF;

  -- Case 11: other Player cannot reuse client_event_id
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.assign_business_player_to_zone(v_player2, v_zone);
  RESET ROLE;
  EXECUTE 'SET ROLE anon';
  raised := false;
  BEGIN
    PERFORM public.apply_business_playback_usage_heartbeat(
      v_cred2, v_event2, gen_random_uuid(), 1, audio_id, 100
    );
  EXCEPTION WHEN OTHERS THEN raised := true; v_err := SQLERRM;
  END;
  IF NOT raised OR position('client_event_identity_conflict' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case11: expected client_event_identity_conflict, got %', v_err;
  END IF;

  -- Case 12: same Player retry → idempotent duplicate
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, v_event2, v_session, 2, audio_id, 4000
  );
  IF coalesce((v_hb->>'duplicate')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Case12: expected duplicate true got %', v_hb;
  END IF;

  -- Case 13: stale sample_seq
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, v_event3, v_session, 2, audio_id, 5000
  );
  IF coalesce((v_hb->>'accepted_ms')::bigint, -1) <> 0 THEN
    RAISE EXCEPTION 'Case13: stale seq should accept 0 got %', v_hb;
  END IF;

  -- Case 14: seek
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, gen_random_uuid(), v_session, 3, audio_id, 100, NULL, NULL, 'seek'
  );
  IF coalesce((v_hb->>'accepted_ms')::bigint, -1) <> 0 THEN
    RAISE EXCEPTION 'Case14: seek should be 0';
  END IF;

  -- Case 15: track_change
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, gen_random_uuid(), v_session, 4, audio_id2, 0, NULL, NULL, 'track_change'
  );
  IF coalesce((v_hb->>'accepted_ms')::bigint, -1) <> 0 THEN
    RAISE EXCEPTION 'Case15: track_change should be 0';
  END IF;

  -- Case 16: impossible jump
  PERFORM pg_sleep(0.05);
  PERFORM public.apply_business_playback_usage_heartbeat(
    v_cred, gen_random_uuid(), v_session, 5, audio_id2, 50, NULL, NULL, 'advance'
  );
  PERFORM pg_sleep(0.05);
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, gen_random_uuid(), v_session, 6, audio_id2, 600000, NULL, NULL, 'advance'
  );
  IF coalesce((v_hb->>'accepted_ms')::bigint, -1) <> 0 THEN
    RAISE EXCEPTION 'Case16: impossible jump should be 0 got %', v_hb;
  END IF;

  -- Case 17–18: reassignment A→B on SAME playback_session re-baselines; old facts stay A
  RESET ROLE;
  SELECT zone_id INTO v_zone_old FROM public.playback_usage_facts WHERE client_event_id = v_event2;
  IF v_zone_old IS DISTINCT FROM v_zone THEN
    RAISE EXCEPTION 'Case17 pre: expected zone A on old fact';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.assign_business_player_to_zone(v_player, v_zone2);
  RESET ROLE;
  EXECUTE 'SET ROLE anon';

  -- Same playback_session_id as Zone A; continue audio_id2; sample_seq stays monotonic (7, 8).
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, v_event4, v_session, 7, audio_id2, 500, NULL, NULL, 'advance'
  );
  IF coalesce((v_hb->>'accepted_ms')::bigint, -1) <> 0 THEN
    RAISE EXCEPTION 'Case17: first sample after reassignment must baseline +0 got %', v_hb;
  END IF;

  PERFORM pg_sleep(3);
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred, v_event5, v_session, 8, audio_id2, 4000, NULL, NULL, 'advance'
  );
  IF coalesce((v_hb->>'accepted_ms')::bigint, 0) <= 0 THEN
    RAISE EXCEPTION 'Case17: second sample after reassignment should accept under Zone B got %', v_hb;
  END IF;

  RESET ROLE;
  SELECT zone_id INTO v_fact_zone FROM public.playback_usage_facts WHERE client_event_id = v_event2;
  IF v_fact_zone IS DISTINCT FROM v_zone THEN
    RAISE EXCEPTION 'Case18: historical fact rewritten to %', v_fact_zone;
  END IF;
  SELECT zone_id INTO v_zone_new FROM public.playback_usage_facts WHERE client_event_id = v_event5;
  IF v_zone_new IS DISTINCT FROM v_zone2 THEN
    RAISE EXCEPTION 'Case17: new fact expected zone B got %', v_zone_new;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.playback_usage_facts WHERE client_event_id = v_event4 AND listened_ms > 0
  ) THEN
    RAISE EXCEPTION 'Case17: baseline sample must not create positive fact';
  END IF;

  -- Case 23/24: consumer analytics exclude business
  SELECT coalesce(sum(listened_ms), 0) INTO admin_sum
  FROM public.playback_usage_admin_facts(NULL, NULL, true, NULL, NULL, NULL, NULL);
  SELECT coalesce(sum(listened_ms), 0) INTO author_sum
  FROM public.author_stats_listening_facts(
    v_author_id, now() - interval '1 day', now() + interval '1 day'
  );
  SELECT coalesce(sum(listened_ms), 0) INTO consumer_sum
  FROM public.playback_usage_facts
  WHERE usage_kind = 'consumer' AND listened_ms > 0;

  IF admin_sum <> consumer_sum THEN
    RAISE EXCEPTION 'Case23: admin_sum=% consumer_sum=%', admin_sum, consumer_sum;
  END IF;
  IF author_sum <> (
    SELECT coalesce(sum(listened_ms), 0) FROM public.playback_usage_facts
    WHERE usage_kind = 'consumer' AND listened_ms > 0 AND author_id_snapshot = v_author_id
  ) THEN
    RAISE EXCEPTION 'Case24: author facts include business author_sum=%', author_sum;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.playback_usage_facts
    WHERE usage_kind = 'business' AND listened_ms > 0
  ) AND admin_sum >= (
    SELECT coalesce(sum(listened_ms), 0) FROM public.playback_usage_facts WHERE listened_ms > 0
  ) THEN
    RAISE EXCEPTION 'Case23: admin sum looks like it includes all facts';
  END IF;

  -- Case 25: no direct anon/authenticated table access
  EXECUTE 'SET ROLE anon';
  raised := false;
  BEGIN
    PERFORM count(*) FROM public.playback_usage_facts;
  EXCEPTION WHEN OTHERS THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case25: anon SELECT facts must fail'; END IF;
  RESET ROLE;
  EXECUTE 'SET ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM count(*) FROM public.playback_usage_facts;
  EXCEPTION WHEN OTHERS THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case25: authenticated SELECT facts must fail'; END IF;
  RESET ROLE;

  -- Case 26: no destructive FK on snapshot columns
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'playback_usage_facts'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name IN ('organization_id', 'location_id', 'zone_id', 'player_id')
  ) THEN
    RAISE EXCEPTION 'Case26: destructive FK on B2B snapshots';
  END IF;

  -- Case 27: playback must not mutate connectivity heartbeat runtime
  SELECT last_heartbeat_at INTO v_before
  FROM public.business_player_runtime WHERE player_id = v_player;
  EXECUTE 'SET ROLE anon';
  PERFORM public.apply_business_playback_usage_heartbeat(
    v_cred, v_event6, gen_random_uuid(), 1, audio_id, 0
  );
  RESET ROLE;
  SELECT last_heartbeat_at INTO v_after
  FROM public.business_player_runtime WHERE player_id = v_player;
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'Case27: playback must not mutate connectivity heartbeat';
  END IF;

  -- Case 28: multiple Players in one Zone → independent attributed facts
  -- P2 already assigned to v_zone earlier
  EXECUTE 'SET ROLE anon';
  PERFORM public.apply_business_playback_usage_heartbeat(
    v_cred2, v_event7, v_session_p2, 1, audio_id, 0
  );
  PERFORM pg_sleep(3);
  v_hb := public.apply_business_playback_usage_heartbeat(
    v_cred2, v_event8, v_session_p2, 2, audio_id, 3000
  );
  IF coalesce((v_hb->>'accepted_ms')::bigint, 0) <= 0 THEN
    RAISE EXCEPTION 'Case28: P2 accept failed %', v_hb;
  END IF;
  RESET ROLE;

  SELECT count(*) INTO cnt FROM public.playback_usage_facts
  WHERE client_event_id = v_event8
    AND usage_kind = 'business'
    AND player_id = v_player2
    AND zone_id = v_zone
    AND organization_id = v_org;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'Case28: expected independent P2 fact cnt=%', cnt;
  END IF;

  RAISE NOTICE 'business_playback_attribution_smoke: all cases ok';
END;
$$;
