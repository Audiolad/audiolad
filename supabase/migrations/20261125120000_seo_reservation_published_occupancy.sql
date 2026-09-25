-- Reserve stays idempotent for the same author's active row and refuses a
-- query already used by a published product.
-- Occupancy is primary_seo_query_id, or — until a separate backfill —
-- exact normalized equality of practices.seo_primary_query and
-- seo_queries.normalized_query. Not fuzzy. Not ILIKE.
-- Active reservation limit stays 5. used / released / expired do not count.
-- No seed. No backfill. No new tables or columns.

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

  -- Re-submit of the caller's own active reservation must not insert a second row
  -- and must not fail the active-slot limit.
  SELECT * INTO v_reservation
  FROM public.seo_query_reservations
  WHERE query_id = p_query_id
    AND author_id = p_author_id
    AND status = 'active'
  ORDER BY reserved_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_reservation;
  END IF;

  -- Published product is authoritative even when no reservation exists.
  IF EXISTS (
    SELECT 1
    FROM public.practices
    WHERE deleted_at IS NULL
      AND status = 'published'
      AND primary_seo_query_id = p_query_id
  ) THEN
    RAISE EXCEPTION 'seo_query_occupied_by_published_product' USING ERRCODE = 'P0001';
  END IF;

  -- Legacy compatibility until backfill sets primary_seo_query_id.
  -- Exact normalized equality only — not fuzzy, not ILIKE.
  IF EXISTS (
    SELECT 1
    FROM public.practices
    WHERE deleted_at IS NULL
      AND status = 'published'
      AND primary_seo_query_id IS NULL
      AND seo_primary_query IS NOT NULL
      AND public.normalize_seo_query(seo_primary_query) = v_query.normalized_query
  ) THEN
    RAISE EXCEPTION 'seo_query_occupied_by_published_product' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.seo_query_reservations
    WHERE query_id = p_query_id AND status IN ('active', 'used')
  ) THEN
    RAISE EXCEPTION 'seo_query_already_reserved' USING ERRCODE = 'P0001';
  END IF;

  -- used / released / expired do not consume the 5 active slots.
  SELECT count(*) INTO v_active_count
  FROM public.seo_query_reservations
  WHERE author_id = p_author_id AND status = 'active';
  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'seo_reservation_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.seo_query_reservations (
    query_id, author_id, reserved_at, expires_at, status
  ) VALUES (p_query_id, p_author_id, now(), now() + interval '7 days', 'active')
  RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

COMMENT ON FUNCTION public.reserve_seo_query(uuid, uuid) IS
  'audiolad:seo-reserve:v3; idempotent own active reservation; published occupancy via primary_seo_query_id or legacy exact normalized seo_primary_query; active limit 5; no backfill';

REVOKE ALL ON FUNCTION public.reserve_seo_query(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_seo_query(uuid, uuid) TO authenticated;
