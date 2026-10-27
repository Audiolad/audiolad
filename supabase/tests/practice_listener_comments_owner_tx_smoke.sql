-- Runs after 20270127120000. Owner delete and return are one transaction.
-- A failed journal insert does not leave a deleted row.

\set ON_ERROR_STOP on

DO $$
DECLARE
  listener uuid := '11111111-1111-4111-8111-111111111111';
  actor uuid := '22222222-2222-4222-8222-222222222222';
  author_id uuid := '55555555-5555-4555-8555-555555555555';
  practice uuid := 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0';
  published_comment uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  hidden_comment uuid := 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';
  listener_deleted uuid := 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3';
  atomic_comment uuid := 'f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4';
  notice_id uuid := 'f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5';
  missing_actor uuid := 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';
  result text;
  cnt integer;
  seen_status text;
BEGIN
  INSERT INTO public.practices (
    id, author_id, title, slug, status, product_kind, catalog_visibility, published_at
  ) VALUES (
    practice, author_id, 'Журнал', 'zhurnal', 'published', 'practice', 'listed', now()
  );

  INSERT INTO public.practice_listener_comments (
    id, practice_id, user_id, kind, body, public_name, status, body_fingerprint
  ) VALUES
    (published_comment, practice, listener, 'impression', 'Живой отзыв', 'Мария', 'published', 'живой отзыв'),
    (hidden_comment, practice, listener, 'impression', 'Скрытый отзыв', 'Мария', 'hidden', 'скрытый отзыв'),
    (listener_deleted, practice, listener, 'impression', 'Свой отзыв', 'Мария', 'published', 'свой отзыв'),
    (atomic_comment, practice, listener, 'impression', 'Целый отзыв', 'Мария', 'published', 'целый отзыв');

  INSERT INTO public.practice_listener_comment_notices (
    id, recipient_user_id, comment_id, practice_id, kind
  ) VALUES (
    notice_id, actor, published_comment, practice, 'new_impression'
  );

  SELECT public.practice_listener_comment_owner_delete(
    published_comment, actor, 'f7f7f7f7-f7f7-4f7f-8f7f-f7f7f7f7f7f7', now()
  ) INTO result;
  IF result IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'owner delete must return ok, got %', result;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comments
  WHERE id = published_comment AND status = 'deleted' AND deleted_at IS NOT NULL;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'owner delete must soft-delete the row';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_moderation_events
  WHERE comment_id = published_comment AND action = 'owner_delete' AND reason = 'previous:published';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'owner delete must write previous:published in the same transaction';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_notices
  WHERE comment_id = published_comment;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'owner delete must remove notices, got %', cnt;
  END IF;

  SELECT public.practice_listener_comment_owner_return(
    published_comment, actor, 'f8f8f8f8-f8f8-4f8f-8f8f-f8f8f8f8f8f8', now()
  ) INTO result;
  IF result IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'return of a published impression must restore published, got %', result;
  END IF;

  SELECT public.practice_listener_comment_owner_delete(
    hidden_comment, actor, 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f9', now()
  ) INTO result;
  IF result IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'owner delete of a hidden comment must return ok, got %', result;
  END IF;

  SELECT public.practice_listener_comment_owner_return(
    hidden_comment, actor, 'fafafafa-fafa-4afa-8afa-fafafafafafa', now()
  ) INTO result;
  IF result IS DISTINCT FROM 'hidden' THEN
    RAISE EXCEPTION 'return of a hidden comment must restore hidden, got %', result;
  END IF;

  SELECT status INTO seen_status
  FROM public.practice_listener_comments
  WHERE id = hidden_comment AND deleted_at IS NULL;
  IF seen_status IS DISTINCT FROM 'hidden' THEN
    RAISE EXCEPTION 'hidden comment must stay hidden after return, got %', seen_status;
  END IF;

  UPDATE public.practice_listener_comments
  SET status = 'deleted', deleted_at = now(), updated_at = now()
  WHERE id = listener_deleted;

  SELECT public.practice_listener_comment_owner_return(
    listener_deleted, actor, 'fbfbfbfb-fbfb-4bfb-8bfb-fbfbfbfbfbfb', now()
  ) INTO result;
  IF result IS DISTINCT FROM 'not_owner_deleted' THEN
    RAISE EXCEPTION 'a listener delete without owner_delete must not be restored, got %', result;
  END IF;

  SELECT status INTO seen_status
  FROM public.practice_listener_comments
  WHERE id = listener_deleted;
  IF seen_status IS DISTINCT FROM 'deleted' THEN
    RAISE EXCEPTION 'listener-deleted row must stay deleted, got %', seen_status;
  END IF;

  BEGIN
    PERFORM public.practice_listener_comment_owner_delete(
      atomic_comment, missing_actor, 'fcfcfcfc-fcfc-4cfc-8cfc-fcfcfcfcfcfc', now()
    );
    RAISE EXCEPTION 'a missing actor must fail the journal insert';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;

  SELECT status INTO seen_status
  FROM public.practice_listener_comments
  WHERE id = atomic_comment;
  IF seen_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'a failed journal insert must not leave the comment deleted, got %', seen_status;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listener_comment_moderation_events
  WHERE comment_id = atomic_comment;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'a failed owner delete must not keep a journal row';
  END IF;

  SET ROLE anon;
  BEGIN
    PERFORM public.practice_listener_comment_owner_delete(
      atomic_comment, actor, 'fdfdfdfd-fdfd-4dfd-8dfd-fdfdfdfdfdfd', now()
    );
    RAISE EXCEPTION 'anon must not execute owner delete';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  SET ROLE authenticated;
  BEGIN
    PERFORM public.practice_listener_comment_owner_return(
      listener_deleted, actor, 'fefefefe-fefe-4efe-8efe-fefefefefefe', now()
    );
    RAISE EXCEPTION 'authenticated must not execute owner return';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;
END
$$;

SELECT 'practice_listener_comments_owner_tx_smoke: PASS';
