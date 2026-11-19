-- t1578u M1–M4: play-log protection. Runs in one transaction and rolls back.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_ctx uuid;
  v_fact uuid := gen_random_uuid();
  v_biz uuid := gen_random_uuid();
  v_n integer;
  v_ok boolean;
  v_row record;
  v_hour timestamptz := date_trunc('hour', now() - interval '5 hours', 'UTC');
  v_failed boolean;
BEGIN
  -- M1: insert time is forced to the server time.
  INSERT INTO public.analytics_sessions (anonymous_id) VALUES ('smoke-m1') RETURNING id INTO v_ctx;
  INSERT INTO public.playback_usage_facts (id, client_event_id, sample_seq, session_id, listening_key, practice_id,
    listened_ms, position_ms, phase, occurred_at, created_at)
  VALUES (v_fact, gen_random_uuid(), 1, v_ctx, 'smoke:m1', gen_random_uuid(), 1000, 1000, 'advance', now(),
    timestamptz '2020-01-01 00:00:00+00');
  IF (SELECT created_at FROM public.playback_usage_facts WHERE id = v_fact) <> now() THEN
    RAISE EXCEPTION 'M1: created_at not forced to now()';
  END IF;
  IF (SELECT client_offline FROM public.playback_usage_facts WHERE id = v_fact) THEN
    RAISE EXCEPTION 'M2: consumer fact flagged offline';
  END IF;

  -- M1: UPDATE / DELETE refused.
  v_failed := false;
  BEGIN
    UPDATE public.playback_usage_facts SET listened_ms = 999999 WHERE id = v_fact;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'M1: UPDATE allowed'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.playback_usage_facts SET user_id = gen_random_uuid() WHERE id = v_fact;
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'M1: user_id set to a value'; END IF;
  v_failed := false;
  BEGIN
    DELETE FROM public.playback_usage_facts WHERE id = v_fact;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'M1: DELETE allowed'; END IF;

  -- M1: the FK ON DELETE SET NULL still works (analytics session removed, fact kept).
  DELETE FROM public.analytics_sessions WHERE id = v_ctx;
  SELECT count(*) INTO v_n FROM public.playback_usage_facts WHERE id = v_fact AND session_id IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'M1: FK SET NULL broken'; END IF;

  IF has_table_privilege('service_role', 'public.playback_usage_facts', 'UPDATE')
     OR has_table_privilege('service_role', 'public.playback_usage_facts', 'DELETE')
     OR has_table_privilege('service_role', 'public.playback_usage_facts', 'TRUNCATE') THEN
    RAISE EXCEPTION 'M1: service_role keeps UPDATE/DELETE/TRUNCATE';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.playback_usage_facts', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.playback_usage_facts', 'SELECT') THEN
    RAISE EXCEPTION 'M1: service_role lost INSERT/SELECT';
  END IF;

  -- M2: the offline marker of the business offline RPC (transaction-local settings).
  PERFORM set_config('audiolad.usage_offline', '1', true);
  PERFORM set_config('audiolad.usage_device_at', '2026-11-19 08:00:00+00', true);
  INSERT INTO public.playback_usage_facts (id, client_event_id, sample_seq, listening_key, practice_id,
    listened_ms, position_ms, phase, occurred_at, usage_kind, organization_id, location_id, zone_id, player_id)
  VALUES (v_biz, gen_random_uuid(), 1, 'smoke:m2', gen_random_uuid(), 1000, 1000, 'advance', now(),
    'business', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
  PERFORM set_config('audiolad.usage_offline', '', true);
  PERFORM set_config('audiolad.usage_device_at', '', true);
  SELECT client_offline, device_occurred_at INTO v_row FROM public.playback_usage_facts WHERE id = v_biz;
  IF NOT v_row.client_offline OR v_row.device_occurred_at <> timestamptz '2026-11-19 08:00:00+00' THEN
    RAISE EXCEPTION 'M2: offline marker not stored';
  END IF;
  IF to_regprocedure('public.apply_business_point_usage_sample_offline(text, uuid, uuid, bigint, uuid, bigint, timestamptz)') IS NULL
     OR NOT has_function_privilege('anon', 'public.apply_business_point_usage_sample_offline(text, uuid, uuid, bigint, uuid, bigint, timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_business_player_usage_sample_at(uuid, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text, timestamptz)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'M2: offline RPC grants';
  END IF;
  -- Garbage token is refused before anything is written.
  v_failed := false;
  BEGIN
    PERFORM public.apply_business_point_usage_sample_offline('x', gen_random_uuid(), gen_random_uuid(), 1, gen_random_uuid(), 0, now());
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'M2: bad token accepted'; END IF;

  -- M3: facts of two past hours (written with the guard off, as history), then the chain.
  ALTER TABLE public.playback_usage_facts DISABLE TRIGGER playback_usage_facts_guard;
  INSERT INTO public.playback_usage_facts (client_event_id, sample_seq, listening_key, practice_id,
    listened_ms, position_ms, phase, occurred_at, created_at)
  SELECT gen_random_uuid(), g, 'smoke:m3', gen_random_uuid(), 5000, g * 5000, 'advance',
    v_hour + g * interval '1 minute', v_hour + g * interval '1 minute'
  FROM generate_series(1, 90) AS g;
  ALTER TABLE public.playback_usage_facts ENABLE TRIGGER playback_usage_facts_guard;
  -- Genesis is the hour of the oldest fact; only hours ended at least 1 h ago are sealed.
  v_n := public.seal_playback_usage_facts(1000);
  IF v_n < 3 THEN RAISE EXCEPTION 'M3: sealed % hours', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.playback_usage_fact_seals WHERE period_end > now() - interval '1 hour') THEN
    RAISE EXCEPTION 'M3: sealed an open hour';
  END IF;
  SELECT fact_count INTO v_n FROM public.playback_usage_fact_seals WHERE period_start = v_hour;
  IF v_n <> 59 THEN RAISE EXCEPTION 'M3: first hour count %', v_n; END IF;
  SELECT fact_count INTO v_n FROM public.playback_usage_fact_seals WHERE period_start = v_hour + interval '1 hour';
  IF v_n <> 31 THEN RAISE EXCEPTION 'M3: second hour count %', v_n; END IF;
  IF EXISTS (
    SELECT 1 FROM public.playback_usage_fact_seals a JOIN public.playback_usage_fact_seals b ON b.period_start = a.period_end
    WHERE b.prev_chain_sha256 <> a.chain_sha256
  ) THEN RAISE EXCEPTION 'M3: chain broken'; END IF;
  SELECT ok INTO v_ok FROM public.verify_playback_usage_fact_seal(v_hour);
  IF NOT v_ok THEN RAISE EXCEPTION 'M3: verify failed on untouched data'; END IF;
  IF public.seal_playback_usage_facts(1000) <> 0 THEN RAISE EXCEPTION 'M3: resealed'; END IF;

  -- A tampered fact (guard switched off by a superuser) is detected.
  ALTER TABLE public.playback_usage_facts DISABLE TRIGGER playback_usage_facts_guard;
  UPDATE public.playback_usage_facts SET listened_ms = 6000
    WHERE id = (SELECT id FROM public.playback_usage_facts WHERE listening_key = 'smoke:m3' ORDER BY created_at LIMIT 1);
  ALTER TABLE public.playback_usage_facts ENABLE TRIGGER playback_usage_facts_guard;
  SELECT ok INTO v_ok FROM public.verify_playback_usage_fact_seal(v_hour);
  IF v_ok THEN RAISE EXCEPTION 'M3: tampering not detected'; END IF;

  -- Seals are append-only.
  v_failed := false;
  BEGIN
    UPDATE public.playback_usage_fact_seals SET fact_count = 0 WHERE period_start = v_hour;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'M3: seal UPDATE allowed'; END IF;

  -- M4: registry insert works, update refused.
  INSERT INTO public.evidence_index_versions (version, built_at, engine_version, index_json_sha256, catalog_tracks,
    control_tracks, failed_tracks, tracks)
  VALUES ('20261119-120000-0000abcd', now(), 't1578u-2', repeat('a', 64), 1, 0, 0,
    '[{"code":"AL-T-000000001","kind":"catalog","sha256":"x"}]'::jsonb);
  v_failed := false;
  BEGIN
    UPDATE public.evidence_index_versions SET catalog_tracks = 2;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'M4: registry UPDATE allowed'; END IF;
  IF has_table_privilege('service_role', 'public.evidence_index_versions', 'UPDATE') THEN
    RAISE EXCEPTION 'M4: service_role may UPDATE the registry';
  END IF;

  RAISE NOTICE 'playback_log_protection_smoke: ok';
END;
$$;
-- M2 end-to-end: a paired point sends an offline sample with device time.
-- Rights are out of scope here: the eligibility resolver is stubbed inside this rolled-back transaction.
CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{"decision":"ELIGIBLE"}'::jsonb $$;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-0000000000a1');
INSERT INTO public.profiles (id, role) VALUES ('00000000-0000-4000-8000-0000000000a1', 'listener');
-- Seeded items are practices; one is relabelled as music for this rolled-back run.
UPDATE public.practices SET product_kind = 'music'
  WHERE id = (SELECT practice_id FROM public.audio_items ORDER BY id LIMIT 1);
SET LOCAL session_replication_role = origin;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
CREATE TEMP TABLE m2_fx AS
  SELECT public.create_business_organization_with_location('Смоук','Точка 1','cafe','RU','Europe/Moscow') AS b;
CREATE TEMP TABLE m2_cn AS SELECT public.create_business_point_pairing((b->>'location_id')::uuid) AS p FROM m2_fx;
ALTER TABLE m2_cn ADD COLUMN s jsonb;
UPDATE m2_cn SET s = public.redeem_business_point_pairing(p->>'code', 'fixture-m2');
DO $$
DECLARE
  v_token text := (SELECT s->>'token' FROM m2_cn);
  v_item uuid := (SELECT id FROM public.audio_items ORDER BY id LIMIT 1);
  v_ps uuid := '00000000-0000-4000-8000-0000000000b1';
  v_res jsonb;
  v_dev timestamptz;
  v_row record;
BEGIN
  IF v_token IS NULL OR v_item IS NULL THEN RAISE EXCEPTION 'M2: fixture incomplete'; END IF;
  v_res := public.apply_business_point_usage_sample_offline(v_token, gen_random_uuid(), v_ps, 1, v_item, 0, clock_timestamp());
  UPDATE public.playback_usage_contexts
    SET last_reported_at = clock_timestamp() - interval '20 seconds', created_at = clock_timestamp() - interval '30 seconds'
    WHERE listening_key LIKE 'business:%:' || v_ps::text;
  -- Plausible device time (after the last report, in the past) is used as occurred_at.
  v_dev := date_trunc('milliseconds', clock_timestamp() - interval '10 seconds');
  v_res := public.apply_business_point_usage_sample_offline(v_token, gen_random_uuid(), v_ps, 2, v_item, 10000, v_dev);
  IF NOT (v_res->>'device_time_used')::boolean THEN RAISE EXCEPTION 'M2: plausible device time ignored: %', v_res; END IF;
  SELECT occurred_at, client_offline, device_occurred_at INTO v_row
    FROM public.playback_usage_facts WHERE usage_kind = 'business' AND sample_seq = 2
      AND listening_key LIKE 'business:%:' || v_ps::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'M2: offline fact not written: %', v_res; END IF;
  IF v_row.occurred_at <> v_dev OR NOT v_row.client_offline OR v_row.device_occurred_at <> v_dev THEN
    RAISE EXCEPTION 'M2: offline fact fields % / %', v_row, v_dev;
  END IF;
  -- Device time in the future is not trusted.
  v_res := public.apply_business_point_usage_sample_offline(v_token, gen_random_uuid(), v_ps, 3, v_item, 12000,
    clock_timestamp() + interval '1 hour');
  IF (v_res->>'device_time_used')::boolean THEN RAISE EXCEPTION 'M2: future device time used'; END IF;
  -- Device time before the last report is not trusted either.
  v_res := public.apply_business_point_usage_sample_offline(v_token, gen_random_uuid(), v_ps, 4, v_item, 14000, v_dev);
  IF (v_res->>'device_time_used')::boolean THEN RAISE EXCEPTION 'M2: stale device time used'; END IF;
  IF current_setting('audiolad.usage_offline', true) IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'M2: offline marker leaked';
  END IF;
  RAISE NOTICE 'playback_log_protection_smoke: offline ok';
END;
$$;
-- TRUNCATE outside the DO block (statement trigger).
SAVEPOINT t;
DO $$ BEGIN
  BEGIN
    EXECUTE 'TRUNCATE public.playback_usage_facts CASCADE';
    RAISE EXCEPTION 'M1: TRUNCATE allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
