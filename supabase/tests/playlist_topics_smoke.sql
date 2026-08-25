-- Isolated smoke for playlist_topics + set_playlist_topics.
-- Apply only on a stub database after
-- scripts/lib/playlist-topics-sql-stub.sql and
-- 20260825141000_playlist_topics.sql.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_playlist_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  money_id uuid := '11111111-1111-4111-8111-111111111111';
  purpose_id uuid := '22222222-2222-4222-8222-222222222222';
  calm_id uuid := '33333333-3333-4333-8333-333333333333';
  energy_id uuid := '44444444-4444-4444-8444-444444444444';
  inactive_id uuid := '55555555-5555-4555-8555-555555555555';
  topic_count integer;
  result jsonb;
BEGIN
  INSERT INTO public.playlists (id, title, visibility, slug, published_at, listed_at)
  VALUES (v_playlist_id, 'Витрина', 'public', 'vitrina', now(), now());

  INSERT INTO public.topics (id, key, slug, title, is_active, sort_order)
  VALUES
    (money_id, 'money', 'money', 'Деньги', true, 10),
    (purpose_id, 'purpose', 'purpose', 'Предназначение', true, 70),
    (calm_id, 'calm', 'calm', 'Спокойствие', true, 30),
    (energy_id, 'energy', 'energy', 'Энергия', true, 60),
    (inactive_id, 'archived', 'archived', 'Архив', false, 90);

  result := public.set_playlist_topics(v_playlist_id, ARRAY['money', 'purpose']);

  IF result ->> 'playlist_id' <> v_playlist_id::text THEN
    RAISE EXCEPTION 'rpc must return playlist_id';
  END IF;

  SELECT count(*) INTO topic_count
  FROM public.playlist_topics
  WHERE playlist_id = v_playlist_id;

  IF topic_count <> 2 THEN
    RAISE EXCEPTION 'expected 2 playlist_topics, got %', topic_count;
  END IF;

  result := public.set_playlist_topics(v_playlist_id, ARRAY['calm']);

  SELECT count(*) INTO topic_count
  FROM public.playlist_topics
  WHERE playlist_id = v_playlist_id;

  IF topic_count <> 1 THEN
    RAISE EXCEPTION 'replace must leave 1 topic, got %', topic_count;
  END IF;

  BEGIN
    PERFORM public.set_playlist_topics(
      v_playlist_id,
      ARRAY['money', 'purpose', 'calm', 'energy']
    );
    RAISE EXCEPTION 'more than 3 topics must fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%topic_limit_exceeded%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.set_playlist_topics(v_playlist_id, ARRAY['money', 'money']);
    RAISE EXCEPTION 'duplicate topics must fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%duplicate_topic_keys%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.set_playlist_topics(v_playlist_id, ARRAY['archived']);
    RAISE EXCEPTION 'inactive topic must fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%topic_not_found%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.set_playlist_topics(v_playlist_id, ARRAY['unknown-key']);
    RAISE EXCEPTION 'unknown topic must fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%topic_not_found%' THEN
        RAISE;
      END IF;
  END;

  result := public.set_playlist_topics(v_playlist_id, ARRAY[]::text[]);

  SELECT count(*) INTO topic_count
  FROM public.playlist_topics
  WHERE playlist_id = v_playlist_id;

  IF topic_count <> 0 THEN
    RAISE EXCEPTION 'empty topic set must clear assignments, got %', topic_count;
  END IF;

  IF (result ->> 'topic_count')::integer <> 0 THEN
    RAISE EXCEPTION 'empty assignment remains published-capable';
  END IF;
END;
$$;
