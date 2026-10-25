-- Задача 09d393ce. Только новая таблица; существующие схемы и данные не меняются.
-- Не применять без отдельного согласования владельца перед deploy.
BEGIN;
CREATE TABLE IF NOT EXISTS public.music_analyzer_feature_overrides (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.music_analyzer_runs(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL CHECK (schema_version = 'audiolad-features:1'),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  patch jsonb NOT NULL CHECK (jsonb_typeof(patch) = 'object' AND octet_length(patch::text) <= 16384)
);
CREATE INDEX IF NOT EXISTS music_analyzer_feature_overrides_run_idx
  ON public.music_analyzer_feature_overrides(run_id, id);
ALTER TABLE public.music_analyzer_feature_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.music_analyzer_feature_overrides FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.music_analyzer_feature_overrides TO service_role;
REVOKE ALL ON SEQUENCE public.music_analyzer_feature_overrides_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.music_analyzer_feature_overrides_id_seq TO service_role;
COMMENT ON TABLE public.music_analyzer_feature_overrides IS
  'История ручных поправок. Только append через owner/admin API; исходный normalized_json не меняется. null в patch возвращает автоматический признак.';
COMMIT;
