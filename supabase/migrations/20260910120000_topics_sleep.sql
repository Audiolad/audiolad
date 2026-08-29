BEGIN;

-- Incremental platform topic: Сон.
-- Same directory as 20260717140000_topics_foundation.sql
-- and later topic seed migrations.
-- Topic facet only; not a publication class.
-- No UPDATE of practices. No backfill. No rename of existing topics.

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
  'sleep',
  'sleep',
  'Сон',
  NULL,
  35,
  true,
  true
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
