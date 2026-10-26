BEGIN;

-- Listener impressions on published meditations and audio practices.
-- Additive only: new tables, functions, policies and grants.
-- Does not alter practice_ratings, product moderation or existing rows.
-- Production apply requires a separate owner decision.

CREATE TABLE IF NOT EXISTS public.practice_listener_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.practice_listener_comments (id) ON DELETE CASCADE,
  kind text NOT NULL,
  body text NOT NULL,
  public_name text NOT NULL,
  status text NOT NULL DEFAULT 'published',
  client_request_id uuid,
  body_fingerprint text NOT NULL,
  hidden_reason text,
  hidden_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT practice_listener_comments_kind_check
    CHECK (kind IN ('impression', 'author_reply')),
  CONSTRAINT practice_listener_comments_status_check
    CHECK (status IN ('published', 'hidden', 'deleted')),
  CONSTRAINT practice_listener_comments_shape_check
    CHECK (
      (kind = 'impression' AND parent_id IS NULL)
      OR (kind = 'author_reply' AND parent_id IS NOT NULL)
    ),
  CONSTRAINT practice_listener_comments_body_check
    CHECK (char_length(body) BETWEEN 2 AND 2000),
  CONSTRAINT practice_listener_comments_public_name_check
    CHECK (char_length(public_name) BETWEEN 2 AND 40),
  CONSTRAINT practice_listener_comments_hidden_reason_check
    CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS practice_listener_comments_request_idx
  ON public.practice_listener_comments (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS practice_listener_comments_one_live_reply_idx
  ON public.practice_listener_comments (parent_id)
  WHERE kind = 'author_reply' AND status <> 'deleted';

CREATE INDEX IF NOT EXISTS practice_listener_comments_feed_idx
  ON public.practice_listener_comments (practice_id, created_at DESC, id DESC)
  WHERE kind = 'impression' AND status <> 'deleted';

CREATE INDEX IF NOT EXISTS practice_listener_comments_parent_idx
  ON public.practice_listener_comments (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS practice_listener_comments_fingerprint_idx
  ON public.practice_listener_comments (user_id, practice_id, body_fingerprint, created_at DESC)
  WHERE kind = 'impression' AND status <> 'deleted';

COMMENT ON TABLE public.practice_listener_comments IS
  'Voluntary public text impressions about meditations and audio practices, plus one author reply. Independent of practice_ratings. user_id is not granted to anon or authenticated.';

CREATE TABLE IF NOT EXISTS public.practice_listener_comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.practice_listener_comments (id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_listener_comment_reports_reason_check
    CHECK (reason IN ('spam', 'insult', 'personal_data', 'other')),
  CONSTRAINT practice_listener_comment_reports_details_check
    CHECK (details IS NULL OR char_length(details) <= 300),
  CONSTRAINT practice_listener_comment_reports_unique
    UNIQUE (comment_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS practice_listener_comment_reports_comment_idx
  ON public.practice_listener_comment_reports (comment_id, created_at DESC);

COMMENT ON TABLE public.practice_listener_comment_reports IS
  'One complaint per listener per comment. No client read. Moderators use the service role.';

CREATE TABLE IF NOT EXISTS public.practice_listener_comment_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.practice_listener_comments (id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_listener_comment_moderation_events_action_check
    CHECK (action IN ('hide', 'restore', 'report')),
  CONSTRAINT practice_listener_comment_moderation_events_reason_check
    CHECK (reason IS NULL OR char_length(reason) <= 200)
);

CREATE INDEX IF NOT EXISTS practice_listener_comment_moderation_events_comment_idx
  ON public.practice_listener_comment_moderation_events (comment_id, created_at);

COMMENT ON TABLE public.practice_listener_comment_moderation_events IS
  'Append-only moderation journal for listener impressions. Authors cannot hide criticism here.';

CREATE TABLE IF NOT EXISTS public.practice_listener_comment_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.practice_listener_comments (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  kind text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_listener_comment_notices_kind_check
    CHECK (kind IN ('new_impression', 'author_reply')),
  CONSTRAINT practice_listener_comment_notices_unique
    UNIQUE (recipient_user_id, comment_id, kind)
);

CREATE INDEX IF NOT EXISTS practice_listener_comment_notices_recipient_idx
  ON public.practice_listener_comment_notices (recipient_user_id, created_at DESC);

COMMENT ON TABLE public.practice_listener_comment_notices IS
  'In-app notices only. No email or SMS is sent from this table.';

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
      AND COALESCE(p.product_kind, 'practice') = 'practice'
      AND (p.catalog_section IS NULL OR p.catalog_section <> 'music')
      AND (
        (p.published_at IS NOT NULL AND p.published_at <= now())
        OR p.scheduled_publish_at IS NULL
        OR p.scheduled_publish_at <= now()
      )
  );
$$;

COMMENT ON FUNCTION public.practice_accepts_listener_comments(uuid) IS
  'True for a publicly available meditation or audio practice. Music and audio_post are false.';

CREATE OR REPLACE FUNCTION public.practice_listener_comment_row_visible(
  p_user_id uuid,
  p_practice_id uuid,
  p_parent_id uuid,
  p_status text,
  p_deleted_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_status IS DISTINCT FROM 'deleted'
    AND p_deleted_at IS NULL
    AND (
      (
        p_status = 'published'
        AND public.practice_accepts_listener_comments(p_practice_id)
        AND (
          p_parent_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.practice_listener_comments AS parent
            WHERE parent.id = p_parent_id
              AND parent.status = 'published'
              AND parent.deleted_at IS NULL
          )
        )
      )
      OR (p_user_id = auth.uid() AND p_status IS DISTINCT FROM 'deleted')
      OR (
        p_status = 'published'
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          JOIN public.author_members AS m ON m.author_id = pr.author_id
          WHERE pr.id = p_practice_id
            AND m.user_id = auth.uid()
        )
      )
    );
$$;

COMMENT ON FUNCTION public.practice_listener_comment_row_visible(uuid, uuid, uuid, text, timestamptz) IS
  'Public published rows, the author''s own rows, and published rows for the practice author. Hidden rows stay with their writer.';

REVOKE ALL ON FUNCTION public.practice_accepts_listener_comments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.practice_listener_comment_row_visible(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_accepts_listener_comments(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.practice_listener_comment_row_visible(uuid, uuid, uuid, text, timestamptz) TO anon, authenticated, service_role;

ALTER TABLE public.practice_listener_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_listener_comment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_listener_comment_moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_listener_comment_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visible listener comments" ON public.practice_listener_comments;
CREATE POLICY "Visible listener comments"
  ON public.practice_listener_comments
  FOR SELECT
  TO anon, authenticated
  USING (
    public.practice_listener_comment_row_visible(
      user_id,
      practice_id,
      parent_id,
      status,
      deleted_at
    )
  );

DROP POLICY IF EXISTS "Users read own listener comment notices"
  ON public.practice_listener_comment_notices;
CREATE POLICY "Users read own listener comment notices"
  ON public.practice_listener_comment_notices
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

REVOKE ALL ON TABLE public.practice_listener_comments FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_listener_comments FROM anon;
REVOKE ALL ON TABLE public.practice_listener_comments FROM authenticated;
GRANT ALL ON TABLE public.practice_listener_comments TO service_role;

REVOKE ALL ON TABLE public.practice_listener_comment_reports FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_listener_comment_reports FROM anon;
REVOKE ALL ON TABLE public.practice_listener_comment_reports FROM authenticated;
GRANT ALL ON TABLE public.practice_listener_comment_reports TO service_role;

REVOKE ALL ON TABLE public.practice_listener_comment_moderation_events FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_listener_comment_moderation_events FROM anon;
REVOKE ALL ON TABLE public.practice_listener_comment_moderation_events FROM authenticated;
GRANT ALL ON TABLE public.practice_listener_comment_moderation_events TO service_role;

REVOKE ALL ON TABLE public.practice_listener_comment_notices FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_listener_comment_notices FROM anon;
REVOKE ALL ON TABLE public.practice_listener_comment_notices FROM authenticated;
GRANT SELECT ON TABLE public.practice_listener_comment_notices TO authenticated;
GRANT ALL ON TABLE public.practice_listener_comment_notices TO service_role;

CREATE OR REPLACE VIEW public.practice_listener_comment_feed
WITH (security_barrier = true) AS
SELECT
  c.id,
  c.practice_id,
  c.parent_id,
  c.kind,
  c.body,
  c.public_name,
  c.status,
  c.created_at,
  c.edited_at,
  (c.user_id IS NOT NULL AND c.user_id = auth.uid()) AS mine
FROM public.practice_listener_comments AS c
WHERE public.practice_listener_comment_row_visible(
  c.user_id,
  c.practice_id,
  c.parent_id,
  c.status,
  c.deleted_at
);

COMMENT ON VIEW public.practice_listener_comment_feed IS
  'Public impression feed without user_id, email or profile surname. security_barrier view filters with practice_listener_comment_row_visible.';

REVOKE ALL ON TABLE public.practice_listener_comment_feed FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_listener_comment_feed FROM anon;
REVOKE ALL ON TABLE public.practice_listener_comment_feed FROM authenticated;
GRANT SELECT ON TABLE public.practice_listener_comment_feed TO anon, authenticated, service_role;

COMMIT;
