BEGIN;

DO $$
DECLARE
  starts integer;
  listeners integer;
BEGIN
  IF to_regprocedure('public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)') IS NULL
    OR to_regprocedure('public.admin_analytics_p2_summary(timestamptz,timestamptz,boolean,timestamptz,timestamptz,uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.author_stats_summary(uuid,timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'required analytics function is missing';
  END IF;

  IF has_function_privilege('public', 'public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'analytics_product_event_facts grants are not hardened';
  END IF;

  INSERT INTO public.analytics_events (id, event_name, practice_id, occurred_at)
  VALUES
    ('11111111-1111-1111-1111-111111111111', 'audio_play_started', 'c3d63131-3ef4-4dbb-8888-0a5085a456b5', now()),
    ('22222222-2222-2222-2222-222222222222', 'audio_play_started', 'c3d63131-3ef4-4dbb-8888-0a5085a456b5', now());

  SELECT
    count(*) FILTER (WHERE event_name = 'audio_play_started'),
    count(DISTINCT visitor_key) FILTER (WHERE event_name = 'audio_play_started')
  INTO starts, listeners
  FROM public.analytics_product_event_facts(NULL, NULL, NULL, NULL, false)
  WHERE event_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  );

  IF starts <> 2 OR listeners <> 0 THEN
    RAISE EXCEPTION 'nullable visitor identity smoke failed: starts %, listeners %', starts, listeners;
  END IF;
END
$$;

ROLLBACK;
