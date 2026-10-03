BEGIN;

-- Yandex can emit several query_text values that collapse through normalize_seo_query.
-- Those rows are summed into one metric. source_row_count keeps the export size;
-- metric_count is the unique normalized queries. Phase 2 is still absent.

ALTER TABLE public.seo_search_snapshots
  ADD COLUMN source_row_count integer,
  ADD COLUMN metric_count integer;

UPDATE public.seo_search_snapshots
SET source_row_count = row_count,
    metric_count = row_count
WHERE source_row_count IS NULL
   OR metric_count IS NULL;

ALTER TABLE public.seo_search_snapshots
  ALTER COLUMN source_row_count SET NOT NULL,
  ALTER COLUMN metric_count SET NOT NULL;

ALTER TABLE public.seo_search_snapshots
  ADD CONSTRAINT seo_search_snapshots_source_metric_counts_check
  CHECK (
    source_row_count >= 0
    AND metric_count >= 0
    AND metric_count <= source_row_count
  );

DROP FUNCTION IF EXISTS public.import_seo_search_snapshot(text, date, date, text, jsonb);

CREATE FUNCTION public.import_seo_search_snapshot(
  p_source text,
  p_period_start date,
  p_period_end date,
  p_original_filename text,
  p_metrics jsonb,
  p_source_row_count integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_replaced boolean := false;
  v_count integer;
  v_input integer;
  v_source integer;
  v_impressions bigint;
  v_clicks bigint;
  v_matched integer;
  v_filename text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.has_platform_permission(auth.uid(), 'seo.manage') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_source IS DISTINCT FROM 'yandex_webmaster' THEN
    RAISE EXCEPTION 'unsupported_source' USING ERRCODE = '22023';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;
  IF p_metrics IS NULL OR jsonb_typeof(p_metrics) <> 'array' THEN
    RAISE EXCEPTION 'invalid_metrics' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_metrics) = 0 OR jsonb_array_length(p_metrics) > 50000 THEN
    RAISE EXCEPTION 'invalid_metrics' USING ERRCODE = '22023';
  END IF;

  v_filename := left(btrim(coalesce(p_original_filename, '')), 180);
  IF v_filename = '' THEN
    RAISE EXCEPTION 'invalid_filename' USING ERRCODE = '22023';
  END IF;

  -- Validate every source row before any grouping or write.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_metrics) AS row(
      query_text text,
      impressions bigint,
      clicks bigint,
      ctr numeric,
      avg_position numeric,
      avg_click_position numeric,
      raw_metrics jsonb
    )
    WHERE row.query_text IS NULL
       OR btrim(row.query_text) = ''
       OR public.normalize_seo_query(row.query_text) = ''
       OR row.impressions IS NULL
       OR row.clicks IS NULL
       OR row.ctr IS NULL
       OR row.avg_position IS NULL
       OR row.impressions < 0
       OR row.clicks < 0
       OR row.clicks > row.impressions
       OR row.ctr < 0
       OR row.ctr > 1
       OR row.avg_position < 0
       OR (row.avg_click_position IS NOT NULL AND row.avg_click_position < 0)
  ) THEN
    RAISE EXCEPTION 'invalid_metrics' USING ERRCODE = '22023';
  END IF;

  v_input := jsonb_array_length(p_metrics);
  IF p_source_row_count IS NULL THEN
    v_source := v_input;
  ELSIF p_source_row_count < v_input OR p_source_row_count > 50000 THEN
    RAISE EXCEPTION 'invalid_metrics' USING ERRCODE = '22023';
  ELSE
    v_source := p_source_row_count;
  END IF;

  DROP TABLE IF EXISTS pg_temp.seo_search_import_rows;
  CREATE TEMP TABLE seo_search_import_rows (
    ordinality bigint PRIMARY KEY,
    query_text text NOT NULL,
    normalized_query text NOT NULL,
    impressions bigint NOT NULL,
    clicks bigint NOT NULL,
    avg_position numeric NOT NULL,
    avg_click_position numeric NULL,
    raw_metrics jsonb NULL
  ) ON COMMIT DROP;

  INSERT INTO seo_search_import_rows (
    ordinality,
    query_text,
    normalized_query,
    impressions,
    clicks,
    avg_position,
    avg_click_position,
    raw_metrics
  )
  SELECT
    item.ordinality,
    btrim(row.query_text),
    public.normalize_seo_query(row.query_text),
    row.impressions,
    row.clicks,
    row.avg_position,
    row.avg_click_position,
    row.raw_metrics
  FROM jsonb_array_elements(p_metrics) WITH ORDINALITY AS item(value, ordinality)
  CROSS JOIN LATERAL jsonb_to_record(item.value) AS row(
    query_text text,
    impressions bigint,
    clicks bigint,
    ctr numeric,
    avg_position numeric,
    avg_click_position numeric,
    raw_metrics jsonb
  );

  IF EXISTS (
    SELECT 1
    FROM seo_search_import_rows
    GROUP BY normalized_query
    HAVING sum(clicks) > sum(impressions)
  ) THEN
    RAISE EXCEPTION 'invalid_metrics' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_id
  FROM public.seo_search_snapshots
  WHERE period_start = p_period_start
    AND period_end = p_period_end
    AND source = p_source
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    v_replaced := true;
    UPDATE public.seo_search_snapshots
    SET imported_at = now(),
        original_filename = v_filename
    WHERE id = v_id;
  ELSE
    INSERT INTO public.seo_search_snapshots (
      source,
      period_start,
      period_end,
      imported_at,
      original_filename,
      row_count,
      source_row_count,
      metric_count,
      total_impressions,
      total_clicks
    ) VALUES (
      p_source,
      p_period_start,
      p_period_end,
      now(),
      v_filename,
      0,
      0,
      0,
      0,
      0
    )
    RETURNING id INTO v_id;
  END IF;

  -- Replace this period only. Older snapshots and their metrics stay in place.
  DELETE FROM public.seo_search_query_metrics
  WHERE snapshot_id = v_id;

  INSERT INTO public.seo_search_query_metrics (
    snapshot_id,
    query_id,
    query_text,
    normalized_query,
    impressions,
    clicks,
    ctr,
    avg_position,
    avg_click_position,
    raw_metrics
  )
  WITH grouped AS (
    SELECT
      normalized_query,
      sum(impressions) AS impressions,
      sum(clicks) AS clicks,
      CASE
        WHEN sum(impressions) = 0 THEN 0
        ELSE sum(avg_position * impressions) / sum(impressions)
      END AS avg_position,
      CASE
        WHEN coalesce(sum(clicks) FILTER (WHERE avg_click_position IS NOT NULL), 0) = 0 THEN NULL
        ELSE sum(avg_click_position * clicks) FILTER (WHERE avg_click_position IS NOT NULL)
             / sum(clicks) FILTER (WHERE avg_click_position IS NOT NULL)
      END AS avg_click_position
    FROM seo_search_import_rows
    GROUP BY normalized_query
  ),
  picked AS (
    SELECT DISTINCT ON (normalized_query)
      normalized_query,
      query_text
    FROM seo_search_import_rows
    ORDER BY normalized_query, impressions DESC, ordinality ASC
  ),
  counter_sums AS (
    SELECT
      source.normalized_query,
      entry.key,
      sum(entry.value::numeric) AS total
    FROM seo_search_import_rows AS source
    CROSS JOIN LATERAL jsonb_each(coalesce(source.raw_metrics, '{}'::jsonb)) AS entry(key, value)
    WHERE jsonb_typeof(entry.value) = 'number'
      AND entry.key !~* 'ctr|avg|average|средн'
    GROUP BY source.normalized_query, entry.key
  ),
  rate_values AS (
    SELECT
      source.normalized_query,
      entry.key,
      (array_agg(entry.value ORDER BY source.impressions DESC, source.ordinality ASC))[1] AS value
    FROM seo_search_import_rows AS source
    CROSS JOIN LATERAL jsonb_each(coalesce(source.raw_metrics, '{}'::jsonb)) AS entry(key, value)
    WHERE jsonb_typeof(entry.value) <> 'number'
       OR entry.key ~* 'ctr|avg|average|средн'
    GROUP BY source.normalized_query, entry.key
  ),
  raw_merged AS (
    SELECT
      parts.normalized_query,
      jsonb_object_agg(parts.key, parts.value) AS raw_metrics
    FROM (
      SELECT normalized_query, key, to_jsonb(total) AS value
      FROM counter_sums
      UNION ALL
      SELECT normalized_query, key, value
      FROM rate_values
    ) AS parts
    GROUP BY parts.normalized_query
  )
  SELECT
    v_id,
    q.id,
    picked.query_text,
    grouped.normalized_query,
    grouped.impressions,
    grouped.clicks,
    CASE
      WHEN grouped.impressions = 0 THEN 0
      ELSE grouped.clicks::numeric / grouped.impressions
    END,
    grouped.avg_position,
    grouped.avg_click_position,
    raw_merged.raw_metrics
  FROM grouped
  JOIN picked ON picked.normalized_query = grouped.normalized_query
  LEFT JOIN raw_merged ON raw_merged.normalized_query = grouped.normalized_query
  LEFT JOIN public.seo_queries AS q
    ON q.normalized_query = grouped.normalized_query;

  SELECT
    count(*)::integer,
    coalesce(sum(impressions), 0),
    coalesce(sum(clicks), 0),
    count(*) FILTER (WHERE query_id IS NOT NULL)::integer
  INTO v_count, v_impressions, v_clicks, v_matched
  FROM public.seo_search_query_metrics
  WHERE snapshot_id = v_id;

  IF v_count > v_source THEN
    RAISE EXCEPTION 'invalid_metrics' USING ERRCODE = '22023';
  END IF;

  UPDATE public.seo_search_snapshots
  SET row_count = v_source,
      source_row_count = v_source,
      metric_count = v_count,
      total_impressions = v_impressions,
      total_clicks = v_clicks,
      imported_at = now()
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'snapshot_id', v_id,
    'replaced', v_replaced,
    'row_count', v_source,
    'source_row_count', v_source,
    'metric_count', v_count,
    'matched_count', v_matched,
    'new_count', v_count - v_matched,
    'total_impressions', v_impressions,
    'total_clicks', v_clicks
  );
END;
$$;

COMMENT ON FUNCTION public.import_seo_search_snapshot(text, date, date, text, jsonb, integer) IS
  'Idempotent Yandex Webmaster query import. Collapses rows that share normalize_seo_query. Replaces metrics for the same source and period. Does not insert seo_queries and does not delete other periods.';

REVOKE ALL ON FUNCTION public.import_seo_search_snapshot(text, date, date, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_seo_search_snapshot(text, date, date, text, jsonb, integer) TO authenticated, service_role;

COMMIT;
