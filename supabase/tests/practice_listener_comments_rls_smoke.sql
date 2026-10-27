\set ON_ERROR_STOP on

DO $$
DECLARE
  listener uuid := '11111111-1111-4111-8111-111111111111';
  author_user uuid := '22222222-2222-4222-8222-222222222222';
  other_user uuid := '33333333-3333-4333-8333-333333333333';
  author_id uuid := '55555555-5555-4555-8555-555555555555';
  leak_user uuid := '66666666-6666-4666-8666-666666666666';
  mail_user uuid := '77777777-7777-4777-8777-777777777777';
  name_user uuid := '88888888-8888-4888-8888-888888888888';
  practice uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  music uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  comment_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  hidden_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  music_comment uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  leak_comment uuid := 'f1111111-1111-4111-8111-111111111111';
  mail_comment uuid := 'f2222222-2222-4222-8222-222222222222';
  name_comment uuid := 'f3333333-3333-4333-8333-333333333333';
  reply_id uuid := 'f4444444-4444-4444-8444-444444444444';
  draft uuid := '99999999-9999-4999-8999-999999999999';
  draft_comment uuid := 'f5555555-5555-4555-8555-555555555555';
  deleted_comment uuid := 'f6666666-6666-4666-8666-666666666666';
  workspace_avatar text := 'https://cdn.example/workspaces/55555555-5555-4555-8555-555555555555/avatar.webp';
  safe_avatar text := 'https://cdn.example/pictures/maria.webp';
  cnt integer;
  seen_user integer;
  seen_avatar text;
BEGIN
  INSERT INTO auth.users (id) VALUES (listener), (author_user), (other_user), (leak_user), (mail_user), (name_user);
  INSERT INTO public.authors (id, name, slug, avatar_url)
  VALUES (author_id, 'Анна Светлая', 'anna', workspace_avatar);
  INSERT INTO public.practices (
    id, author_id, title, slug, status, product_kind, catalog_section, catalog_visibility, published_at
  ) VALUES
    (practice, author_id, 'Тихая', 'tihaya', 'published', 'practice', 'meditations', 'listed', now()),
    (music, author_id, 'Трек', 'trek', 'published', 'music', 'music', 'listed', now()),
    (draft, author_id, 'Черновик', 'chernovik', 'draft', 'practice', 'meditations', 'listed', NULL);
  INSERT INTO public.author_members (author_id, user_id) VALUES (author_id, author_user);

  INSERT INTO public.profiles (id, full_name, avatar_url, avatar_path) VALUES
    (listener, 'Мария Петрова', safe_avatar, NULL),
    (leak_user, 'Илья Север', 'https://cdn.example/sign/' || leak_user::text || '/photo.webp?token=secret', leak_user::text || '/photo.webp'),
    (mail_user, 'Ольга Почта', 'https://olga@cdn.example/a.webp', NULL),
    (name_user, 'Ольга Петрова', 'https://cdn.example/Петрова.webp', NULL),
    (author_user, 'Анна Светлая', 'https://cdn.example/people/anna-private.webp', author_user::text || '/face.webp');

  INSERT INTO public.practice_listener_comments (
    id, practice_id, user_id, kind, body, public_name, status, body_fingerprint, parent_id
  ) VALUES
    (comment_id, practice, listener, 'impression', 'Стало спокойнее', 'Мария', 'published', 'стало спокойнее', NULL),
    (hidden_id, practice, listener, 'impression', 'Скрытый текст', 'Мария', 'hidden', 'скрытый текст', NULL),
    (music_comment, music, listener, 'impression', 'Про музыку', 'Мария', 'published', 'про музыку', NULL),
    (leak_comment, practice, leak_user, 'impression', 'Тихий вечер', 'Илья', 'published', 'тихий вечер', NULL),
    (mail_comment, practice, mail_user, 'impression', 'Мягкий звук', 'Ольга', 'published', 'мягкий звук', NULL),
    (name_comment, practice, name_user, 'impression', 'Ровный голос', 'Ольга', 'published', 'ровный голос', NULL),
    (reply_id, practice, author_user, 'author_reply', 'Спасибо за отзыв', 'Анна', 'published', 'спасибо за отзыв', comment_id),
    (draft_comment, draft, listener, 'impression', 'Черновой отзыв', 'Мария', 'published', 'черновой отзыв', NULL),
    (deleted_comment, practice, listener, 'impression', 'Удалённый отзыв', 'Мария', 'deleted', 'удалённый отзыв', NULL);

  UPDATE public.practice_listener_comments
  SET deleted_at = now()
  WHERE id = deleted_comment;

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
  IF cnt <> 5 THEN
    RAISE EXCEPTION 'anon feed should show four published impressions and one reply, got %', cnt;
  END IF;

  SELECT avatar_url INTO seen_avatar
  FROM public.practice_listener_comment_feed
  WHERE id = comment_id;
  IF seen_avatar IS DISTINCT FROM safe_avatar THEN
    RAISE EXCEPTION 'published impression should show the safe public avatar, got %', seen_avatar;
  END IF;

  SELECT avatar_url INTO seen_avatar
  FROM public.practice_listener_comment_feed
  WHERE id = leak_comment;
  IF seen_avatar IS DISTINCT FROM '/api/listener-comment-avatars/' || leak_comment::text THEN
    RAISE EXCEPTION 'private storage should become a comment proxy, got %', seen_avatar;
  END IF;
  IF position(leak_user::text in seen_avatar) > 0 OR position('token=' in seen_avatar) > 0 THEN
    RAISE EXCEPTION 'proxy avatar leaked the listener id or a signed token';
  END IF;

  SELECT avatar_url INTO seen_avatar
  FROM public.practice_listener_comment_feed
  WHERE id = mail_comment;
  IF seen_avatar IS NOT NULL THEN
    RAISE EXCEPTION 'an address with email must not be published, got %', seen_avatar;
  END IF;

  SELECT avatar_url INTO seen_avatar
  FROM public.practice_listener_comment_feed
  WHERE id = name_comment;
  IF seen_avatar IS NOT NULL THEN
    RAISE EXCEPTION 'an address with the surname must not be published, got %', seen_avatar;
  END IF;

  SELECT avatar_url INTO seen_avatar
  FROM public.practice_listener_comment_feed
  WHERE id = reply_id;
  IF seen_avatar IS DISTINCT FROM workspace_avatar THEN
    RAISE EXCEPTION 'author reply should use the workspace avatar, got %', seen_avatar;
  END IF;
  IF position('anna-private' in seen_avatar) > 0 OR position(author_user::text in seen_avatar) > 0 THEN
    RAISE EXCEPTION 'author reply leaked the personal profile picture';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.practice_listener_comment_feed
    WHERE avatar_url IS NOT NULL
      AND (
        position('@' in avatar_url) > 0
        OR position('token=' in lower(avatar_url)) > 0
        OR position('/user-avatars/' in lower(avatar_url)) > 0
        OR position(listener::text in avatar_url) > 0
        OR position(leak_user::text in avatar_url) > 0
        OR position(mail_user::text in avatar_url) > 0
        OR position(author_user::text in avatar_url) > 0
        OR position('Петрова' in avatar_url) > 0
        OR position('петрова' in avatar_url) > 0
      )
  ) THEN
    RAISE EXCEPTION 'feed avatar leaked private data';
  END IF;

  SELECT public.practice_listener_comment_public_avatar(hidden_id) INTO seen_avatar;
  IF seen_avatar IS NOT NULL THEN
    RAISE EXCEPTION 'hidden impression avatar must stay hidden for anon';
  END IF;

  SELECT public.practice_listener_comment_public_avatar(comment_id) INTO seen_avatar;
  IF seen_avatar IS DISTINCT FROM safe_avatar THEN
    RAISE EXCEPTION 'visible impression avatar must follow the feed, got %', seen_avatar;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id IN (draft_comment, music_comment, hidden_id, deleted_comment);
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'unpublished, music, hidden and deleted rows must stay out of the anon feed, got %', cnt;
  END IF;

  SELECT public.practice_listener_comment_public_avatar(draft_comment) INTO seen_avatar;
  IF seen_avatar IS NOT NULL THEN
    RAISE EXCEPTION 'unpublished practice must not serve an avatar, got %', seen_avatar;
  END IF;

  SELECT public.practice_listener_comment_public_avatar(music_comment) INTO seen_avatar;
  IF seen_avatar IS NOT NULL THEN
    RAISE EXCEPTION 'music product must not serve an avatar, got %', seen_avatar;
  END IF;

  SELECT public.practice_listener_comment_public_avatar(deleted_comment) INTO seen_avatar;
  IF seen_avatar IS NOT NULL THEN
    RAISE EXCEPTION 'deleted impression must not serve an avatar, got %', seen_avatar;
  END IF;

  BEGIN
    PERFORM public.practice_listener_safe_avatar_url(safe_avatar, listener, 'Мария Петрова');
    RAISE EXCEPTION 'anon must not call the avatar helper';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM avatar_path FROM public.profiles;
    RAISE EXCEPTION 'anon must not read profile avatar paths';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

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
    AND column_name IN ('user_id', 'email', 'full_name', 'avatar_path', 'surname');
  IF seen_user <> 0 THEN
    RAISE EXCEPTION 'feed must not expose user_id, email, full_name, avatar_path or surname';
  END IF;

  SELECT count(*) INTO cnt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'practice_listener_comment_feed'
    AND column_name = 'avatar_url';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'feed must expose avatar_url';
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
  SELECT avatar_url INTO seen_avatar
  FROM public.practice_listener_comment_feed
  WHERE id = hidden_id;
  IF seen_avatar IS DISTINCT FROM safe_avatar THEN
    RAISE EXCEPTION 'owner should see the safe avatar on a hidden impression, got %', seen_avatar;
  END IF;
  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = deleted_comment;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'owner must not see a deleted impression';
  END IF;
  SELECT public.practice_listener_comment_public_avatar(deleted_comment) INTO seen_avatar;
  IF seen_avatar IS NOT NULL THEN
    RAISE EXCEPTION 'owner must not receive an avatar for a deleted impression, got %', seen_avatar;
  END IF;
  SELECT public.practice_listener_comment_public_avatar(draft_comment) INTO seen_avatar;
  IF seen_avatar IS DISTINCT FROM safe_avatar THEN
    RAISE EXCEPTION 'owner still sees their own impression on an unpublished practice, got %', seen_avatar;
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
  BEGIN
    PERFORM 1 FROM public.practice_listener_comment_edits;
    RAISE EXCEPTION 'authenticated must not read edit marks';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    PERFORM public.practice_listener_comment_insert_limited(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      practice,
      listener,
      NULL,
      'impression',
      'Чужой слот',
      'Мария',
      'published',
      NULL,
      'чужой слот',
      now(),
      now() - interval '10 minutes',
      6
    );
    RAISE EXCEPTION 'authenticated must not claim a comment slot';
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
