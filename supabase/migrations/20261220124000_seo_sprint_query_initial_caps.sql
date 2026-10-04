-- Normalize the first letter for every SEO query in AudioSprint «Осень звучит».
-- Some sprint phrases already existed in seo_queries from older Wordstat seeds in lowercase.
-- The sprint seed keeps existing query_text on normalized_query conflicts, so those rows stayed
-- lowercase and the locked product title inherited that casing.
--
-- Scope: only queries attached to the current sprint. No schema changes.

BEGIN;

DO $$
DECLARE
  v_sprint_id uuid;
  v_query_updates integer := 0;
  v_display_updates integer := 0;
  v_product_updates integer := 0;
  v_remaining integer := 0;
BEGIN
  SELECT id
  INTO v_sprint_id
  FROM public.seo_sprints
  WHERE slug = 'osen-zvuchit-2026';

  IF v_sprint_id IS NULL THEN
    RAISE EXCEPTION 'audio_sprint_not_found';
  END IF;

  -- Canonical query text is the source of truth for reservations and title lock.
  -- Changing only the first character's case keeps normalized_query unchanged.
  UPDATE public.seo_queries AS q
  SET query_text = upper(left(q.query_text, 1)) || substr(q.query_text, 2)
  FROM public.seo_sprint_queries AS sq
  WHERE sq.sprint_id = v_sprint_id
    AND sq.query_id = q.id
    AND left(q.query_text, 1) <> upper(left(q.query_text, 1));

  GET DIAGNOSTICS v_query_updates = ROW_COUNT;

  -- Keep the sprint presentation copy aligned as well.
  UPDATE public.seo_sprint_queries AS sq
  SET display_title =
    upper(left(sq.display_title, 1)) || substr(sq.display_title, 2)
  WHERE sq.sprint_id = v_sprint_id
    AND left(sq.display_title, 1) <> upper(left(sq.display_title, 1));

  GET DIAGNOSTICS v_display_updates = ROW_COUNT;

  -- Existing linked products cache seo_primary_query. Keep it equal to canonical query_text.
  -- If the current product title differs only by query normalization/case, update the title too.
  PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);

  UPDATE public.practices AS p
  SET
    seo_primary_query = q.query_text,
    title = CASE
      WHEN public.normalize_seo_query(p.title) = q.normalized_query
        THEN q.query_text
      ELSE p.title
    END,
    updated_at = now()
  FROM public.seo_sprint_queries AS sq
  JOIN public.seo_queries AS q ON q.id = sq.query_id
  WHERE sq.sprint_id = v_sprint_id
    AND p.primary_seo_query_id = q.id
    AND (
      p.seo_primary_query IS DISTINCT FROM q.query_text
      OR (
        public.normalize_seo_query(p.title) = q.normalized_query
        AND p.title IS DISTINCT FROM q.query_text
      )
    );

  GET DIAGNOSTICS v_product_updates = ROW_COUNT;

  SELECT count(*)
  INTO v_remaining
  FROM public.seo_sprint_queries AS sq
  JOIN public.seo_queries AS q ON q.id = sq.query_id
  WHERE sq.sprint_id = v_sprint_id
    AND left(q.query_text, 1) <> upper(left(q.query_text, 1));

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'audio_sprint_lowercase_queries_remaining=%', v_remaining;
  END IF;

  SELECT count(*)
  INTO v_remaining
  FROM public.seo_sprint_queries AS sq
  WHERE sq.sprint_id = v_sprint_id
    AND left(sq.display_title, 1) <> upper(left(sq.display_title, 1));

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'audio_sprint_lowercase_display_titles_remaining=%', v_remaining;
  END IF;

  SELECT count(*)
  INTO v_remaining
  FROM public.practices AS p
  JOIN public.seo_queries AS q ON q.id = p.primary_seo_query_id
  JOIN public.seo_sprint_queries AS sq ON sq.query_id = q.id
  WHERE sq.sprint_id = v_sprint_id
    AND p.seo_primary_query IS DISTINCT FROM q.query_text;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'audio_sprint_primary_query_mismatch_remaining=%', v_remaining;
  END IF;

  RAISE NOTICE
    'seo_sprint_query_initial_caps query_updates=% display_updates=% product_updates=%',
    v_query_updates,
    v_display_updates,
    v_product_updates;
END;
$$;

COMMIT;
