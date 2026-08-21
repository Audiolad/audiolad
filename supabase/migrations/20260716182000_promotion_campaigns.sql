BEGIN;

-- ---------------------------------------------------------------------------
-- Author promotion campaigns (UTM link builder + analytics grouping)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.promotion_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,

  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE CASCADE,

  name text NOT NULL,
  campaign_key text NOT NULL,

  status text NOT NULL DEFAULT 'active',

  created_by uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT promotion_campaigns_author_campaign_key_unique
    UNIQUE (author_id, campaign_key),

  CONSTRAINT promotion_campaigns_status_check
    CHECK (status IN ('active', 'archived')),

  CONSTRAINT promotion_campaigns_name_check
    CHECK (
      char_length(btrim(name)) > 0
      AND char_length(name) <= 120
    ),

  CONSTRAINT promotion_campaigns_campaign_key_check
    CHECK (
      campaign_key ~ '^[a-z0-9_]{2,64}$'
    )
);

CREATE INDEX IF NOT EXISTS promotion_campaigns_author_id_idx
  ON public.promotion_campaigns (author_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS promotion_campaigns_practice_id_idx
  ON public.promotion_campaigns (practice_id);

CREATE INDEX IF NOT EXISTS analytics_events_practice_campaign_created_idx
  ON public.analytics_events (practice_id, utm_campaign, created_at DESC)
  WHERE practice_id IS NOT NULL AND utm_campaign IS NOT NULL;

COMMENT ON TABLE public.promotion_campaigns IS
  'Author-defined promo campaigns; links are derived from campaign_key + channel UTM params.';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_promotion_campaigns_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promotion_campaigns_set_updated_at ON public.promotion_campaigns;
CREATE TRIGGER promotion_campaigns_set_updated_at
  BEFORE UPDATE ON public.promotion_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_promotion_campaigns_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_can_read_author_promotion(
  p_author_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      public.is_platform_admin(p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.author_members AS am
        WHERE am.author_id = p_author_id
          AND am.user_id = p_user_id
          AND am.role IN ('owner', 'editor')
      )
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_read_author_promotion(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_read_author_promotion(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.promotion_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_campaigns_select ON public.promotion_campaigns;
CREATE POLICY promotion_campaigns_select
  ON public.promotion_campaigns
  FOR SELECT
  TO authenticated
  USING (public.user_can_read_author_promotion(author_id));

DROP POLICY IF EXISTS promotion_campaigns_insert ON public.promotion_campaigns;
CREATE POLICY promotion_campaigns_insert
  ON public.promotion_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.user_can_read_author_promotion(author_id)
    AND EXISTS (
      SELECT 1
      FROM public.practices AS p
      WHERE p.id = practice_id
        AND p.author_id = promotion_campaigns.author_id
        AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS promotion_campaigns_update ON public.promotion_campaigns;
CREATE POLICY promotion_campaigns_update
  ON public.promotion_campaigns
  FOR UPDATE
  TO authenticated
  USING (public.user_can_read_author_promotion(author_id))
  WITH CHECK (
    public.user_can_read_author_promotion(author_id)
    AND author_id = (SELECT pc.author_id FROM public.promotion_campaigns AS pc WHERE pc.id = promotion_campaigns.id)
    AND practice_id = (SELECT pc.practice_id FROM public.promotion_campaigns AS pc WHERE pc.id = promotion_campaigns.id)
    AND created_by = (SELECT pc.created_by FROM public.promotion_campaigns AS pc WHERE pc.id = promotion_campaigns.id)
  );

REVOKE ALL ON public.promotion_campaigns FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.promotion_campaigns TO authenticated;
GRANT ALL ON public.promotion_campaigns TO service_role;

-- ---------------------------------------------------------------------------
-- Aggregated campaign stats (no raw PII)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_promotion_campaign_stats(
  p_campaign_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  utm_source text,
  utm_medium text,
  utm_content text,
  event_name text,
  unique_visitors bigint,
  event_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_campaign public.promotion_campaigns%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_campaign
  FROM public.promotion_campaigns AS pc
  WHERE pc.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_read_author_promotion(v_campaign.author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(NULLIF(btrim(ae.utm_source), ''), '(none)') AS utm_source,
    COALESCE(NULLIF(btrim(ae.utm_medium), ''), '(none)') AS utm_medium,
    COALESCE(NULLIF(btrim(ae.utm_content), ''), '(none)') AS utm_content,
    ae.event_name,
    COUNT(
      DISTINCT COALESCE(ae.user_id::text, ae.anonymous_session_id)
    )::bigint AS unique_visitors,
    COUNT(*)::bigint AS event_count
  FROM public.analytics_events AS ae
  WHERE ae.practice_id = v_campaign.practice_id
    AND ae.utm_campaign = v_campaign.campaign_key
    AND ae.event_name LIKE 'promo\_%' ESCAPE '\'
    AND (p_date_from IS NULL OR ae.created_at >= p_date_from)
    AND (p_date_to IS NULL OR ae.created_at <= p_date_to)
  GROUP BY 1, 2, 3, 4
  ORDER BY 4, 1, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- Author-level promotion summary across campaigns
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_author_promotion_summary(
  p_author_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  campaign_id uuid,
  campaign_name text,
  campaign_key text,
  campaign_status text,
  practice_id uuid,
  practice_title text,
  practice_slug text,
  author_slug text,
  unique_views bigint,
  unique_play_starts bigint,
  unique_registrations bigint,
  unique_saves bigint,
  total_events bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.user_can_read_author_promotion(p_author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH campaign_rows AS (
    SELECT
      pc.id,
      pc.name,
      pc.campaign_key,
      pc.status,
      pc.practice_id,
      pc.updated_at,
      p.title AS practice_title,
      p.slug AS practice_slug,
      a.slug AS author_slug
    FROM public.promotion_campaigns AS pc
    JOIN public.practices AS p ON p.id = pc.practice_id
    JOIN public.authors AS a ON a.id = pc.author_id
    WHERE pc.author_id = p_author_id
  ),
  event_stats AS (
    SELECT
      cr.id AS campaign_id,
      COUNT(*)::bigint AS total_events,
      COUNT(DISTINCT CASE
        WHEN ae.event_name = 'promo_practice_viewed'
        THEN COALESCE(ae.user_id::text, ae.anonymous_session_id)
      END)::bigint AS unique_views,
      COUNT(DISTINCT CASE
        WHEN ae.event_name = 'promo_practice_play_started'
        THEN COALESCE(ae.user_id::text, ae.anonymous_session_id)
      END)::bigint AS unique_play_starts,
      COUNT(DISTINCT CASE
        WHEN ae.event_name = 'promo_signup_completed'
        THEN COALESCE(ae.user_id::text, ae.anonymous_session_id)
      END)::bigint AS unique_registrations,
      COUNT(DISTINCT CASE
        WHEN ae.event_name = 'promo_practice_saved'
        THEN COALESCE(ae.user_id::text, ae.anonymous_session_id)
      END)::bigint AS unique_saves
    FROM campaign_rows AS cr
    LEFT JOIN public.analytics_events AS ae
      ON ae.practice_id = cr.practice_id
      AND ae.utm_campaign = cr.campaign_key
      AND ae.event_name LIKE 'promo\_%' ESCAPE '\'
      AND (p_date_from IS NULL OR ae.created_at >= p_date_from)
      AND (p_date_to IS NULL OR ae.created_at <= p_date_to)
    GROUP BY cr.id
  )
  SELECT
    cr.id,
    cr.name,
    cr.campaign_key,
    cr.status,
    cr.practice_id,
    cr.practice_title,
    cr.practice_slug,
    cr.author_slug,
    COALESCE(es.unique_views, 0),
    COALESCE(es.unique_play_starts, 0),
    COALESCE(es.unique_registrations, 0),
    COALESCE(es.unique_saves, 0),
    COALESCE(es.total_events, 0)
  FROM campaign_rows AS cr
  LEFT JOIN event_stats AS es ON es.campaign_id = cr.id
  ORDER BY cr.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_author_promotion_summary(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_author_promotion_summary(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_author_promotion_summary(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_author_promotion_summary(uuid, timestamptz, timestamptz) TO service_role;

COMMIT;
