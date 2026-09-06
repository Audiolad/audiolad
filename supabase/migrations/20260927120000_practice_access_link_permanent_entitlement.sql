BEGIN;

-- ---------------------------------------------------------------------------
-- Phase 5 follow-up: successful external-link redeem must leave an ACTIVE
-- entitlement. grant_practice_access stays 5-arg and does not change global
-- expiry policy (purchase / subscription / admin keep current semantics).
-- Reactivation is local to the redeem transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activate_permanent_practice_access(
  p_user_id uuid,
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expires_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required'
      USING ERRCODE = '22023', DETAIL = 'user_id_required';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023', DETAIL = 'practice_id_required';
  END IF;

  UPDATE public.user_practices
  SET expires_at = NULL
  WHERE user_id = p_user_id
    AND practice_id = p_practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entitlement_missing_after_grant'
      USING ERRCODE = 'P0002', DETAIL = 'entitlement_missing_after_grant';
  END IF;

  SELECT up.expires_at
  INTO v_expires_at
  FROM public.user_practices AS up
  WHERE up.user_id = p_user_id
    AND up.practice_id = p_practice_id;

  IF v_expires_at IS NOT NULL AND v_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'entitlement_still_expired'
      USING ERRCODE = '22023', DETAIL = 'entitlement_still_expired';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_permanent_practice_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_permanent_practice_access(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.activate_permanent_practice_access(uuid, uuid) IS
  'audiolad:access-link-activate:v1; clear user_practices.expires_at after an external access-link grant. Does not change access_level. Called only from redeem_practice_access_link in the same transaction. service_role only.';

CREATE OR REPLACE FUNCTION public.redeem_practice_access_link(
  p_token_hash text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.practice_access_links%ROWTYPE;
  v_grant jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required'
      USING ERRCODE = '22023', DETAIL = 'user_id_required';
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  SELECT *
  INTO v_link
  FROM public.practice_access_links
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  IF v_link.status = 'revoked' THEN
    RAISE EXCEPTION 'link_revoked'
      USING ERRCODE = '22023', DETAIL = 'link_revoked';
  END IF;

  IF v_link.status = 'redeemed' THEN
    IF v_link.redeemed_by_user_id IS NOT DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'already_redeemed_by_you'
        USING ERRCODE = '22023', DETAIL = 'already_redeemed_by_you';
    END IF;

    RAISE EXCEPTION 'link_already_used'
      USING ERRCODE = '22023', DETAIL = 'link_already_used';
  END IF;

  IF v_link.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'link_already_used'
      USING ERRCODE = '22023', DETAIL = 'link_already_used';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < clock_timestamp() THEN
    RAISE EXCEPTION 'link_expired'
      USING ERRCODE = '22023', DETAIL = 'link_expired';
  END IF;

  PERFORM public.assert_practice_access_link_target(
    v_link.practice_id,
    v_link.target_access_level
  );

  v_grant := public.grant_practice_access(
    p_user_id,
    v_link.practice_id,
    v_link.target_access_level,
    'external_manual',
    jsonb_build_object(
      'access_link_id', v_link.id,
      'granted_via', 'external_access_link'
    )
  );

  -- New issuance: entitlement must be active. Never mark redeemed if the
  -- leftover expires_at would keep resolveProductAccess inactive.
  PERFORM public.activate_permanent_practice_access(
    p_user_id,
    v_link.practice_id
  );

  UPDATE public.practice_access_links
  SET
    status = 'redeemed',
    redeemed_by_user_id = p_user_id,
    redeemed_at = clock_timestamp()
  WHERE id = v_link.id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_already_used'
      USING ERRCODE = '22023', DETAIL = 'link_already_used';
  END IF;

  RETURN jsonb_build_object(
    'code', 'granted',
    'link_id', v_link.id,
    'practice_id', v_link.practice_id,
    'target_access_level', v_link.target_access_level,
    'grant', v_grant
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_practice_access_link(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_practice_access_link(text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.redeem_practice_access_link(text, uuid) IS
  'audiolad:access-link-redeem:v2; transactional one-time claim. SELECT FOR UPDATE, grant_practice_access(external_manual), activate_permanent_practice_access, then mark redeemed. Never consumes the link if the entitlement would remain expired. GET/preview must not call this. service_role only.';

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.activate_permanent_practice_access(uuid, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE activate_permanent_practice_access';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.activate_permanent_practice_access(uuid, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role must EXECUTE activate_permanent_practice_access';
  END IF;
END;
$$;

COMMIT;
