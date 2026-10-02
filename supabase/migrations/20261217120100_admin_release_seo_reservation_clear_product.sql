-- Admin release of a product-linked reservation set status = 'released'
-- without clearing product_id. That violates
-- seo_query_reservations_product_active_check
-- (product_id IS NULL OR status IN ('active', 'used')).
-- Reproduced against the v2 function body: SQLSTATE 23514,
-- constraint seo_query_reservations_product_active_check.
-- The practice SEO update is in the same transaction and rolls back,
-- so the admin row stays «В работе».

CREATE OR REPLACE FUNCTION public.admin_release_seo_query_reservation(p_reservation_id uuid)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.seo_query_reservations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'seo.manage') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation
  FROM public.seo_query_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND OR v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'seo_reservation_not_releasable' USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.product_id IS NOT NULL THEN
    PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
    UPDATE public.practices
    SET
      primary_seo_query_id = NULL,
      seo_primary_query = NULL,
      updated_at = now()
    WHERE id = v_reservation.product_id
      AND primary_seo_query_id = v_reservation.query_id;
  END IF;

  UPDATE public.seo_query_reservations
  SET
    status = 'released',
    product_id = NULL,
    released_at = now(),
    updated_at = now()
  WHERE id = p_reservation_id
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

COMMENT ON FUNCTION public.admin_release_seo_query_reservation(uuid) IS
  'audiolad:seo-reservation-admin-release:v3; clears practices.primary_seo_query_id and practices.seo_primary_query; nulls product_id so a released row satisfies seo_query_reservations_product_active_check';

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef('public.admin_release_seo_query_reservation(uuid)'::regprocedure)
  INTO v_src;
  IF v_src NOT LIKE '%product_id = NULL%' THEN
    RAISE EXCEPTION 'admin_release_seo_query_reservation must null product_id';
  END IF;
END
$$;
