-- Topics foundation smoke (run on test DB after migration 20260717140000)
-- Usage: psql -f supabase/tests/topics_foundation_smoke.sql

BEGIN;

DO $$
DECLARE
  v_topic_count integer;
  v_join_count integer;
BEGIN
  SELECT count(*)
  INTO v_topic_count
  FROM public.topics
  WHERE is_active = true;

  IF v_topic_count <> 7 THEN
    RAISE EXCEPTION 'smoke failed: expected 7 active topics, got %', v_topic_count;
  END IF;

  SELECT count(*)
  INTO v_join_count
  FROM public.practice_topics;

  IF v_join_count < 18 THEN
    RAISE EXCEPTION 'smoke failed: expected at least 18 practice_topics rows, got %', v_join_count;
  END IF;

  IF to_regprocedure('public.set_practice_topics(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'smoke failed: set_practice_topics missing';
  END IF;

  IF to_regprocedure('public.resolve_author_topic_limit(uuid)') IS NULL THEN
    RAISE EXCEPTION 'smoke failed: resolve_author_topic_limit missing';
  END IF;

  IF (
    SELECT obj_description(
      'public.publish_audio_product(uuid,timestamptz)'::regprocedure,
      'pg_proc'
    )
  ) NOT LIKE '%v4%' THEN
    RAISE EXCEPTION 'smoke failed: publish_audio_product v4 comment missing';
  END IF;
END;
$$;

ROLLBACK;
