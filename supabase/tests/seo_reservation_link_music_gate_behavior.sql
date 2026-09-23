-- Behavior for link_seo_reservation_to_product music gate. Never run on production.

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_other uuid := '00000000-0000-4000-8000-000000000099';
  v_aurafon uuid := '59c7e5b8-eae4-4394-82fb-b815a10be6c2';
  v_music uuid := '11111111-1111-4111-8111-111111111101';
  v_music_kind uuid := '11111111-1111-4111-8111-111111111102';
  v_release uuid := '11111111-1111-4111-8111-111111111103';
  v_practice uuid := '11111111-1111-4111-8111-111111111104';
  v_course uuid := '11111111-1111-4111-8111-111111111105';
  v_audiobook uuid := '11111111-1111-4111-8111-111111111106';
  v_post uuid := '11111111-1111-4111-8111-111111111107';
  v_aurafon_practice uuid := '11111111-1111-4111-8111-111111111108';
  v_direct uuid := '11111111-1111-4111-8111-111111111109';
  v_q_music uuid := '22222222-2222-4222-8222-222222222201';
  v_q_kind uuid := '22222222-2222-4222-8222-222222222202';
  v_q_release uuid := '22222222-2222-4222-8222-222222222203';
  v_q_practice uuid := '22222222-2222-4222-8222-222222222204';
  v_q_course uuid := '22222222-2222-4222-8222-222222222205';
  v_q_audiobook uuid := '22222222-2222-4222-8222-222222222206';
  v_q_post uuid := '22222222-2222-4222-8222-222222222207';
  v_q_aurafon uuid := '22222222-2222-4222-8222-222222222208';
  v_q_direct uuid := '22222222-2222-4222-8222-222222222209';
  v_r_music uuid := '33333333-3333-4333-8333-333333333301';
  v_r_kind uuid := '33333333-3333-4333-8333-333333333302';
  v_r_release uuid := '33333333-3333-4333-8333-333333333303';
  v_r_practice uuid := '33333333-3333-4333-8333-333333333304';
  v_r_course uuid := '33333333-3333-4333-8333-333333333305';
  v_r_audiobook uuid := '33333333-3333-4333-8333-333333333306';
  v_r_post uuid := '33333333-3333-4333-8333-333333333307';
  v_r_aurafon uuid := '33333333-3333-4333-8333-333333333308';
  v_r_direct uuid := '33333333-3333-4333-8333-333333333309';
  v_row public.seo_query_reservations%ROWTYPE;
  v_primary uuid;
  v_text text;
  v_expires timestamptz;
  v_err text;
BEGIN
  INSERT INTO public.authors (id, name, slug) VALUES
    (v_other, 'Other', 'other-author'),
    (v_aurafon, 'Aurafon', 'aurafon');

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_other, v_user, 'owner'),
    (v_aurafon, v_user, 'owner');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, moderation_status, product_kind, publication_class
  ) VALUES
    (v_music, v_other, 'Music', 'music', 'draft', 'not_submitted', 'music', 'release'),
    (v_music_kind, v_other, 'Music kind', 'music-kind', 'draft', 'not_submitted', 'music', NULL),
    (v_release, v_other, 'Release', 'release', 'draft', 'not_submitted', 'practice', 'release'),
    (v_practice, v_other, 'Practice', 'practice', 'draft', 'not_submitted', 'practice', 'practice'),
    (v_course, v_other, 'Course', 'course', 'draft', 'not_submitted', 'practice', 'course'),
    (v_audiobook, v_other, 'Audiobook', 'audiobook', 'draft', 'not_submitted', 'practice', 'audiobook'),
    (v_post, v_other, 'Post', 'post', 'draft', 'not_submitted', 'audio_post', 'post'),
    (v_aurafon_practice, v_aurafon, 'Aurafon practice', 'aurafon-practice', 'draft', 'not_submitted', 'practice', 'practice'),
    (v_direct, v_other, 'Direct practice', 'direct-practice', 'draft', 'not_submitted', 'practice', 'practice');

  INSERT INTO public.seo_queries (id, query_text, normalized_query) VALUES
    (v_q_music, 'музыка для сна', 'музыка для сна'),
    (v_q_kind, 'музыка для отдыха', 'музыка для отдыха'),
    (v_q_release, 'музыка для йоги', 'музыка для йоги'),
    (v_q_practice, 'медитация для сна', 'медитация для сна'),
    (v_q_course, 'курс медитации', 'курс медитации'),
    (v_q_audiobook, 'аудиокнига', 'аудиокнига'),
    (v_q_post, 'аудиопост', 'аудиопост'),
    (v_q_aurafon, 'практика аурафон', 'практика аурафон'),
    (v_q_direct, 'прямая практика', 'прямая практика');

  INSERT INTO public.seo_query_reservations (
    id, query_id, author_id, product_id, reserved_at, expires_at, status
  ) VALUES
    (v_r_music, v_q_music, v_other, NULL, now(), now() + interval '7 days', 'active'),
    (v_r_kind, v_q_kind, v_other, NULL, now(), now() + interval '7 days', 'active'),
    (v_r_release, v_q_release, v_other, NULL, now(), now() + interval '7 days', 'active'),
    (v_r_practice, v_q_practice, v_other, NULL, now(), now() + interval '7 days', 'active'),
    (v_r_course, v_q_course, v_other, NULL, now(), now() + interval '7 days', 'active'),
    (v_r_audiobook, v_q_audiobook, v_other, NULL, now(), now() + interval '7 days', 'active'),
    (v_r_post, v_q_post, v_other, NULL, now(), now() + interval '7 days', 'active'),
    (v_r_aurafon, v_q_aurafon, v_aurafon, NULL, now(), now() + interval '7 days', 'active'),
    (v_r_direct, v_q_direct, v_other, NULL, now(), now() + interval '7 days', 'active');

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  -- OTHER + factual music/release draft links.
  v_row := public.link_seo_reservation_to_product(v_r_music, v_music);
  IF v_row.product_id IS DISTINCT FROM v_music OR v_row.expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'music release link failed';
  END IF;
  SELECT primary_seo_query_id, seo_primary_query
    INTO v_primary, v_text
  FROM public.practices WHERE id = v_music;
  IF v_primary IS DISTINCT FROM v_q_music OR v_text IS DISTINCT FROM 'музыка для сна' THEN
    RAISE EXCEPTION 'music release primary not synced';
  END IF;

  -- Idempotent retry does not write again. now() is stable inside one transaction,
  -- so a sentinel timestamp is the write detector.
  UPDATE public.practices SET updated_at = '2000-01-01T00:00:00Z' WHERE id = v_music;
  v_row := public.link_seo_reservation_to_product(v_r_music, v_music);
  IF v_row.product_id IS DISTINCT FROM v_music THEN
    RAISE EXCEPTION 'idempotent music link failed';
  END IF;
  IF (SELECT updated_at FROM public.practices WHERE id = v_music) IS DISTINCT FROM '2000-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'idempotent music link rewrote the product';
  END IF;

  -- product_kind = music is enough.
  PERFORM public.link_seo_reservation_to_product(v_r_kind, v_music_kind);
  SELECT primary_seo_query_id INTO v_primary FROM public.practices WHERE id = v_music_kind;
  IF v_primary IS DISTINCT FROM v_q_kind THEN
    RAISE EXCEPTION 'product_kind music link failed';
  END IF;

  -- publication_class = release is enough.
  PERFORM public.link_seo_reservation_to_product(v_r_release, v_release);
  SELECT primary_seo_query_id INTO v_primary FROM public.practices WHERE id = v_release;
  IF v_primary IS DISTINCT FROM v_q_release THEN
    RAISE EXCEPTION 'publication_class release link failed';
  END IF;

  -- Factual practice is rejected. There is no client publication_class argument to spoof.
  BEGIN
    PERFORM public.link_seo_reservation_to_product(v_r_practice, v_practice);
    RAISE EXCEPTION 'practice link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err IS DISTINCT FROM 'seo_reservation_product_not_music' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT product_id FROM public.seo_query_reservations WHERE id = v_r_practice) IS NOT NULL
     OR (SELECT primary_seo_query_id FROM public.practices WHERE id = v_practice) IS NOT NULL THEN
    RAISE EXCEPTION 'rejected practice link mutated rows';
  END IF;

  BEGIN
    PERFORM public.link_seo_reservation_to_product(v_r_course, v_course);
    RAISE EXCEPTION 'course link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err IS DISTINCT FROM 'seo_reservation_product_not_music' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.link_seo_reservation_to_product(v_r_audiobook, v_audiobook);
    RAISE EXCEPTION 'audiobook link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err IS DISTINCT FROM 'seo_reservation_product_not_music' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.link_seo_reservation_to_product(v_r_post, v_post);
    RAISE EXCEPTION 'post link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err IS DISTINCT FROM 'seo_reservation_product_not_music' THEN
      RAISE;
    END IF;
  END;

  -- Aurafon non-music beta flow still links.
  PERFORM public.link_seo_reservation_to_product(v_r_aurafon, v_aurafon_practice);
  SELECT primary_seo_query_id, seo_primary_query
    INTO v_primary, v_text
  FROM public.practices WHERE id = v_aurafon_practice;
  IF v_primary IS DISTINCT FROM v_q_aurafon OR v_text IS DISTINCT FROM 'практика аурафон' THEN
    RAISE EXCEPTION 'aurafon non-music link failed';
  END IF;
  SELECT expires_at INTO v_expires FROM public.seo_query_reservations WHERE id = v_r_aurafon;
  IF v_expires IS NOT NULL THEN
    RAISE EXCEPTION 'aurafon link left an expiry';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.link_seo_reservation_to_product(uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated cannot execute link_seo_reservation_to_product';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.link_seo_reservation_to_product(uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon can execute link_seo_reservation_to_product';
  END IF;

  -- Direct RPC as authenticated still sees the factual practice row.
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.link_seo_reservation_to_product(v_r_direct, v_direct);
    RAISE EXCEPTION 'direct rpc bypass succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err IS DISTINCT FROM 'seo_reservation_product_not_music' THEN
      RAISE;
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  IF (SELECT product_id FROM public.seo_query_reservations WHERE id = v_r_direct) IS NOT NULL
     OR (SELECT primary_seo_query_id FROM public.practices WHERE id = v_direct) IS NOT NULL THEN
    RAISE EXCEPTION 'direct rpc bypass mutated rows';
  END IF;

  RAISE NOTICE 'seo_reservation_link_music_gate_behavior: ALL PASS';
END $$;

SELECT 'seo_reservation_link_music_gate_behavior: ALL PASS' AS result;
