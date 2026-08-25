BEGIN;

-- Incremental platform topics: Карьера, Бизнес, Обучение.
-- Same directory as 20260717140000_topics_foundation.sql.
-- Topic remains a facet independent of publication class.
-- «Обучение» is topics.key=learning, not a course class.

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
    'career',
    'career',
    'Карьера',
    NULL,
    80,
    true,
    true
  ),
  (
    'business',
    'business',
    'Бизнес',
    NULL,
    90,
    true,
    true
  ),
  (
    'learning',
    'learning',
    'Обучение',
    NULL,
    100,
    true,
    true
  )
ON CONFLICT (key) DO NOTHING;

COMMIT;
