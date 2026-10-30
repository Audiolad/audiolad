-- Synthetic fixtures only, run by business-player-retention-isolated.py.
DO $$
DECLARE
  t timestamptz := statement_timestamp() - 400 * 24 * interval '1 hour';
  r record;
  days integer;
  before_live jsonb;
  after_live jsonb;
BEGIN
  INSERT INTO public.business_player_device_heartbeat VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', decode(repeat('ab',32),'hex'), now(), now());
  INSERT INTO public.business_player_playback_state VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'playing', NULL, NULL, now(), now(), now());
  SELECT jsonb_build_array(
    (SELECT jsonb_agg(h) FROM public.business_player_device_heartbeat h),
    (SELECT jsonb_agg(s) FROM public.business_player_playback_state s)) INTO before_live;
  INSERT INTO public.business_player_listening_history
    (player_id, organization_id, location_id, audio_item_id, first_confirmed_at, last_confirmed_at)
  SELECT '00000000-0000-0000-0000-000000000001'::uuid,
         '00000000-0000-0000-0000-000000000001'::uuid,
         '00000000-0000-0000-0000-000000000001'::uuid,
         '00000000-0000-0000-0000-000000000001'::uuid, t - interval '1 day', x
  FROM unnest(ARRAY[t - interval '1 microsecond', t, t + interval '1 microsecond', t - interval '1 hour', t - interval '2 hours']) x;
  SELECT * INTO r FROM public.cleanup_business_player_listening_history();
  IF r.candidates <> 0 OR r.deleted <> 0 OR (SELECT count(*) FROM public.business_player_listening_history) <> 5 THEN
    RAISE EXCEPTION 'disabled by default';
  END IF;
  SELECT * INTO r FROM public.cleanup_business_player_listening_history(false, true);
  IF r.candidates <> 0 OR r.deleted <> 0 OR (SELECT count(*) FROM public.business_player_listening_history) <> 5 THEN
    RAISE EXCEPTION 'kill switch overrides delete opt-in';
  END IF;
  SELECT * INTO r FROM public.cleanup_business_player_listening_history(true);
  IF r.candidates <> 3 OR r.deleted <> 0 OR (SELECT count(*) FROM public.business_player_listening_history) <> 5 THEN
    RAISE EXCEPTION 'dry-run must only count strict older candidates';
  END IF;
  SELECT * INTO r FROM public.cleanup_business_player_listening_history(true, true, 500, 20, 401);
  IF r.candidates <> 0 OR r.deleted <> 0
     OR r.cutoff <> statement_timestamp() - 401 * 24 * interval '1 hour' THEN
    RAISE EXCEPTION 'alternate retention must change cutoff and preserve younger rows';
  END IF;
  FOREACH days IN ARRAY ARRAY[NULL::integer, 0, -1, 29, 3651] LOOP
    BEGIN
      PERFORM public.cleanup_business_player_listening_history(true, true, 500, 20, days);
      RAISE EXCEPTION 'invalid retention days accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  FOREACH days IN ARRAY ARRAY[30, 3650] LOOP
    SELECT * INTO r FROM public.cleanup_business_player_listening_history(true, false, 500, 20, days);
    IF r.deleted <> 0 OR r.cutoff <> statement_timestamp() - days * 24 * interval '1 hour' THEN
      RAISE EXCEPTION 'valid retention boundary';
    END IF;
  END LOOP;
  SELECT * INTO r FROM public.cleanup_business_player_listening_history(true, true, 1, 2);
  IF r.deleted <> 2 OR r.batches <> 2 OR (SELECT count(*) FROM public.business_player_listening_history) <> 3 THEN
    RAISE EXCEPTION 'batch/loop limit';
  END IF;
  SELECT * INTO r FROM public.cleanup_business_player_listening_history(true, true);
  IF r.deleted <> 1 OR r.batches <> 1 THEN RAISE EXCEPTION 'remaining oldest row'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_player_listening_history WHERE last_confirmed_at = t)
     OR NOT EXISTS (SELECT 1 FROM public.business_player_listening_history WHERE last_confirmed_at = t + interval '1 microsecond') THEN
    RAISE EXCEPTION 'cutoff equality/newer boundary must survive even with old first confirmation';
  END IF;
  SELECT * INTO r FROM public.cleanup_business_player_listening_history(true, true);
  IF r.deleted <> 0 THEN RAISE EXCEPTION 'idempotency'; END IF;
  SELECT jsonb_build_array(
    (SELECT jsonb_agg(h) FROM public.business_player_device_heartbeat h),
    (SELECT jsonb_agg(s) FROM public.business_player_playback_state s)) INTO after_live;
  IF before_live IS DISTINCT FROM after_live THEN RAISE EXCEPTION 'live rows changed'; END IF;
  BEGIN
    PERFORM public.cleanup_business_player_listening_history(true, true, 501, 20);
    RAISE EXCEPTION 'invalid batch accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.cleanup_business_player_listening_history(true, true, 500, 21);
    RAISE EXCEPTION 'invalid loop accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.business_player_listening_history_retention_idx'::regclass AND indisvalid) THEN
    RAISE EXCEPTION 'retention index must be valid after migration reapply';
  END IF;
  IF has_function_privilege('anon', 'public.cleanup_business_player_listening_history(boolean,boolean,integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cleanup_business_player_listening_history(boolean,boolean,integer,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cleanup_business_player_listening_history(boolean,boolean,integer,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cleanup role permissions';
  END IF;
END;
$$;
SELECT 'business player retention: PASS';
