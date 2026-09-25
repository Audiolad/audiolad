-- Dry-run only. Do not execute against production.
-- Finds published practices with primary_seo_query_id IS NULL whose
-- seo_primary_query exactly matches seo_queries.normalized_query.
-- Prints practice_id, author_id, seo_primary_query, matched query_id,
-- query_text, reservation state, and conflicts.
-- A conflict means the row must not be backfilled automatically.

SELECT
  p.id AS practice_id,
  p.author_id,
  p.seo_primary_query,
  q.id AS matched_query_id,
  q.query_text,
  r.id AS reservation_id,
  r.status AS reservation_status,
  r.author_id AS reservation_author_id,
  r.product_id AS reservation_product_id,
  CASE
    WHEN fk_owner.id IS NOT NULL THEN 'fk_owned_by_other_practice'
    WHEN r.status IN ('active', 'used')
      AND r.author_id IS DISTINCT FROM p.author_id THEN 'reservation_other_author'
    WHEN r.status IN ('active', 'used')
      AND r.product_id IS NOT NULL
      AND r.product_id IS DISTINCT FROM p.id THEN 'reservation_other_product'
    WHEN sibling.practice_id IS NOT NULL THEN 'multiple_legacy_practices'
    ELSE NULL
  END AS conflict
FROM public.practices p
JOIN public.seo_queries q
  ON q.normalized_query = public.normalize_seo_query(p.seo_primary_query)
LEFT JOIN public.seo_query_reservations r
  ON r.query_id = q.id
 AND r.status IN ('active', 'used')
LEFT JOIN public.practices fk_owner
  ON fk_owner.primary_seo_query_id = q.id
 AND fk_owner.id IS DISTINCT FROM p.id
 AND fk_owner.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT p2.id AS practice_id
  FROM public.practices p2
  JOIN public.seo_queries q2
    ON q2.normalized_query = public.normalize_seo_query(p2.seo_primary_query)
  WHERE p2.status = 'published'
    AND p2.deleted_at IS NULL
    AND p2.primary_seo_query_id IS NULL
    AND p2.seo_primary_query IS NOT NULL
    AND btrim(p2.seo_primary_query) <> ''
    AND q2.id = q.id
    AND p2.id IS DISTINCT FROM p.id
  LIMIT 1
) sibling ON true
WHERE p.status = 'published'
  AND p.deleted_at IS NULL
  AND p.primary_seo_query_id IS NULL
  AND p.seo_primary_query IS NOT NULL
  AND btrim(p.seo_primary_query) <> ''
ORDER BY p.id;
