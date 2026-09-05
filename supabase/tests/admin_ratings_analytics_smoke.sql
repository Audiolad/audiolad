-- Isolated admin Ratings RPC + RLS smoke.
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  user_c uuid := '33333333-3333-4333-8333-333333333333';
  user_d uuid := '44444444-4444-4444-8444-444444444444';
  user_e uuid := '55555555-5555-4555-8555-555555555555';
  p_sleep uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  p_music uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  p_post uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  t_now timestamptz := timestamptz '2026-09-05 12:00:00+00';
  t_yest timestamptz := timestamptz '2026-09-04 12:00:00+00';
  t_year timestamptz := timestamptz '2025-09-05 12:00:00+00';
  t_edit timestamptz := timestamptz '2026-09-05 11:00:00+00';
  summary jsonb;
  products jsonb;
  authors jsonb;
  events jsonb;
  page1 jsonb;
  page2 jsonb;
  ids1 text[];
  ids2 text[];
  raised boolean;
  event_count integer;
  hmac_leak integer;
BEGIN
  EXECUTE 'SET ROLE service_role';

  -- Fixture: 5,4,3 + excluded 1 on sleep.
  PERFORM public.set_practice_rating(user_a, p_sleep, 5, 'v1:ip-a', 'v1:dev-a', t_yest);
  PERFORM public.set_practice_rating(user_b, p_sleep, 4, 'v1:ip-b', 'v1:dev-b', t_yest);
  PERFORM public.set_practice_rating(user_c, p_sleep, 3, 'v1:ip-c', 'v1:dev-c', t_yest);
  PERFORM public.set_practice_rating(user_d, p_sleep, 1, 'v1:ip-d', 'v1:dev-d', t_yest);

  UPDATE public.practice_ratings
  SET excluded_at = t_now, excluded_reason = 'test'
  WHERE user_id = user_d AND practice_id = p_sleep;

  -- Temporal B: year-ago first rating, edited today 2→5 on music.
  PERFORM public.set_practice_rating(user_a, p_music, 2, 'v1:ip-a', 'v1:dev-a', t_year);
  PERFORM public.set_practice_rating(user_a, p_music, 5, NULL, NULL, t_edit);

  -- Identical resubmit must not add an event (Stage 2 still).
  SELECT count(*) INTO event_count
  FROM public.practice_rating_events
  WHERE user_id = user_a AND practice_id = p_music;
  PERFORM public.set_practice_rating(user_a, p_music, 5, NULL, NULL, t_now);
  IF (SELECT count(*) FROM public.practice_rating_events
      WHERE user_id = user_a AND practice_id = p_music) <> event_count THEN
    RAISE EXCEPTION 'identical resubmit created an event';
  END IF;

  -- Author two: one rating on audio_post.
  PERFORM public.set_practice_rating(user_b, p_post, 4, 'v1:ip-b', 'v1:dev-b', t_yest);

  INSERT INTO public.practice_listen_stats (user_id, practice_id, real_listened_ms, rating_eligible_at)
  VALUES
    (user_a, p_sleep, 30000, t_yest),
    (user_b, p_sleep, 30000, t_yest),
    (user_c, p_sleep, 30000, t_yest),
    (user_d, p_sleep, 30000, t_yest),
    (user_e, p_sleep, 30000, t_yest);

  summary := public.admin_ratings_summary(NULL, NULL);
  IF (summary->>'rating_count')::int <> 5 THEN
    RAISE EXCEPTION 'all-time count expected 5 got %', summary->>'rating_count';
  END IF;
  -- 5+4+3 + music 5 + post 4 = 21
  IF (summary->>'total_stars')::int <> 21 THEN
    RAISE EXCEPTION 'all-time stars expected 21 got %', summary->>'total_stars';
  END IF;
  IF (summary->>'average')::numeric <> 4.2 THEN
    RAISE EXCEPTION 'all-time avg expected 4.2 got %', summary->>'average';
  END IF;

  -- Sleep-only fixture check via products.
  products := public.admin_ratings_products(
    t_now - interval '6 days',
    t_now - interval '29 days',
    t_now,
    'Практика сна',
    'total_stars',
    'desc',
    50,
    0
  );
  IF (products->'rows'->0->>'rating_count')::int <> 3 THEN
    RAISE EXCEPTION 'sleep fixture count expected 3 got %', products->'rows'->0->>'rating_count';
  END IF;
  IF (products->'rows'->0->>'total_stars')::int <> 12 THEN
    RAISE EXCEPTION 'sleep fixture stars expected 12 got %', products->'rows'->0->>'total_stars';
  END IF;
  IF (products->'rows'->0->>'average')::numeric <> 4 THEN
    RAISE EXCEPTION 'sleep fixture avg expected 4 got %', products->'rows'->0->>'average';
  END IF;
  IF (products->'rows'->0->>'eligible_listeners')::int <> 5 THEN
    RAISE EXCEPTION 'sleep eligible expected 5';
  END IF;
  -- 3 active ratings among 5 eligible (excluded does not count)
  IF (products->'rows'->0->>'rated_eligible')::int <> 3 THEN
    RAISE EXCEPTION 'sleep rated_eligible expected 3';
  END IF;

  -- Temporal: year-ago edited rating is all-time only.
  products := public.admin_ratings_products(
    t_yest,
    t_yest - interval '20 days',
    t_now,
    'Музыка',
    'total_stars',
    'desc',
    50,
    0
  );
  IF (products->'rows'->0->>'total_stars')::int <> 5 THEN
    RAISE EXCEPTION 'music all-time stars expected 5';
  END IF;
  IF (products->'rows'->0->>'stars_7d')::int <> 0 THEN
    RAISE EXCEPTION 'music 7d stars must be 0 for year-ago created_at';
  END IF;
  IF (products->'rows'->0->>'count_7d')::int <> 0 THEN
    RAISE EXCEPTION 'music 7d count must be 0';
  END IF;

  authors := public.admin_ratings_authors(
    t_yest,
    t_yest - interval '20 days',
    t_now,
    NULL,
    'total_stars',
    'desc',
    50,
    0
  );
  IF (authors->'rows'->0->>'rating_bearing_products')::int <> 2 THEN
    RAISE EXCEPTION 'author one should have 2 rating-bearing products';
  END IF;
  -- author one: sleep 12 + music 5 = 17
  IF (authors->'rows'->0->>'total_stars')::int <> 17 THEN
    RAISE EXCEPTION 'author one stars expected 17 got %', authors->'rows'->0->>'total_stars';
  END IF;

  events := public.admin_ratings_events(NULL, NULL, NULL, NULL, 'first', NULL, 50, 0);
  IF jsonb_array_length(events->'rows') < 1 THEN
    RAISE EXCEPTION 'first events missing';
  END IF;
  IF events->'rows'->0->>'event_kind' <> 'first' THEN
    RAISE EXCEPTION 'first filter leaked changed';
  END IF;

  -- Pagination: 50-size pages with stable order, no overlap.
  page1 := public.admin_ratings_events(NULL, NULL, NULL, NULL, NULL, NULL, 2, 0);
  page2 := public.admin_ratings_events(NULL, NULL, NULL, NULL, NULL, NULL, 2, 2);
  SELECT array_agg(value->>'id') INTO ids1 FROM jsonb_array_elements(page1->'rows') AS value;
  SELECT array_agg(value->>'id') INTO ids2 FROM jsonb_array_elements(page2->'rows') AS value;
  IF ids1 && ids2 THEN
    RAISE EXCEPTION 'journal pages overlap % %', ids1, ids2;
  END IF;
  IF page1->'rows'->0->>'occurred_at' < page1->'rows'->1->>'occurred_at' THEN
    RAISE EXCEPTION 'journal not newest first';
  END IF;

  SELECT count(*) INTO hmac_leak
  FROM jsonb_array_elements(page1->'rows') AS value
  WHERE value::text ILIKE '%vote_ip%' OR value::text ILIKE '%v1:ip%';
  IF hmac_leak <> 0 THEN
    RAISE EXCEPTION 'journal leaked HMAC';
  END IF;

  -- Listener cannot execute admin RPCs or read foreign rows / events / HMAC.
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO event_count
  FROM public.practice_ratings
  WHERE user_id = user_b;
  IF event_count <> 0 THEN
    RAISE EXCEPTION 'listener saw foreign rating rows';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.admin_ratings_summary(NULL, NULL);
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'listener executed admin_ratings_summary';
  END IF;

  raised := false;
  BEGIN
    PERFORM 1 FROM public.practice_rating_events;
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'listener selected practice_rating_events';
  END IF;

  EXECUTE 'RESET ROLE';
END
$$;
