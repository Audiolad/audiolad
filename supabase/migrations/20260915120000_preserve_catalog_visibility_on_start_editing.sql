-- Preserve catalog visibility when an author starts editing a published product.
--
-- Root cause: start_practice_editing previously wrote a false listing flag
-- on published → unpublished. The visibility trigger then stored
-- catalog_visibility as unlisted. approve_and_publish_practice correctly
-- preserves the current listing choice, so a later republish kept the wiped
-- unlisted value.
--
-- Fix: stop writing visibility columns in start_practice_editing.
-- status unpublished already excludes Catalog, Author Public Page, and sitemap.
-- Do not force a listed flag on approve/publish.
--
-- Additive CREATE OR REPLACE of the current function. Do not edit older
-- already-applied migrations.

BEGIN;

CREATE OR REPLACE FUNCTION public.start_practice_editing(
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
  v_can_bypass boolean;
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

  SELECT COALESCE(a.can_bypass_product_moderation, false)
  INTO v_can_bypass
  FROM public.authors AS a
  WHERE a.id = v_practice.author_id;

  IF NOT (
    (
      v_practice.status = 'published'
      AND v_practice.moderation_status = 'approved'
    )
    OR (
      v_practice.status = 'unpublished'
      AND v_practice.moderation_status = 'approved'
    )
    OR (
      v_practice.status = 'published'
      AND v_can_bypass
    )
  ) THEN
    RAISE EXCEPTION 'lifecycle_state_changed'
      USING ERRCODE = 'P0001',
        DETAIL = 'Editing mode requires published/unpublished approved (or published bypass).';
  END IF;

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  PERFORM set_config('audiolad.allow_practice_moderation_update', 'on', true);

  UPDATE public.practices AS p
  SET
    status = 'unpublished',
    moderation_status = 'not_submitted',
    moderation_review_comment = NULL,
    moderation_submitted_at = NULL,
    updated_at = now()
  WHERE p.id = p_practice_id
  RETURNING * INTO v_practice;

  PERFORM public.log_practice_moderation_event(
    v_practice.id,
    v_practice.author_id,
    'edit_mode_started',
    v_from_status,
    'unpublished',
    v_from_moderation,
    'not_submitted',
    NULL,
    auth.uid(),
    'author',
    v_practice.moderation_attempt,
    jsonb_build_object('source', 'start_practice_editing')
  );
  PERFORM public.record_author_support_mutation_audit(
    v_practice.author_id,
    'product_editing_started',
    'practice',
    v_practice.id::text,
    jsonb_build_object('source', 'start_practice_editing')
  );

  RETURN v_practice;
END;
$$;

COMMENT ON FUNCTION public.start_practice_editing(uuid) IS
  'Start editing a published/unpublished approved practice. Sets status=unpublished and resets moderation. Does not change is_catalog_listed or catalog_visibility; unpublished status already excludes public listings.';

REVOKE ALL ON FUNCTION public.start_practice_editing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_practice_editing(uuid) TO authenticated;

COMMIT;
