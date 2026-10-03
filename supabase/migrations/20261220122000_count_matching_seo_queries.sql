BEGIN;

-- Preview matches Webmaster queries to seo_queries through a POST body.
-- Passing thousands of query strings in a URL filter exceeds nginx limits.
-- This function does not insert unknown queries and does not create seo_pages.

CREATE FUNCTION public.count_matching_seo_queries(p_normalized_queries text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.has_platform_permission(auth.uid(), 'seo.manage') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_normalized_queries IS NULL OR cardinality(p_normalized_queries) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_normalized_queries) > 1000 THEN
    RAISE EXCEPTION 'invalid_metrics' USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT q.normalized_query)::integer
  INTO v_count
  FROM public.seo_queries AS q
  WHERE q.normalized_query = ANY (p_normalized_queries);

  RETURN coalesce(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.count_matching_seo_queries(text[]) IS
  'Counts distinct seo_queries.normalized_query values present in the given list. Does not insert seo_queries.';

REVOKE ALL ON FUNCTION public.count_matching_seo_queries(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_matching_seo_queries(text[]) TO authenticated, service_role;

COMMIT;
