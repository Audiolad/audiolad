BEGIN;

-- Shared product-analytics facts. This is deliberately a function, rather than
-- a view/materialization: it keeps the event predicate in one audited place and
-- applies the content owner at the event's practice.
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
  device_type text
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
    coalesce(public.admin_analytics_visitor_key(
      e.user_id, coalesce(s.anonymous_id, e.anonymous_session_id), e.occurred_at
    ), e.id::text),
    s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.device_type
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
    -- This is content-owner scoped: being a member of Author A never hides an
    -- event for Author B.
    AND (
      e.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.author_members am
        WHERE am.author_id = pr.author_id AND am.user_id = e.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.analytics_product_event_facts(timestamptz, timestamptz, uuid, uuid, boolean) IS
  'audiolad:analytics:shared-product-semantics; canonical human product events, identity, owner-scoped self-traffic exclusion, and Europe/Moscow listening day';

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_window_metrics(
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false, p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL, p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH e AS (
    SELECT * FROM public.analytics_product_event_facts(
      p_from, p_to, p_author_id, p_practice_id, p_include_test
    )
    WHERE public.admin_analytics_p2_utm_matches(p_utm_source, utm_source)
      AND (nullif(btrim(coalesce(p_device_type, '')), '') IS NULL OR device_type = p_device_type)
  )
  SELECT jsonb_build_object(
    'sessions', count(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)::int,
    'visitors', count(DISTINCT visitor_key)::int,
    'registrations', 0,
    'excluded_service_sessions', 0, 'excluded_service_visitors', 0,
    'practice_views', count(*) FILTER (WHERE event_name = 'practice_view')::int,
    'play_starts', count(*) FILTER (WHERE event_name = 'audio_play_started')::int,
    'completions', count(*) FILTER (WHERE event_name = 'audio_completed')::int,
    'saves', count(*) FILTER (WHERE event_name = 'first_manual_library_save')::int,
    'practice_visitors', count(DISTINCT visitor_key) FILTER (WHERE event_name = 'practice_view')::int,
    'listeners', count(DISTINCT visitor_key) FILTER (WHERE event_name = 'audio_play_started')::int,
    'completers', count(DISTINCT visitor_key) FILTER (WHERE event_name = 'audio_completed')::int,
    'savers', count(DISTINCT visitor_key) FILTER (WHERE event_name = 'first_manual_library_save')::int
  ) FROM e;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_summary(
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false, p_prev_from timestamptz DEFAULT NULL,
  p_prev_to timestamptz DEFAULT NULL, p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL, p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c jsonb; prev jsonb;
BEGIN
 c := public.admin_analytics_p2_window_metrics(p_from,p_to,p_include_test,p_author_id,p_practice_id,p_utm_source,p_device_type);
 IF p_prev_from IS NOT NULL AND p_prev_to IS NOT NULL THEN
   prev := public.admin_analytics_p2_window_metrics(p_prev_from,p_prev_to,p_include_test,p_author_id,p_practice_id,p_utm_source,p_device_type);
 END IF;
 RETURN jsonb_build_object('audience', jsonb_build_object('sessions',c->'sessions','visitors',c->'visitors','registrations',c->'registrations','excluded_service_sessions',c->'excluded_service_sessions','excluded_service_visitors',c->'excluded_service_visitors'),
  'events',jsonb_build_object('practice_views',c->'practice_views','play_starts',c->'play_starts','completions',c->'completions','saves',c->'saves'),
  'people',jsonb_build_object('practice_visitors',c->'practice_visitors','listeners',c->'listeners','completers',c->'completers','savers',c->'savers'),
  'purchases',NULL,'previous',CASE WHEN prev IS NULL THEN NULL ELSE jsonb_build_object('sessions',prev->'sessions','visitors',prev->'visitors','registrations',prev->'registrations','practice_views',prev->'practice_views','play_starts',prev->'play_starts','listeners',prev->'listeners','completions',prev->'completions','saves',prev->'saves','savers',prev->'savers') END);
END $$;

CREATE OR REPLACE FUNCTION public.author_stats_summary(p_author_id uuid, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 WITH e AS (SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,NULL,false)),
 sales AS (SELECT public.author_canonical_sales_counts(p_author_id,p_from,p_to,false,true) s)
 SELECT jsonb_build_object(
  'author_page_views',0,'author_page_unique_visitors',0,
  'practice_views',count(*) FILTER(WHERE event_name='practice_view')::int,
  'practice_unique_visitors',count(DISTINCT visitor_key) FILTER(WHERE event_name='practice_view')::int,
  'plays',count(*) FILTER(WHERE event_name='audio_play_started')::int,
  'progress_25',count(*) FILTER(WHERE event_name='audio_progress_25')::int,
  'completions',count(*) FILTER(WHERE event_name='audio_completed')::int,
  'library_saves',0,
  'gross_purchases',coalesce(((SELECT s FROM sales)->>'gross_purchases')::int,0),
  'refund_sales',coalesce(((SELECT s FROM sales)->>'refund_sales')::int,0),
  'full_refunds',coalesce(((SELECT s FROM sales)->>'full_refunds')::int,0),
  'partial_refunds',coalesce(((SELECT s FROM sales)->>'partial_refunds')::int,0),
  'net_sales',coalesce(((SELECT s FROM sales)->>'net_sales')::int,0),
  'gross_revenue_minor',coalesce(((SELECT s FROM sales)->>'gross_revenue_minor')::bigint,0),
  'refunded_amount_minor',coalesce(((SELECT s FROM sales)->>'refunded_amount_minor')::bigint,0),
  'net_revenue_minor',coalesce(((SELECT s FROM sales)->>'net_revenue_minor')::bigint,0),
  'view_to_play_rate',public.author_stats_rate(count(*) FILTER(WHERE event_name='audio_play_started'),count(*) FILTER(WHERE event_name='practice_view')),
  'play_to_complete_rate',public.author_stats_rate(count(*) FILTER(WHERE event_name='audio_completed'),count(*) FILTER(WHERE event_name='audio_play_started'))
 ) FROM e;
$$;

CREATE OR REPLACE FUNCTION public.author_stats_products(p_author_id uuid, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 WITH e AS (SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,NULL,false)),
 a AS (SELECT practice_id,
   count(*) FILTER(WHERE event_name='practice_view')::int views,
   count(DISTINCT visitor_key) FILTER(WHERE event_name='practice_view')::int visitors,
   count(*) FILTER(WHERE event_name='audio_play_started')::int plays,
   count(*) FILTER(WHERE event_name='audio_progress_25')::int progress,
   count(*) FILTER(WHERE event_name='audio_completed')::int completions
   FROM e GROUP BY practice_id)
 SELECT jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object(
   'product_slug',p.slug,'title',p.title,'slug',p.slug,'status',p.status,'is_free',p.is_free,'price',p.price,
   'practice_views',coalesce(a.views,0),'practice_unique_visitors',coalesce(a.visitors,0),'plays',coalesce(a.plays,0),
   'progress_25',coalesce(a.progress,0),'completions',coalesce(a.completions,0),
   'library_saves',0,'gross_purchases',0,'refund_sales',0,'full_refunds',0,'partial_refunds',0,'net_sales',0,
   'gross_revenue_minor',0,'refunded_amount_minor',0,'net_revenue_minor',0,
   'view_to_play_rate',public.author_stats_rate(coalesce(a.plays,0),coalesce(a.views,0)),
   'play_to_complete_rate',public.author_stats_rate(coalesce(a.completions,0),coalesce(a.plays,0))
 ) ORDER BY coalesce(a.views,0) DESC,p.title),'[]'::jsonb))
 FROM public.practices p LEFT JOIN a ON a.practice_id=p.id WHERE p.author_id=p_author_id;
$$;

-- P2 breakdowns deliberately aggregate the same canonical fact function.
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_practices(
 p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,p_include_test boolean DEFAULT false,p_author_id uuid DEFAULT NULL,p_practice_id uuid DEFAULT NULL,p_utm_source text DEFAULT NULL,p_device_type text DEFAULT NULL,p_sort text DEFAULT 'play_starts',p_sort_dir text DEFAULT 'desc',p_limit int DEFAULT 20,p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH e AS (SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,p_practice_id,p_include_test) WHERE public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (nullif(btrim(coalesce(p_device_type,'')),'') IS NULL OR device_type=p_device_type)),
 a AS (SELECT practice_id,count(*) FILTER(WHERE event_name='practice_view')::int views,count(DISTINCT visitor_key) FILTER(WHERE event_name='practice_view')::int unique_visitors,count(*) FILTER(WHERE event_name='audio_play_started')::int play_starts,count(DISTINCT visitor_key) FILTER(WHERE event_name='audio_play_started')::int unique_listeners,count(*) FILTER(WHERE event_name='audio_completed')::int completions,count(DISTINCT visitor_key) FILTER(WHERE event_name='audio_completed')::int unique_completers,count(*) FILTER(WHERE event_name='first_manual_library_save')::int saves,count(DISTINCT visitor_key) FILTER(WHERE event_name='first_manual_library_save')::int unique_savers FROM e GROUP BY practice_id)
 SELECT jsonb_build_object('total',count(*)::int,'rows',coalesce(jsonb_agg(jsonb_build_object('practiceId',a.practice_id,'title',p.title,'authorId',p.author_id,'authorName',au.name,'authorSlug',au.slug,'practiceSlug',p.slug,'href','/practice/'||au.slug||'/'||p.slug,'views',a.views,'uniqueVisitors',a.unique_visitors,'playStarts',a.play_starts,'uniqueListeners',a.unique_listeners,'completions',a.completions,'uniqueCompleters',a.unique_completers,'saves',a.saves,'uniqueSavers',a.unique_savers) ORDER BY a.play_starts DESC,a.views DESC),'[]'::jsonb)) FROM a JOIN public.practices p ON p.id=a.practice_id LEFT JOIN public.authors au ON au.id=p.author_id;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_authors(
 p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,p_include_test boolean DEFAULT false,p_author_id uuid DEFAULT NULL,p_practice_id uuid DEFAULT NULL,p_utm_source text DEFAULT NULL,p_device_type text DEFAULT NULL,p_sort text DEFAULT 'play_starts',p_sort_dir text DEFAULT 'desc',p_limit int DEFAULT 20,p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH e AS (SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,p_practice_id,p_include_test) WHERE public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (nullif(btrim(coalesce(p_device_type,'')),'') IS NULL OR device_type=p_device_type)),
 a AS (SELECT author_id,count(*) FILTER(WHERE event_name='practice_view')::int views,count(*) FILTER(WHERE event_name='audio_play_started')::int play_starts,count(DISTINCT visitor_key) FILTER(WHERE event_name='audio_play_started')::int unique_listeners,count(*) FILTER(WHERE event_name='audio_completed')::int completions,count(*) FILTER(WHERE event_name='first_manual_library_save')::int saves FROM e GROUP BY author_id)
 SELECT jsonb_build_object('total',count(*)::int,'rows',coalesce(jsonb_agg(jsonb_build_object('authorId',a.author_id,'name',au.name,'slug',au.slug,'href','/authors/'||au.slug,'publishedPractices',(SELECT count(*)::int FROM public.practices p WHERE p.author_id=a.author_id AND p.status='published'),'views',a.views,'playStarts',a.play_starts,'uniqueListeners',a.unique_listeners,'completions',a.completions,'saves',a.saves) ORDER BY a.play_starts DESC,a.views DESC),'[]'::jsonb)) FROM a JOIN public.authors au ON au.id=a.author_id;
$$;

-- Keep the existing response envelope while sourcing all product counts from
-- the shared facts. Page, sale, and library facts remain their local domains.
CREATE OR REPLACE FUNCTION public.author_stats_timeseries(p_author_id uuid,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH bounds AS (SELECT coalesce(p_from,now()-interval '1 day') f,coalesce(p_to,now()) t),
 days AS (SELECT generate_series(date_trunc('day',f AT TIME ZONE 'Europe/Moscow'),date_trunc('day',(t-interval '1 microsecond') AT TIME ZONE 'Europe/Moscow'),interval '1 day')::date d FROM bounds),
 e AS (SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,NULL,false)),
 a AS (SELECT listening_day d,count(*) FILTER(WHERE event_name='practice_view')::int views,count(DISTINCT visitor_key) FILTER(WHERE event_name='practice_view')::int visitors,count(*) FILTER(WHERE event_name='audio_play_started')::int plays,count(*) FILTER(WHERE event_name='audio_progress_25')::int progress,count(*) FILTER(WHERE event_name='audio_completed')::int completions FROM e GROUP BY listening_day)
 SELECT jsonb_build_object('from',p_from,'to',p_to,'points',coalesce(jsonb_agg(jsonb_build_object('date',days.d::text,'practice_views',coalesce(a.views,0),'practice_unique_visitors',coalesce(a.visitors,0),'plays',coalesce(a.plays,0),'progress_25',coalesce(a.progress,0),'completions',coalesce(a.completions,0),'library_saves',0,'author_page_views',0,'author_page_unique_visitors',0) ORDER BY days.d),'[]'::jsonb)) FROM days LEFT JOIN a ON a.d=days.d;
$$;

CREATE OR REPLACE FUNCTION public.author_stats_sources(p_author_id uuid,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH buckets AS (SELECT unnest(ARRAY['direct','internal','telegram','vk','max','search','other_external','unknown']) bucket),
 e AS (SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,NULL,false)),
 a AS (SELECT public.author_stats_source_bucket(utm_source,NULL) bucket,
   count(*) FILTER(WHERE event_name='practice_view')::int views,
   count(DISTINCT visitor_key) FILTER(WHERE event_name='practice_view')::int visitors,
   count(*) FILTER(WHERE event_name='audio_play_started')::int plays FROM e GROUP BY 1)
 SELECT jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('bucket',buckets.bucket,'views',coalesce(a.views,0),'visitors',coalesce(a.visitors,0),'plays',coalesce(a.plays,0)) ORDER BY coalesce(a.visitors,0) DESC,buckets.bucket),'[]'::jsonb)) FROM buckets LEFT JOIN a ON a.bucket=buckets.bucket;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_timeseries(
 p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,p_include_test boolean DEFAULT false,p_author_id uuid DEFAULT NULL,p_practice_id uuid DEFAULT NULL,p_utm_source text DEFAULT NULL,p_device_type text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH bounds AS (SELECT coalesce(p_from,now()-interval '29 days') f,coalesce(p_to,now()) t),
 days AS (SELECT generate_series(date_trunc('day',f AT TIME ZONE 'Europe/Moscow'),date_trunc('day',(t-interval '1 microsecond') AT TIME ZONE 'Europe/Moscow'),interval '1 day')::date d FROM bounds),
 e AS (SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,p_practice_id,p_include_test) WHERE public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (nullif(btrim(coalesce(p_device_type,'')),'') IS NULL OR device_type=p_device_type)),
 a AS (SELECT listening_day d,count(DISTINCT visitor_key)::int visitors,count(*) FILTER(WHERE event_name='practice_view')::int views,count(*) FILTER(WHERE event_name='audio_play_started')::int starts,count(DISTINCT visitor_key) FILTER(WHERE event_name='audio_play_started')::int listeners,count(*) FILTER(WHERE event_name='audio_completed')::int completions,count(*) FILTER(WHERE event_name='first_manual_library_save')::int saves FROM e GROUP BY listening_day)
 SELECT jsonb_build_object('granularity','day','points',coalesce(jsonb_agg(jsonb_build_object('bucket',days.d::text,'visitors',coalesce(a.visitors,0),'registrations',0,'practice_views',coalesce(a.views,0),'play_starts',coalesce(a.starts,0),'listeners',coalesce(a.listeners,0),'completions',coalesce(a.completions,0),'saves',coalesce(a.saves,0)) ORDER BY days.d),'[]'::jsonb)) FROM days LEFT JOIN a ON a.d=days.d;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_acquisition(
 p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,p_include_test boolean DEFAULT false,p_author_id uuid DEFAULT NULL,p_practice_id uuid DEFAULT NULL,p_utm_source text DEFAULT NULL,p_device_type text DEFAULT NULL,p_limit int DEFAULT 20,p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH e AS (SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,p_practice_id,p_include_test) WHERE public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (nullif(btrim(coalesce(p_device_type,'')),'') IS NULL OR device_type=p_device_type)),
 a AS (SELECT btrim(coalesce(utm_source,'')) source,btrim(coalesce(utm_medium,'')) medium,btrim(coalesce(utm_campaign,'')) campaign,btrim(coalesce(utm_content,'')) content,count(DISTINCT session_id)::int sessions,count(DISTINCT visitor_key)::int visitors,count(*) FILTER(WHERE event_name='audio_play_started')::int starts,count(DISTINCT visitor_key) FILTER(WHERE event_name='audio_play_started')::int listeners,count(*) FILTER(WHERE event_name='first_manual_library_save')::int saves FROM e GROUP BY 1,2,3,4)
 SELECT jsonb_build_object('attribution','session_touch','total',count(*)::int,'rows',coalesce(jsonb_agg(jsonb_build_object('utmSource',source,'utmMedium',medium,'utmCampaign',campaign,'utmContent',content,'label',public.admin_analytics_p2_utm_label(source,medium,campaign,content),'sessions',sessions,'visitors',visitors,'registrations',0,'playStarts',starts,'listeners',listeners,'saves',saves) ORDER BY sessions DESC,source),'[]'::jsonb)) FROM a;
$$;

REVOKE ALL ON FUNCTION public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_window_metrics(timestamptz,timestamptz,boolean,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_window_metrics(timestamptz,timestamptz,boolean,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_summary(timestamptz,timestamptz,boolean,timestamptz,timestamptz,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_summary(timestamptz,timestamptz,boolean,timestamptz,timestamptz,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_practices(timestamptz,timestamptz,boolean,uuid,uuid,text,text,text,text,int,int), public.admin_analytics_p2_authors(timestamptz,timestamptz,boolean,uuid,uuid,text,text,text,text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_practices(timestamptz,timestamptz,boolean,uuid,uuid,text,text,text,text,int,int), public.admin_analytics_p2_authors(timestamptz,timestamptz,boolean,uuid,uuid,text,text,text,text,int,int) TO service_role;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_timeseries(timestamptz,timestamptz,boolean,uuid,uuid,text,text), public.admin_analytics_p2_acquisition(timestamptz,timestamptz,boolean,uuid,uuid,text,text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_timeseries(timestamptz,timestamptz,boolean,uuid,uuid,text,text), public.admin_analytics_p2_acquisition(timestamptz,timestamptz,boolean,uuid,uuid,text,text,int,int) TO service_role;
REVOKE ALL ON FUNCTION public.author_stats_summary(uuid,timestamptz,timestamptz), public.author_stats_products(uuid,timestamptz,timestamptz), public.author_stats_timeseries(uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_sources(uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_stats_summary(uuid,timestamptz,timestamptz), public.author_stats_products(uuid,timestamptz,timestamptz), public.author_stats_timeseries(uuid,timestamptz,timestamptz), public.author_stats_sources(uuid,timestamptz,timestamptz) TO service_role;
COMMIT;
