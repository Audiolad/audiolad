-- Isolated scratch DB only. Synthetic users; never apply to production.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  user_manager uuid := gen_random_uuid();
  user_outsider uuid := gen_random_uuid();
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  loc_a uuid := gen_random_uuid();
  loc_b uuid := gen_random_uuid();
  zone_a uuid := gen_random_uuid();
  zone_b uuid := gen_random_uuid();
  player_a uuid := gen_random_uuid();
  player_b uuid := gen_random_uuid();
  author_id uuid := gen_random_uuid();
  practice_id uuid := gen_random_uuid();
  audio_id uuid := gen_random_uuid();
  program_a uuid := gen_random_uuid();
  program_b uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  fact_id uuid := gen_random_uuid();
  consumer_fact_id uuid := gen_random_uuid();
  start_time timestamptz := now() - interval '1 minute';
  table_name text;
  n bigint;
BEGIN
  INSERT INTO auth.users(id) VALUES (user_a), (user_b), (user_manager), (user_outsider);
  INSERT INTO public.authors(id, slug) VALUES (author_id, 'spa-smoke-author');
  INSERT INTO public.practices(id, author_id, slug) VALUES (practice_id, author_id, 'spa-smoke-track');
  INSERT INTO public.audio_items(id, practice_id) VALUES (audio_id, practice_id);
  INSERT INTO public.business_organizations(id, name) VALUES (org_a, 'SPA A'), (org_b, 'SPA B');
  INSERT INTO public.business_organization_members(organization_id, user_id, role)
    VALUES (org_a, user_a, 'owner'), (org_b, user_b, 'owner'), (org_a, user_manager, 'manager');
  INSERT INTO public.business_locations(id, organization_id, name, business_category, country_code, timezone)
    VALUES (loc_a, org_a, 'A', 'spa', 'AA', 'UTC'), (loc_b, org_b, 'B', 'spa', 'BB', 'UTC');
  INSERT INTO public.business_zones(id, location_id) VALUES (zone_a, loc_a), (zone_b, loc_b);
  INSERT INTO public.business_players(id, organization_id, player_code)
    VALUES (player_a, org_a, 'AL-P-000000001'), (player_b, org_b, 'AL-P-000000002');
  INSERT INTO public.business_player_assignments(player_id, zone_id, assigned_at)
    VALUES (player_a, zone_a, start_time - interval '1 hour'), (player_b, zone_b, start_time - interval '1 hour');
  INSERT INTO public.business_programs(id, organization_id, name)
    VALUES (program_a, org_a, 'A program'), (program_b, org_b, 'B program');
  INSERT INTO public.business_program_items(program_id, audio_item_id, position)
    VALUES (program_a, audio_id, 1), (program_b, audio_id, 1);
  INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, program_id, started_at, event, client_event_id)
    VALUES (player_b, zone_b, org_b, audio_id, program_b, start_time, 'start', gen_random_uuid());
  INSERT INTO public.business_pilot_allowlist(user_id, organization_id)
    VALUES (user_b, org_b), (user_outsider, org_a);

  -- NoAllowlist: membership alone gives no read or write access.
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH table_name IN ARRAY ARRAY['business_programs', 'business_program_items', 'business_pilot_allowlist', 'business_playback_log'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'NoAllowlist: unexpected rows in %', table_name; END IF;
  END LOOP;
  BEGIN
    INSERT INTO public.business_programs(organization_id, name, created_by) VALUES (org_a, 'Denied', user_a);
    RAISE EXCEPTION 'NoAllowlist: write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.business_program_items(program_id, audio_item_id, position, added_by) VALUES (program_a, audio_id, 2, user_a);
    RAISE EXCEPTION 'NoAllowlist: item write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, started_at, event, client_event_id)
      VALUES (player_a, zone_a, org_a, audio_id, start_time, 'start', gen_random_uuid());
    RAISE EXCEPTION 'NoAllowlist: log write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.business_pilot_allowlist(user_id, organization_id) VALUES (user_a, org_a);
    RAISE EXCEPTION 'SelfEnrollment: allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- AllowlistWithoutMembership: admission alone does not grant tenant access.
  PERFORM set_config('request.jwt.claim.sub', user_outsider::text, true);
  SET LOCAL ROLE authenticated;
  IF public.has_business_pilot_access(org_a) OR EXISTS (SELECT 1 FROM public.business_programs) THEN
    RAISE EXCEPTION 'AllowlistWithoutMembership: access allowed';
  END IF;
  RESET ROLE;
  INSERT INTO public.business_pilot_allowlist(user_id, organization_id) VALUES (user_a, org_a), (user_manager, org_a);
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;

  -- CrossOrganization: own allowlist and membership cannot read another tenant.
  SELECT count(*) INTO n FROM public.business_programs;
  IF n <> 1 THEN RAISE EXCEPTION 'CrossOrganization: programs visible'; END IF;
  SELECT count(*) INTO n FROM public.business_program_items;
  IF n <> 1 THEN RAISE EXCEPTION 'CrossOrganization: items visible'; END IF;
  SELECT count(*) INTO n FROM public.business_pilot_allowlist;
  IF n <> 1 THEN RAISE EXCEPTION 'CrossOrganization: allowlist visible'; END IF;
  IF EXISTS (SELECT 1 FROM public.business_playback_log) THEN RAISE EXCEPTION 'CrossOrganization: log visible'; END IF;
  BEGIN
    INSERT INTO public.business_programs(organization_id, name, created_by) VALUES (org_b, 'Denied', user_a);
    RAISE EXCEPTION 'CrossOrganization: program write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.business_programs SET name = 'Denied' WHERE id = program_b;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'CrossOrganization: update allowed'; END IF;

  -- Idempotency: repeated offline batch keeps the first row, not another usage fact.
  INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, program_id,
    started_at, ended_at, played_ms, event, client_event_id, offline, received_at)
  VALUES (player_a, zone_a, org_a, audio_id, program_a, start_time, start_time + interval '5 seconds',
    5000, 'complete', event_id, true, '2000-01-01') ON CONFLICT (player_id, client_event_id) DO NOTHING;
  INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, program_id,
    started_at, played_ms, event, client_event_id, offline)
  VALUES (player_a, zone_a, org_a, audio_id, program_a, start_time, 9000, 'complete', event_id, true)
    ON CONFLICT (player_id, client_event_id) DO NOTHING;
  SELECT count(*) INTO n FROM public.business_playback_log WHERE player_id = player_a AND client_event_id = event_id;
  IF n <> 1 OR NOT EXISTS (SELECT 1 FROM public.business_playback_log WHERE client_event_id = event_id
    AND played_ms = 5000 AND offline AND received_at >= now()) THEN
    RAISE EXCEPTION 'Idempotency: duplicate or overwritten event/server timestamp';
  END IF;
  BEGIN
    UPDATE public.business_playback_log SET played_ms = 0;
    RAISE EXCEPTION 'AppendOnly: update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.business_playback_log;
    RAISE EXCEPTION 'AppendOnly: delete allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, program_id, started_at, event, client_event_id)
    VALUES (player_a, zone_a, org_a, audio_id, program_b, start_time, 'error', gen_random_uuid());
    RAISE EXCEPTION 'ScopeValidation: foreign program accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'business_spa_program_scope_mismatch' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, started_at, event, client_event_id)
    VALUES (player_a, zone_b, org_a, audio_id, start_time, 'error', gen_random_uuid());
    RAISE EXCEPTION 'ScopeValidation: foreign zone accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'business_spa_player_scope_mismatch' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.business_program_items(program_id, audio_item_id, position, added_by)
      VALUES (program_a, audio_id, 2, user_a);
    RAISE EXCEPTION 'ProgramItemUnique: duplicate accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE public.business_programs SET organization_id = org_b WHERE id = program_a;
    RAISE EXCEPTION 'ImmutableScope: program moved';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'business_spa_program_organization_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.business_program_items(program_id, audio_item_id, position, added_by)
      VALUES (program_b, audio_id, 2, user_a);
    RAISE EXCEPTION 'CrossOrganization: item write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, started_at, event, client_event_id)
      VALUES (player_b, zone_b, org_b, audio_id, start_time, 'start', gen_random_uuid());
    RAISE EXCEPTION 'CrossOrganization: log write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  -- Player-scoped event keys allow another player to use the same event UUID.
  INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, started_at, event, client_event_id)
    VALUES (player_b, zone_b, org_b, audio_id, start_time, 'start', event_id);
  SELECT count(*) INTO n FROM public.business_playback_log WHERE client_event_id = event_id;
  IF n <> 2 THEN RAISE EXCEPTION 'Idempotency: event key must be scoped to player'; END IF;
  -- HistoricalAssignment: move the player, then receive a delayed old-zone event.
  UPDATE public.business_player_assignments SET unassigned_at = now() WHERE player_id = player_a;
  INSERT INTO public.business_zones(location_id, name) VALUES (loc_a, 'New SPA zone') RETURNING id INTO zone_b;
  INSERT INTO public.business_player_assignments(player_id, zone_id, assigned_at) VALUES (player_a, zone_b, now());
  SET LOCAL ROLE authenticated;
  INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, started_at, event, client_event_id, offline)
    VALUES (player_a, zone_a, org_a, audio_id, start_time, 'skip', gen_random_uuid(), true);
  BEGIN
    INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, started_at, event, client_event_id, offline)
      VALUES (player_a, zone_b, org_a, audio_id, start_time, 'skip', gen_random_uuid(), true);
    RAISE EXCEPTION 'HistoricalAssignment: event before assignment accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'business_spa_player_scope_mismatch' THEN RAISE; END IF;
  END;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.playback_usage_facts) THEN RAISE EXCEPTION 'CanonicalLedger: telemetry wrote usage'; END IF;

  -- CanonicalLedger: only matching existing business attribution can be linked.
  INSERT INTO public.playback_usage_facts(id, client_event_id, sample_seq, listening_key, practice_id,
    audio_item_id, listened_ms, position_ms, phase, occurred_at, usage_kind, organization_id, location_id, zone_id, player_id)
  VALUES (fact_id, gen_random_uuid(), 1, 'spa:business', practice_id, audio_id, 1000, 1000, 'advance', now(),
    'business', org_a, loc_a, zone_a, player_a);
  INSERT INTO public.playback_usage_facts(id, client_event_id, sample_seq, listening_key, practice_id,
    audio_item_id, listened_ms, position_ms, phase, occurred_at)
  VALUES (consumer_fact_id, gen_random_uuid(), 1, 'spa:consumer', practice_id, audio_id, 1000, 1000, 'advance', now());
  SET LOCAL ROLE authenticated;
  INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, usage_fact_id, started_at, event, client_event_id)
    VALUES (player_a, zone_a, org_a, audio_id, fact_id, start_time, 'start', gen_random_uuid());
  BEGIN
    INSERT INTO public.business_playback_log(player_id, zone_id, organization_id, audio_item_id, usage_fact_id, started_at, event, client_event_id)
    VALUES (player_a, zone_a, org_a, audio_id, consumer_fact_id, start_time, 'start', gen_random_uuid());
    RAISE EXCEPTION 'CanonicalLedger: consumer fact accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'business_spa_usage_fact_mismatch' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- ManagerRole: reuse existing owner/manager membership permissions.
  PERFORM set_config('request.jwt.claim.sub', user_manager::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.business_programs(organization_id, name, created_by) VALUES (org_a, 'Manager program', user_manager);
  UPDATE public.business_program_items SET excluded_at = now(), excluded_reason = 'Pilot curation' WHERE program_id = program_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'ManagerRole: item update denied'; END IF;
  RESET ROLE;

  -- DisabledAllowlist: revocation takes effect on all four tables.
  UPDATE public.business_pilot_allowlist SET enabled = false WHERE user_id = user_a;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH table_name IN ARRAY ARRAY['business_programs', 'business_program_items', 'business_pilot_allowlist', 'business_playback_log'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'DisabledAllowlist: unexpected rows in %', table_name; END IF;
  END LOOP;
  RESET ROLE;

  -- ServiceRole: unrestricted admission management and tenant reads.
  SET LOCAL ROLE service_role;
  UPDATE public.business_pilot_allowlist SET enabled = true WHERE user_id = user_a;
  SELECT count(*) INTO n FROM public.business_programs;
  IF n <> 3 THEN RAISE EXCEPTION 'ServiceRole: cross-tenant read denied'; END IF;
  RESET ROLE;

  -- NoRightsColumns: exact column contract excludes legal decisions and copied metadata.
  IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public'
    AND c.table_name IN ('business_programs', 'business_program_items', 'business_pilot_allowlist', 'business_playback_log')
    AND (c.column_name ~ '(rights|licens|eligib|grant|permission)' OR c.column_name IN ('audio_path', 'audio_url', 'music_track_code', 'duration_seconds'))) THEN
    RAISE EXCEPTION 'NoRightsColumns: rights or copied track metadata found';
  END IF;
  RAISE NOTICE 'business_spa_programs_smoke: ok';
END;
$$;
ROLLBACK;
