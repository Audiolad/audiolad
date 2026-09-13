BEGIN;

-- Shared human-event facts for owner and future author overview consumers.
CREATE OR REPLACE FUNCTION public.analytics_overview_event_facts(
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_author_id uuid DEFAULT NULL, p_practice_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false, p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
) RETURNS TABLE (
  event_id uuid, session_id uuid, user_id uuid, event_name text, practice_id uuid,
  author_id uuid, occurred_at timestamptz, listening_day date, visitor_key text,
  utm_source text, device_type text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT e.id, e.session_id, e.user_id, e.event_name, e.practice_id, pr.author_id,
    e.occurred_at, (e.occurred_at AT TIME ZONE 'Europe/Moscow')::date,
    public.admin_analytics_visitor_key(e.user_id, coalesce(s.anonymous_id, e.anonymous_session_id), e.occurred_at),
    s.utm_source, s.device_type
  FROM public.analytics_events e
  LEFT JOIN public.analytics_sessions s ON s.id = e.session_id
  LEFT JOIN public.practices pr ON pr.id = e.practice_id
  WHERE (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at < p_to)
    AND (p_author_id IS NULL OR pr.author_id = p_author_id)
    AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
    AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
    AND (nullif(btrim(coalesce(p_device_type, '')), '') IS NULL OR s.device_type = p_device_type)
    AND e.event_name IN ('page_view', 'practice_view', 'audio_play_started', 'audio_completed', 'first_manual_library_save')
    AND (p_include_test OR NOT (
      coalesce(e.is_staff, false) OR coalesce(e.is_test, false) OR coalesce(e.is_bot, false)
      OR coalesce(e.traffic_class, 'human') <> 'human'
      OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
      OR coalesce(s.is_staff, false) OR coalesce(s.is_test, false) OR coalesce(s.is_bot, false)
      OR coalesce(s.traffic_class, 'human') <> 'human'
      OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
    ))
    AND (e.user_id IS NULL OR pr.author_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.author_members am WHERE am.author_id = pr.author_id AND am.user_id = e.user_id
    ));
$$;

CREATE OR REPLACE FUNCTION public.analytics_owner_overview(
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false, p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL, p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_to timestamptz := coalesce(p_to, now()); v_result jsonb;
BEGIN
  WITH product_facts AS (
    SELECT * FROM public.analytics_overview_event_facts(p_from,p_to,p_author_id,p_practice_id,p_include_test,p_utm_source,p_device_type)
  ), platform_facts AS (
    SELECT * FROM public.analytics_overview_event_facts(p_from,p_to,NULL,NULL,p_include_test,p_utm_source,p_device_type)
  ), current_listeners AS (
    SELECT DISTINCT visitor_key FROM product_facts WHERE event_name='audio_play_started' AND visitor_key IS NOT NULL
  ), historical_starts AS (
    SELECT visitor_key, occurred_at FROM public.analytics_overview_event_facts(NULL,p_from,NULL,NULL,p_include_test,NULL,NULL)
    WHERE event_name='audio_play_started' AND visitor_key IS NOT NULL
  ), wal AS (
    SELECT count(DISTINCT visitor_key)::int n FROM public.analytics_overview_event_facts(v_to-interval '7 days',v_to,p_author_id,p_practice_id,p_include_test,p_utm_source,p_device_type)
    WHERE event_name='audio_play_started' AND visitor_key IS NOT NULL
  ), previous_wal AS (
    SELECT count(DISTINCT visitor_key)::int n FROM public.analytics_overview_event_facts(v_to-interval '14 days',v_to-interval '7 days',p_author_id,p_practice_id,p_include_test,p_utm_source,p_device_type)
    WHERE event_name='audio_play_started' AND visitor_key IS NOT NULL
  ), mal AS (
    SELECT count(DISTINCT visitor_key)::int n FROM public.analytics_overview_event_facts(v_to-interval '30 days',v_to,p_author_id,p_practice_id,p_include_test,p_utm_source,p_device_type)
    WHERE event_name='audio_play_started' AND visitor_key IS NOT NULL
  ), previous_mal AS (
    SELECT count(DISTINCT visitor_key)::int n FROM public.analytics_overview_event_facts(v_to-interval '60 days',v_to-interval '30 days',p_author_id,p_practice_id,p_include_test,p_utm_source,p_device_type)
    WHERE event_name='audio_play_started' AND visitor_key IS NOT NULL
  )
  SELECT jsonb_build_object(
    'real_visitors',(SELECT count(DISTINCT visitor_key)::int FROM platform_facts WHERE event_name='page_view' AND visitor_key IS NOT NULL),
    'practice_visitors',(SELECT count(DISTINCT visitor_key)::int FROM product_facts WHERE event_name='practice_view' AND visitor_key IS NOT NULL),
    'listeners',(SELECT count(*)::int FROM current_listeners),
    'completers',(SELECT count(DISTINCT visitor_key)::int FROM product_facts WHERE event_name='audio_completed' AND visitor_key IS NOT NULL),
    'practice_views',(SELECT count(*)::int FROM product_facts WHERE event_name='practice_view'),
    'play_starts',(SELECT count(*)::int FROM product_facts WHERE event_name='audio_play_started'),
    'completions',(SELECT count(*)::int FROM product_facts WHERE event_name='audio_completed'),
    'new_listeners',(SELECT count(*)::int FROM current_listeners c WHERE NOT EXISTS (SELECT 1 FROM historical_starts h WHERE h.visitor_key=c.visitor_key)),
    'returning_listeners',(SELECT count(*)::int FROM current_listeners c WHERE EXISTS (SELECT 1 FROM historical_starts h WHERE h.visitor_key=c.visitor_key)),
    'repeat_listeners',(SELECT count(*)::int FROM (SELECT visitor_key FROM product_facts WHERE event_name='audio_play_started' AND visitor_key IS NOT NULL GROUP BY visitor_key HAVING count(DISTINCT listening_day)>=2) x),
    'wal',(SELECT n FROM wal),'previous_wal',(SELECT n FROM previous_wal),
    'mal',(SELECT n FROM mal),'previous_mal',(SELECT n FROM previous_mal)
  ) INTO v_result;
  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_overview_event_facts(timestamptz,timestamptz,uuid,uuid,boolean,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_owner_overview(timestamptz,timestamptz,boolean,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_overview_event_facts(timestamptz,timestamptz,uuid,uuid,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_owner_overview(timestamptz,timestamptz,boolean,uuid,uuid,text,text) TO service_role;
COMMIT;
