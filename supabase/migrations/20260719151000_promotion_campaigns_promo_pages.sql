BEGIN;

-- ---------------------------------------------------------------------------
-- Extend promotion_campaigns for promo-page campaigns (legacy practice target preserved)
-- ---------------------------------------------------------------------------

ALTER TABLE public.promotion_campaigns
  ADD COLUMN IF NOT EXISTS promo_page_id uuid NULL
    REFERENCES public.promo_pages (id) ON DELETE RESTRICT;

ALTER TABLE public.promotion_campaigns
  ALTER COLUMN practice_id DROP NOT NULL;

ALTER TABLE public.promotion_campaigns
  DROP CONSTRAINT IF EXISTS promotion_campaigns_target_xor_check;

ALTER TABLE public.promotion_campaigns
  ADD CONSTRAINT promotion_campaigns_target_xor_check
  CHECK (
    (
      practice_id IS NOT NULL
      AND promo_page_id IS NULL
    )
    OR (
      practice_id IS NULL
      AND promo_page_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS promotion_campaigns_promo_page_id_idx
  ON public.promotion_campaigns (promo_page_id)
  WHERE promo_page_id IS NOT NULL;

COMMENT ON COLUMN public.promotion_campaigns.promo_page_id IS
  'Promo landing target. XOR with practice_id. RESTRICT preserves campaign history if page is removed.';

-- ---------------------------------------------------------------------------
-- RLS policy updates
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS promotion_campaigns_insert ON public.promotion_campaigns;
CREATE POLICY promotion_campaigns_insert
  ON public.promotion_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.user_can_read_author_promotion(author_id)
    AND (
      (
        practice_id IS NOT NULL
        AND promo_page_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.practices AS p
          WHERE p.id = practice_id
            AND p.author_id = promotion_campaigns.author_id
            AND p.status = 'published'
        )
      )
      OR (
        promo_page_id IS NOT NULL
        AND practice_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.promo_pages AS pp
          WHERE pp.id = promo_page_id
            AND pp.author_id = promotion_campaigns.author_id
            AND pp.status = 'published'
        )
      )
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
    AND author_id = (
      SELECT pc.author_id
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaigns.id
    )
    AND practice_id IS NOT DISTINCT FROM (
      SELECT pc.practice_id
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaigns.id
    )
    AND promo_page_id IS NOT DISTINCT FROM (
      SELECT pc.promo_page_id
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaigns.id
    )
    AND created_by = (
      SELECT pc.created_by
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaigns.id
    )
  );

-- ---------------------------------------------------------------------------
-- Keep legacy summary RPC working when promo_page campaigns exist
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_author_promotion_summary(uuid, timestamptz, timestamptz);

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
  promo_page_id uuid,
  promo_page_title text,
  promo_page_slug text,
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
      pc.promo_page_id,
      pc.updated_at,
      p.title AS practice_title,
      p.slug AS practice_slug,
      pp.public_title AS promo_page_title,
      pp.slug AS promo_page_slug,
      a.slug AS author_slug
    FROM public.promotion_campaigns AS pc
    JOIN public.authors AS a ON a.id = pc.author_id
    LEFT JOIN public.practices AS p ON p.id = pc.practice_id
    LEFT JOIN public.promo_pages AS pp ON pp.id = pc.promo_page_id
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
      ON ae.utm_campaign = cr.campaign_key
      AND ae.event_name LIKE 'promo\_%' ESCAPE '\'
      AND (
        (cr.practice_id IS NOT NULL AND ae.practice_id = cr.practice_id)
        OR (
          cr.promo_page_id IS NOT NULL
          AND ae.promo_page_id = cr.promo_page_id
        )
      )
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
    cr.promo_page_id,
    cr.promo_page_title,
    cr.promo_page_slug,
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
