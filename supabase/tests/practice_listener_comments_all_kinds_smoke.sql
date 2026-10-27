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
    id, author_id, title, slug, status, product_kind, catalog_section, published_at
  ) VALUES (
    post, author_id, 'Дом', 'dom', 'published', 'audio_post', NULL, now()
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

SELECT 'practice_listener_comments_all_kinds_smoke: PASS';
