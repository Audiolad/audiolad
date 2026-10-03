-- Allow an author to move an unlinked active SEO reservation between
-- author workspaces they can both edit. This keeps the reservation/query
-- globally unique while changing only its owning workspace.
--
-- The original expiry is preserved so moving a reservation cannot extend the
-- seven-day reservation window. Linked/used reservations are intentionally
-- not transferable.

CREATE OR REPLACE FUNCTION public.transfer_seo_query_reservation(
  p_reservation_id uuid,
  p_target_author_id uuid
)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_source_author_id uuid;
  v_active_count integer;
  v_first_author text;
  v_second_author text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_target_author_id IS NULL THEN
    RAISE EXCEPTION 'seo_reservation_transfer_target_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_reservation
  FROM public.seo_query_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND OR v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'seo_reservation_not_transferable'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.product_id IS NOT NULL THEN
    RAISE EXCEPTION 'seo_reservation_already_linked'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.expires_at IS NOT NULL
     AND v_reservation.expires_at <= now() THEN
    RAISE EXCEPTION 'seo_reservation_expired'
      USING ERRCODE = 'P0001';
  END IF;

  v_source_author_id := v_reservation.author_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members
    WHERE author_id = v_source_author_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members
    WHERE author_id = p_target_author_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_source_author_id = p_target_author_id THEN
    RETURN v_reservation;
  END IF;

  -- reserve_seo_query serializes per author with this same advisory-lock seed.
  -- Lock both authors in deterministic order so transfer and reserve cannot
  -- race the five-active-reservations limit or deadlock each other.
  v_first_author := LEAST(v_source_author_id::text, p_target_author_id::text);
  v_second_author := GREATEST(v_source_author_id::text, p_target_author_id::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_first_author, 73051));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_second_author, 73051));

  -- Re-read after the advisory locks in case another transaction changed the
  -- reservation before we acquired the per-author locks.
  SELECT *
  INTO v_reservation
  FROM public.seo_query_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_reservation.status <> 'active'
     OR v_reservation.product_id IS NOT NULL
     OR v_reservation.author_id IS DISTINCT FROM v_source_author_id THEN
    RAISE EXCEPTION 'seo_reservation_not_transferable'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.expires_at IS NOT NULL
     AND v_reservation.expires_at <= now() THEN
    RAISE EXCEPTION 'seo_reservation_expired'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.expire_seo_query_reservation(NULL, p_target_author_id);

  SELECT count(*)
  INTO v_active_count
  FROM public.seo_query_reservations
  WHERE author_id = p_target_author_id
    AND status = 'active';

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'seo_reservation_limit_reached'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.seo_query_reservations
  SET
    author_id = p_target_author_id,
    updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

COMMENT ON FUNCTION public.transfer_seo_query_reservation(uuid, uuid) IS
  'audiolad:seo-reservation-transfer:v1; move an active unlinked reservation between author workspaces editable by the same authenticated user; preserves expiry and target 5-slot limit';

REVOKE ALL ON FUNCTION public.transfer_seo_query_reservation(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_seo_query_reservation(uuid, uuid)
  TO authenticated;
