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

-- Author dashboard listening time uses the same facts, keyed only by
-- author_id_snapshot, without rewriting ordinary author KPI counts.
DO $$
DECLARE
  v_author_a uuid := 'a8111111-1111-4111-8111-111111111181';
  v_author_b uuid := 'a8222222-2222-4222-8222-222222222182';
  v_practice uuid := 'c8111111-1111-4111-8111-111111111181';
  v_deleted uuid := 'c8222222-2222-4222-8222-222222222182';
  v_practice_b uuid := 'c8333333-3333-4333-8333-333333333183';
  v_human uuid := 'd8111111-1111-4111-8111-111111111181';
  v_auth uuid := 'd8222222-2222-4222-8222-222222222182';
  v_member uuid := 'd8333333-3333-4333-8333-333333333183';
  v_pdel_user uuid := 'd8444444-8444-4444-8444-444444444184';
  v_staff_session uuid := 'e1111111-1111-4111-8111-111111111111';
  v_valid timestamptz := timestamptz '2026-09-26 00:00:00+03';
  v_from timestamptz := timestamptz '2026-09-24 00:00:00+03';
  v_to timestamptz := timestamptz '2026-09-28 00:00:00+03';
  v_payload jsonb;
  v_other jsonb;
  v_series jsonb;
  v_products jsonb;
  v_plays integer;
  v_plays_after integer;
  v_slug_sum bigint;
  v_all_rows bigint;
BEGIN
  IF to_regprocedure('public.author_stats_listening_summary(uuid,timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'author_stats_listening_summary is missing';
  END IF;

  IF has_function_privilege('anon', 'public.author_stats_listening_summary(uuid,timestamptz,timestamptz)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.author_stats_listening_summary(uuid,timestamptz,timestamptz)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.author_stats_listening_summary(uuid,timestamptz,timestamptz)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'author listening summary grants are not hardened';
  END IF;

  UPDATE public.playback_usage_settings
  SET listening_time_valid_from = v_valid
  WHERE singleton;

  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (v_human, 'author-listen-human@example.com', now()),
    (v_auth, 'author-listen-auth@example.com', now()),
    (v_member, 'author-listen-member@example.com', now()),
    (v_pdel_user, 'author-listen-deleted@example.com', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.authors (id, name, slug, access_status) VALUES
    (v_author_a, 'Автор Прослушивание А', 'author-listen-a', 'commercial'),
    (v_author_b, 'Автор Прослушивание Б', 'author-listen-b', 'commercial');

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_a, v_member, 'owner');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class
  ) VALUES
    (v_practice, v_author_a, 'Current', 'listen-current', 'draft', true, 0, 'practice', 'practice'),
    (v_deleted, v_author_a, 'Soon deleted', 'listen-deleted', 'draft', true, 0, 'practice', 'practice'),
    (v_practice_b, v_author_b, 'Author B', 'listen-b', 'draft', true, 0, 'practice', 'practice');

  INSERT INTO public.analytics_sessions
    (id, anonymous_id, is_staff, is_test, is_bot, traffic_class)
  VALUES
    (v_staff_session, 'listener-staff', true, false, false, 'staff');

  INSERT INTO public.analytics_events
    (id, event_name, practice_id, user_id, anonymous_session_id, session_id, occurred_at, is_staff, is_test, is_bot, traffic_class)
  VALUES
    ('f1111111-1111-4111-8111-111111111101', 'audio_play_started', v_practice, v_human, 'listener-human', NULL, timestamptz '2026-09-25 12:00:00+03', false, false, false, 'human'),
    ('f1111111-1111-4111-8111-111111111102', 'audio_play_started', v_practice, v_human, 'listener-human', NULL, timestamptz '2026-09-26 10:00:00+03', false, false, false, 'human'),
    ('f1111111-1111-4111-8111-111111111103', 'audio_play_started', v_practice, NULL, 'listener-anon', NULL, timestamptz '2026-09-26 11:00:00+03', false, false, false, 'human'),
    ('f1111111-1111-4111-8111-111111111104', 'audio_play_started', v_practice, v_auth, 'listener-auth', NULL, timestamptz '2026-09-26 12:00:00+03', false, false, false, 'human'),
    ('f1111111-1111-4111-8111-111111111105', 'audio_play_started', v_deleted, v_pdel_user, 'listener-deleted', NULL, timestamptz '2026-09-26 13:00:00+03', false, false, false, 'human'),
    ('f1111111-1111-4111-8111-111111111106', 'audio_play_started', v_practice, v_member, 'listener-member', NULL, timestamptz '2026-09-26 14:00:00+03', false, false, false, 'human'),
    ('f1111111-1111-4111-8111-111111111107', 'audio_play_started', v_practice, NULL, 'listener-staff', v_staff_session, timestamptz '2026-09-26 15:00:00+03', true, false, false, 'staff'),
    ('f1111111-1111-4111-8111-111111111108', 'audio_play_started', v_practice_b, v_human, 'listener-human', NULL, timestamptz '2026-09-26 16:00:00+03', false, false, false, 'human');

  INSERT INTO public.playback_usage_facts
    (client_event_id, sample_seq, listening_key, session_id, user_id, anonymous_id, practice_id, listened_ms, position_ms, phase, occurred_at, author_id_snapshot)
  VALUES
    ('91111111-1111-4111-8111-111111111101', 1, 'author-listen-anon', NULL, NULL, 'listener-anon', v_practice, 1000, 1000, 'advance', timestamptz '2026-09-26 11:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111102', 1, 'author-listen-auth', NULL, v_auth, 'listener-auth', v_practice, 2000, 2000, 'advance', timestamptz '2026-09-26 12:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111103', 1, 'author-listen-deleted', NULL, v_pdel_user, 'listener-deleted', v_deleted, 4000, 4000, 'advance', timestamptz '2026-09-26 13:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111104', 1, 'author-listen-member', NULL, v_member, 'listener-member', v_practice, 50000, 50000, 'advance', timestamptz '2026-09-26 14:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111105', 1, 'author-listen-staff', v_staff_session, NULL, 'listener-staff', v_practice, 80000, 80000, 'advance', timestamptz '2026-09-26 15:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111106', 1, 'author-listen-test', NULL, NULL, 'test-listener', v_practice, 90000, 90000, 'advance', timestamptz '2026-09-26 15:30:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111107', 1, 'author-listen-b', NULL, v_human, 'listener-human', v_practice_b, 9000, 9000, 'advance', timestamptz '2026-09-26 16:00:00+03', v_author_b);

  SELECT (public.author_stats_summary(v_author_a, v_from, v_to) ->> 'plays')::int
  INTO v_plays;

  SELECT public.author_stats_listening_summary(v_author_a, v_from, v_to) INTO v_payload;
  IF v_plays <> 5
    OR (v_payload ->> 'listened_ms')::bigint <> 7000
    OR (v_payload ->> 'measured_listeners')::integer <> 4
    OR (v_payload ->> 'measured_play_starts')::integer <> 4
    OR (v_payload ->> 'average_listen_per_start_ms')::bigint <> 1750
    OR (v_payload ->> 'partial')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'author partial window wrong: plays % listening %', v_plays, v_payload;
  END IF;

  SELECT public.author_stats_listening_summary(v_author_a, NULL, NULL) INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 7000
    OR (v_payload ->> 'measured_play_starts')::integer <> 4
    OR (v_payload ->> 'partial')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'author All window wrong: %', v_payload;
  END IF;

  SELECT public.author_stats_listening_summary(
    v_author_a, v_valid - interval '3 days', v_valid
  ) INTO v_payload;
  IF v_payload -> 'listened_ms' IS DISTINCT FROM 'null'::jsonb
    OR (v_payload ->> 'unmeasured')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'author pre-metering window was not unmeasured: %', v_payload;
  END IF;

  SELECT public.author_stats_listening_summary(v_author_b, NULL, NULL) INTO v_other;
  IF (v_other ->> 'listened_ms')::bigint <> 9000 THEN
    RAISE EXCEPTION 'author B saw another author: %', v_other;
  END IF;

  SELECT public.author_stats_listening_timeseries(
    v_author_a,
    timestamptz '2026-09-25 00:00:00+03',
    timestamptz '2026-09-27 00:00:00+03'
  ) INTO v_series;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_series -> 'points') AS p(point)
    WHERE p.point ->> 'date' = '2026-09-25'
      AND jsonb_typeof(p.point -> 'listened_ms') = 'null'
  ) OR (
    SELECT (p.point ->> 'listened_ms')::bigint
    FROM jsonb_array_elements(v_series -> 'points') AS p(point)
    WHERE p.point ->> 'date' = '2026-09-26'
  ) <> 7000 THEN
    RAISE EXCEPTION 'author timeseries before valid_from was not unmeasured: %', v_series;
  END IF;

  SELECT public.author_stats_listening_products(v_author_a, NULL, NULL) INTO v_products;
  SELECT coalesce(sum((row ->> 'listened_ms')::bigint), 0)
  INTO v_slug_sum
  FROM jsonb_array_elements(v_products -> 'rows') AS row
  WHERE row ->> 'product_slug' IS NOT NULL;
  IF v_slug_sum <> 7000 OR (
    SELECT coalesce(sum((row ->> 'listened_ms')::bigint), 0)
    FROM jsonb_array_elements(v_products -> 'rows') AS row
    WHERE row ->> 'product_slug' = 'listen-current'
  ) <> 3000 THEN
    RAISE EXCEPTION 'author product breakdown mismatch: %', v_products;
  END IF;

  INSERT INTO public.playback_usage_facts
    (client_event_id, sample_seq, listening_key, user_id, anonymous_id, practice_id, listened_ms, position_ms, phase, occurred_at, author_id_snapshot)
  VALUES
    ('91111111-1111-4111-8111-111111111108', 1, 'author-listen-snapshot', v_human, 'listener-human', v_practice_b, 7000, 7000, 'advance', timestamptz '2026-09-26 17:00:00+03', v_author_a);

  SELECT (public.author_stats_summary(v_author_a, v_from, v_to) ->> 'plays')::int
  INTO v_plays_after;
  SELECT public.author_stats_listening_summary(v_author_a, NULL, NULL) INTO v_payload;
  SELECT public.author_stats_listening_summary(v_author_b, NULL, NULL) INTO v_other;
  IF v_plays_after <> v_plays
    OR (v_payload ->> 'listened_ms')::bigint <> 14000
    OR (v_other ->> 'listened_ms')::bigint <> 9000
    OR (v_payload ->> 'averages_withheld')::boolean IS NOT TRUE
    OR v_payload -> 'measured_play_starts' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'average_listen_per_start_ms' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'average_listen_per_listener_ms' IS DISTINCT FROM 'null'::jsonb
  THEN
    RAISE EXCEPTION 'snapshot attribution or ordinary plays changed: plays % -> % A % B %',
      v_plays, v_plays_after, v_payload, v_other;
  END IF;

  DELETE FROM public.practices WHERE id = v_deleted;

  SELECT public.author_stats_listening_summary(v_author_a, NULL, NULL) INTO v_payload;
  SELECT public.author_stats_listening_products(v_author_a, NULL, NULL) INTO v_products;
  SELECT coalesce(sum((row ->> 'listened_ms')::bigint), 0)
  INTO v_slug_sum
  FROM jsonb_array_elements(v_products -> 'rows') AS row
  WHERE row ->> 'product_slug' IS NOT NULL;
  SELECT coalesce(sum((row ->> 'listened_ms')::bigint), 0)
  INTO v_all_rows
  FROM jsonb_array_elements(v_products -> 'rows') AS row;
  IF (v_payload ->> 'listened_ms')::bigint <> 14000
    OR v_slug_sum <> 3000
    OR v_all_rows <> 14000
    OR (v_payload ->> 'averages_withheld')::boolean IS NOT TRUE
    OR v_payload -> 'average_listen_per_start_ms' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'measured_listeners' IS DISTINCT FROM 'null'::jsonb
  THEN
    RAISE EXCEPTION 'deleted practice left the author total: summary % products %', v_payload, v_products;
  END IF;
END
$$;

-- Rolling admin listening cards: one bounded SUM, no denominator scan.
-- A window that ends at or before valid_from is JSON null, not zero.
DO $$
DECLARE
  v_practice uuid := 'c9111111-1111-4111-8111-111111111191';
  v_other uuid := 'c9222222-2222-4222-8222-222222222192';
  v_author uuid := 'a9111111-1111-4111-8111-111111111191';
  v_end timestamptz := timestamptz '2026-10-07 14:16:00+03';
  v_valid timestamptz := timestamptz '2026-08-01 00:00:00+03';
  v_payload jsonb;
  v_def text;
BEGIN
  IF to_regprocedure('public.admin_analytics_listening_time_windows(timestamptz,boolean,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'admin_analytics_listening_time_windows is missing';
  END IF;

  IF has_function_privilege('anon', 'public.admin_analytics_listening_time_windows(timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_analytics_listening_time_windows(timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('public', 'public.admin_analytics_listening_time_windows(timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_analytics_listening_time_windows(timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'listening window grants are not hardened';
  END IF;

  v_def := pg_get_functiondef('public.admin_analytics_listening_time_windows(timestamptz,boolean,uuid,uuid,text,text)'::regprocedure);
  IF position('admin_analytics_p2_window_metrics' in v_def) > 0
    OR position('analytics_events' in v_def) > 0
  THEN
    RAISE EXCEPTION 'listening windows must not scan denominators or analytics_events';
  END IF;

  UPDATE public.playback_usage_settings
  SET listening_time_valid_from = v_valid
  WHERE singleton;

  INSERT INTO public.playback_usage_facts
    (client_event_id, sample_seq, listening_key, anonymous_id, practice_id, listened_ms, position_ms, phase, occurred_at, author_id_snapshot)
  VALUES
    ('92111111-1111-4111-8111-111111111201', 1, 'listen-window-current', 'listen-window-a', v_practice, 263580000, 263580000, 'advance', v_end - interval '1 day', v_author),
    ('92111111-1111-4111-8111-111111111202', 1, 'listen-window-prev', 'listen-window-b', v_practice, 5000, 5000, 'advance', v_end - interval '10 days', v_author),
    ('92111111-1111-4111-8111-111111111203', 1, 'listen-window-other', 'listen-window-c', v_other, 9000, 9000, 'advance', v_end - interval '1 day', v_author),
    ('92111111-1111-4111-8111-111111111204', 1, 'listen-window-old', 'listen-window-d', v_practice, 8000, 8000, 'advance', v_valid - interval '2 days', v_author);

  SELECT public.admin_analytics_listening_time_windows(
    v_end, false, NULL, v_practice, NULL, NULL
  )
  INTO v_payload;

  IF (v_payload ->> 'end')::timestamptz IS DISTINCT FROM v_end
    OR (v_payload -> 'week' ->> 'from')::timestamptz IS DISTINCT FROM v_end - interval '7 days'
    OR (v_payload -> 'week_prev' ->> 'to')::timestamptz IS DISTINCT FROM v_end - interval '7 days'
    OR (v_payload -> 'week_prev' ->> 'from')::timestamptz IS DISTINCT FROM v_end - interval '14 days'
    OR (v_payload -> 'month' ->> 'from')::timestamptz IS DISTINCT FROM v_end - interval '30 days'
    OR (v_payload -> 'month_prev' ->> 'from')::timestamptz IS DISTINCT FROM v_end - interval '60 days'
    OR (v_payload -> 'month_prev' ->> 'to')::timestamptz IS DISTINCT FROM v_end - interval '30 days'
  THEN
    RAISE EXCEPTION 'listening window bounds drifted: %', v_payload;
  END IF;

  IF (v_payload -> 'week' ->> 'listened_ms')::bigint <> 263580000
    OR (v_payload -> 'week' ->> 'partial')::boolean
    OR (v_payload -> 'week' ->> 'unmeasured')::boolean
    OR (v_payload -> 'week_prev' ->> 'listened_ms')::bigint <> 5000
    OR (v_payload -> 'week_prev' ->> 'partial')::boolean
    OR (v_payload -> 'week_prev' ->> 'unmeasured')::boolean
    OR (v_payload -> 'month' ->> 'listened_ms')::bigint <> 263585000
    OR (v_payload -> 'month' ->> 'partial')::boolean
    OR (v_payload -> 'month_prev' ->> 'listened_ms')::bigint <> 0
    OR (v_payload -> 'month_prev' ->> 'unmeasured')::boolean
    OR (v_payload -> 'month_prev' ->> 'partial')::boolean
  THEN
    RAISE EXCEPTION 'filtered listening windows wrong: %', v_payload;
  END IF;

  -- Exact 7/30-day rolling cards skip denominators. A calendar-length window does not.
  SELECT public.admin_analytics_listening_time(
    v_end - interval '7 days', v_end, false, NULL, v_practice, NULL, NULL
  )
  INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 263580000
    OR (v_payload ->> 'partial')::boolean
    OR (v_payload ->> 'unmeasured')::boolean
    OR v_payload -> 'measured_listeners' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'measured_play_starts' IS DISTINCT FROM 'null'::jsonb
  THEN
    RAISE EXCEPTION 'exact 7-day total called denominators: %', v_payload;
  END IF;

  SELECT public.admin_analytics_listening_time(
    v_end - interval '30 days', v_end, false, NULL, v_practice, NULL, NULL
  )
  INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 263585000
    OR v_payload -> 'measured_listeners' IS DISTINCT FROM 'null'::jsonb
  THEN
    RAISE EXCEPTION 'exact 30-day total called denominators: %', v_payload;
  END IF;

  SELECT public.admin_analytics_listening_time(
    v_end - interval '7 days' - interval '1 minute', v_end, false, NULL, v_practice, NULL, NULL
  )
  INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 263580000
    OR (v_payload ->> 'measured_listeners')::integer IS DISTINCT FROM 0
    OR (v_payload ->> 'measured_play_starts')::integer IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION 'calendar-length window dropped denominators: %', v_payload;
  END IF;

  UPDATE public.playback_usage_settings
  SET listening_time_valid_from = v_end - interval '20 days'
  WHERE singleton;

  SELECT public.admin_analytics_listening_time_windows(
    v_end, false, v_author, v_practice, NULL, NULL
  )
  INTO v_payload;

  IF (v_payload -> 'week' ->> 'listened_ms')::bigint <> 263580000
    OR (v_payload -> 'week' ->> 'partial')::boolean
    OR (v_payload -> 'week_prev' ->> 'listened_ms')::bigint <> 5000
    OR (v_payload -> 'week_prev' ->> 'partial')::boolean
    OR (v_payload -> 'week_prev' ->> 'unmeasured')::boolean
    OR (v_payload -> 'month' ->> 'partial')::boolean IS NOT TRUE
    OR (v_payload -> 'month' ->> 'listened_ms')::bigint <> 263585000
    OR (v_payload -> 'month_prev' ->> 'unmeasured')::boolean IS NOT TRUE
    OR v_payload -> 'month_prev' -> 'listened_ms' IS DISTINCT FROM 'null'::jsonb
  THEN
    RAISE EXCEPTION 'partial listening windows wrong: %', v_payload;
  END IF;

  UPDATE public.playback_usage_settings
  SET listening_time_valid_from = v_end + interval '1 minute'
  WHERE singleton;

  SELECT public.admin_analytics_listening_time_windows(
    v_end, false, NULL, NULL, NULL, NULL
  )
  INTO v_payload;

  IF (v_payload -> 'week' ->> 'unmeasured')::boolean IS NOT TRUE
    OR v_payload -> 'week' -> 'listened_ms' IS DISTINCT FROM 'null'::jsonb
    OR (v_payload -> 'month' ->> 'unmeasured')::boolean IS NOT TRUE
    OR v_payload -> 'month' -> 'listened_ms' IS DISTINCT FROM 'null'::jsonb
    OR (v_payload -> 'week' ->> 'listened_ms') = '0'
  THEN
    RAISE EXCEPTION 'unmeasured listening windows became zero: %', v_payload;
  END IF;
END
$$;

-- Grouped listening SUM (20261224120000): playback_usage_admin_listened_ms must
-- equal sum(listened_ms) FROM playback_usage_admin_facts for every filter combination,
-- and admin_analytics_listening_time must use it for the SUM.
DO $$
DECLARE
  v_author_a uuid := 'ab111111-1111-4111-8111-1111111111a1';
  v_author_b uuid := 'ab222222-2222-4222-8222-2222222222b2';
  v_pa1 uuid := 'cb111111-1111-4111-8111-1111111111a1';
  v_pa2 uuid := 'cb222222-2222-4222-8222-2222222222a2';
  v_pb uuid := 'cb333333-3333-4333-8333-3333333333b3';
  v_human uuid := 'db111111-1111-4111-8111-111111111101';
  v_human2 uuid := 'db222222-2222-4222-8222-222222222202';
  v_staff uuid := 'db333333-3333-4333-8333-333333333303';
  v_tester uuid := 'db444444-4444-4444-8444-444444444404';
  v_member uuid := 'db555555-5555-4555-8555-555555555505';
  v_s_tg uuid := 'eb111111-1111-4111-8111-111111111101';
  v_s_desk uuid := 'eb222222-2222-4222-8222-222222222202';
  v_s_bot uuid := 'eb333333-3333-4333-8333-333333333303';
  v_s_camp uuid := 'eb444444-4444-4444-8444-444444444404';
  v_s_staff uuid := 'eb555555-5555-4555-8555-555555555505';
  v_s_test uuid := 'eb666666-6666-4666-8666-666666666606';
  v_s_class uuid := 'eb777777-7777-4777-8777-777777777707';
  v_s_testanon uuid := 'eb888888-8888-4888-8888-888888888808';
  v_s_plain uuid := 'eb999999-9999-4999-8999-999999999909';
  v_end timestamptz := timestamptz '2026-10-07 14:16:00+03';
  v_def text;
  v_payload jsonb;
  v_grouped bigint;
  v_canonical bigint;
  v_checked integer := 0;
  v_window record;
  v_include boolean;
  v_author uuid;
  v_practice uuid;
  v_utm text;
  v_device text;
BEGIN
  IF to_regprocedure('public.playback_usage_admin_listened_ms(timestamptz,timestamptz,boolean,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'playback_usage_admin_listened_ms is missing';
  END IF;

  IF has_function_privilege('anon', 'public.playback_usage_admin_listened_ms(timestamptz,timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.playback_usage_admin_listened_ms(timestamptz,timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('public', 'public.playback_usage_admin_listened_ms(timestamptz,timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.playback_usage_admin_listened_ms(timestamptz,timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'grouped listening helper grants are not hardened';
  END IF;

  IF has_function_privilege('anon', 'public.admin_analytics_listening_time(timestamptz,timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_analytics_listening_time(timestamptz,timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('public', 'public.admin_analytics_listening_time(timestamptz,timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_analytics_listening_time(timestamptz,timestamptz,boolean,uuid,uuid,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'admin listening time grants changed';
  END IF;

  v_def := pg_get_functiondef('public.playback_usage_admin_listened_ms(timestamptz,timestamptz,boolean,uuid,uuid,text,text)'::regprocedure);
  IF position('AS MATERIALIZED' in v_def) = 0
    OR position('SECURITY DEFINER' in v_def) = 0
    OR position('playback_usage_admin_facts' in v_def) > 0
  THEN
    RAISE EXCEPTION 'grouped listening helper lost MATERIALIZED or SECURITY DEFINER: %', v_def;
  END IF;

  v_def := pg_get_functiondef('public.admin_analytics_listening_time(timestamptz,timestamptz,boolean,uuid,uuid,text,text)'::regprocedure);
  IF position('playback_usage_admin_listened_ms(' in v_def) = 0
    OR position('FROM public.playback_usage_admin_facts' in v_def) > 0
    OR position('query_canceled' in v_def) = 0
  THEN
    RAISE EXCEPTION 'admin_analytics_listening_time does not use the grouped SUM: %', v_def;
  END IF;

  UPDATE public.playback_usage_settings
  SET listening_time_valid_from = timestamptz '2026-08-01 00:00:00+03'
  WHERE singleton;

  INSERT INTO auth.users (id, email) VALUES
    (v_human, 'grouped-human@example.com'),
    (v_human2, 'grouped-human2@example.com'),
    (v_staff, 'grouped-staff@example.com'),
    (v_tester, 'grouped-tester@example.com'),
    (v_member, 'grouped-member@example.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.platform_user_roles (user_id, role_code) VALUES (v_staff, 'owner');
  INSERT INTO public.analytics_test_accounts (user_id, label) VALUES (v_tester, 'grouped smoke');

  INSERT INTO public.authors (id, name, slug, access_status) VALUES
    (v_author_a, 'Автор Группа А', 'grouped-listen-a', 'commercial'),
    (v_author_b, 'Автор Группа Б', 'grouped-listen-b', 'commercial');
  INSERT INTO public.author_members (author_id, user_id, role) VALUES (v_author_a, v_member, 'owner');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class
  ) VALUES
    (v_pa1, v_author_a, 'Grouped A1', 'grouped-a1', 'draft', true, 0, 'practice', 'practice'),
    (v_pa2, v_author_a, 'Grouped A2', 'grouped-a2', 'draft', true, 0, 'practice', 'practice'),
    (v_pb, v_author_b, 'Grouped B', 'grouped-b', 'draft', true, 0, 'practice', 'practice');

  INSERT INTO public.analytics_sessions
    (id, anonymous_id, utm_source, utm_campaign, device_type, is_staff, is_test, is_bot, traffic_class)
  VALUES
    (v_s_tg, 'grouped-anon-tg', 'telegram', 'spring', 'mobile', false, false, false, 'human'),
    (v_s_desk, 'grouped-anon-desk', NULL, NULL, 'desktop', false, false, false, 'human'),
    -- One exclusion signal per session, so each predicate is exercised on its own.
    (v_s_bot, 'grouped-anon-bot', NULL, NULL, 'desktop', false, false, true, 'human'),
    (v_s_camp, 'grouped-anon-camp', 'telegram', 'spring_test', 'desktop', false, false, false, 'human'),
    (v_s_staff, 'grouped-anon-sstaff', NULL, NULL, 'desktop', true, false, false, 'human'),
    (v_s_test, 'grouped-anon-stest', NULL, NULL, 'desktop', false, true, false, 'human'),
    (v_s_class, 'grouped-anon-sclass', NULL, NULL, 'desktop', false, false, false, 'test'),
    (v_s_testanon, 'test-grouped-session', NULL, 'spring', 'desktop', false, false, false, 'human'),
    (v_s_plain, 'grouped-anon-plain', NULL, 'spring', 'desktop', false, false, false, 'human');

  INSERT INTO public.playback_usage_facts
    (client_event_id, sample_seq, listening_key, session_id, user_id, anonymous_id, practice_id, listened_ms, position_ms, phase, occurred_at, author_id_snapshot)
  VALUES
    -- Several rows per group: one human on telegram/mobile.
    ('93111111-1111-4111-8111-111111111301', 1, 'grouped-human-a1', v_s_tg, v_human, 'grouped-anon-tg', v_pa1, 1000, 1000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111302', 2, 'grouped-human-a1', v_s_tg, v_human, 'grouped-anon-tg', v_pa1, 2000, 3000, 'advance', v_end - interval '1 day' + interval '5 seconds', v_author_a),
    ('93111111-1111-4111-8111-111111111303', 3, 'grouped-human-a1', v_s_tg, v_human, 'grouped-anon-tg', v_pa1, 3000, 6000, 'advance', v_end - interval '2 days', v_author_a),
    ('93111111-1111-4111-8111-111111111304', 1, 'grouped-anon-a2', v_s_desk, NULL, 'grouped-anon-desk', v_pa2, 500, 500, 'advance', v_end - interval '3 days', v_author_a),
    ('93111111-1111-4111-8111-111111111305', 2, 'grouped-anon-a2', v_s_desk, NULL, 'grouped-anon-desk', v_pa2, 700, 1200, 'advance', v_end - interval '3 days' + interval '5 seconds', v_author_a),
    -- Excluded unless include_test: staff user, test account, bot session, test campaign, test anonymous id.
    ('93111111-1111-4111-8111-111111111306', 1, 'grouped-staff', NULL, v_staff, 'grouped-anon-staff', v_pa1, 40000, 40000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111307', 1, 'grouped-tester', NULL, v_tester, 'grouped-anon-tester', v_pa1, 50000, 50000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111308', 1, 'grouped-bot', v_s_bot, NULL, 'grouped-anon-bot', v_pa1, 70000, 70000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111309', 1, 'grouped-camp', v_s_camp, NULL, 'grouped-anon-camp', v_pa1, 80000, 80000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111310', 1, 'grouped-test-anon', NULL, NULL, 'test-grouped-anon', v_pa1, 90000, 90000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111319', 1, 'grouped-sstaff', v_s_staff, NULL, 'grouped-anon-sstaff', v_pa1, 11000, 11000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111320', 1, 'grouped-stest', v_s_test, NULL, 'grouped-anon-stest', v_pa1, 12000, 12000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111321', 1, 'grouped-sclass', v_s_class, NULL, 'grouped-anon-sclass', v_pa1, 13000, 13000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111322', 1, 'grouped-stestanon', v_s_testanon, NULL, 'grouped-anon-x', v_pa1, 14000, 14000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111324', 1, 'grouped-fact-testanon', v_s_plain, NULL, 'test-grouped-fact', v_pa1, 16000, 16000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111323', 1, 'grouped-include-month', v_s_staff, NULL, 'grouped-anon-sstaff', v_pa1, 15000, 15000, 'advance', v_end - interval '25 days', v_author_a),
    -- Author member of A listening to A: always excluded. Listening to B: counted for B.
    ('93111111-1111-4111-8111-111111111311', 1, 'grouped-member-a', NULL, v_member, 'grouped-anon-member', v_pa1, 60000, 60000, 'advance', v_end - interval '1 day', v_author_a),
    ('93111111-1111-4111-8111-111111111312', 1, 'grouped-member-b', NULL, v_member, 'grouped-anon-member', v_pb, 5000, 5000, 'advance', v_end - interval '1 day', v_author_b),
    ('93111111-1111-4111-8111-111111111313', 1, 'grouped-human-b', v_s_tg, v_human, 'grouped-anon-tg', v_pb, 4000, 4000, 'advance', v_end - interval '1 day', v_author_b),
    -- No snapshot: author comes from the current practice owner.
    ('93111111-1111-4111-8111-111111111314', 1, 'grouped-nosnap', NULL, NULL, 'grouped-anon-nosnap', v_pa2, 300, 300, 'advance', v_end - interval '4 days', NULL),
    -- Window edges: from is inclusive, to is exclusive.
    ('93111111-1111-4111-8111-111111111315', 1, 'grouped-edge-from', NULL, v_human2, 'grouped-anon-h2', v_pa1, 9, 9, 'advance', v_end - interval '7 days', v_author_a),
    ('93111111-1111-4111-8111-111111111316', 1, 'grouped-edge-to', NULL, v_human2, 'grouped-anon-h2', v_pa1, 100000, 100000, 'advance', v_end, v_author_a),
    ('93111111-1111-4111-8111-111111111317', 4, 'grouped-human-a1', v_s_tg, v_human, 'grouped-anon-tg', v_pa1, 7000, 13000, 'advance', v_end - interval '10 days', v_author_a),
    ('93111111-1111-4111-8111-111111111318', 5, 'grouped-human-a1', v_s_tg, v_human, 'grouped-anon-tg', v_pa1, 8000, 21000, 'advance', v_end - interval '20 days', v_author_a);

  -- Absolute values prove the filters actually remove rows.
  IF public.playback_usage_admin_listened_ms(v_end - interval '7 days', v_end, false, v_author_a, NULL, NULL, NULL) <> 7509
    OR public.playback_usage_admin_listened_ms(v_end - interval '7 days', v_end, true, v_author_a, NULL, NULL, NULL) <> 403509
    OR public.playback_usage_admin_listened_ms(v_end - interval '7 days', v_end, false, v_author_a, NULL, 'telegram', NULL) <> 6000
    OR public.playback_usage_admin_listened_ms(v_end - interval '7 days', v_end, true, v_author_a, NULL, 'telegram', NULL) <> 86000
    OR public.playback_usage_admin_listened_ms(v_end - interval '7 days', v_end, false, v_author_a, NULL, NULL, 'mobile') <> 6000
    OR public.playback_usage_admin_listened_ms(v_end - interval '7 days', v_end, false, v_author_a, NULL, '__none__', NULL) <> 1509
    OR public.playback_usage_admin_listened_ms(v_end - interval '7 days', v_end, false, v_author_a, v_pa2, NULL, NULL) <> 1500
    OR public.playback_usage_admin_listened_ms(v_end - interval '14 days', v_end - interval '7 days', false, v_author_a, NULL, NULL, NULL) <> 7000
    OR public.playback_usage_admin_listened_ms(v_end - interval '30 days', v_end, false, v_author_a, NULL, NULL, NULL) <> 22509
    OR public.playback_usage_admin_listened_ms(NULL, NULL, false, v_author_a, NULL, NULL, NULL) <> 122509
    OR public.playback_usage_admin_listened_ms(NULL, NULL, false, v_author_b, NULL, NULL, NULL) <> 9000
  THEN
    RAISE EXCEPTION 'grouped listening helper filters wrong';
  END IF;

  FOR v_window IN
    SELECT * FROM (VALUES
      (NULL::timestamptz, NULL::timestamptz),
      (v_end - interval '7 days', v_end),
      (v_end - interval '30 days', v_end),
      (v_end - interval '14 days', v_end - interval '7 days'),
      (v_end - interval '1 day' - interval '1 minute', v_end - interval '1 day' + interval '1 second'),
      (v_end - interval '60 days', v_end - interval '30 days')
    ) AS w(p_from, p_to)
  LOOP
    FOREACH v_include IN ARRAY ARRAY[false, true] LOOP
      FOREACH v_author IN ARRAY ARRAY[NULL, v_author_a, v_author_b]::uuid[] LOOP
        FOREACH v_practice IN ARRAY ARRAY[NULL, v_pa1, v_pb]::uuid[] LOOP
          FOREACH v_utm IN ARRAY ARRAY[NULL, 'telegram', '__none__', ' Telegram ']::text[] LOOP
            FOREACH v_device IN ARRAY ARRAY[NULL, 'mobile', 'desktop', '']::text[] LOOP
              v_grouped := public.playback_usage_admin_listened_ms(
                v_window.p_from, v_window.p_to, v_include, v_author, v_practice, v_utm, v_device
              );
              SELECT coalesce(sum(f.listened_ms), 0)::bigint
              INTO v_canonical
              FROM public.playback_usage_admin_facts(
                v_window.p_from, v_window.p_to, v_include, v_author, v_practice, v_utm, v_device
              ) AS f;
              IF v_grouped IS DISTINCT FROM v_canonical THEN
                RAISE EXCEPTION 'grouped SUM % <> canonical % for from % to % include % author % practice % utm % device %',
                  v_grouped, v_canonical, v_window.p_from, v_window.p_to, v_include, v_author, v_practice, v_utm, v_device;
              END IF;
              v_checked := v_checked + 1;
            END LOOP;
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  IF v_checked <> 6 * 2 * 3 * 3 * 4 * 4 THEN
    RAISE EXCEPTION 'grouped SUM matrix incomplete: %', v_checked;
  END IF;

  -- The RPC returns the grouped SUM; rolling cards still skip denominators,
  -- calendar windows still return them.
  SELECT public.admin_analytics_listening_time(
    v_end - interval '7 days', v_end, false, v_author_a, NULL, NULL, NULL
  ) INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 7509
    OR v_payload -> 'measured_listeners' IS DISTINCT FROM 'null'::jsonb
    OR (v_payload ->> 'partial')::boolean
  THEN
    RAISE EXCEPTION 'grouped rolling week payload wrong: %', v_payload;
  END IF;

  SELECT public.admin_analytics_listening_time(
    v_end - interval '30 days', v_end, true, v_author_a, NULL, NULL, NULL
  ) INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 433509
    OR v_payload -> 'measured_listeners' IS DISTINCT FROM 'null'::jsonb
  THEN
    RAISE EXCEPTION 'grouped rolling month payload wrong: %', v_payload;
  END IF;

  SELECT public.admin_analytics_listening_time(
    v_end - interval '8 days', v_end, false, v_author_a, NULL, NULL, NULL
  ) INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 7509
    OR jsonb_typeof(v_payload -> 'measured_listeners') <> 'number'
    OR jsonb_typeof(v_payload -> 'measured_play_starts') <> 'number'
  THEN
    RAISE EXCEPTION 'grouped calendar payload dropped denominators: %', v_payload;
  END IF;

  SELECT public.admin_analytics_listening_time(NULL, NULL, false, NULL, NULL, NULL, NULL)
  INTO v_payload;
  SELECT coalesce(sum(f.listened_ms), 0)::bigint
  INTO v_canonical
  FROM public.playback_usage_admin_facts(
    timestamptz '2026-08-01 00:00:00+03', NULL, false, NULL, NULL, NULL, NULL
  ) AS f;
  IF (v_payload ->> 'listened_ms')::bigint IS DISTINCT FROM v_canonical
    OR (v_payload ->> 'partial')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'grouped All payload % <> canonical %', v_payload, v_canonical;
  END IF;

  UPDATE public.playback_usage_settings
  SET listening_time_valid_from = v_end + interval '1 minute'
  WHERE singleton;
  SELECT public.admin_analytics_listening_time(
    v_end - interval '7 days', v_end, false, v_author_a, NULL, NULL, NULL
  ) INTO v_payload;
  IF v_payload -> 'listened_ms' IS DISTINCT FROM 'null'::jsonb
    OR (v_payload ->> 'unmeasured')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'grouped unmeasured window became a number: %', v_payload;
  END IF;
END
$$;

ROLLBACK;
