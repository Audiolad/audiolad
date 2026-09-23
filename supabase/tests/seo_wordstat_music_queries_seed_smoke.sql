-- Disposable assertions for 20261101120000. Run only by the isolated compile database.
BEGIN;

DO $$
DECLARE
  v_count integer;
  v_query_text text;
  v_frequency integer;
  v_checked_at date;
  v_source text;
  v_intent text;
  v_format text;
  v_audio_fit text;
BEGIN
  SELECT query_text, frequency, frequency_checked_at::date, source
  INTO v_query_text, v_frequency, v_checked_at, v_source
  FROM public.seo_queries
  WHERE normalized_query = public.normalize_seo_query('музыка для засыпания взрослых');
  IF v_query_text IS DISTINCT FROM 'Музыка для засыпания взрослых!!!'
     OR v_frequency IS DISTINCT FROM 777
     OR v_checked_at IS DISTINCT FROM DATE '2026-01-01'
     OR v_source IS DISTINCT FROM 'wordstat' THEN
    RAISE EXCEPTION 'existing real Wordstat row was overwritten';
  END IF;

  SELECT frequency, frequency_checked_at::date, intent, recommended_format, audio_fit
  INTO v_frequency, v_checked_at, v_intent, v_format, v_audio_fit
  FROM public.seo_queries
  WHERE normalized_query = public.normalize_seo_query('музыка для засыпания без слов');
  IF v_frequency IS DISTINCT FROM 595
     OR v_checked_at IS DISTINCT FROM DATE '2026-09-23'
     OR v_intent IS DISTINCT FROM 'music'
     OR v_format IS DISTINCT FROM 'Музыка'
     OR v_audio_fit IS DISTINCT FROM 'high' THEN
    RAISE EXCEPTION 'NULL fields were not filled from the approved Wordstat seed';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.seo_queries
  WHERE normalized_query = public.normalize_seo_query('музыка для засыпания взрослых');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'canonical normalization created a duplicate music query';
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    VALUES
      ('музыка для йоги и медитации', 1432, DATE '2026-09-14'),
      ('музыка для занятий йогой', 984, DATE '2026-09-14'),
      ('музыка для концентрации мозга', 1026, DATE '2026-09-14'),
      ('спокойная музыка для концентрации', 902, DATE '2026-09-14'),
      ('фоновая музыка для концентрации', 868, DATE '2026-09-14'),
      ('классическая музыка для концентрации', 487, DATE '2026-09-14')
  ) AS expected(query_text, frequency, frequency_checked_at)
  JOIN public.seo_queries AS actual
    ON actual.normalized_query = public.normalize_seo_query(expected.query_text)
   AND actual.query_text = expected.query_text
   AND actual.frequency = expected.frequency
   AND actual.frequency_checked_at::date = expected.frequency_checked_at;
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'existing initial-opportunity data was overwritten';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.seo_queries
  WHERE normalized_query IN (
    public.normalize_seo_query('фоновая музыка для спа'),
    public.normalize_seo_query('музыка для спа-процедур'),
    public.normalize_seo_query('музыка для релаксации и массажа'),
    public.normalize_seo_query('успокаивающая музыка для массажа'),
    public.normalize_seo_query('красивая музыка для массажа'),
    public.normalize_seo_query('спокойная музыка для массажа'),
    public.normalize_seo_query('музыка для массажа расслабляющая час')
  );
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'SPA/massage seed rows must remain exactly once each';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.seo_queries
    GROUP BY normalized_query
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'seo_queries contains duplicate normalized_query values';
  END IF;
END $$;

ROLLBACK;
