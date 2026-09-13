BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_seo_query(p_query_id uuid, p_author_id uuid)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query public.seo_queries%ROWTYPE;
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_active_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.author_members
    WHERE author_id = p_author_id AND user_id = auth.uid() AND role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Serialize all reservations for one author, including different queries.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_author_id::text, 73051));
  SELECT * INTO v_query FROM public.seo_queries WHERE id = p_query_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_query_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_query.analysis_status <> 'analyzed' THEN
    RAISE EXCEPTION 'seo_query_not_analyzed' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.expire_seo_query_reservation(p_query_id, NULL);
  PERFORM public.expire_seo_query_reservation(NULL, p_author_id);

  SELECT count(*) INTO v_active_count
  FROM public.seo_query_reservations
  WHERE author_id = p_author_id AND status = 'active';
  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'seo_reservation_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.seo_query_reservations
    WHERE query_id = p_query_id AND status IN ('active', 'used')
  ) THEN
    RAISE EXCEPTION 'seo_query_already_reserved' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.seo_query_reservations (
    query_id, author_id, reserved_at, expires_at, status
  ) VALUES (p_query_id, p_author_id, now(), now() + interval '7 days', 'active')
  RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

DROP POLICY IF EXISTS seo_queries_select_authenticated ON public.seo_queries;
CREATE POLICY seo_queries_select_authenticated ON public.seo_queries
  FOR SELECT TO authenticated USING (
    public.is_platform_staff(auth.uid())
    OR (
      analysis_status = 'analyzed'
      AND EXISTS (
        SELECT 1 FROM public.author_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
      )
    )
  );

UPDATE public.seo_queries
SET analysis_status = 'analyzed'
WHERE analysis_status = 'not_analyzed'
  AND id IN (
    SELECT query_id
    FROM public.seo_query_reservations
    WHERE status IN ('active', 'used')
  );

COMMIT;
