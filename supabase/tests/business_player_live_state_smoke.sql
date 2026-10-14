-- Isolated smoke for 20261231160000 (task c02fe282 real-1b, player live state). Rolls back.
-- Proves: three signals stay separate; cross-org owner cannot read; a device cannot forge
-- another device's state or another org's player; no direct table access; tracks are scoped.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
DO $$ BEGIN
  IF to_regprocedure('auth.role()') IS NULL THEN
    EXECUTE $f$CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      'SELECT NULLIF(current_setting(''request.jwt.claim.role'', true), '''')'$f$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC';
  END IF;
END $$;
CREATE TABLE pg_temp.stub_decisions (audio_item_id uuid, decision text);
GRANT SELECT ON pg_temp.stub_decisions TO PUBLIC;
CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('decision', coalesce((SELECT decision FROM pg_temp.stub_decisions d
    WHERE d.audio_item_id = p_audio_item_id), 'UNKNOWN'));
$$;
DO $$
DECLARE
  user_a uuid := gen_random_uuid(); user_b uuid := gen_random_uuid(); user_m uuid := gen_random_uuid(); user_n uuid := gen_random_uuid(); player_a2 uuid := gen_random_uuid(); res text;
  org_a uuid := gen_random_uuid(); org_b uuid := gen_random_uuid();
  loc_a uuid := gen_random_uuid(); loc_b uuid := gen_random_uuid();
  zone_a uuid := gen_random_uuid(); zone_b uuid := gen_random_uuid();
  player_a uuid := gen_random_uuid(); player_b uuid := gen_random_uuid();
  author_id uuid := gen_random_uuid(); practice_id uuid := gen_random_uuid();
  t_ok uuid := gen_random_uuid(); t_unk uuid := gen_random_uuid(); t_foreign uuid := gen_random_uuid();
  program_a uuid := gen_random_uuid(); program_b uuid := gen_random_uuid();
  dev1 text := repeat('a', 40); dev2 text := repeat('b', 40); devb text := repeat('c', 40);
  r record; n bigint;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (user_a, 'live-a@test.invalid'), (user_b, 'live-b@test.invalid'), (user_m, 'live-m@test.invalid'), (user_n, 'live-n@test.invalid');
  INSERT INTO public.authors(id, name, slug) VALUES (author_id, 'Живой', 'live-state-author');
  PERFORM set_config('audiolad.allow_practice_publish', 'on', true);
  INSERT INTO public.practices(id, author_id, title, slug, status, is_free, price, product_kind, publication_class, cover_url, catalog_visibility)
    VALUES (practice_id, author_id, 'Live release', 'live-state-release', 'published', true, 0, 'music', 'release', 'https://example.test/l.webp', 'listed');
  INSERT INTO public.audio_items(id, practice_id, title, position, music_track_code, duration_seconds, status)
  SELECT t, practice_id, 'Live ' || ord, ord, 'AL-T-8' || lpad(ord::text, 8, '0'), 2700, 'published'
  FROM unnest(ARRAY[t_ok, t_unk, t_foreign]) WITH ORDINALITY AS x(t, ord);
  INSERT INTO pg_temp.stub_decisions VALUES (t_ok, 'ELIGIBLE'), (t_foreign, 'ELIGIBLE');

  INSERT INTO public.business_organizations(id, name) VALUES (org_a, 'Live A'), (org_b, 'Live B');
  INSERT INTO public.business_organization_members(organization_id, user_id, role)
    VALUES (org_a, user_a, 'owner'), (org_b, user_b, 'owner'), (org_a, user_m, 'manager');
  INSERT INTO public.business_locations(id, organization_id, name, business_category, country_code, timezone)
    VALUES (loc_a, org_a, 'A', 'spa', 'RU', 'Europe/Moscow'), (loc_b, org_b, 'B', 'spa', 'RU', 'Europe/Moscow');
  INSERT INTO public.business_zones(id, location_id, name, is_default) VALUES (zone_a, loc_a, 'A', true), (zone_b, loc_b, 'B', true);
  INSERT INTO public.business_players(id, organization_id, player_code) VALUES (player_a, org_a, 'AL-P-800000001'), (player_b, org_b, 'AL-P-800000002'), (player_a2, org_a, 'AL-P-800000003');
  INSERT INTO public.business_player_assignments(player_id, zone_id, assigned_at)
    VALUES (player_a, zone_a, now() - interval '1 day'), (player_b, zone_b, now() - interval '1 day'), (player_a2, zone_a, now() - interval '2 days');
  INSERT INTO public.business_programs(id, organization_id, name, status) VALUES (program_a, org_a, 'A', 'active'), (program_b, org_b, 'B', 'active');
  INSERT INTO public.business_program_items(program_id, audio_item_id, position) VALUES (program_a, t_ok, 1), (program_a, t_unk, 2), (program_b, t_foreign, 1);
  INSERT INTO public.business_pilot_allowlist(user_id, organization_id) VALUES (user_a, org_a), (user_b, org_b);

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;

  -- NoDirectTableAccess: authenticated cannot read or write any of the three tables.
  BEGIN PERFORM 1 FROM public.business_player_device_heartbeat; RAISE EXCEPTION 'DirectRead heartbeat: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.business_player_playback_state; RAISE EXCEPTION 'DirectRead state: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.business_player_listening_history; RAISE EXCEPTION 'DirectRead history: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.business_player_playback_state(player_id, organization_id, playback_state, state_changed_at, reported_at)
    VALUES (player_a, org_a, 'playing', now(), now()); RAISE EXCEPTION 'DirectWrite: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.business_player_live_claim(player_a, dev1, now()); RAISE EXCEPTION 'ClaimHelperPrivate: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- HeartbeatOnly: connectivity recorded, no playback state, no history.
  PERFORM public.report_business_spa_player_heartbeat(player_a, dev1);
  SELECT * INTO r FROM public.get_business_owner_player_live_state(loc_a);
  IF r.last_seen_at IS NULL OR r.playback_state IS NOT NULL OR r.playing_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'HeartbeatOnly: %', r; END IF;

  -- UnconfirmedPlaying: state "playing" without audio advancing is not confirmation, not history.
  PERFORM public.report_business_spa_player_playback(player_a, dev1, 'playing', t_ok, false, NULL);
  SELECT * INTO r FROM public.get_business_owner_player_live_state(loc_a);
  IF r.playback_state <> 'playing' OR r.playing_confirmed_at IS NOT NULL OR r.current_track_title <> 'Live 1' THEN
    RAISE EXCEPTION 'UnconfirmedPlaying: %', r; END IF;

  -- ConfirmedPlaying: confirmation sets confirmed time and one history row; repeats extend it.
  PERFORM public.report_business_spa_player_playback(player_a, dev1, 'playing', t_ok, true, NULL);
  PERFORM public.report_business_spa_player_playback(player_a, dev1, 'playing', t_ok, true, NULL);
  SELECT * INTO r FROM public.get_business_owner_player_live_state(loc_a);
  IF r.playing_confirmed_at IS NULL THEN RAISE EXCEPTION 'ConfirmedPlaying: %', r; END IF;

  -- InvalidConfirm: confirmation is only valid for "playing" with a track.
  BEGIN PERFORM public.report_business_spa_player_playback(player_a, dev1, 'paused', t_ok, true, NULL);
    RAISE EXCEPTION 'InvalidConfirm: must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- OwnPlayerOnly: the session may write only its own player, not another player of the org.
  BEGIN PERFORM public.report_business_spa_player_heartbeat(player_a2, dev2);
    RAISE EXCEPTION 'OwnPlayerOnly heartbeat: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.report_business_spa_player_playback(player_a2, dev2, 'stopped', NULL, false, NULL);
    RAISE EXCEPTION 'OwnPlayerOnly state: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- TrackScope: UNKNOWN-rights and foreign tracks are dropped (track part only), never stored.
  res := public.report_business_spa_player_playback(player_a, dev1, 'playing', t_unk, false, NULL);
  IF res <> 'track_not_allowed' THEN RAISE EXCEPTION 'TrackUnknownRights: %', res; END IF;
  res := public.report_business_spa_player_playback(player_a, dev1, 'playing', t_foreign, false, NULL);
  IF res <> 'track_not_allowed' THEN RAISE EXCEPTION 'TrackForeignOrg: %', res; END IF;
  SELECT * INTO r FROM public.get_business_owner_player_live_state(loc_a);
  IF r.current_track_title IS NOT NULL OR r.playing_confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'TrackDropped: %', r; END IF;
  -- Back to the allowed, confirmed track.
  res := public.report_business_spa_player_playback(player_a, dev1, 'playing', t_ok, true, NULL);
  IF res <> 'ok' THEN RAISE EXCEPTION 'BackToOk: %', res; END IF;

  -- DeviceForge: a second device session cannot overwrite a live device's state.
  BEGIN PERFORM public.report_business_spa_player_playback(player_a, dev2, 'stopped', NULL, false, NULL);
    RAISE EXCEPTION 'DeviceForgeState: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.report_business_spa_player_heartbeat(player_a, dev2);
    RAISE EXCEPTION 'DeviceForgeHeartbeat: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- CrossOrgWrite: allowlisted owner of org B cannot write org A's player.
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  BEGIN PERFORM public.report_business_spa_player_heartbeat(player_a, devb);
    RAISE EXCEPTION 'CrossOrgWrite heartbeat: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.report_business_spa_player_playback(player_a, devb, 'stopped', NULL, false, NULL);
    RAISE EXCEPTION 'CrossOrgWrite state: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- CrossOrgRead: owner of org B cannot read org A's point.
  BEGIN PERFORM * FROM public.get_business_owner_player_live_state(loc_a);
    RAISE EXCEPTION 'CrossOrgRead: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Own point of org B: nothing reported yet -> no rows (neutral), no org A data.
  SELECT count(*) INTO n FROM public.get_business_owner_player_live_state(loc_b);
  IF n <> 0 THEN RAISE EXCEPTION 'OwnEmpty: %', n; END IF;

  -- NonMember: a user with no membership cannot read the point.
  PERFORM set_config('request.jwt.claim.sub', user_n::text, true);
  BEGIN PERFORM * FROM public.get_business_owner_player_live_state(loc_a);
    RAISE EXCEPTION 'NonMemberRead: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.report_business_spa_player_heartbeat(player_a, devb);
    RAISE EXCEPTION 'NonMemberWrite: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- NonPilotMember: org A manager (not allowlisted) cannot write, but may read as member.
  PERFORM set_config('request.jwt.claim.sub', user_m::text, true);
  BEGIN PERFORM public.report_business_spa_player_heartbeat(player_a, dev2);
    RAISE EXCEPTION 'NonPilotWrite: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO n FROM public.get_business_owner_player_live_state(loc_a);
  IF n <> 1 THEN RAISE EXCEPTION 'MemberRead (deduped, reporting player only): %', n; END IF;
  -- OwnerReadOk + NoUrl: owner sees title only, nothing URL-like.
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SELECT * INTO r FROM public.get_business_owner_player_live_state(loc_a);
  IF r.current_track_title <> 'Live 1' OR r.playing_confirmed_at IS NULL OR r.last_seen_at IS NULL THEN
    RAISE EXCEPTION 'OwnerReadOk: %', r; END IF;
  IF r::text ~* '(https?://|storage|/object/|token=)' THEN RAISE EXCEPTION 'NoUrl: %', r; END IF;

  -- Anonymous: no execute at all.
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN PERFORM * FROM public.get_business_owner_player_live_state(loc_a); RAISE EXCEPTION 'AnonRead: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.report_business_spa_player_heartbeat(player_a, dev1); RAISE EXCEPTION 'AnonWrite: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- Separation as stored: one heartbeat row, one state row, exactly one history row.
  SELECT count(*) INTO n FROM public.business_player_listening_history WHERE player_id = player_a;
  IF n <> 1 THEN RAISE EXCEPTION 'HistoryOneRow: %', n; END IF;
  SELECT count(*) INTO n FROM public.business_player_listening_history WHERE player_id = player_b;
  IF n <> 0 THEN RAISE EXCEPTION 'HistoryForeign: %', n; END IF;
  IF (SELECT playback_state FROM public.business_player_playback_state WHERE player_id = player_a) <> 'playing' THEN
    RAISE EXCEPTION 'StateUntouchedByForgers'; END IF;

  -- StaleTakeover: after 5 min without signal, a replacement device may take over.
  UPDATE public.business_player_device_heartbeat SET last_seen_at = now() - interval '6 minutes' WHERE player_id = player_a;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.report_business_spa_player_playback(player_a, dev2, 'paused', t_ok, false, NULL);
  RESET ROLE;
  -- Pause keeps confirmation timestamp of the same track but adds no history.
  SELECT count(*) INTO n FROM public.business_player_listening_history WHERE player_id = player_a;
  IF n <> 1 THEN RAISE EXCEPTION 'PauseNoHistory: %', n; END IF;
  -- PermissionExpiresMidTrack: heartbeat still refreshed, only the track part rejected.
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.report_business_spa_player_playback(player_a, dev2, 'playing', t_ok, true, NULL);
  RESET ROLE;
  UPDATE pg_temp.stub_decisions SET decision = 'UNKNOWN' WHERE audio_item_id = t_ok;
  UPDATE public.business_player_device_heartbeat SET last_seen_at = now() - interval '2 minutes' WHERE player_id = player_a;
  SET LOCAL ROLE authenticated;
  res := public.report_business_spa_player_playback(player_a, dev2, 'playing', t_ok, true, NULL);
  RESET ROLE;
  IF res <> 'track_not_allowed' THEN RAISE EXCEPTION 'ExpiredTrack result: %', res; END IF;
  IF (SELECT last_seen_at FROM public.business_player_device_heartbeat WHERE player_id = player_a) < now() THEN
    RAISE EXCEPTION 'ExpiredTrack: heartbeat not refreshed'; END IF;
  IF (SELECT audio_item_id FROM public.business_player_playback_state WHERE player_id = player_a) IS NOT NULL THEN
    RAISE EXCEPTION 'ExpiredTrack: track kept'; END IF;
  SELECT count(*) INTO n FROM public.business_player_listening_history WHERE player_id = player_a;
  IF n <> 1 THEN RAISE EXCEPTION 'ExpiredTrack: history %', n; END IF;
  RAISE NOTICE 'business_player_live_state_smoke: ok';
END $$;
ROLLBACK;
