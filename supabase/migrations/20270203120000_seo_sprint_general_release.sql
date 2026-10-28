-- Только схема. Данные меняются отдельным согласованным запуском скрипта.
BEGIN;
ALTER TABLE public.seo_sprint_queries
  ADD COLUMN released_to_general_at timestamptz NULL;
COMMENT ON COLUMN public.seo_sprint_queries.released_to_general_at IS
  'Время снятия операционных ограничений спринта. Историческая связь сохраняется.';
COMMIT;
