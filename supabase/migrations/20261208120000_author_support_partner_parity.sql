BEGIN;

-- Platform-owner support mode must have the same author-workspace partner view
-- as the workspace owner, while remaining scoped by the active support proof.
CREATE OR REPLACE FUNCTION public.author_partner_is_owner(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.author_members AS m
        WHERE m.author_id = p_author_id
          AND m.user_id = auth.uid()
          AND m.role = 'owner'
      )
    )
    OR public.author_support_session_allows(p_author_id);
$$;

REVOKE ALL ON FUNCTION public.author_partner_is_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_partner_is_owner(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_author_partner_profile_with_support_proof(
  p_token_hash text,
  p_author_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
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
    'author_partner_updated',
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
    'author_partner_updated',
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
    'author_partner_updated',
    'author_partner_profile',
    p_author_id::text,
    jsonb_build_object('operation', 'invite_template')
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_author_partner_profile_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_author_partner_profile_with_support_proof(text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_author_partner_profile_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_author_partner_profile_with_support_proof(text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.change_author_partner_code_with_support_proof(text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_author_partner_code_with_support_proof(text, uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.list_author_partner_invitees_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_author_partner_invitees_with_support_proof(text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_author_partner_reward_dashboard_with_support_proof(text, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_author_partner_reward_dashboard_with_support_proof(text, uuid, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_author_partner_invite_template_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_author_partner_invite_template_with_support_proof(text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_author_partner_invite_template_with_support_proof(text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_author_partner_invite_template_with_support_proof(text, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.author_partner_is_owner(uuid) IS
  'Owner authorization for partner program; active request-bound platform-owner support proof is accepted for the scoped author.';

COMMIT;
