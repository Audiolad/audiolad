-- Single-word catalog smoke (run on test DB after 20261006120000)
-- Usage: psql -f supabase/tests/topics_single_word_catalog_smoke.sql

BEGIN;

DO $$
DECLARE
  v_active_count integer;
  v_old_titles integer;
  v_old_assignments integer;
BEGIN
  SELECT count(*)
  INTO v_active_count
  FROM public.topics
  WHERE is_active = true
    AND key IN (
      'money',
      'abundance',
      'love',
      'relationships',
      'calm',
      'sleep',
      'self-worth',
      'self-esteem',
      'body-wellbeing',
      'energy',
      'purpose',
      'career',
      'business',
      'learning',
      'spirituality'
    );

  IF v_active_count <> 15 THEN
    RAISE EXCEPTION 'smoke failed: expected 15 catalog topics, got %', v_active_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.topics
    WHERE key = 'self-worth' AND title = 'Уверенность' AND sort_order = 70
  ) THEN
    RAISE EXCEPTION 'smoke failed: self-worth is not Уверенность/70';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.topics
    WHERE key = 'self-esteem' AND title = 'Самооценка' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'smoke failed: Самооценка missing';
  END IF;

  SELECT count(*)
  INTO v_old_titles
  FROM public.topics
  WHERE title IN (
    'Уверенность и самоценность',
    'Уверенность и самооценка',
    'Тело и самочувствие',
    'Энергия и ресурс'
  );

  IF v_old_titles > 0 THEN
    RAISE EXCEPTION 'smoke failed: old compound titles still present';
  END IF;

  SELECT count(*)
  INTO v_old_assignments
  FROM public.practice_topics AS pt
  INNER JOIN public.topics AS t ON t.id = pt.topic_id
  WHERE t.title IN (
    'Уверенность и самоценность',
    'Уверенность и самооценка',
    'Тело и самочувствие',
    'Энергия и ресурс'
  );

  IF v_old_assignments > 0 THEN
    RAISE EXCEPTION
      'smoke failed: % products still on old compound titles',
      v_old_assignments;
  END IF;
END;
$$;

ROLLBACK;
