BEGIN;

-- ---------------------------------------------------------------------------
-- Commercial onboarding access statuses
--
-- Adds:
--   commercial_onboarding  – approved application, payout/terms incomplete
--   commercial_active      – paid products allowed
--   commercial_suspended   – commercial capabilities paused
--
-- Backfills legacy access_status = 'commercial' → 'commercial_active'.
-- Approve RPC now grants commercial_onboarding (not paid access).
-- Paid products remain allowed for commercial_active and legacy 'commercial'.
--
-- DO NOT apply to production without explicit approval.
-- ---------------------------------------------------------------------------

-- 1) Expand CHECK (keep legacy 'commercial' during transition).
ALTER TABLE public.authors
  DROP CONSTRAINT IF EXISTS authors_access_status_check;

ALTER TABLE public.authors
  ADD CONSTRAINT authors_access_status_check
  CHECK (
    access_status IN (
      'free',
      'commercial_pending',
      'commercial_onboarding',
      'commercial_active',
      'commercial_suspended',
      'commercial',
      'suspended',
      'terminated'
    )
  );

COMMENT ON COLUMN public.authors.access_status IS
  'Author workspace access tier: free, commercial_pending, commercial_onboarding, commercial_active, commercial_suspended, suspended, terminated. Legacy commercial is treated as commercial_active and must not be newly assigned.';

-- 2) Paid gate: active + legacy commercial only (NOT onboarding / suspended).
CREATE OR REPLACE FUNCTION public.author_access_allows_paid_products(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IN ('commercial_active', 'commercial');
$$;

COMMENT ON FUNCTION public.author_access_allows_paid_products(text) IS
  'True only when the author may create/publish paid products. commercial_onboarding and commercial_suspended are false. Legacy commercial is temporarily accepted as commercial_active.';

-- 3) Backfill commercial → commercial_active with guards (no product/ledger changes).
DO $$
DECLARE
  v_legacy_before integer;
  v_active_before integer;
  v_updated integer;
  v_legacy_after integer;
  v_active_after integer;
BEGIN
  SELECT count(*)::integer
  INTO v_legacy_before
  FROM public.authors
  WHERE access_status = 'commercial';

  SELECT count(*)::integer
  INTO v_active_before
  FROM public.authors
  WHERE access_status = 'commercial_active';

  RAISE NOTICE
    'commercial_onboarding_migration: legacy commercial=% commercial_active_before=%',
    v_legacy_before,
    v_active_before;

  -- Audit before rewrite so from_status remains accurate.
  INSERT INTO public.author_access_status_events (
    author_id,
    application_id,
    from_status,
    to_status,
    changed_by,
    reason
  )
  SELECT
    a.id,
    NULL,
    'commercial',
    'commercial_active',
    NULL,
    'migration_commercial_to_commercial_active'
  FROM public.authors AS a
  WHERE a.access_status = 'commercial';

  UPDATE public.authors
  SET
    access_status = 'commercial_active',
    updated_at = now()
  WHERE access_status = 'commercial';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*)::integer
  INTO v_legacy_after
  FROM public.authors
  WHERE access_status = 'commercial';

  SELECT count(*)::integer
  INTO v_active_after
  FROM public.authors
  WHERE access_status = 'commercial_active';

  IF v_legacy_after <> 0 THEN
    RAISE EXCEPTION
      'commercial_access_status_backfill_incomplete: % legacy commercial rows remain',
      v_legacy_after;
  END IF;

  IF v_updated <> v_legacy_before THEN
    RAISE EXCEPTION
      'commercial_access_status_backfill_mismatch: updated=% expected=%',
      v_updated,
      v_legacy_before;
  END IF;

  IF v_active_after <> (v_active_before + v_legacy_before) THEN
    RAISE EXCEPTION
      'commercial_access_status_active_count_mismatch: active_after=% expected=%',
      v_active_after,
      (v_active_before + v_legacy_before);
  END IF;

  RAISE NOTICE
    'commercial_onboarding_migration: updated=% legacy_after=% commercial_active_after=%',
    v_updated,
    v_legacy_after,
    v_active_after;
END;
$$;

-- 4) Commercial access setter: new statuses only (no new legacy commercial).
CREATE OR REPLACE FUNCTION public.set_author_access_status_for_commercial_application(
  p_author_id uuid,
  p_new_status text,
  p_changed_by uuid,
  p_reason text,
  p_commercial_application_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from text;
BEGIN
  IF p_new_status NOT IN (
    'free',
    'commercial_pending',
    'commercial_onboarding',
    'commercial_active',
    'commercial_suspended'
  ) THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  SELECT a.access_status
  INTO v_from
  FROM public.authors AS a
  WHERE a.id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_from = p_new_status THEN
    RETURN v_from;
  END IF;

  -- Never downgrade an already-active commercial author into onboarding.
  IF p_new_status = 'commercial_onboarding'
     AND v_from IN ('commercial_active', 'commercial') THEN
    RETURN v_from;
  END IF;

  IF v_from IN ('suspended', 'terminated') THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.authors
  SET
    access_status = p_new_status,
    updated_at = now()
  WHERE id = p_author_id;

  INSERT INTO public.author_access_status_events (
    author_id,
    application_id,
    commercial_application_id,
    from_status,
    to_status,
    changed_by,
    reason
  ) VALUES (
    p_author_id,
    NULL,
    p_commercial_application_id,
    v_from,
    p_new_status,
    p_changed_by,
    NULLIF(btrim(p_reason), '')
  );

  RETURN p_new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_author_access_status_for_commercial_application(uuid, text, uuid, text, uuid) FROM PUBLIC;

-- 5) Approve → commercial_onboarding; idempotent when already approved.
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

COMMIT;
