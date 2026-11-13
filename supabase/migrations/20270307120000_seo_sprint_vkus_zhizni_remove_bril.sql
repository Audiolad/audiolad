-- AudioSprint «Вкус жизни»: remove one query from the sprint (Sergey, t1429u: «не для нас»).
-- Query: «Ансамбль современного джаза игоря бриля» (any case – matched by normalized_query).
-- Idempotent: does nothing when the query or the sprint is absent. Fails closed (whole
-- migration rolls back, nothing changes) if the query already has a reservation or a
-- product, so an author's booking is never deleted silently.
-- The canonical seo_queries row was created by 20270306120000 for this sprint only; it is
-- deleted only while nothing else references it.
BEGIN;

DO $$
DECLARE
  v_sprint_id uuid;
  v_query_id uuid;
  v_total integer;
  v_music integer;
  v_voice integer;
BEGIN
  SELECT id INTO v_sprint_id FROM public.seo_sprints WHERE slug = 'vkus-zhizni-2026';
  SELECT id INTO v_query_id
  FROM public.seo_queries
  WHERE normalized_query = public.normalize_seo_query('ансамбль современного джаза игоря бриля')
  -- Row lock held until COMMIT: reserve_seo_query locks the same row, and any new
  -- reservation/product row takes FOR KEY SHARE on it through its FK, so nothing can be
  -- attached between the check below and the DELETE (no silent cascade of a booking).
  FOR UPDATE;

  IF v_sprint_id IS NOT NULL AND v_query_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.seo_query_reservations WHERE query_id = v_query_id)
      OR EXISTS (SELECT 1 FROM public.practices WHERE primary_seo_query_id = v_query_id) THEN
      RAISE EXCEPTION 'seo_sprint_vkus_zhizni_remove_bril_blocked: query has a reservation or a product';
    END IF;

    DELETE FROM public.seo_sprint_queries
    WHERE sprint_id = v_sprint_id AND query_id = v_query_id;

    DELETE FROM public.seo_queries AS q
    WHERE q.id = v_query_id
      AND NOT EXISTS (SELECT 1 FROM public.seo_sprint_queries sq WHERE sq.query_id = q.id)
      AND NOT EXISTS (SELECT 1 FROM public.seo_query_proposals p WHERE p.query_id = q.id)
      AND NOT EXISTS (SELECT 1 FROM public.seo_search_query_metrics m WHERE m.query_id = q.id);
  END IF;

  IF v_sprint_id IS NOT NULL THEN
    SELECT
      count(*),
      count(*) FILTER (WHERE author_group = 'music'),
      count(*) FILTER (WHERE author_group = 'voice')
    INTO v_total, v_music, v_voice
    FROM public.seo_sprint_queries
    WHERE sprint_id = v_sprint_id AND pool = 'initial';

    IF v_total <> 265 OR v_music <> 139 OR v_voice <> 126 THEN
      RAISE EXCEPTION
        'seo_sprint_vkus_zhizni_remove_bril_count_mismatch total=% music=% voice=%',
        v_total, v_music, v_voice;
    END IF;
  END IF;
END;
$$;

COMMIT;
