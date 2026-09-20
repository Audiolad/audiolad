-- Idempotent seed: 7 manually approved spa/massage music SEO queries.
-- analysis_status = analyzed so they appear in author SEO opportunities.
-- frequency intentionally NULL (do not invent Wordstat counts).
-- ON CONFLICT preserves existing frequency / frequency_checked_at / source / query_text.

BEGIN;

INSERT INTO public.seo_queries (
  query_text,
  source,
  frequency,
  frequency_checked_at,
  intent,
  recommended_format,
  audio_fit,
  analysis_status
)
VALUES
  ('фоновая музыка для спа', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для спа-процедур', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для релаксации и массажа', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('успокаивающая музыка для массажа', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('красивая музыка для массажа', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('спокойная музыка для массажа', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для массажа расслабляющая час', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed')
ON CONFLICT (normalized_query) DO UPDATE SET
  analysis_status = 'analyzed',
  intent = COALESCE(public.seo_queries.intent, EXCLUDED.intent),
  recommended_format = COALESCE(public.seo_queries.recommended_format, EXCLUDED.recommended_format),
  audio_fit = COALESCE(public.seo_queries.audio_fit, EXCLUDED.audio_fit);

COMMIT;
