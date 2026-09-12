BEGIN;

-- A visitor key represents a canonical person identity, not an event identity.
-- Events without an identity remain available to event metrics but are excluded
-- from distinct-person metrics by their existing `visitor_key IS NOT NULL` guards.
CREATE OR REPLACE FUNCTION public.analytics_product_event_facts(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS TABLE (
  event_id uuid,
  session_id uuid,
  user_id uuid,
  event_name text,
  practice_id uuid,
  author_id uuid,
  occurred_at timestamptz,
  listening_day date,
  visitor_key text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  device_type text,
  referrer_domain text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id, e.session_id, e.user_id, e.event_name, e.practice_id, pr.author_id,
    e.occurred_at,
    (e.occurred_at AT TIME ZONE 'Europe/Moscow')::date,
    public.admin_analytics_visitor_key(
      e.user_id, coalesce(s.anonymous_id, e.anonymous_session_id), e.occurred_at
    ),
    s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.device_type, s.referrer_domain
  FROM public.analytics_events e
  LEFT JOIN public.analytics_sessions s ON s.id = e.session_id
  JOIN public.practices pr ON pr.id = e.practice_id
  WHERE (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at < p_to)
    AND (p_author_id IS NULL OR pr.author_id = p_author_id)
    AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
    AND e.event_name IN (
      'practice_view', 'audio_play_started', 'audio_progress_25',
      'audio_completed', 'first_manual_library_save'
    )
    AND (
      p_include_test OR NOT (
        coalesce(e.is_staff, false)
        OR coalesce(e.is_test, false)
        OR coalesce(e.is_bot, false)
        OR coalesce(e.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
        OR coalesce(s.is_staff, false)
        OR coalesce(s.is_test, false)
        OR coalesce(s.is_bot, false)
        OR coalesce(s.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
      )
    )
    AND (
      e.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.author_members am
        WHERE am.author_id = pr.author_id AND am.user_id = e.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.analytics_product_event_facts(timestamptz, timestamptz, uuid, uuid, boolean) IS
  'audiolad:analytics:shared-product-semantics; canonical human product events, nullable canonical person identity, owner-scoped self-traffic exclusion, and Europe/Moscow listening day';

CREATE OR REPLACE FUNCTION public.author_stats_sources(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH members AS (
    SELECT am.user_id FROM public.author_members AS am WHERE am.author_id = p_author_id
  ),
  buckets AS (
    SELECT unnest(ARRAY[
      'direct', 'internal', 'telegram', 'vk', 'max', 'search', 'other_external', 'unknown'
    ]) AS bucket
  ),
  attributed AS (
    SELECT public.author_stats_source_bucket(f.utm_source,f.referrer_domain) AS bucket,f.visitor_key,f.event_name
    FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,NULL,false) f
    WHERE f.event_name IN ('practice_view','audio_play_started')
    UNION ALL
    SELECT public.author_stats_source_bucket(s.utm_source,s.referrer_domain),
      public.admin_analytics_visitor_key(e.user_id,coalesce(s.anonymous_id,e.anonymous_session_id),e.occurred_at),
      e.event_name
    FROM public.analytics_events e
    LEFT JOIN public.analytics_sessions s ON s.id=e.session_id
    WHERE e.event_name='author_page_view'
      AND e.author_id=p_author_id
      AND (p_from IS NULL OR e.occurred_at>=p_from)
      AND (p_to IS NULL OR e.occurred_at<p_to)
      AND coalesce(e.is_staff,false)=false
      AND coalesce(e.is_test,false)=false
      AND coalesce(e.is_bot,false)=false
      AND coalesce(e.traffic_class,'human')='human'
      AND (e.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM members m WHERE m.user_id=e.user_id
      ))
  ),
  agg AS (
    SELECT
      bucket,
      count(*) FILTER (WHERE event_name IN ('practice_view', 'author_page_view'))::int AS views,
      count(DISTINCT visitor_key)::int AS visitors,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS plays
    FROM attributed
    GROUP BY bucket
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'bucket', b.bucket,
      'views', coalesce(a.views, 0),
      'visitors', coalesce(a.visitors, 0),
      'plays', coalesce(a.plays, 0)
    )
    ORDER BY coalesce(a.visitors, 0) DESC, b.bucket
  ), '[]'::jsonb)
  INTO v_result
  FROM buckets AS b
  LEFT JOIN agg AS a ON a.bucket = b.bucket;

  RETURN jsonb_build_object('rows', coalesce(v_result, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.author_stats_sources(uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_stats_sources(uuid,timestamptz,timestamptz) TO service_role;

COMMIT;
