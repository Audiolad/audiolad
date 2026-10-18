-- Rollback of 20270110120000_author_terms_account_level_acceptance.sql (only with Sergey's OK).
-- Restores the per-workspace bodies from 20270109120000 verbatim and drops the helper.
-- Data: nothing to restore (the migration wrote no rows). Afterwards Sergey's other workspaces
-- again need their own acceptance; grants already created stay (revoke separately if wanted).
BEGIN;

CREATE OR REPLACE FUNCTION public.author_has_accepted_current_terms(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_author_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.author_terms_acceptances a
      JOIN public.author_terms_versions v ON v.id = a.terms_version_id
      WHERE a.author_id = p_author_id AND v.document_key = 'author-terms' AND v.is_current
    )
    OR EXISTS (
      SELECT 1
      FROM public.author_terms_acceptances a
      JOIN public.author_terms_versions v ON v.id = a.terms_version_id
      WHERE a.author_id = p_author_id AND v.document_key = 'author-terms' AND v.commercial_access_continues
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.author_business_agreement_acceptance(p_author_id uuid)
RETURNS TABLE(acceptance_id uuid, terms_version_id uuid, version text, content_hash text, accepted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, v.id, v.version, v.content_hash, a.accepted_at
  FROM public.author_terms_versions c
  JOIN public.author_terms_acceptances a ON a.author_id = p_author_id
  JOIN public.author_terms_versions v ON v.id = a.terms_version_id
  WHERE p_author_id IS NOT NULL
    AND c.document_key = 'author-terms' AND c.is_current
    AND v.document_key = 'author-terms' AND v.covers_business
    AND (v.id = c.id OR v.commercial_access_continues)
  ORDER BY (v.id = c.id) DESC, a.accepted_at DESC, a.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.author_commercial_agreement_state(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE c public.author_terms_versions%ROWTYPE; v_accepted_current boolean; v_any boolean; v_continues boolean; v_biz record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.author_members m WHERE m.author_id = p_author_id AND m.user_id = auth.uid()
  ) AND NOT public.business_onboarding_is_moderator() THEN
    RAISE EXCEPTION 'author_membership_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.author_terms_versions WHERE document_key = 'author-terms' AND is_current;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('current_version', NULL, 'accepted_current', false, 'previous_edition_active', false,
      'reaccept_invited', false, 'business_agreement', false);
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.author_terms_acceptances WHERE author_id = p_author_id AND terms_version_id = c.id)
    INTO v_accepted_current;
  SELECT EXISTS (SELECT 1 FROM public.author_terms_acceptances a JOIN public.author_terms_versions v ON v.id = a.terms_version_id
    WHERE a.author_id = p_author_id AND v.document_key = 'author-terms' AND v.id <> c.id) INTO v_any;
  SELECT EXISTS (SELECT 1 FROM public.author_terms_acceptances a JOIN public.author_terms_versions v ON v.id = a.terms_version_id
    WHERE a.author_id = p_author_id AND v.document_key = 'author-terms' AND v.id <> c.id AND v.commercial_access_continues) INTO v_continues;
  SELECT * INTO v_biz FROM public.author_business_agreement_acceptance(p_author_id);
  RETURN jsonb_build_object(
    'current_version', c.version,
    'current_covers_business', c.covers_business,
    'accepted_current', v_accepted_current,
    -- earlier edition keeps its commercial channels indefinitely (no date); notice only, nothing required
    'previous_edition_active', NOT v_accepted_current AND v_continues,
    'reaccept_invited', NOT v_accepted_current AND v_any AND c.covers_business,
    'business_agreement', v_biz.acceptance_id IS NOT NULL,
    'business_agreement_version', v_biz.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.business_unified_auto_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_authors uuid[];
BEGIN
  IF NOT public.business_unified_agreement_active() THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'author_terms_acceptances' THEN
    SELECT array_agg(DISTINCT n.author_id) INTO v_authors
      FROM new_rows n JOIN public.author_terms_versions v ON v.id = n.terms_version_id AND v.covers_business;
  ELSIF TG_TABLE_NAME = 'business_rightsholder_verifications' THEN
    SELECT array_agg(DISTINCT m.author_id) INTO v_authors
      FROM new_rows n JOIN public.author_members m ON m.user_id = n.owner_user_id AND m.role = 'owner'
      WHERE n.status = 'verified';
  ELSIF TG_TABLE_NAME = 'practices' THEN
    SELECT array_agg(DISTINCT n.author_id) INTO v_authors
      FROM new_rows n WHERE n.status = 'published' AND n.product_kind = 'music';
  ELSIF TG_TABLE_NAME = 'audio_items' THEN
    SELECT array_agg(DISTINCT p.author_id) INTO v_authors
      FROM new_rows n JOIN public.practices p ON p.id = n.practice_id
      WHERE n.status = 'published' AND p.status = 'published' AND p.product_kind = 'music';
  END IF;
  PERFORM public.business_unified_auto_sync_authors(v_authors);
  RETURN NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.author_terms_covering_acceptances(uuid[]);
COMMIT;
