BEGIN;

-- Phase 1 SEO analytics: query-level Yandex Webmaster history joined to seo_queries.
-- Phase 2 (seo_pages, URL×query metrics, page-type comparison, cannibalization) is intentionally absent.
-- Unknown Webmaster queries are stored on the snapshot only and are not inserted into seo_queries.

CREATE TABLE public.seo_search_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  original_filename text NOT NULL,
  row_count integer NOT NULL,
  total_impressions bigint NOT NULL,
  total_clicks bigint NOT NULL,
  CONSTRAINT seo_search_snapshots_source_check CHECK (source = 'yandex_webmaster'),
  CONSTRAINT seo_search_snapshots_period_order CHECK (period_end >= period_start),
  CONSTRAINT seo_search_snapshots_filename_not_blank CHECK (btrim(original_filename) <> ''),
  CONSTRAINT seo_search_snapshots_counts_non_negative CHECK (
    row_count >= 0
    AND total_impressions >= 0
    AND total_clicks >= 0
  ),
  CONSTRAINT seo_search_snapshots_period_source_unique UNIQUE (period_start, period_end, source)
);

CREATE TABLE public.seo_search_query_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.seo_search_snapshots(id) ON DELETE CASCADE,
  query_id uuid NULL REFERENCES public.seo_queries(id) ON DELETE SET NULL,
  query_text text NOT NULL,
  normalized_query text NOT NULL,
  impressions bigint NOT NULL,
  clicks bigint NOT NULL,
  ctr numeric NOT NULL,
  avg_position numeric NOT NULL,
  avg_click_position numeric NULL,
  raw_metrics jsonb NULL,
  CONSTRAINT seo_search_query_metrics_query_text_not_blank CHECK (btrim(query_text) <> ''),
  CONSTRAINT seo_search_query_metrics_normalized_not_blank CHECK (btrim(normalized_query) <> ''),
  CONSTRAINT seo_search_query_metrics_non_negative CHECK (
    impressions >= 0
    AND clicks >= 0
    AND clicks <= impressions
    AND ctr >= 0
    AND ctr <= 1
    AND avg_position >= 0
    AND (avg_click_position IS NULL OR avg_click_position >= 0)
  ),
  CONSTRAINT seo_search_query_metrics_snapshot_query_unique UNIQUE (snapshot_id, normalized_query)
);

CREATE INDEX seo_search_snapshots_period_idx
  ON public.seo_search_snapshots(source, period_end DESC, period_start DESC);
CREATE INDEX seo_search_query_metrics_query_id_idx
  ON public.seo_search_query_metrics(query_id)
  WHERE query_id IS NOT NULL;
CREATE INDEX seo_search_query_metrics_normalized_idx
  ON public.seo_search_query_metrics(normalized_query);

CREATE OR REPLACE FUNCTION public.import_seo_search_snapshot(
  p_source text,
  p_period_start date,
  p_period_end date,
  p_original_filename text,
  p_metrics jsonb
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
  v_distinct integer;
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

  SELECT count(*)::integer, count(DISTINCT public.normalize_seo_query(row.query_text))::integer
  INTO v_count, v_distinct
  FROM jsonb_to_recordset(p_metrics) AS row(query_text text);
  IF v_count <> v_distinct THEN
    RAISE EXCEPTION 'duplicate_normalized_query' USING ERRCODE = '22023';
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
  SELECT
    v_id,
    q.id,
    btrim(row.query_text),
    public.normalize_seo_query(row.query_text),
    row.impressions,
    row.clicks,
    row.ctr,
    row.avg_position,
    row.avg_click_position,
    row.raw_metrics
  FROM jsonb_to_recordset(p_metrics) AS row(
    query_text text,
    impressions bigint,
    clicks bigint,
    ctr numeric,
    avg_position numeric,
    avg_click_position numeric,
    raw_metrics jsonb
  )
  LEFT JOIN public.seo_queries AS q
    ON q.normalized_query = public.normalize_seo_query(row.query_text);

  SELECT
    count(*)::integer,
    coalesce(sum(impressions), 0),
    coalesce(sum(clicks), 0),
    count(*) FILTER (WHERE query_id IS NOT NULL)::integer
  INTO v_count, v_impressions, v_clicks, v_matched
  FROM public.seo_search_query_metrics
  WHERE snapshot_id = v_id;

  UPDATE public.seo_search_snapshots
  SET row_count = v_count,
      total_impressions = v_impressions,
      total_clicks = v_clicks,
      imported_at = now()
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'snapshot_id', v_id,
    'replaced', v_replaced,
    'row_count', v_count,
    'matched_count', v_matched,
    'new_count', v_count - v_matched,
    'total_impressions', v_impressions,
    'total_clicks', v_clicks
  );
END;
$$;

COMMENT ON FUNCTION public.import_seo_search_snapshot(text, date, date, text, jsonb) IS
  'Idempotent Yandex Webmaster query import. Replaces metrics for the same source and period. Does not insert seo_queries and does not delete other periods.';

REVOKE ALL ON FUNCTION public.import_seo_search_snapshot(text, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_seo_search_snapshot(text, date, date, text, jsonb) TO authenticated, service_role;

ALTER TABLE public.seo_search_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_search_query_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY seo_search_snapshots_select_seo ON public.seo_search_snapshots
  FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'seo.manage'));
CREATE POLICY seo_search_snapshots_insert_seo ON public.seo_search_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_permission(auth.uid(), 'seo.manage'));
CREATE POLICY seo_search_snapshots_update_seo ON public.seo_search_snapshots
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'seo.manage'))
  WITH CHECK (public.has_platform_permission(auth.uid(), 'seo.manage'));

CREATE POLICY seo_search_query_metrics_select_seo ON public.seo_search_query_metrics
  FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'seo.manage'));
CREATE POLICY seo_search_query_metrics_insert_seo ON public.seo_search_query_metrics
  FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_permission(auth.uid(), 'seo.manage'));
CREATE POLICY seo_search_query_metrics_update_seo ON public.seo_search_query_metrics
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'seo.manage'))
  WITH CHECK (public.has_platform_permission(auth.uid(), 'seo.manage'));

REVOKE ALL ON public.seo_search_snapshots, public.seo_search_query_metrics FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.seo_search_snapshots, public.seo_search_query_metrics TO authenticated;
GRANT ALL ON public.seo_search_snapshots, public.seo_search_query_metrics TO service_role;

COMMIT;
