-- Preserve catalog visibility when an author unpublishes an approved product.
--
-- Root cause: unpublish_approved_practice wrote a false listing flag on
-- published → unpublished. trg_sync_practice_catalog_visibility then stored
-- catalog_visibility as unlisted. publish_audio_product correctly uses
-- COALESCE(v_practice.is_catalog_listed, true), so a later republish kept
-- the wiped unlisted value. Same class as start_practice_editing, already
-- fixed in 20260915120000_preserve_catalog_visibility_on_start_editing.sql.
--
-- Fix: stop writing visibility columns in unpublish_approved_practice.
-- status unpublished already excludes Catalog, Author Public Page, and sitemap.
-- Do not force a listed flag on publish_audio_product.
--
-- Also restores Olga's wiped listed preference for one guarded unpublished
-- row without publishing. No general backfill.
--
-- Additive CREATE OR REPLACE of the current function. Do not edit older
-- already-applied migrations. Wrapper
-- unpublish_approved_practice_with_support_proof keeps calling the base
-- function.

BEGIN;

CREATE OR REPLACE FUNCTION public.unpublish_approved_practice(
  p_practice_id uuid
)
RETURNS public.practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_from_status text;
  v_from_moderation text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN
    RAISE EXCEPTION 'permission_denied'
      USING ERRCODE = '42501';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'lifecycle_state_changed'
      USING ERRCODE = 'P0001',
        DETAIL = 'Product is not published.';
  END IF;

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  UPDATE public.practices AS p
  SET
    status = 'unpublished',
    updated_at = now()
  WHERE p.id = p_practice_id
  RETURNING * INTO v_practice;

  PERFORM public.log_practice_moderation_event(
    v_practice.id,
    v_practice.author_id,
    'unpublished',
    v_from_status,
    'unpublished',
    v_from_moderation,
    v_practice.moderation_status,
    NULL,
    auth.uid(),
    'author',
    v_practice.moderation_attempt,
    jsonb_build_object('source', 'unpublish_approved_practice')
  );
  PERFORM public.record_author_support_mutation_audit(
    v_practice.author_id,
    'product_unpublished',
    'practice',
    v_practice.id::text,
    jsonb_build_object('source', 'unpublish_approved_practice')
  );

  RETURN v_practice;
END;
$$;

COMMENT ON FUNCTION public.unpublish_approved_practice(uuid) IS
  'Unpublish an approved published practice. Sets status=unpublished and keeps moderation_status. Does not change is_catalog_listed or catalog_visibility; unpublished status already excludes public listings.';

REVOKE ALL ON FUNCTION public.unpublish_approved_practice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpublish_approved_practice(uuid) TO authenticated;

-- Guarded one-row repair for Olga's unpublished approved practice
-- (b8f16e12-c301-44f2-bd23-ec1eb387cb3d). Restores the catalog-listed
-- preference that unpublish previously wiped. Does not publish.
-- If the row no longer matches this exact damaged state, UPDATE is a no-op.
UPDATE public.practices
SET
  is_catalog_listed = true,
  catalog_visibility = 'listed',
  updated_at = now()
WHERE id = 'b8f16e12-c301-44f2-bd23-ec1eb387cb3d'
  AND status = 'unpublished'
  AND moderation_status = 'approved'
  AND is_catalog_listed IS FALSE
  AND catalog_visibility = 'unlisted';

COMMIT;
