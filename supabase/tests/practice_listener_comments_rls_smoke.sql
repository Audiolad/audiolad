\set ON_ERROR_STOP on

DO $$
DECLARE
  listener uuid := '11111111-1111-4111-8111-111111111111';
  author_user uuid := '22222222-2222-4222-8222-222222222222';
  other_user uuid := '33333333-3333-4333-8333-333333333333';
  author_id uuid := '55555555-5555-4555-8555-555555555555';
  practice uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  music uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  comment_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  hidden_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  music_comment uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  cnt integer;
  seen_user integer;
BEGIN
  INSERT INTO auth.users (id) VALUES (listener), (author_user), (other_user);
  INSERT INTO public.authors (id, name, slug) VALUES (author_id, 'Анна Светлая', 'anna');
  INSERT INTO public.practices (
    id, author_id, title, slug, status, product_kind, catalog_section, published_at
  ) VALUES
    (practice, author_id, 'Тихая', 'tihaya', 'published', 'practice', 'meditations', now()),
    (music, author_id, 'Трек', 'trek', 'published', 'music', 'music', now());
  INSERT INTO public.author_members (author_id, user_id) VALUES (author_id, author_user);

  INSERT INTO public.practice_listener_comments (
    id, practice_id, user_id, kind, body, public_name, status, body_fingerprint
  ) VALUES
    (comment_id, practice, listener, 'impression', 'Стало спокойнее', 'Мария', 'published', 'стало спокойнее'),
    (hidden_id, practice, listener, 'impression', 'Скрытый текст', 'Мария', 'hidden', 'скрытый текст'),
    (music_comment, music, listener, 'impression', 'Про музыку', 'Мария', 'published', 'про музыку');

  SET ROLE anon;
  BEGIN
    PERFORM 1 FROM public.practice_listener_comments;
    RAISE EXCEPTION 'anon must not read the base table';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE practice_id = practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'anon feed should show only the published impression, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = music_comment;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'music impressions must stay out of the feed';
  END IF;

  SELECT count(*) INTO seen_user
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'practice_listener_comment_feed'
    AND column_name IN ('user_id', 'email', 'full_name');
  IF seen_user <> 0 THEN
    RAISE EXCEPTION 'feed must not expose user_id, email or full_name';
  END IF;

  BEGIN
    INSERT INTO public.practice_listener_comments (
      practice_id, user_id, kind, body, public_name, body_fingerprint
    ) VALUES (practice, listener, 'impression', 'Взлом', 'Анон', 'взлом');
    RAISE EXCEPTION 'anon insert must fail';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', other_user::text, true);
  SET ROLE authenticated;
  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = hidden_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'another listener must not see a hidden impression';
  END IF;
  BEGIN
    DELETE FROM public.practice_listener_comments WHERE id = comment_id;
    RAISE EXCEPTION 'authenticated delete must fail';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', listener::text, true);
  SET ROLE authenticated;
  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = hidden_id AND mine IS TRUE;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'owner must see their hidden impression';
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', author_user::text, true);
  SET ROLE authenticated;
  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = comment_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'author must see the published impression';
  END IF;
  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = hidden_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'author must not see a hidden impression';
  END IF;
  RESET ROLE;

  SET ROLE authenticated;
  BEGIN
    PERFORM 1 FROM public.practice_listener_comment_reports;
    RAISE EXCEPTION 'authenticated must not read reports';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.practice_listener_comment_moderation_events;
    RAISE EXCEPTION 'authenticated must not read the moderation journal';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  SELECT count(*) INTO cnt FROM public.practice_listener_comment_reports;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'reports stay service-role only and this scratch inserted none, got %', cnt;
  END IF;
END
$$;

SELECT 'practice_listener_comments_rls_smoke: PASS';
