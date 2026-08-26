BEGIN;

-- Incremental platform topic: Духовность.
-- Same directory as 20260717140000_topics_foundation.sql
-- and 20260825120000_topics_career_business_learning.sql.
-- Topic facet only; not a publication class.
-- No UPDATE of practices. No backfill.

INSERT INTO public.topics (
  key,
  slug,
  title,
  description,
  sort_order,
  is_active,
  show_on_home
)
VALUES (
  'spirituality',
  'spirituality',
  'Духовность',
  NULL,
  110,
  true,
  true
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
