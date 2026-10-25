-- Только на изолированной тестовой БД после миграций. В этой сессии не запускался.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.music_analyzer_feature_overrides'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'RLS истории не включён';
  END IF;
  IF has_table_privilege('anon', 'public.music_analyzer_feature_overrides', 'SELECT')
     OR has_table_privilege('authenticated', 'public.music_analyzer_feature_overrides', 'INSERT')
     OR has_table_privilege('service_role', 'public.music_analyzer_feature_overrides', 'UPDATE')
     OR has_table_privilege('service_role', 'public.music_analyzer_feature_overrides', 'DELETE') THEN
    RAISE EXCEPTION 'Неверные права на историю';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.music_analyzer_feature_overrides', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.music_analyzer_feature_overrides', 'INSERT') THEN
    RAISE EXCEPTION 'Нет прав append/read';
  END IF;
END;
$$;
ROLLBACK;
