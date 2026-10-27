-- Public comment gate and one-transaction platform-owner soft delete.
-- Repeats practice_accepts_listener_comments so a database that already
-- applied 20270126120000 without catalog_visibility still closes
-- selected_users products. Adds two service_role functions. Each function
-- updates the comment and writes the journal in the same transaction.
-- A failed journal insert leaves the comment unchanged.
-- Does not INSERT, UPDATE, or DELETE any product row.
-- Does not touch practice_ratings.
--
-- OWNER APPROVAL REQUIRED before this file is applied in production.
--
-- Rollback is not executed here. To drop only these helpers:
--   DROP FUNCTION IF EXISTS public.practice_listener_comment_owner_delete(uuid, uuid, uuid, timestamptz);
--   DROP FUNCTION IF EXISTS public.practice_listener_comment_owner_return(uuid, uuid, uuid, timestamptz);
-- Recreate practice_accepts_listener_comments from the corrected
-- 20270126120000 file. Do not drop comment rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.practice_accepts_listener_comments(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = p_practice_id
      AND p.deleted_at IS NULL
      AND p.status = 'published'
      AND p.catalog_visibility IN ('listed', 'unlisted')
      AND (
        (p.published_at IS NOT NULL AND p.published_at <= now())
        OR p.scheduled_publish_at IS NULL
        OR p.scheduled_publish_at <= now()
      )
  );
$$;

COMMENT ON FUNCTION public.practice_accepts_listener_comments(uuid) IS
  'True for a published product with catalog_visibility listed or unlisted. Private selected_users products, drafts, future schedules and ids that are not practices are false.';

REVOKE ALL ON FUNCTION public.practice_accepts_listener_comments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_accepts_listener_comments(uuid) TO anon, authenticated, service_role;

ALTER TABLE public.practice_listener_comment_moderation_events
  DROP CONSTRAINT IF EXISTS practice_listener_comment_moderation_events_action_check;

ALTER TABLE public.practice_listener_comment_moderation_events
  ADD CONSTRAINT practice_listener_comment_moderation_events_action_check
  CHECK (action IN ('hide', 'report', 'owner_delete', 'owner_return'));

CREATE OR REPLACE FUNCTION public.practice_listener_comment_owner_delete(
  p_comment_id uuid,
  p_actor_user_id uuid,
  p_event_id uuid,
  p_now timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_deleted_at timestamptz;
BEGIN
  SELECT status, deleted_at
    INTO v_status, v_deleted_at
  FROM public.practice_listener_comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF NOT FOUND OR v_status = 'deleted' OR v_deleted_at IS NOT NULL THEN
    RETURN 'not_found';
  END IF;

  IF v_status NOT IN ('published', 'hidden') THEN
    RETURN 'not_found';
  END IF;

  UPDATE public.practice_listener_comments
  SET status = 'deleted',
      deleted_at = p_now,
      updated_at = p_now
  WHERE id = p_comment_id;

  INSERT INTO public.practice_listener_comment_moderation_events (
    id, comment_id, actor_user_id, action, reason, created_at
  ) VALUES (
    p_event_id,
    p_comment_id,
    p_actor_user_id,
    'owner_delete',
    'previous:' || v_status,
    p_now
  );

  DELETE FROM public.practice_listener_comment_notices
  WHERE comment_id = p_comment_id;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.practice_listener_comment_owner_delete(uuid, uuid, uuid, timestamptz) IS
  'Platform-owner soft delete. Status, journal row and notice removal commit together. service_role only.';

CREATE OR REPLACE FUNCTION public.practice_listener_comment_owner_return(
  p_comment_id uuid,
  p_actor_user_id uuid,
  p_event_id uuid,
  p_now timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_deleted_at timestamptz;
  v_reason text;
  v_event_at timestamptz;
  v_previous text;
BEGIN
  SELECT status, deleted_at
    INTO v_status, v_deleted_at
  FROM public.practice_listener_comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'deleted' OR v_deleted_at IS NULL THEN
    RETURN 'not_found';
  END IF;

  SELECT reason, created_at
    INTO v_reason, v_event_at
  FROM public.practice_listener_comment_moderation_events
  WHERE comment_id = p_comment_id
    AND action = 'owner_delete'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_reason IS NULL OR v_event_at IS NULL OR v_event_at < v_deleted_at THEN
    RETURN 'not_owner_deleted';
  END IF;

  IF v_reason = 'previous:hidden' THEN
    v_previous := 'hidden';
  ELSIF v_reason = 'previous:published' THEN
    v_previous := 'published';
  ELSE
    RETURN 'not_owner_deleted';
  END IF;

  UPDATE public.practice_listener_comments
  SET status = v_previous,
      deleted_at = NULL,
      updated_at = p_now
  WHERE id = p_comment_id;

  INSERT INTO public.practice_listener_comment_moderation_events (
    id, comment_id, actor_user_id, action, reason, created_at
  ) VALUES (
    p_event_id,
    p_comment_id,
    p_actor_user_id,
    'owner_return',
    'status:' || v_previous,
    p_now
  );

  RETURN v_previous;
END;
$$;

COMMENT ON FUNCTION public.practice_listener_comment_owner_return(uuid, uuid, uuid, timestamptz) IS
  'Restores only a row whose current deletion is an owner_delete event, back to previous:published or previous:hidden. service_role only.';

REVOKE ALL ON FUNCTION public.practice_listener_comment_owner_delete(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.practice_listener_comment_owner_delete(uuid, uuid, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.practice_listener_comment_owner_delete(uuid, uuid, uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.practice_listener_comment_owner_delete(uuid, uuid, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.practice_listener_comment_owner_return(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.practice_listener_comment_owner_return(uuid, uuid, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.practice_listener_comment_owner_return(uuid, uuid, uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.practice_listener_comment_owner_return(uuid, uuid, uuid, timestamptz) TO service_role;

COMMIT;
