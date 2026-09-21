-- When admin approves a commercial application and the author already accepted
-- the current Author Terms, promote straight to commercial_active.
-- Fixes stuck UI «Коммерческий статус активируется» after terms-before-approve.
-- Also backfills authors already stuck: onboarding + approved app + current terms.

BEGIN;

CREATE OR REPLACE FUNCTION public.approve_author_commercial_application(
  p_application_id uuid,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.author_commercial_applications%ROWTYPE;
  v_transition jsonb;
  v_access text;
  v_terms_accepted boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'approved' THEN
    SELECT a.access_status
    INTO v_access
    FROM public.authors AS a
    WHERE a.id = v_row.author_id;

    -- Idempotent re-approve: still finalize if terms already accepted.
    SELECT EXISTS (
      SELECT 1
      FROM public.author_terms_acceptances AS ata
      INNER JOIN public.author_terms_versions AS atv
        ON atv.id = ata.terms_version_id
       AND atv.is_current = true
      WHERE ata.author_id = v_row.author_id
    )
    INTO v_terms_accepted;

    IF v_terms_accepted
       AND coalesce(v_access, '') = 'commercial_onboarding' THEN
      v_access := public.set_author_access_status_for_commercial_application(
        v_row.author_id,
        'commercial_active',
        v_actor,
        'author_terms_already_accepted_on_approve',
        p_application_id
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'application_id', p_application_id,
      'author_id', v_row.author_id,
      'status', 'approved',
      'access_status', v_access
    );
  END IF;

  IF v_row.status NOT IN ('submitted', 'in_review', 'needs_changes') THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_transition := public.transition_author_commercial_application_status(
    p_application_id,
    'approved',
    p_staff_comment,
    NULL
  );

  v_access := public.set_author_access_status_for_commercial_application(
    v_row.author_id,
    'commercial_onboarding',
    v_actor,
    'commercial_application_approved',
    p_application_id
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.author_terms_acceptances AS ata
    INNER JOIN public.author_terms_versions AS atv
      ON atv.id = ata.terms_version_id
     AND atv.is_current = true
    WHERE ata.author_id = v_row.author_id
  )
  INTO v_terms_accepted;

  IF v_terms_accepted THEN
    v_access := public.set_author_access_status_for_commercial_application(
      v_row.author_id,
      'commercial_active',
      v_actor,
      'author_terms_already_accepted_on_approve',
      p_application_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', coalesce((v_transition ->> 'idempotent')::boolean, false),
    'application_id', p_application_id,
    'author_id', v_row.author_id,
    'status', 'approved',
    'access_status', v_access
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_author_commercial_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_author_commercial_application(uuid, text)
  TO authenticated, service_role;

-- Backfill stuck authors (approved + current terms + still onboarding).
DO $$
DECLARE
  r record;
  v_new text;
BEGIN
  FOR r IN
    SELECT DISTINCT
      a.id AS author_id,
      aca.id AS application_id,
      COALESCE(aca.reviewed_by, ata.accepted_by_user_id) AS actor_id
    FROM public.authors AS a
    INNER JOIN public.author_commercial_applications AS aca
      ON aca.author_id = a.id
     AND aca.status = 'approved'
    INNER JOIN public.author_terms_acceptances AS ata
      ON ata.author_id = a.id
    INNER JOIN public.author_terms_versions AS atv
      ON atv.id = ata.terms_version_id
     AND atv.is_current = true
    WHERE a.access_status = 'commercial_onboarding'
      AND COALESCE(aca.reviewed_by, ata.accepted_by_user_id) IS NOT NULL
  LOOP
    v_new := public.set_author_access_status_for_commercial_application(
      r.author_id,
      'commercial_active',
      r.actor_id,
      'backfill_terms_accepted_before_approve',
      r.application_id
    );
    RAISE NOTICE 'commercial_activate_backfill author=% -> %', r.author_id, v_new;
  END LOOP;
END;
$$;

COMMIT;
