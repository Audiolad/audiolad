-- Authoritative music/release gate for reservation → product linking.
-- authenticated can EXECUTE this RPC directly, so the route check is not enough.
-- The function loads the practices row. It does not accept publication_class.
-- Aurafon (59c7e5b8-eae4-4394-82fb-b815a10be6c2) keeps non-music beta linking.
-- Other authors require product_kind = music OR publication_class = release.
-- Atomic locks, idempotent same-product return, and existing rejection codes stay.
-- No seed. No new tables or columns.

CREATE OR REPLACE FUNCTION public.link_seo_reservation_to_product(
  p_reservation_id uuid,
  p_product_id uuid
)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_query public.seo_queries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_reservation
  FROM public.seo_query_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND OR v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'seo_reservation_not_linkable' USING ERRCODE = 'P0001';
  END IF;

  -- Expired unlinked reservation cannot be linked.
  IF v_reservation.product_id IS NULL
     AND v_reservation.expires_at IS NOT NULL
     AND v_reservation.expires_at < now() THEN
    RAISE EXCEPTION 'seo_reservation_expired' USING ERRCODE = 'P0001';
  END IF;

  -- Reservation already linked to a different product.
  IF v_reservation.product_id IS NOT NULL
     AND v_reservation.product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'seo_reservation_already_linked' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_practice
  FROM public.practices
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status <> 'draft'
     OR v_practice.moderation_status NOT IN ('not_submitted', 'changes_requested') THEN
    RAISE EXCEPTION 'seo_reservation_product_not_linkable' USING ERRCODE = 'P0001';
  END IF;

  IF v_practice.author_id IS DISTINCT FROM v_reservation.author_id
     OR NOT EXISTS (
       SELECT 1 FROM public.author_members
       WHERE author_id = v_reservation.author_id
         AND user_id = auth.uid()
         AND role IN ('owner', 'editor')
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Factual product fields only. Aurafon remains on the closed beta.
  IF v_practice.author_id IS DISTINCT FROM '59c7e5b8-eae4-4394-82fb-b815a10be6c2'::uuid
     AND v_practice.product_kind IS DISTINCT FROM 'music'
     AND v_practice.publication_class IS DISTINCT FROM 'release' THEN
    RAISE EXCEPTION 'seo_reservation_product_not_music' USING ERRCODE = 'P0001';
  END IF;

  IF v_practice.primary_seo_query_id IS NOT NULL
     AND v_practice.primary_seo_query_id IS DISTINCT FROM v_reservation.query_id THEN
    RAISE EXCEPTION 'practice_already_has_primary_seo_query' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_query
  FROM public.seo_queries
  WHERE id = v_reservation.query_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_query_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF char_length(v_query.query_text) > 120 THEN
    RAISE EXCEPTION 'seo_query_too_long_for_product' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: already linked to this product with matching query.
  IF v_reservation.product_id IS NOT DISTINCT FROM p_product_id
     AND v_practice.primary_seo_query_id IS NOT DISTINCT FROM v_reservation.query_id
     AND v_practice.seo_primary_query IS NOT DISTINCT FROM v_query.query_text THEN
    RETURN v_reservation;
  END IF;

  PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);

  UPDATE public.practices
  SET
    primary_seo_query_id = v_reservation.query_id,
    seo_primary_query = v_query.query_text,
    updated_at = now()
  WHERE id = v_practice.id;

  UPDATE public.seo_query_reservations
  SET
    product_id = v_practice.id,
    expires_at = NULL,
    updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

COMMENT ON FUNCTION public.link_seo_reservation_to_product(uuid, uuid) IS
  'audiolad:seo-reservation-link:v3; factual music/release gate for non-Aurafon authors; Aurafon beta unchanged; sets practices.primary_seo_query_id and practices.seo_primary_query atomically; idempotent for same product';

REVOKE ALL ON FUNCTION public.link_seo_reservation_to_product(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_seo_reservation_to_product(uuid, uuid) TO authenticated;
