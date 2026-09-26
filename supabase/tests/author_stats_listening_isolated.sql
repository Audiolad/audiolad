-- Isolated checks for author_stats_listening_*. The harness creates the
-- minimal schema and then applies 20261128120000_author_stats_listening_time.sql.
DO $$
DECLARE
  v_author_a uuid := 'a1111111-1111-4111-8111-111111111111';
  v_author_b uuid := 'a2222222-2222-4222-8222-222222222222';
  v_practice uuid := 'c1111111-1111-4111-8111-111111111111';
  v_deleted uuid := 'c2222222-2222-4222-8222-222222222222';
  v_practice_b uuid := 'c3333333-3333-4333-8333-333333333333';
  v_human uuid := 'd1111111-1111-4111-8111-111111111111';
  v_auth uuid := 'd2222222-2222-4222-8222-222222222222';
  v_member uuid := 'd3333333-3333-4333-8333-333333333333';
  v_pdel_user uuid := 'd4444444-4444-4444-8444-444444444444';
  v_staff_session uuid := 'e1111111-1111-4111-8111-111111111111';
  v_valid timestamptz := timestamptz '2026-09-26 00:00:00+03';
  v_from timestamptz := timestamptz '2026-09-24 00:00:00+03';
  v_to timestamptz := timestamptz '2026-09-28 00:00:00+03';
  v_payload jsonb;
  v_series jsonb;
  v_products jsonb;
  v_day text;
  v_wide_starts integer;
  v_slug_sum bigint;
  v_all_rows bigint;
BEGIN
  IF has_function_privilege(
    'anon',
    'public.author_stats_listening_summary(uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.author_stats_listening_summary(uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.author_stats_listening_summary(uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'author listening summary grants are not hardened';
  END IF;

  BEGIN
    PERFORM public.author_stats_listening_summary(
      'ffffffff-ffff-4fff-8fff-ffffffffffff', NULL, NULL
    );
    RAISE EXCEPTION 'missing author was accepted';
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      NULL;
  END;

  INSERT INTO public.authors (id, name, slug) VALUES
    (v_author_a, 'Author A', 'author-listen-a'),
    (v_author_b, 'Author B', 'author-listen-b');

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_a, v_member, 'owner');

  INSERT INTO public.practices (id, author_id, title, slug) VALUES
    (v_practice, v_author_a, 'Current', 'listen-current'),
    (v_deleted, v_author_a, 'Soon deleted', 'listen-deleted'),
    (v_practice_b, v_author_b, 'Author B', 'listen-b');

  INSERT INTO public.analytics_sessions
    (id, anonymous_id, user_id, is_staff, is_test, is_bot, traffic_class)
  VALUES
    (v_staff_session, 'listener-staff', NULL, true, false, false, 'staff');

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
    ('91111111-1111-4111-8111-111111111101', 1, 'anon', NULL, NULL, 'listener-anon', v_practice, 1000, 1000, 'advance', timestamptz '2026-09-26 11:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111102', 1, 'auth', NULL, v_auth, 'listener-auth', v_practice, 2000, 2000, 'advance', timestamptz '2026-09-26 12:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111103', 1, 'deleted', NULL, v_pdel_user, 'listener-deleted', v_deleted, 4000, 4000, 'advance', timestamptz '2026-09-26 13:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111104', 1, 'member', NULL, v_member, 'listener-member', v_practice, 50000, 50000, 'advance', timestamptz '2026-09-26 14:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111105', 1, 'staff', v_staff_session, NULL, 'listener-staff', v_practice, 80000, 80000, 'advance', timestamptz '2026-09-26 15:00:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111106', 1, 'test-anon', NULL, NULL, 'test-listener', v_practice, 90000, 90000, 'advance', timestamptz '2026-09-26 15:30:00+03', v_author_a),
    ('91111111-1111-4111-8111-111111111107', 1, 'author-b', NULL, v_human, 'listener-human', v_practice_b, 9000, 9000, 'advance', timestamptz '2026-09-26 16:00:00+03', v_author_b);

  SELECT count(*)::int
  INTO v_wide_starts
  FROM public.analytics_product_event_facts(v_from, v_to, v_author_a, NULL, false)
  WHERE event_name = 'audio_play_started';
  IF v_wide_starts <> 5 THEN
    RAISE EXCEPTION 'wide-window author A starts were %, expected 5', v_wide_starts;
  END IF;

  SELECT public.author_stats_listening_summary(v_author_a, v_from, v_to) INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 7000
    OR (v_payload ->> 'measured_listeners')::integer <> 4
    OR (v_payload ->> 'measured_play_starts')::integer <> 4
    OR (v_payload ->> 'average_listen_per_listener_ms')::bigint <> 1750
    OR (v_payload ->> 'average_listen_per_start_ms')::bigint <> 1750
    OR (v_payload ->> 'partial')::boolean IS NOT TRUE
    OR (v_payload ->> 'unmeasured')::boolean
  THEN
    RAISE EXCEPTION 'partial measured window wrong: % (wide starts %)', v_payload, v_wide_starts;
  END IF;

  IF (v_payload ->> 'average_listen_per_start_ms')::bigint
    = round(7000::numeric / v_wide_starts)
  THEN
    RAISE EXCEPTION 'average used the historical start count';
  END IF;

  SELECT public.author_stats_listening_summary(v_author_a, NULL, NULL) INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 7000
    OR (v_payload ->> 'measured_play_starts')::integer <> 4
    OR (v_payload ->> 'measured_listeners')::integer <> 4
    OR (v_payload ->> 'average_listen_per_start_ms')::bigint <> 1750
    OR (v_payload ->> 'partial')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'All measured window wrong: %', v_payload;
  END IF;

  SELECT public.author_stats_listening_summary(v_author_a, v_valid - interval '3 days', v_valid)
  INTO v_payload;
  IF v_payload -> 'listened_ms' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'average_listen_per_listener_ms' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'average_listen_per_start_ms' IS DISTINCT FROM 'null'::jsonb
    OR (v_payload ->> 'unmeasured')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'pre-metering window was not unmeasured: %', v_payload;
  END IF;

  SELECT public.author_stats_listening_summary(v_author_b, NULL, NULL) INTO v_payload;
  IF (v_payload ->> 'listened_ms')::bigint <> 9000 THEN
    RAISE EXCEPTION 'author B saw someone else''s usage: %', v_payload;
  END IF;

  SELECT public.author_stats_listening_timeseries(
    v_author_a,
    timestamptz '2026-09-25 00:00:00+03',
    timestamptz '2026-09-27 00:00:00+03'
  ) INTO v_series;

  SELECT p.point ->> 'listened_ms'
  INTO v_day
  FROM jsonb_array_elements(v_series -> 'points') AS p(point)
  WHERE p.point ->> 'date' = '2026-09-25';
  IF v_day IS NOT NULL OR NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_series -> 'points') AS p(point)
    WHERE p.point ->> 'date' = '2026-09-25'
      AND jsonb_typeof(p.point -> 'listened_ms') = 'null'
  ) THEN
    RAISE EXCEPTION 'day before valid_from was not unmeasured: %', v_series;
  END IF;

  SELECT (p.point ->> 'listened_ms')::bigint
  INTO v_all_rows
  FROM jsonb_array_elements(v_series -> 'points') AS p(point)
  WHERE p.point ->> 'date' = '2026-09-26';
  IF v_all_rows <> 7000 THEN
    RAISE EXCEPTION 'measured day sum wrong: %', v_series;
  END IF;

  SELECT public.author_stats_listening_products(v_author_a, v_from, v_to) INTO v_products;
  SELECT coalesce(sum((row ->> 'listened_ms')::bigint), 0)
  INTO v_slug_sum
  FROM jsonb_array_elements(v_products -> 'rows') AS row
  WHERE row ->> 'product_slug' IS NOT NULL;
  SELECT coalesce(sum((row ->> 'listened_ms')::bigint), 0)
  INTO v_all_rows
  FROM jsonb_array_elements(v_products -> 'rows') AS row;
  IF v_slug_sum <> 7000 OR v_all_rows <> 7000 THEN
    RAISE EXCEPTION 'current products did not match summary: %', v_products;
  END IF;

  -- Author A still owns the practice, with a listening fact and a start.
  -- Transfer it. Snapshot minutes stay with A. Starts follow the new owner.
  -- The average must not become 7000 divided by the starts that remain.
  UPDATE public.practices SET author_id = v_author_b WHERE id = v_deleted;

  SELECT count(*)::int
  INTO v_wide_starts
  FROM public.analytics_product_event_facts(NULL, NULL, v_author_a, NULL, false)
  WHERE event_name = 'audio_play_started';

  SELECT public.author_stats_listening_summary(v_author_a, NULL, NULL) INTO v_payload;
  SELECT public.author_stats_listening_summary(v_author_b, NULL, NULL) INTO v_series;
  IF (v_payload ->> 'listened_ms')::bigint <> 7000
    OR (v_series ->> 'listened_ms')::bigint <> 9000
    OR (v_payload ->> 'averages_withheld')::boolean IS NOT TRUE
    OR v_payload -> 'measured_listeners' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'measured_play_starts' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'average_listen_per_listener_ms' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'average_listen_per_start_ms' IS DISTINCT FROM 'null'::jsonb
    OR (
      v_wide_starts > 0
      AND v_payload -> 'average_listen_per_start_ms'
        IS NOT DISTINCT FROM to_jsonb(round(7000::numeric / v_wide_starts)::bigint)
    )
  THEN
    RAISE EXCEPTION
      'transfer inflated the average or moved the historical total: A % B % remaining starts %',
      v_payload, v_series, v_wide_starts;
  END IF;

  IF (
    SELECT coalesce(sum((row ->> 'listened_ms')::bigint), 0)
    FROM jsonb_array_elements(v_products -> 'rows') AS row
    WHERE row ->> 'product_slug' = 'listen-current'
  ) <> 3000 THEN
    RAISE EXCEPTION 'anonymous and authenticated listening were not both counted: %', v_products;
  END IF;

  INSERT INTO public.playback_usage_facts
    (client_event_id, sample_seq, listening_key, user_id, anonymous_id, practice_id, listened_ms, position_ms, phase, occurred_at, author_id_snapshot)
  VALUES
    ('91111111-1111-4111-8111-111111111108', 1, 'snapshot-a-on-b', v_human, 'listener-human', v_practice_b, 7000, 7000, 'advance', timestamptz '2026-09-26 17:00:00+03', v_author_a);

  SELECT public.author_stats_listening_summary(v_author_a, NULL, NULL) INTO v_payload;
  SELECT public.author_stats_listening_summary(v_author_b, NULL, NULL) INTO v_series;
  SELECT public.author_stats_listening_products(v_author_a, NULL, NULL) INTO v_products;
  SELECT coalesce(sum((row ->> 'listened_ms')::bigint), 0)
  INTO v_slug_sum
  FROM jsonb_array_elements(v_products -> 'rows') AS row
  WHERE row ->> 'product_slug' IS NOT NULL;
  IF (v_payload ->> 'listened_ms')::bigint <> 14000
    OR (v_series ->> 'listened_ms')::bigint <> 9000
    OR v_slug_sum <> 3000
    OR (v_payload ->> 'averages_withheld')::boolean IS NOT TRUE
    OR v_payload -> 'average_listen_per_start_ms' IS DISTINCT FROM 'null'::jsonb
  THEN
    RAISE EXCEPTION
      'snapshot attribution failed: A % B % products %',
      v_payload, v_series, v_products;
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
    OR v_payload -> 'average_listen_per_listener_ms' IS DISTINCT FROM 'null'::jsonb
    OR v_payload -> 'average_listen_per_start_ms' IS DISTINCT FROM 'null'::jsonb
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_products -> 'rows') AS row
      WHERE row ->> 'product_slug' = 'listen-deleted'
    )
  THEN
    RAISE EXCEPTION 'deleted practice left the author total: summary % products %', v_payload, v_products;
  END IF;
END
$$;
