BEGIN;

-- Sequential completion cohort for the admin funnel percent.
-- Card "Дослушавшие" stays COUNT(DISTINCT visitor_key) of audio_completed.
-- completers_among_listeners is the subset of this window's listeners
-- (audio_play_started) who also have audio_completed in the same window.
-- No new completion-zone event.

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
    WHERE p_from IS NOT NULL AND event_name='audio_play_started' AND visitor_key IS NOT NULL
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
    'completers_among_listeners',(
      SELECT count(*)::int FROM current_listeners c
      WHERE EXISTS (
        SELECT 1 FROM product_facts f
        WHERE f.event_name = 'audio_completed' AND f.visitor_key = c.visitor_key
      )
    ),
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

COMMENT ON FUNCTION public.analytics_owner_overview(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:owner-overview; existing people and WAL/MAL counts unchanged. completers_among_listeners is audio_completed intersected with this window''s audio_play_started visitor_keys.';

REVOKE ALL ON FUNCTION public.analytics_owner_overview(timestamptz,timestamptz,boolean,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_owner_overview(timestamptz,timestamptz,boolean,uuid,uuid,text,text) TO service_role;

COMMIT;
