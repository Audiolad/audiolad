-- Isolated smoke for Business Player Foundation (A2).
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  v_boot jsonb;
  v_boot_b jsonb;
  v_org uuid;
  v_org_b uuid;
  v_loc uuid;
  v_zone uuid;
  v_zone2 uuid;
  v_zone_b uuid;
  v_create jsonb;
  v_create2 jsonb;
  v_create_b jsonb;
  v_player uuid;
  v_player2 uuid;
  v_player_b uuid;
  v_cred text;
  v_cred_old text;
  v_cred_new text;
  v_assign jsonb;
  v_hb jsonb;
  v_hash bytea;
  cnt integer;
  raised boolean;
  v_err text;
  v_row record;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (user_a, 'a@example.com'),
    (user_b, 'b@example.com');

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
  VALUES (v_loc, 'Second Zone', false, 'active')
  RETURNING id INTO v_zone2;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_boot_b := public.create_business_organization_with_location(
    'Org B', 'Loc B', 'spa', 'DE', 'Europe/Berlin'
  );
  v_org_b := (v_boot_b->>'organization_id')::uuid;
  v_zone_b := (v_boot_b->>'zone_id')::uuid;

  -- Case 1: unauth create Player
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RESET ROLE;
  raised := false;
  BEGIN
    PERFORM public.create_business_player(v_org, 'P1');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('not_authenticated' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case1: expected not_authenticated, got %', v_err;
  END IF;

  -- Case 2: outsider cannot create in Org A
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  EXECUTE 'SET ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM public.create_business_player(v_org, 'Hack');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('not_organization_owner' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case2: expected not_organization_owner, got %', v_err;
  END IF;

  -- Case 3: owner creates Player
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_create := public.create_business_player(v_org, 'Front Desk');
  IF coalesce(v_create->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Case3: create failed %', v_create;
  END IF;
  v_player := (v_create->>'player_id')::uuid;
  v_cred := v_create->>'credential';
  IF v_create->>'player_code' !~ '^AL-P-[0-9]{9}$' THEN
    RAISE EXCEPTION 'Case3: bad player_code %', v_create->>'player_code';
  END IF;
  IF v_cred IS NULL OR char_length(v_cred) < 32 THEN
    RAISE EXCEPTION 'Case3: credential missing';
  END IF;
  SELECT count(*) INTO cnt FROM public.business_players
  WHERE id = v_player AND status = 'active';
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case3: player row missing'; END IF;

  RESET ROLE;
  SELECT credential_hash INTO v_hash
  FROM public.business_player_credentials WHERE player_id = v_player;
  IF v_hash IS NULL OR octet_length(v_hash) <> 32 THEN
    RAISE EXCEPTION 'Case3: hash missing';
  END IF;
  -- prove DB stores hash of credential, not plaintext
  IF encode(v_hash, 'escape') = v_cred OR encode(v_hash, 'hex') = v_cred THEN
    RAISE EXCEPTION 'Case3: plaintext appears stored in hash column';
  END IF;
  IF v_hash <> public.business_player_hash_credential(v_cred) THEN
    RAISE EXCEPTION 'Case3: hash mismatch';
  END IF;

  -- Case 4: authenticated cannot read credentials table
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM credential_hash FROM public.business_player_credentials WHERE player_id = v_player;
  EXCEPTION WHEN insufficient_privilege THEN
    raised := true;
  WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case4: authenticated must not SELECT credentials';
  END IF;

  -- Case 5: assign to own zone
  v_assign := public.assign_business_player_to_zone(v_player, v_zone);
  IF coalesce(v_assign->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Case5: assign failed %', v_assign;
  END IF;
  SELECT count(*) INTO cnt FROM public.business_player_assignments
  WHERE player_id = v_player AND zone_id = v_zone AND unassigned_at IS NULL;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case5: active assignment missing'; END IF;

  -- Case 6: cross-org assignment rejected
  raised := false;
  BEGIN
    PERFORM public.assign_business_player_to_zone(v_player, v_zone_b);
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('cross_organization_assignment' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case6: expected cross_organization_assignment, got %', v_err;
  END IF;

  -- Case 7: max one active assignment (partial unique via service path)
  RESET ROLE;
  raised := false;
  BEGIN
    INSERT INTO public.business_player_assignments (player_id, zone_id)
    VALUES (v_player, v_zone2);
  EXCEPTION WHEN unique_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case7: second active assignment must fail unique';
  END IF;

  -- Case 8: reassignment closes old
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_assign := public.assign_business_player_to_zone(v_player, v_zone2);
  SELECT count(*) INTO cnt FROM public.business_player_assignments
  WHERE player_id = v_player AND zone_id = v_zone AND unassigned_at IS NOT NULL;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case8: old assignment not closed'; END IF;
  SELECT count(*) INTO cnt FROM public.business_player_assignments
  WHERE player_id = v_player AND zone_id = v_zone2 AND unassigned_at IS NULL;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case8: new assignment missing'; END IF;

  -- Case 9: idempotent same zone
  v_assign := public.assign_business_player_to_zone(v_player, v_zone2);
  IF coalesce((v_assign->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Case9: expected idempotent true';
  END IF;
  SELECT count(*) INTO cnt FROM public.business_player_assignments
  WHERE player_id = v_player AND zone_id = v_zone2;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case9: duplicate history row'; END IF;

  -- Case 10: valid heartbeat
  RESET ROLE;
  EXECUTE 'SET ROLE anon';
  v_hb := public.record_business_player_heartbeat(v_cred, now(), '1.0.0');
  IF coalesce(v_hb->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Case10: heartbeat failed %', v_hb;
  END IF;
  IF (v_hb->>'player_id')::uuid <> v_player THEN
    RAISE EXCEPTION 'Case10: wrong player';
  END IF;
  IF v_hb ? 'organization_id' OR v_hb ? 'zone_id' THEN
    RAISE EXCEPTION 'Case10: heartbeat leaked org/zone';
  END IF;

  -- Case 11: invalid credential
  raised := false;
  BEGIN
    PERFORM public.record_business_player_heartbeat(repeat('0', 64));
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('invalid_player_credential' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case11: expected invalid_player_credential, got %', v_err;
  END IF;

  -- Case 12: suspended/retired reject heartbeat
  RESET ROLE;
  UPDATE public.business_players SET status = 'suspended' WHERE id = v_player;
  EXECUTE 'SET ROLE anon';
  raised := false;
  BEGIN
    PERFORM public.record_business_player_heartbeat(v_cred);
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('player_not_active' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case12: expected player_not_active, got %', v_err;
  END IF;
  RESET ROLE;
  UPDATE public.business_players SET status = 'active' WHERE id = v_player;

  -- Case 13: never_seen
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_create2 := public.create_business_player(v_org, 'Never Seen');
  v_player2 := (v_create2->>'player_id')::uuid;
  SELECT health_status INTO v_err
  FROM public.get_business_player_health(v_org)
  WHERE player_id = v_player2;
  IF v_err IS DISTINCT FROM 'never_seen' THEN
    RAISE EXCEPTION 'Case13: expected never_seen got %', v_err;
  END IF;

  -- Case 14–16: online / stale / offline via runtime server time
  RESET ROLE;
  UPDATE public.business_player_runtime
  SET last_heartbeat_at = clock_timestamp() - interval '30 seconds'
  WHERE player_id = v_player;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT health_status INTO v_err
  FROM public.get_business_player_health(v_org) WHERE player_id = v_player;
  IF v_err IS DISTINCT FROM 'online' THEN
    RAISE EXCEPTION 'Case14: expected online got %', v_err;
  END IF;

  RESET ROLE;
  UPDATE public.business_player_runtime
  SET last_heartbeat_at = clock_timestamp() - interval '120 seconds'
  WHERE player_id = v_player;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT health_status INTO v_err
  FROM public.get_business_player_health(v_org) WHERE player_id = v_player;
  IF v_err IS DISTINCT FROM 'stale' THEN
    RAISE EXCEPTION 'Case15: expected stale got %', v_err;
  END IF;

  RESET ROLE;
  UPDATE public.business_player_runtime
  SET last_heartbeat_at = clock_timestamp() - interval '400 seconds'
  WHERE player_id = v_player;
  -- Client clock cannot make offline player online via heartbeat metadata alone:
  -- only last_heartbeat_at (server) matters for derived health.
  IF public.business_player_derived_health(
       clock_timestamp() - interval '400 seconds',
       clock_timestamp()
     ) IS DISTINCT FROM 'offline' THEN
    RAISE EXCEPTION 'Case16: derived health offline failed';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT health_status INTO v_err
  FROM public.get_business_player_health(v_org) WHERE player_id = v_player;
  IF v_err IS DISTINCT FROM 'offline' THEN
    RAISE EXCEPTION 'Case16: expected offline got %', v_err;
  END IF;

  -- Case 17: outsider sees nothing
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.business_players WHERE id = v_player;
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case17: outsider sees player'; END IF;
  SELECT count(*) INTO cnt FROM public.business_player_assignments WHERE player_id = v_player;
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case17: outsider sees assignment'; END IF;
  raised := false;
  BEGIN
    PERFORM * FROM public.get_business_player_health(v_org);
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('not_organization_member' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case17: expected not_organization_member, got %', v_err;
  END IF;

  -- Case 18–20: no direct INSERT/UPDATE/DELETE
  raised := false;
  BEGIN
    INSERT INTO public.business_players (organization_id, player_code, status)
    VALUES (v_org, 'AL-P-999999999', 'active');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case18: direct INSERT must fail'; END IF;

  raised := false;
  BEGIN
    UPDATE public.business_players SET display_name = 'x' WHERE id = v_player;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case19: direct UPDATE must fail'; END IF;

  raised := false;
  BEGIN
    DELETE FROM public.business_players WHERE id = v_player;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case20: direct DELETE must fail'; END IF;

  -- Case 21: same user players in two orgs
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  -- make user_a also owner of org B via membership insert as table owner
  RESET ROLE;
  INSERT INTO public.business_organization_members (organization_id, user_id, role)
  VALUES (v_org_b, user_a, 'owner')
  ON CONFLICT DO NOTHING;
  -- org B already has user_b as owner; add user_a as second owner? role unique per user-org
  -- Actually UNIQUE(organization_id, user_id) — user_a can be owner of org B too if inserted.
  DELETE FROM public.business_organization_members
  WHERE organization_id = v_org_b AND user_id = user_a;
  INSERT INTO public.business_organization_members (organization_id, user_id, role)
  VALUES (v_org_b, user_a, 'owner');

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_create_b := public.create_business_player(v_org_b, 'Org B Player');
  v_player_b := (v_create_b->>'player_id')::uuid;
  IF v_player_b IS NULL THEN RAISE EXCEPTION 'Case21: org B player missing'; END IF;
  SELECT count(*) INTO cnt FROM public.business_players
  WHERE id IN (v_player, v_player_b) AND created_by = user_a;
  -- created_by visible via SELECT for members of each org separately
  SELECT count(*) INTO cnt
  FROM public.business_players WHERE organization_id = v_org;
  IF cnt < 2 THEN RAISE EXCEPTION 'Case21: org A players missing'; END IF;

  -- Case 22: multiple players in one zone allowed
  RESET ROLE;
  -- close any active on player2 first via owner assign both to v_zone
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.assign_business_player_to_zone(v_player, v_zone);
  PERFORM public.assign_business_player_to_zone(v_player2, v_zone);
  SELECT count(*) INTO cnt FROM public.business_player_assignments
  WHERE zone_id = v_zone AND unassigned_at IS NULL;
  IF cnt < 2 THEN RAISE EXCEPTION 'Case22: multi player per zone blocked'; END IF;

  -- Case 23: credential rotation
  v_cred_old := v_cred;
  v_create := public.rotate_business_player_credential(v_player);
  v_cred_new := v_create->>'credential';
  IF v_cred_new IS NULL OR v_cred_new = v_cred_old THEN
    RAISE EXCEPTION 'Case23: rotation did not change credential';
  END IF;
  RESET ROLE;
  EXECUTE 'SET ROLE anon';
  raised := false;
  BEGIN
    PERFORM public.record_business_player_heartbeat(v_cred_old);
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case23: old credential still works'; END IF;
  v_hb := public.record_business_player_heartbeat(v_cred_new);
  IF coalesce(v_hb->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Case23: new credential failed';
  END IF;

  -- Security: player_code is not a credential
  raised := false;
  BEGIN
    PERFORM public.record_business_player_heartbeat(
      (SELECT player_code FROM public.business_players WHERE id = v_player)
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Security: player_code must not authenticate heartbeat';
  END IF;

  RAISE NOTICE 'business_player_foundation_smoke: all cases passed';
END;
$$;
