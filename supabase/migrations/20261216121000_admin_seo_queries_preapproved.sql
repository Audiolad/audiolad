BEGIN;

-- Queries explicitly selected by an administrator are already moderated.
-- Backfill the two affected Wordstat rows reported before this behavior was fixed.
UPDATE public.seo_queries
SET analysis_status = 'analyzed'
WHERE source = 'wordstat'
  AND analysis_status = 'not_analyzed'
  AND normalized_query IN (
    public.normalize_seo_query('практика на прощение'),
    public.normalize_seo_query('практика на прощение обид')
  );

COMMIT;
