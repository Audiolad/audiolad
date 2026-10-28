WITH facts AS MATERIALIZED (
  SELECT sq.sprint_id, sq.query_id, sq.pool, sq.author_group, sq.display_title,
    q.query_text, q.normalized_query, q.analysis_status,
    to_jsonb(sq)->>'released_to_general_at' AS released_to_general_at,
    q.id IS NOT NULL AS already_in_base,
    (SELECT count(*) FROM public.seo_queries other
      WHERE other.normalized_query = q.normalized_query) AS canonical_count,
    EXISTS (SELECT 1 FROM public.seo_sprint_queries other
      WHERE other.query_id = sq.query_id AND other.sprint_id <> sq.sprint_id
        AND to_jsonb(other)->>'released_to_general_at' IS NULL) AS other_sprint,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', proposal.id,
      'author_id', proposal.author_id) ORDER BY proposal.id)
      FROM public.seo_query_proposals proposal WHERE proposal.query_id = sq.query_id), '[]') AS proposals,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'author_id', r.author_id,
      'product_id', r.product_id, 'expires_at', r.expires_at,
      'released_at', r.released_at) ORDER BY r.id)
      FROM public.seo_query_reservations r WHERE r.query_id = sq.query_id), '[]') AS reservations,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'deleted_at', p.deleted_at,
      'primary_seo_query_id', p.primary_seo_query_id) ORDER BY p.id)
      FROM public.practices p
      WHERE p.primary_seo_query_id = sq.query_id
        OR public.normalize_seo_query(p.seo_primary_query) = q.normalized_query
        OR EXISTS (SELECT 1 FROM public.seo_query_reservations r
          WHERE r.query_id = sq.query_id AND r.product_id = p.id)), '[]') AS products
  FROM public.seo_sprint_queries sq
  JOIN public.seo_sprints s ON s.id = sq.sprint_id
  LEFT JOIN public.seo_queries q ON q.id = sq.query_id
  WHERE s.slug = 'osen-zvuchit-2026'
), classified AS MATERIALIZED (
  SELECT *, CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(products) p
      WHERE p->>'status' = 'published' AND p->>'deleted_at' IS NULL)
      THEN 'published_product'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(reservations) r
      WHERE r->>'status' = 'used'
        OR (r->>'status' = 'active' AND (r->>'product_id' IS NOT NULL
          OR r->>'expires_at' IS NULL OR (r->>'expires_at')::timestamptz > now())))
      THEN 'active_rights'
    WHEN products <> '[]'::jsonb OR proposals <> '[]'::jsonb OR NOT already_in_base OR canonical_count <> 1
      OR normalized_query IS DISTINCT FROM public.normalize_seo_query(query_text)
      OR other_sprint THEN 'ambiguous'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(reservations) r
      WHERE r->>'status' = 'active' AND r->>'product_id' IS NULL
        AND (r->>'expires_at')::timestamptz <= now()) THEN 'expired_reservation'
    WHEN reservations <> '[]'::jsonb OR analysis_status IS DISTINCT FROM 'analyzed'
      THEN 'ambiguous'
    WHEN released_to_general_at IS NOT NULL THEN 'already_general'
    ELSE 'free'
  END AS category
  FROM facts
)
