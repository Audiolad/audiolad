BEGIN;

-- ---------------------------------------------------------------------------
-- Practice topics: single-word catalog reform
--
-- Canonical dictionary remains public.topics (keys English slug-like; titles RU).
-- UI (author TopicSelector, catalog/home/playlist filters) reads sort_order
-- via listActiveTopics() — no hardcoded topic arrays.
--
-- Existing keys are preserved (immutable). Compound titles are renamed:
--   self-worth:  «Уверенность и самоценность» / «Уверенность и самооценка»
--                → «Уверенность»
--   body-wellbeing: «Тело и самочувствие» → «Самочувствие»
--   energy: «Энергия и ресурс» → «Энергия»
--
-- practice_topics / playlist_topics keep the same topic_id. That maps
-- existing products to «Уверенность» ONLY — this migration does NOT
-- auto-assign «Самооценка» (self-esteem). Doing both would inflate
-- counts and could exceed the author max of 3.
--
-- New selectable topics (SEO hubs izobilie / lyubov-k-sebe stay editorial
-- and do not replace this dictionary):
--   abundance = Изобилие
--   love      = Любовь
--   self-esteem = Самооценка
--
-- Old topic rows are not deleted.
--
-- Pre-migration product counts (DISTINCT practice_id on practice_topics):
-- Measured at apply time via RAISE NOTICE below.
-- Repo seed baseline from 20260717140000_topics_foundation.sql backfill
-- (historical published mapping; production may have more author assignments):
--   confidence_self_esteem (self-worth) = 9
--   body_wellbeing                      = 2
--   energy_resource                     = 7
-- How measured in-repo: count DISTINCT practice slugs in that INSERT
-- mapping whose ARRAY includes the old key. Live DB: NOTICE + post-check.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_confidence_self_esteem integer;
  v_body_wellbeing integer;
  v_energy_resource integer;
  v_confidence_self_esteem_published integer;
  v_body_wellbeing_published integer;
  v_energy_resource_published integer;
BEGIN
  SELECT count(DISTINCT pt.practice_id)
  INTO v_confidence_self_esteem
  FROM public.practice_topics AS pt
  INNER JOIN public.topics AS t ON t.id = pt.topic_id
  WHERE t.key = 'self-worth'
     OR t.title IN (
       'Уверенность и самоценность',
       'Уверенность и самооценка'
     );

  SELECT count(DISTINCT pt.practice_id)
  INTO v_body_wellbeing
  FROM public.practice_topics AS pt
  INNER JOIN public.topics AS t ON t.id = pt.topic_id
  WHERE t.key = 'body-wellbeing'
     OR t.title = 'Тело и самочувствие';

  SELECT count(DISTINCT pt.practice_id)
  INTO v_energy_resource
  FROM public.practice_topics AS pt
  INNER JOIN public.topics AS t ON t.id = pt.topic_id
  WHERE t.key = 'energy'
     OR t.title = 'Энергия и ресурс';

  SELECT count(DISTINCT pt.practice_id)
  INTO v_confidence_self_esteem_published
  FROM public.practice_topics AS pt
  INNER JOIN public.topics AS t ON t.id = pt.topic_id
  INNER JOIN public.practices AS p ON p.id = pt.practice_id
  WHERE p.status = 'published'
    AND (
      t.key = 'self-worth'
      OR t.title IN (
        'Уверенность и самоценность',
        'Уверенность и самооценка'
      )
    );

  SELECT count(DISTINCT pt.practice_id)
  INTO v_body_wellbeing_published
  FROM public.practice_topics AS pt
  INNER JOIN public.topics AS t ON t.id = pt.topic_id
  INNER JOIN public.practices AS p ON p.id = pt.practice_id
  WHERE p.status = 'published'
    AND (t.key = 'body-wellbeing' OR t.title = 'Тело и самочувствие');

  SELECT count(DISTINCT pt.practice_id)
  INTO v_energy_resource_published
  FROM public.practice_topics AS pt
  INNER JOIN public.topics AS t ON t.id = pt.topic_id
  INNER JOIN public.practices AS p ON p.id = pt.practice_id
  WHERE p.status = 'published'
    AND (t.key = 'energy' OR t.title = 'Энергия и ресурс');

  RAISE NOTICE
    'MIGRATION_COUNTS all_practices { confidence_self_esteem=%, body_wellbeing=%, energy_resource=% } published { confidence_self_esteem=%, body_wellbeing=%, energy_resource=% }',
    v_confidence_self_esteem,
    v_body_wellbeing,
    v_energy_resource,
    v_confidence_self_esteem_published,
    v_body_wellbeing_published,
    v_energy_resource_published;
END;
$$;

INSERT INTO public.topics (
  key,
  slug,
  title,
  description,
  sort_order,
  is_active,
  show_on_home
)
VALUES
  (
    'abundance',
    'abundance',
    'Изобилие',
    NULL,
    20,
    true,
    true
  ),
  (
    'love',
    'love',
    'Любовь',
    NULL,
    30,
    true,
    true
  ),
  (
    'self-esteem',
    'self-esteem',
    'Самооценка',
    NULL,
    80,
    true,
    true
  )
ON CONFLICT (key) DO UPDATE
SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  show_on_home = EXCLUDED.show_on_home,
  updated_at = now();

-- Rename compound titles in place. Keys stay. No practice_topics rewrite.
UPDATE public.topics
SET
  title = 'Уверенность',
  updated_at = now()
WHERE key = 'self-worth'
   OR title IN (
     'Уверенность и самоценность',
     'Уверенность и самооценка'
   );

UPDATE public.topics
SET
  title = 'Самочувствие',
  updated_at = now()
WHERE key = 'body-wellbeing'
   OR title = 'Тело и самочувствие';

UPDATE public.topics
SET
  title = 'Энергия',
  updated_at = now()
WHERE key = 'energy'
   OR title = 'Энергия и ресурс';

UPDATE public.topics
SET
  sort_order = CASE key
    WHEN 'money' THEN 10
    WHEN 'abundance' THEN 20
    WHEN 'love' THEN 30
    WHEN 'relationships' THEN 40
    WHEN 'calm' THEN 50
    WHEN 'sleep' THEN 60
    WHEN 'self-worth' THEN 70
    WHEN 'self-esteem' THEN 80
    WHEN 'body-wellbeing' THEN 90
    WHEN 'energy' THEN 100
    WHEN 'purpose' THEN 110
    WHEN 'career' THEN 120
    WHEN 'business' THEN 130
    WHEN 'learning' THEN 140
    WHEN 'spirituality' THEN 150
    ELSE sort_order
  END,
  updated_at = now()
WHERE key IN (
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

DO $$
DECLARE
  v_active_count integer;
  v_old_title_topics integer;
  v_old_title_practice_assignments integer;
  v_old_title_playlist_assignments integer;
  v_title text;
  v_sort integer;
  v_expected text[] := ARRAY[
    'money|Деньги|10',
    'abundance|Изобилие|20',
    'love|Любовь|30',
    'relationships|Отношения|40',
    'calm|Спокойствие|50',
    'sleep|Сон|60',
    'self-worth|Уверенность|70',
    'self-esteem|Самооценка|80',
    'body-wellbeing|Самочувствие|90',
    'energy|Энергия|100',
    'purpose|Предназначение|110',
    'career|Карьера|120',
    'business|Бизнес|130',
    'learning|Обучение|140',
    'spirituality|Духовность|150'
  ];
  v_row text;
  v_key text;
BEGIN
  SELECT count(*)
  INTO v_active_count
  FROM public.topics
  WHERE is_active = true
    AND key = ANY (ARRAY[
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
    ]);

  IF v_active_count <> 15 THEN
    RAISE EXCEPTION
      'Post-check failed: expected 15 active catalog topics, found %',
      v_active_count;
  END IF;

  FOREACH v_row IN ARRAY v_expected
  LOOP
    v_key := split_part(v_row, '|', 1);
    v_title := split_part(v_row, '|', 2);
    v_sort := split_part(v_row, '|', 3)::integer;

    IF NOT EXISTS (
      SELECT 1
      FROM public.topics AS t
      WHERE t.key = v_key
        AND t.slug = v_key
        AND t.title = v_title
        AND t.sort_order = v_sort
        AND t.is_active = true
    ) THEN
      RAISE EXCEPTION
        'Post-check failed: topic % must be active title=% sort_order=%',
        v_key,
        v_title,
        v_sort;
    END IF;
  END LOOP;

  SELECT count(*)
  INTO v_old_title_topics
  FROM public.topics
  WHERE title IN (
    'Уверенность и самоценность',
    'Уверенность и самооценка',
    'Тело и самочувствие',
    'Энергия и ресурс'
  );

  IF v_old_title_topics > 0 THEN
    RAISE EXCEPTION
      'Post-check failed: % topic rows still use old compound titles',
      v_old_title_topics;
  END IF;

  SELECT count(*)
  INTO v_old_title_practice_assignments
  FROM public.practice_topics AS pt
  INNER JOIN public.topics AS t ON t.id = pt.topic_id
  WHERE t.title IN (
    'Уверенность и самоценность',
    'Уверенность и самооценка',
    'Тело и самочувствие',
    'Энергия и ресурс'
  );

  IF v_old_title_practice_assignments > 0 THEN
    RAISE EXCEPTION
      'Post-check failed: % practice_topics rows still reference old compound titles',
      v_old_title_practice_assignments;
  END IF;

  IF to_regclass('public.playlist_topics') IS NOT NULL THEN
    SELECT count(*)
    INTO v_old_title_playlist_assignments
    FROM public.playlist_topics AS plt
    INNER JOIN public.topics AS t ON t.id = plt.topic_id
    WHERE t.title IN (
      'Уверенность и самоценность',
      'Уверенность и самооценка',
      'Тело и самочувствие',
      'Энергия и ресурс'
    );

    IF v_old_title_playlist_assignments > 0 THEN
      RAISE EXCEPTION
        'Post-check failed: % playlist_topics rows still reference old compound titles',
        v_old_title_playlist_assignments;
    END IF;
  END IF;
END;
$$;

COMMIT;
