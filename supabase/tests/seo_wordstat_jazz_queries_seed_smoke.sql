-- Disposable assertions for 20261102120000. Run only by the isolated compile database.
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
  WHERE normalized_query = public.normalize_seo_query('джаз для отдыха');
  IF v_query_text IS DISTINCT FROM 'Джаз для отдыха!!!'
     OR v_frequency IS DISTINCT FROM 777
     OR v_checked_at IS DISTINCT FROM DATE '2026-01-01'
     OR v_source IS DISTINCT FROM 'wordstat' THEN
    RAISE EXCEPTION 'existing jazz Wordstat row was overwritten';
  END IF;

  SELECT frequency, frequency_checked_at::date, intent, recommended_format, audio_fit
  INTO v_frequency, v_checked_at, v_intent, v_format, v_audio_fit
  FROM public.seo_queries
  WHERE normalized_query = public.normalize_seo_query('джаз без слов');
  IF v_frequency IS DISTINCT FROM 1926
     OR v_checked_at IS DISTINCT FROM DATE '2026-09-23'
     OR v_intent IS DISTINCT FROM 'music'
     OR v_format IS DISTINCT FROM 'Музыка'
     OR v_audio_fit IS DISTINCT FROM 'high' THEN
    RAISE EXCEPTION 'NULL fields were not filled from the approved jazz Wordstat seed';
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    VALUES
      ('джаз для работы', 629, DATE '2026-09-14'),
      ('легкий джаз для кафе', 577, DATE '2026-09-14'),
      ('фоновый джаз для кафе и ресторанов', 147, DATE '2026-09-14'),
      ('легкий джаз для отдыха', 105, DATE '2026-09-14'),
      ('спокойный джаз в кафе', 86, DATE '2026-09-14'),
      ('джаз для учебы и отдыха', 57, DATE '2026-09-14')
  ) AS expected(query_text, frequency, frequency_checked_at)
  JOIN public.seo_queries AS actual
    ON actual.normalized_query = public.normalize_seo_query(expected.query_text)
   AND actual.query_text = expected.query_text
   AND actual.frequency = expected.frequency
   AND actual.frequency_checked_at::date = expected.frequency_checked_at
   AND actual.source = 'wordstat';
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'existing jazz initial-opportunity data was overwritten';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.seo_queries
  WHERE normalized_query = public.normalize_seo_query('джаз без слов');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'canonical normalization created a duplicate jazz query';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.seo_queries
  WHERE normalized_query IN (
    public.normalize_seo_query('музыка для засыпания взрослых'),
    public.normalize_seo_query('расслабляющая музыка для медитации'),
    public.normalize_seo_query('спокойная музыка для снятия стресса')
  );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'previous Wordstat music seed rows must remain once each';
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
    SELECT 1 FROM public.seo_queries GROUP BY normalized_query HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'seo_queries contains duplicate normalized_query values';
  END IF;
END $$;

ROLLBACK;
