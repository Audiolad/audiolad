-- Sync practices.seo_primary_query with relational primary_seo_query_id on
-- reservation link/release. No new tables or columns.
-- Closed-beta product-create flow depends on these atomic semantics.

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

CREATE OR REPLACE FUNCTION public.release_seo_query_reservation(p_reservation_id uuid)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_practice public.practices%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_reservation
  FROM public.seo_query_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND OR v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'seo_reservation_not_releasable' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.author_members
    WHERE author_id = v_reservation.author_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_reservation.product_id IS NOT NULL THEN
    SELECT * INTO v_practice
    FROM public.practices
    WHERE id = v_reservation.product_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_practice.deleted_at IS NOT NULL
       OR v_practice.status <> 'draft'
       OR v_practice.moderation_status NOT IN ('not_submitted', 'changes_requested') THEN
      RAISE EXCEPTION 'seo_reservation_product_lifecycle_locked' USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
    UPDATE public.practices
    SET
      primary_seo_query_id = NULL,
      seo_primary_query = NULL,
      updated_at = now()
    WHERE id = v_practice.id
      AND primary_seo_query_id = v_reservation.query_id;
  END IF;

  UPDATE public.seo_query_reservations
  SET
    status = 'released',
    released_at = now(),
    updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

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
    released_at = now(),
    updated_at = now()
  WHERE id = p_reservation_id
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

COMMENT ON FUNCTION public.link_seo_reservation_to_product(uuid, uuid) IS
  'audiolad:seo-reservation-link:v2; sets practices.primary_seo_query_id and practices.seo_primary_query from seo_queries atomically; rejects oversize query text; idempotent for same product';

COMMENT ON FUNCTION public.release_seo_query_reservation(uuid) IS
  'audiolad:seo-reservation-release:v2; clears practices.primary_seo_query_id and practices.seo_primary_query when unlinking a draft';

COMMENT ON FUNCTION public.admin_release_seo_query_reservation(uuid) IS
  'audiolad:seo-reservation-admin-release:v2; clears practices.primary_seo_query_id and practices.seo_primary_query';

-- Keep RPC-only primary_seo_query_id changes, and additionally keep
-- seo_primary_query aligned with seo_queries when a primary id is linked.
CREATE OR REPLACE FUNCTION public.guard_practice_primary_seo_query()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_canonical text;
BEGIN
  IF (
    (TG_OP = 'INSERT' AND NEW.primary_seo_query_id IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.primary_seo_query_id IS DISTINCT FROM OLD.primary_seo_query_id)
  ) AND current_setting('audiolad.allow_primary_seo_query_link', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'primary_seo_query_requires_rpc' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.primary_seo_query_id IS NOT NULL
     AND NEW.seo_primary_query IS DISTINCT FROM OLD.seo_primary_query
     AND current_setting('audiolad.allow_primary_seo_query_link', true) IS DISTINCT FROM 'on' THEN
    SELECT query_text INTO v_canonical
    FROM public.seo_queries
    WHERE id = NEW.primary_seo_query_id;

    IF NOT FOUND OR NEW.seo_primary_query IS DISTINCT FROM v_canonical THEN
      RAISE EXCEPTION 'linked_primary_seo_query_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_practice_primary_seo_query() IS
  'audiolad:seo-primary-guard:v2; RPC-gated primary_seo_query_id changes; linked seo_primary_query may only match seo_queries.query_text unless allow flag is on';
