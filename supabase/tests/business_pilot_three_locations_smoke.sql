-- Throwaway fixture only. Run via scripts/business-pilot-isolated.py, never on production.
-- Catalog ACL checks remain meaningful in single-user PG; this is not HTTP/RLS coverage.
SELECT public.check_test(NOT has_function_privilege('anon','public.activate_business_pilot_location(uuid,integer)','EXECUTE'), 'anon cannot activate');
SELECT public.check_test(has_function_privilege('authenticated','public.activate_business_pilot_location(uuid,integer)','EXECUTE'), 'authenticated activation uses owner check');
SELECT public.check_test(NOT has_function_privilege('authenticated','public.apply_business_player_usage_sample(uuid,uuid,uuid,bigint,uuid,bigint,bigint,numeric,text)','EXECUTE'), 'account cannot call private A3 helper');
SELECT public.check_test(has_function_privilege('anon','public.apply_business_point_usage_sample(text,uuid,uuid,bigint,uuid,bigint)','EXECUTE'), 'point token RPC available to paired anonymous devices');
DO $$ DECLARE token text; BEGIN
  FOREACH token IN ARRAY ARRAY['', 'invalid', repeat('0',64)] LOOP
    BEGIN
      PERFORM public.apply_business_point_usage_sample(token,gen_random_uuid(),gen_random_uuid(),1,gen_random_uuid(),0);
      RAISE EXCEPTION 'missing or unknown point token accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM public.apply_business_playback_usage_heartbeat(token,gen_random_uuid(),gen_random_uuid(),1,gen_random_uuid(),0);
      RAISE EXCEPTION 'missing or unknown player credential accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END; $$;
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
SET test.uid = '00000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE fixture AS SELECT public.create_business_organization_with_location('Пилот','Стритфуд 1','cafe','RU','Europe/Moscow') AS bootstrap;
GRANT SELECT ON fixture TO authenticated;
ALTER TABLE fixture ADD COLUMN org uuid, ADD COLUMN first_location uuid, ADD COLUMN second_location uuid, ADD COLUMN third_location uuid;
UPDATE fixture SET org=(bootstrap->>'organization_id')::uuid, first_location=(bootstrap->>'location_id')::uuid;
DO $$ BEGIN
  BEGIN PERFORM public.activate_business_pilot_location(org,2) FROM fixture; RAISE EXCEPTION 'unconfigured org accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END; $$;
UPDATE business_organizations SET pilot_location_limit=3 WHERE id=(SELECT org FROM fixture);
INSERT INTO business_location_sound_settings(location_id,organization_id,direction) SELECT first_location,org,'jazz' FROM fixture;
SET ROLE authenticated;
SELECT public.check_test((SELECT count(*)=1 FROM business_locations), 'single location regression');
RESET ROLE;
UPDATE fixture SET second_location=(public.activate_business_pilot_location(org,2)->>'location_id')::uuid;
SELECT public.check_test((SELECT count(*)=2 FROM business_locations), 'two locations only, third virtual');
SELECT public.check_test((SELECT (public.activate_business_pilot_location(org,2)->>'location_id')::uuid=second_location FROM fixture), 'retry same slot idempotent');
SELECT public.check_test((SELECT count(*)=2 FROM business_zones), 'one default zone per physical location');
SELECT public.check_test((SELECT count(*)=2 FROM business_location_sound_settings WHERE direction='jazz'), 'same existing atmosphere');
UPDATE business_location_sound_settings SET direction='calm' WHERE location_id=(SELECT second_location FROM fixture);
SELECT public.check_test((SELECT direction='jazz' FROM business_location_sound_settings WHERE location_id=(SELECT first_location FROM fixture)), 'atmosphere independent');
CREATE TEMP TABLE connections AS SELECT first_location AS location, public.create_business_point_pairing(first_location) AS pairing FROM fixture
UNION ALL SELECT second_location, public.create_business_point_pairing(second_location) FROM fixture;
ALTER TABLE connections ADD COLUMN session jsonb;
UPDATE connections SET session=public.redeem_business_point_pairing(pairing->>'code', 'fixture-'||location);
SELECT public.check_test((SELECT count(DISTINCT player_id)=2 FROM business_point_sessions), 'distinct assigned players');
SELECT public.report_business_point_player(session->>'token','heartbeat',NULL,NULL,false,NULL) FROM connections;
SELECT public.check_test((SELECT count(*)=2 FROM business_player_device_heartbeat), 'independent heartbeats');
INSERT INTO practices VALUES ('00000000-0000-4000-8000-000000000020','music',NULL);
INSERT INTO audio_items VALUES ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020','Liked jazz');
SELECT public.report_business_point_player(session->>'token','playback','playing','00000000-0000-4000-8000-000000000021',true,NULL) FROM connections;
SELECT public.report_business_point_player(session->>'token','playback','paused',NULL,false,NULL) FROM connections WHERE location=(SELECT first_location FROM fixture);
SELECT public.check_test((SELECT playback_state='playing' FROM business_player_playback_state WHERE player_id=(SELECT player_id FROM business_point_sessions WHERE location_id=(SELECT second_location FROM fixture))), 'first pause leaves second playing');
SELECT public.enqueue_business_point_command('00000000-0000-4000-8000-000000000030',first_location,'pause') FROM fixture;
SELECT public.check_test((SELECT count(*)=0 FROM connections c CROSS JOIN LATERAL public.claim_business_point_commands(c.session->>'token') WHERE c.location=(SELECT second_location FROM fixture)), 'second cannot claim first commands');
SELECT public.check_test((SELECT count(*)=1 FROM connections c CROSS JOIN LATERAL public.claim_business_point_commands(c.session->>'token') WHERE c.location=(SELECT first_location FROM fixture)), 'first receives command');
-- Same browser listening session UUID deliberately reused: A3 key also contains Player.
SELECT public.apply_business_point_usage_sample(session->>'token',gen_random_uuid(),'00000000-0000-4000-8000-000000000040',1,'00000000-0000-4000-8000-000000000021',0) FROM connections;
UPDATE playback_usage_contexts SET last_reported_at=clock_timestamp()-interval '5 seconds', created_at=clock_timestamp()-interval '10 seconds';
ALTER TABLE connections ADD COLUMN usage_event uuid DEFAULT gen_random_uuid();
SELECT public.apply_business_point_usage_sample(session->>'token',usage_event,'00000000-0000-4000-8000-000000000040',2,'00000000-0000-4000-8000-000000000021',5000) FROM connections;
SELECT public.apply_business_point_usage_sample(session->>'token',usage_event,'00000000-0000-4000-8000-000000000040',2,'00000000-0000-4000-8000-000000000021',5000) FROM connections;
SELECT public.check_test((SELECT count(DISTINCT location_id)=2 AND count(DISTINCT player_id)=2 AND sum(listened_ms)=10000 FROM playback_usage_facts), 'two independent media-time evidence streams');
SET test.deny='1';
DO $$ BEGIN
  BEGIN PERFORM public.apply_business_point_usage_sample(session->>'token',gen_random_uuid(),gen_random_uuid(),3,'00000000-0000-4000-8000-000000000021',6000) FROM connections; RAISE EXCEPTION 'UNKNOWN rights accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
SET test.deny='0';
SELECT public.revoke_business_point_sessions(first_location) FROM fixture;
SELECT public.check_test((SELECT public.business_point_session_alive(session->>'token') FROM connections WHERE location=(SELECT second_location FROM fixture)), 'revoke first leaves second connected');
DO $$ BEGIN
  BEGIN PERFORM public.apply_business_point_usage_sample(session->>'token',gen_random_uuid(),gen_random_uuid(),3,'00000000-0000-4000-8000-000000000021',6000) FROM connections WHERE location=(SELECT first_location FROM fixture); RAISE EXCEPTION 'revoked evidence accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
UPDATE fixture SET third_location=(public.activate_business_pilot_location(org,3)->>'location_id')::uuid;
DO $$ BEGIN
  BEGIN PERFORM public.activate_business_pilot_location(org,4) FROM fixture; RAISE EXCEPTION 'fourth slot accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END; $$;
SELECT public.check_test((SELECT count(*)=3 FROM business_locations), 'exactly three physical locations');
SET test.uid='00000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
-- Single-user Postgres bypasses RLS even under SET ROLE. Check its real predicate here;
-- row visibility with anon/authenticated HTTP sessions remains a staging gate.
SELECT public.check_test(NOT public.is_business_organization_member((SELECT org FROM fixture)), 'foreign membership rejected');
RESET ROLE;
DO $$ BEGIN
  BEGIN PERFORM public.activate_business_pilot_location(org,3) FROM fixture; RAISE EXCEPTION 'foreign activation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
SET test.uid='00000000-0000-4000-8000-000000000001';
INSERT INTO business_subscription_periods VALUES ('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000001',true,79900,now()+interval '30 days');
INSERT INTO business_location_subscription_bindings(order_id,location_id) SELECT '00000000-0000-4000-8000-000000000050',first_location FROM fixture;
DO $$ BEGIN
  BEGIN INSERT INTO business_location_subscription_bindings(order_id,location_id) SELECT '00000000-0000-4000-8000-000000000050',second_location FROM fixture; RAISE EXCEPTION 'one payment funded two points';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END; $$;
SELECT public.check_test(NOT has_table_privilege('authenticated','public.business_location_subscription_bindings','INSERT'), 'owner cannot forge payment');
SELECT public.check_test(NOT has_function_privilege('anon','public.apply_business_player_usage_sample(uuid,uuid,uuid,bigint,uuid,bigint,bigint,numeric,text)','EXECUTE'), 'private A3 helper');
-- Old machine credential path still works using the same internal A3 algorithm.
CREATE TEMP TABLE legacy AS SELECT public.create_business_player(org,'Legacy player') AS player FROM fixture;
SELECT public.assign_business_player_to_zone((player->>'player_id')::uuid,(SELECT id FROM business_zones WHERE location_id=(SELECT third_location FROM fixture))) FROM legacy;
SELECT public.apply_business_playback_usage_heartbeat(player->>'credential',gen_random_uuid(),gen_random_uuid(),1,'00000000-0000-4000-8000-000000000021',0) FROM legacy;
DO $$ BEGIN
  BEGIN INSERT INTO orders(user_id,order_kind,status) VALUES ('00000000-0000-4000-8000-000000000001','business_subscription','pending'); RAISE EXCEPTION 'pilot account checkout accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE business_location_subscription_bindings SET location_id=(SELECT second_location FROM fixture); RAISE EXCEPTION 'payment binding moved';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO business_locations(organization_id,name,business_category,country_code,timezone) SELECT org,'Fourth','cafe','RU','Europe/Moscow' FROM fixture; RAISE EXCEPTION 'direct fourth location insert accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END; $$;
INSERT INTO orders(user_id,order_kind,status) VALUES ('00000000-0000-4000-8000-000000000002','business_subscription','pending');
-- Reassign the second Player; its old device must not overwrite live state or evidence.
SELECT public.assign_business_player_to_zone((SELECT player_id FROM business_point_sessions WHERE location_id=(SELECT second_location FROM fixture)), (SELECT id FROM business_zones WHERE location_id=(SELECT third_location FROM fixture)));
DO $$ BEGIN
  BEGIN PERFORM public.report_business_point_player(session->>'token','heartbeat',NULL,NULL,false,NULL) FROM connections WHERE location=(SELECT second_location FROM fixture); RAISE EXCEPTION 'stale assignment heartbeat accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.apply_business_point_usage_sample(session->>'token',gen_random_uuid(),gen_random_uuid(),3,'00000000-0000-4000-8000-000000000021',6000) FROM connections WHERE location=(SELECT second_location FROM fixture); RAISE EXCEPTION 'stale assignment evidence accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
SELECT 'three-point pilot: PASS';
