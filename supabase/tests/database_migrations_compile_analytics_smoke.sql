BEGIN;

DO $$
DECLARE
  starts integer;
  listeners integer;
  overview jsonb;
BEGIN
  IF to_regprocedure('public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)') IS NULL
    OR to_regprocedure('public.admin_analytics_p2_summary(timestamptz,timestamptz,boolean,timestamptz,timestamptz,uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.author_stats_summary(uuid,timestamptz,timestamptz)') IS NULL
    OR to_regprocedure('public.analytics_owner_overview(timestamptz,timestamptz,boolean,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'required analytics function is missing';
  END IF;

  IF has_function_privilege('public', 'public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'analytics_product_event_facts grants are not hardened';
  END IF;

  INSERT INTO public.analytics_events (id, event_name, practice_id, occurred_at)
  VALUES
    ('11111111-1111-1111-1111-111111111111', 'audio_play_started', 'c3d63131-3ef4-4dbb-8888-0a5085a456b5', now()),
    ('22222222-2222-2222-2222-222222222222', 'audio_play_started', 'c3d63131-3ef4-4dbb-8888-0a5085a456b5', now());

  SELECT
    count(*) FILTER (WHERE event_name = 'audio_play_started'),
    count(DISTINCT visitor_key) FILTER (WHERE event_name = 'audio_play_started')
  INTO starts, listeners
  FROM public.analytics_product_event_facts(NULL, NULL, NULL, NULL, false)
  WHERE event_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  );

  IF starts <> 2 OR listeners <> 0 THEN
    RAISE EXCEPTION 'nullable visitor identity smoke failed: starts %, listeners %', starts, listeners;
  END IF;

  SELECT public.analytics_owner_overview(NULL, NULL, false, NULL, NULL, NULL, NULL)
  INTO overview;
  IF overview IS NULL THEN
    RAISE EXCEPTION 'analytics_owner_overview runtime smoke failed';
  END IF;
END
$$;

-- Out-of-order heartbeats must not re-credit media, and deleting the
-- source product, track, user, or author must not delete the fact.
DO $$
DECLARE
  v_author uuid := 'a1111111-1111-4111-8111-111111111111';
  v_user uuid := 'b2222222-2222-4222-8222-222222222222';
  v_practice uuid := 'c3333333-3333-4333-8333-333333333333';
  v_audio uuid := 'd4444444-4444-4444-8444-444444444444';
  v_key text := v_practice::text || ':' || v_audio::text || ':1000';
  v_t0 timestamptz := timestamptz '2026-09-26 12:00:00+00';
  v_accepted bigint;
  v_duplicate boolean;
  v_position bigint;
  v_seq bigint;
  v_reported timestamptz;
  v_audio_on_context uuid;
  v_total bigint;
  v_fact_practice uuid;
  v_fact_audio uuid;
  v_fact_author uuid;
  v_fact_user uuid;
  v_cascade integer;
  v_payload jsonb;
  v_platform bigint;
  v_platform_after bigint;
  v_platform_author bigint;
  v_ordinary_listeners integer;
  v_ordinary_starts integer;
BEGIN
  IF to_regprocedure('public.apply_playback_usage_heartbeat(uuid,text,bigint,uuid,text,uuid,uuid,uuid,bigint,bigint,numeric,text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'apply_playback_usage_heartbeat is missing';
  END IF;

  SELECT count(*)
  INTO v_cascade
  FROM pg_constraint AS c
  JOIN pg_class AS rel ON rel.oid = c.conrelid
  JOIN pg_namespace AS n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'playback_usage_facts'
    AND c.contype = 'f'
    AND c.confdeltype = 'c';

  IF v_cascade <> 0 THEN
    RAISE EXCEPTION 'playback_usage_facts must not use ON DELETE CASCADE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS rel ON rel.oid = c.conrelid
    JOIN pg_namespace AS n ON n.oid = rel.relnamespace
    JOIN pg_class AS foreign_rel ON foreign_rel.oid = c.confrelid
    WHERE n.nspname = 'public'
      AND rel.relname = 'playback_usage_facts'
      AND c.contype = 'f'
      AND foreign_rel.relname IN ('practices', 'audio_items', 'authors')
  ) THEN
    RAISE EXCEPTION 'playback_usage_facts must not reference practices, audio_items, or authors';
  END IF;

  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (v_user, 'playback-usage-smoke@example.com', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.authors (id, name, slug, access_status)
  VALUES (v_author, 'Проверка прослушивания', 'playback-usage-smoke', 'commercial');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class
  ) VALUES (
    v_practice, v_author, 'Playback Usage Smoke', 'playback-usage-smoke',
    'draft', true, 0, 'practice', 'practice'
  );

  INSERT INTO public.audio_items (id, practice_id, title, position, audio_path, duration_seconds)
  VALUES (v_audio, v_practice, 'Usage Track', 1, NULL, 60);

  -- 15s (seq 2) arrives before 10s (seq 1), then 20s (seq 3).
  SELECT accepted_ms, duplicate
  INTO v_accepted, v_duplicate
  FROM public.apply_playback_usage_heartbeat(
    'e5555555-5555-4555-8555-555555555552', v_key, 2, v_user, 'usage-smoke-anon',
    NULL, v_practice, v_audio, 15000, NULL, 1, 'advance', v_t0
  );
  IF v_accepted <> 0 OR v_duplicate THEN
    RAISE EXCEPTION 'seq2 baseline expected +0, got % duplicate %', v_accepted, v_duplicate;
  END IF;

  SELECT last_position_ms, last_sample_seq, last_reported_at, audio_item_id
  INTO v_position, v_seq, v_reported, v_audio_on_context
  FROM public.playback_usage_contexts
  WHERE listening_key = v_key;

  SELECT accepted_ms, duplicate
  INTO v_accepted, v_duplicate
  FROM public.apply_playback_usage_heartbeat(
    'e5555555-5555-4555-8555-555555555551', v_key, 1, v_user, 'usage-smoke-anon',
    NULL, v_practice, v_audio, 10000, NULL, 1, 'advance', v_t0 + interval '1 second'
  );
  IF v_accepted <> 0 OR v_duplicate THEN
    RAISE EXCEPTION 'late seq1 expected stale +0, got % duplicate %', v_accepted, v_duplicate;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.playback_usage_contexts
    WHERE listening_key = v_key
      AND (
        last_position_ms IS DISTINCT FROM v_position
        OR last_sample_seq IS DISTINCT FROM v_seq
        OR last_reported_at IS DISTINCT FROM v_reported
        OR audio_item_id IS DISTINCT FROM v_audio_on_context
        OR accepted_listened_ms <> 0
      )
  ) THEN
    RAISE EXCEPTION 'stale seq1 moved the playback baseline';
  END IF;

  SELECT accepted_ms, duplicate
  INTO v_accepted, v_duplicate
  FROM public.apply_playback_usage_heartbeat(
    'e5555555-5555-4555-8555-555555555553', v_key, 3, v_user, 'usage-smoke-anon',
    NULL, v_practice, v_audio, 20000, NULL, 1, 'advance', v_t0 + interval '5 seconds'
  );
  IF v_accepted <> 5000 OR v_duplicate THEN
    RAISE EXCEPTION 'seq3 expected 5000, got % duplicate %', v_accepted, v_duplicate;
  END IF;

  SELECT coalesce(sum(listened_ms), 0)
  INTO v_total
  FROM public.playback_usage_facts
  WHERE listening_key = v_key;
  IF v_total <> 5000 THEN
    RAISE EXCEPTION 'out-of-order delivery double-counted: sum %', v_total;
  END IF;

  SELECT accepted_ms, duplicate
  INTO v_accepted, v_duplicate
  FROM public.apply_playback_usage_heartbeat(
    'e5555555-5555-4555-8555-555555555553', v_key, 3, v_user, 'usage-smoke-anon',
    NULL, v_practice, v_audio, 20000, NULL, 1, 'advance', v_t0 + interval '5 seconds'
  );
  IF v_accepted <> 5000 OR NOT v_duplicate THEN
    RAISE EXCEPTION 'retry of seq3 was not idempotent: % duplicate %', v_accepted, v_duplicate;
  END IF;

  SELECT coalesce(sum(listened_ms), 0)
  INTO v_total
  FROM public.playback_usage_facts
  WHERE listening_key = v_key;
  IF v_total <> 5000 THEN
    RAISE EXCEPTION 'retry inserted another fact: sum %', v_total;
  END IF;

  SELECT practice_id, audio_item_id, author_id_snapshot, user_id
  INTO v_fact_practice, v_fact_audio, v_fact_author, v_fact_user
  FROM public.playback_usage_facts
  WHERE listening_key = v_key;

  -- Averages use listeners/starts from valid_from forward, including All.
  -- Ordinary period KPIs still count the earlier audio_play_started.
  UPDATE public.playback_usage_settings
  SET listening_time_valid_from = v_t0
  WHERE singleton;

  INSERT INTO public.analytics_events (
    id, event_name, practice_id, occurred_at, anonymous_session_id
  ) VALUES
    (
      'f6666666-6666-4666-8666-666666666661',
      'audio_play_started',
      v_practice,
      v_t0 - interval '1 day',
      'usage-before-valid'
    ),
    (
      'f6666666-6666-4666-8666-666666666662',
      'audio_play_started',
      v_practice,
      v_t0 + interval '1 minute',
      'usage-after-valid'
    );

  SELECT public.admin_analytics_listening_time(
    v_t0 - interval '2 days', v_t0 + interval '1 day', false, NULL, v_practice, NULL, NULL
  )
  INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 5000
    OR (v_payload ->> 'measured_listeners')::integer <> 1
    OR (v_payload ->> 'measured_play_starts')::integer <> 1
    OR (v_payload ->> 'partial')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'partial measured window wrong: %', v_payload;
  END IF;

  SELECT public.admin_analytics_listening_time(NULL, NULL, false, NULL, v_practice, NULL, NULL)
  INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 5000
    OR (v_payload ->> 'measured_listeners')::integer <> 1
    OR (v_payload ->> 'measured_play_starts')::integer <> 1
    OR (v_payload ->> 'partial')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'All measured window wrong: %', v_payload;
  END IF;

  SELECT
    (v_metrics ->> 'listeners')::integer,
    (v_metrics ->> 'play_starts')::integer
  INTO v_ordinary_listeners, v_ordinary_starts
  FROM (
    SELECT public.admin_analytics_p2_window_metrics(
      v_t0 - interval '2 days', v_t0 + interval '1 day', false, NULL, v_practice, NULL, NULL
    ) AS v_metrics
  ) AS ordinary;
  IF v_ordinary_listeners <> 2 OR v_ordinary_starts <> 2 THEN
    RAISE EXCEPTION
      'ordinary period KPIs changed: listeners % starts %',
      v_ordinary_listeners, v_ordinary_starts;
  END IF;

  SELECT (public.admin_analytics_listening_time(
    NULL, NULL, false, NULL, NULL, NULL, NULL
  ) ->> 'listened_ms')::bigint
  INTO v_platform;
  IF v_platform <> 5000 THEN
    RAISE EXCEPTION 'platform total before delete was %', v_platform;
  END IF;

  DELETE FROM public.audio_items WHERE id = v_audio;
  DELETE FROM public.practices WHERE id = v_practice;
  DELETE FROM public.authors WHERE id = v_author;
  DELETE FROM auth.users WHERE id = v_user;

  SELECT count(*)
  INTO v_total
  FROM public.playback_usage_facts
  WHERE listening_key = v_key;

  SELECT practice_id, audio_item_id, author_id_snapshot, user_id
  INTO v_fact_practice, v_fact_audio, v_fact_author, v_fact_user
  FROM public.playback_usage_facts
  WHERE listening_key = v_key;

  IF v_total <> 1
    OR v_fact_practice IS DISTINCT FROM v_practice
    OR v_fact_audio IS DISTINCT FROM v_audio
    OR v_fact_author IS DISTINCT FROM v_author
    OR v_fact_user IS NOT NULL
  THEN
    RAISE EXCEPTION
      'usage fact did not survive source deletion: count % practice % audio % author % user %',
      v_total, v_fact_practice, v_fact_audio, v_fact_author, v_fact_user;
  END IF;

  SELECT (public.admin_analytics_listening_time(
    NULL, NULL, false, NULL, NULL, NULL, NULL
  ) ->> 'listened_ms')::bigint
  INTO v_platform_after;
  SELECT (public.admin_analytics_listening_time(
    NULL, NULL, false, v_author, NULL, NULL, NULL
  ) ->> 'listened_ms')::bigint
  INTO v_platform_author;
  IF v_platform_after <> v_platform OR v_platform_author <> v_platform THEN
    RAISE EXCEPTION
      'platform total lost historical usage: before % after % author %',
      v_platform, v_platform_after, v_platform_author;
  END IF;
END
$$;

ROLLBACK;
