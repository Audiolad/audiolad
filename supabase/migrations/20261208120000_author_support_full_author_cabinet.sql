BEGIN;

-- Platform-owner support mode must mirror the selected author's partner cabinet.
-- The authenticated actor remains the platform owner; access is granted only
-- when the request-bound support proof resolves to the selected author and
-- acting user. No auth.uid impersonation is introduced.

CREATE OR REPLACE FUNCTION public.author_support_session_is_owner(
  p_author_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proof text;
BEGIN
  IF auth.uid() IS NULL OR p_author_id IS NULL THEN
    RETURN false;
  END IF;

  v_proof := public.author_support_request_token_hash();
  IF v_proof IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.author_support_sessions AS s
    JOIN public.author_members AS m
      ON m.author_id = s.acting_author_id
     AND m.user_id = s.acting_user_id
     AND m.role = 'owner'
    WHERE s.actor_user_id = auth.uid()
      AND s.token_hash = v_proof
      AND s.acting_author_id = p_author_id
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND public.is_platform_owner(s.actor_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_support_session_is_owner(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_support_session_is_owner(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.author_partner_is_owner(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.author_members AS m
        WHERE m.author_id = p_author_id
          AND m.user_id = auth.uid()
          AND m.role = 'owner'
      )
      OR public.author_support_session_is_owner(p_author_id)
    );
$$;

REVOKE ALL ON FUNCTION public.author_partner_is_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_partner_is_owner(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.author_partner_is_member(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.author_members AS m
        WHERE m.author_id = p_author_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'editor')
      )
      OR public.author_support_session_allows(p_author_id)
    );
$$;

REVOKE ALL ON FUNCTION public.author_partner_is_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_partner_is_member(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_author_partner_profile_with_support_proof(
  p_token_hash text,
  p_author_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  RETURN public.get_author_partner_profile(p_author_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_author_partner_profile_with_support_proof(
  p_token_hash text,
  p_author_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  v_result := public.ensure_author_partner_profile(p_author_id);
  PERFORM public.record_author_support_mutation_audit(
    p_author_id,
    'author_partner_profile_updated',
    'author_partner_profile',
    p_author_id::text,
    jsonb_build_object('operation', 'ensure')
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_author_partner_code_with_support_proof(
  p_token_hash text,
  p_author_id uuid,
  p_new_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  v_result := public.change_author_partner_code(p_author_id, p_new_code);
  PERFORM public.record_author_support_mutation_audit(
    p_author_id,
    'author_partner_code_updated',
    'author_partner_profile',
    p_author_id::text,
    jsonb_build_object('operation', 'change_code')
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_author_partner_invitees_with_support_proof(
  p_token_hash text,
  p_author_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  RETURN public.list_author_partner_invitees(p_author_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_author_partner_reward_dashboard_with_support_proof(
  p_token_hash text,
  p_author_id uuid,
  p_history_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  RETURN public.get_author_partner_reward_dashboard(p_author_id, p_history_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_author_partner_invite_template_with_support_proof(
  p_token_hash text,
  p_author_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  RETURN public.get_author_partner_invite_template(p_author_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_author_partner_invite_template_with_support_proof(
  p_token_hash text,
  p_author_id uuid,
  p_template text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  v_result := public.set_author_partner_invite_template(p_author_id, p_template);
  PERFORM public.record_author_support_mutation_audit(
    p_author_id,
    'author_partner_invite_template_updated',
    'author_partner_profile',
    p_author_id::text,
    jsonb_build_object('operation', 'set_invite_template')
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_author_partner_profile_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_author_partner_profile_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_author_partner_code_with_support_proof(text, uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_author_partner_invitees_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_author_partner_reward_dashboard_with_support_proof(text, uuid, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_author_partner_invite_template_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_author_partner_invite_template_with_support_proof(text, uuid, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_author_partner_profile_with_support_proof(text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_author_partner_profile_with_support_proof(text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_author_partner_code_with_support_proof(text, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_author_partner_invitees_with_support_proof(text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_author_partner_reward_dashboard_with_support_proof(text, uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_author_partner_invite_template_with_support_proof(text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_author_partner_invite_template_with_support_proof(text, uuid, text)
  TO authenticated;

-- Studio free-music acquisition is user-scoped rather than author-scoped.
-- Factor the current behavior into an internal explicit-user helper so support
-- mode can act for the session acting_user_id without changing auth.uid().
CREATE OR REPLACE FUNCTION public.acquire_free_studio_music_for_user(
  p_practice_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  entitlement_id uuid,
  practice_id uuid,
  grant_source text,
  order_id uuid,
  inserted boolean,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_acquired record;
  v_grant jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_studio_music_publication(v_practice) THEN
    RAISE EXCEPTION 'not_studio_music' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_acquire_studio_music(v_practice, p_user_id) THEN
    IF v_practice.status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'practice_not_published' USING ERRCODE = 'P0002';
    END IF;
    IF v_practice.music_usage_permission IS DISTINCT FROM 'platform_reuse_allowed' THEN
      RAISE EXCEPTION 'studio_reuse_not_allowed' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_acquired
  FROM public.resolve_studio_music_acquisition(v_practice, p_user_id, now());

  IF v_acquired.acquisition_status IS DISTINCT FROM 'free'
     OR v_acquired.studio_is_free IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'practice_not_free' USING ERRCODE = 'P0002';
  END IF;

  v_grant := public.grant_studio_music_entitlement(
    p_user_id,
    v_practice.id,
    'free',
    NULL
  );

  RETURN QUERY
  SELECT
    (v_grant ->> 'id')::uuid,
    (v_grant ->> 'practice_id')::uuid,
    v_grant ->> 'grant_source',
    NULL::uuid,
    coalesce((v_grant ->> 'inserted')::boolean, false),
    (v_grant ->> 'granted_at')::timestamptz;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_free_studio_music_for_user(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_free_studio_music_for_user(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_free_studio_music(p_practice_id uuid)
RETURNS TABLE (
  entitlement_id uuid,
  practice_id uuid,
  grant_source text,
  order_id uuid,
  inserted boolean,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.acquire_free_studio_music_for_user(p_practice_id, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_free_studio_music(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_free_studio_music(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.acquire_free_studio_music_with_support_proof(
  p_token_hash text,
  p_practice_id uuid
)
RETURNS TABLE (
  entitlement_id uuid,
  practice_id uuid,
  grant_source text,
  order_id uuid,
  inserted boolean,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.author_support_sessions%ROWTYPE;
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);

  SELECT s.*
  INTO v_session
  FROM public.author_support_sessions AS s
  WHERE s.actor_user_id = auth.uid()
    AND s.token_hash = public.author_support_request_token_hash()
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND public.is_platform_owner(s.actor_user_id)
    AND public.author_support_session_allows(s.acting_author_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.acquire_free_studio_music_for_user(
    p_practice_id,
    v_session.acting_user_id
  );

  PERFORM public.record_author_support_mutation_audit(
    v_session.acting_author_id,
    'studio_music_acquired',
    'studio_music',
    p_practice_id::text,
    jsonb_build_object('operation', 'acquire_free')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_free_studio_music_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_free_studio_music_with_support_proof(text, uuid)
  TO authenticated;

COMMIT;
