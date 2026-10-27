-- Runs after 20270126120000 on the listener-comment scratch database.
-- Music and audio posts become public. Drafts, hidden and deleted rows stay out.

\set ON_ERROR_STOP on

DO $$
DECLARE
  listener uuid := '11111111-1111-4111-8111-111111111111';
  author_id uuid := '55555555-5555-4555-8555-555555555555';
  music_comment uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  draft_comment uuid := 'f5555555-5555-4555-8555-555555555555';
  deleted_comment uuid := 'f6666666-6666-4666-8666-666666666666';
  hidden_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  post uuid := 'abababab-abab-4aba-8aba-abababababab';
  post_comment uuid := 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
  journal_id uuid := 'edededed-eded-4ded-8ded-edededededed';
  cnt integer;
BEGIN
  INSERT INTO public.practices (
    id, author_id, title, slug, status, product_kind, catalog_section, catalog_visibility, published_at
  ) VALUES (
    post, author_id, 'Дом', 'dom', 'published', 'audio_post', NULL, 'unlisted', now()
  );

  INSERT INTO public.practice_listener_comments (
    id, practice_id, user_id, kind, body, public_name, status, body_fingerprint, parent_id
  ) VALUES (
    post_comment, post, listener, 'impression', 'Про дом', 'Мария', 'published', 'про дом', NULL
  );

  SET ROLE anon;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = music_comment;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'music impression must be public after the kind gate opens, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = post_comment;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'audio post impression must be public, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id IN (draft_comment, deleted_comment, hidden_id);
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'draft, hidden and deleted rows must stay out of the anon feed, got %', cnt;
  END IF;

  RESET ROLE;

  INSERT INTO public.practice_listener_comment_moderation_events (
    id, comment_id, actor_user_id, action, reason
  ) VALUES (
    journal_id, post_comment, listener, 'owner_delete', 'previous:published'
  );

  UPDATE public.practice_listener_comments
  SET status = 'deleted', deleted_at = now()
  WHERE id = post_comment;

  SET ROLE anon;
  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id = post_comment;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'owner-deleted audio post impression must leave the feed, got %', cnt;
  END IF;
  RESET ROLE;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comments
  WHERE id = post_comment AND status = 'deleted' AND deleted_at IS NOT NULL;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'owner delete must keep the row';
  END IF;
END
$$;

-- Private products, a future schedule, and a uuid that is not a practice.
DO $$
DECLARE
  listener uuid := '11111111-1111-4111-8111-111111111111';
  author_id uuid := '55555555-5555-4555-8555-555555555555';
  private_music uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  private_practice uuid := 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
  private_music_comment uuid := 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
  private_practice_comment uuid := 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
  future_practice uuid := 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
  future_comment uuid := 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
  not_a_practice uuid := 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';
  cnt integer;
  accepts boolean;
BEGIN
  INSERT INTO public.practices (
    id, author_id, title, slug, status, product_kind, catalog_section, catalog_visibility, published_at, scheduled_publish_at
  ) VALUES
    (private_music, author_id, 'Закрытый трек', 'private-track', 'published', 'music', 'music', 'selected_users', now(), NULL),
    (private_practice, author_id, 'Закрытая практика', 'private-practice', 'published', 'practice', 'meditations', 'selected_users', now(), NULL),
    (future_practice, author_id, 'Позже', 'later', 'published', 'practice', 'meditations', 'listed', NULL, now() + interval '2 days');

  INSERT INTO public.practice_listener_comments (
    id, practice_id, user_id, kind, body, public_name, status, body_fingerprint, parent_id
  ) VALUES
    (private_music_comment, private_music, listener, 'impression', 'Тихий трек', 'Мария', 'published', 'тихий трек', NULL),
    (private_practice_comment, private_practice, listener, 'impression', 'Тихая практика', 'Мария', 'published', 'тихая практика', NULL),
    (future_comment, future_practice, listener, 'impression', 'Рано', 'Мария', 'published', 'рано', NULL);

  IF public.practice_accepts_listener_comments(private_music) THEN
    RAISE EXCEPTION 'selected_users music must not accept comments';
  END IF;
  IF public.practice_accepts_listener_comments(private_practice) THEN
    RAISE EXCEPTION 'selected_users practice must not accept comments';
  END IF;
  IF public.practice_accepts_listener_comments(future_practice) THEN
    RAISE EXCEPTION 'a future schedule must not accept comments';
  END IF;
  IF public.practice_accepts_listener_comments(not_a_practice) THEN
    RAISE EXCEPTION 'a uuid that is not a practice must not accept comments';
  END IF;
  IF public.practice_accepts_listener_comments(NULL) THEN
    RAISE EXCEPTION 'null must not accept comments';
  END IF;

  SELECT public.practice_accepts_listener_comments('abababab-abab-4aba-8aba-abababababab') INTO accepts;
  IF accepts IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'published unlisted audio post must stay commentable';
  END IF;

  SET ROLE anon;
  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_feed
  WHERE id IN (private_music_comment, private_practice_comment, future_comment);
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'private and future impressions must be absent from the anon feed, got %', cnt;
  END IF;
  RESET ROLE;
END
$$;

SELECT 'practice_listener_comments_all_kinds_smoke: PASS';
