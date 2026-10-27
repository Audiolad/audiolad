-- Listener impressions on every publicly readable published product.
-- Replaces practice_accepts_listener_comments only, and widens the
-- moderation journal so the platform owner can record a soft delete.
-- catalog_visibility must be listed or unlisted. selected_users stays private.
-- Does not INSERT, UPDATE, or DELETE any product or comment row.
-- Does not touch practice_ratings. Star totals stay a separate table.
--
-- OWNER APPROVAL REQUIRED before this file is applied in production.
--
-- Rollback is not executed here. To put the previous gate back, recreate
-- public.practice_accepts_listener_comments(uuid) from
-- 20270124150000_listener_comments_by_product_type.sql and restrict
-- practice_listener_comment_moderation_events.action to ('hide', 'report').
-- Do not drop the comment rows.

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

COMMENT ON CONSTRAINT practice_listener_comment_moderation_events_action_check
  ON public.practice_listener_comment_moderation_events IS
  'hide and report stay moderator journal actions. owner_delete and owner_return are the platform owner soft-delete audit.';

COMMIT;
