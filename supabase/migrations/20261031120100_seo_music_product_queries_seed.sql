-- Idempotent seed: natural music-product SEO queries («музыка для …»).
-- analysis_status = analyzed so they appear in author SEO opportunities.
-- frequency intentionally NULL (do not invent Wordstat counts).
-- ON CONFLICT preserves existing frequency / frequency_checked_at / source / query_text.
-- Does not repeat the spa/massage rows from 20261022120000.

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
  ('музыка для сна', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для глубокого сна', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для засыпания', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для отдыха', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для релакса', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для релаксации', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для глубокого расслабления', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для медитации', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для медитации перед сном', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для утренней медитации', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для дыхания', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для массажа', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для массажного кабинета', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для спа', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для спа-салона', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для йоги', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для йоги нидры', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для растяжки', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для пилатеса', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для тренировки', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для работы', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для учебы', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для офиса', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для коворкинга', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для концентрации', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для фокуса', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для чтения', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для чтения книг', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для библиотеки', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для фона', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для кафе', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для ресторана', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для магазина', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для салона красоты', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для бизнеса', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для отеля', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для приемной', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для ванны', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для вечера', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для утра', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для восстановления', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для антистресса', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для спокойствия', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для творчества', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для звуковой ванны', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для рейки', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для чакр', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для беременности', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed'),
  ('музыка для детского сна', 'manual', NULL, NULL, 'music', 'Музыка', 'high', 'analyzed')
ON CONFLICT (normalized_query) DO UPDATE SET
  analysis_status = 'analyzed',
  intent = COALESCE(public.seo_queries.intent, EXCLUDED.intent),
  recommended_format = COALESCE(public.seo_queries.recommended_format, EXCLUDED.recommended_format),
  audio_fit = COALESCE(public.seo_queries.audio_fit, EXCLUDED.audio_fit);

COMMIT;
