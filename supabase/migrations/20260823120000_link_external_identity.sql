-- MAX Mini App Stage 3A: atomically link a verified external identity
-- to an already-authenticated Audiolad user (auth.users.id).
-- Does not create auth.users, does not unlink, does not change provider_user_id.
-- Does not apply itself to production; do not apply without explicit approval.
-- Rollback: DROP FUNCTION public.link_external_identity(text, text, uuid);
-- Do NOT drop public.external_identities.

BEGIN;

CREATE OR REPLACE FUNCTION public.link_external_identity(
  p_provider text,
  p_provider_user_id text,
  p_user_id uuid
)
RETURNS TABLE (status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider text;
  v_provider_user_id text;
  v_existing_user_id uuid;
  v_updated integer;
  v_constraint text;
BEGIN
  v_provider := btrim(COALESCE(p_provider, ''));
  v_provider_user_id := btrim(COALESCE(p_provider_user_id, ''));

  IF v_provider = '' OR v_provider_user_id = '' OR p_user_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_args'::text;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.external_identities (provider, provider_user_id)
    VALUES (v_provider, v_provider_user_id)
    ON CONFLICT (provider, provider_user_id) DO NOTHING;

    UPDATE public.external_identities
    SET
      user_id = p_user_id,
      linked_at = COALESCE(linked_at, now()),
      updated_at = now()
    WHERE provider = v_provider
      AND provider_user_id = v_provider_user_id
      AND (user_id IS NULL OR user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.external_identities other
        WHERE other.provider = v_provider
          AND other.user_id = p_user_id
          AND other.provider_user_id <> v_provider_user_id
      );

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 THEN
      RETURN QUERY SELECT 'linked'::text;
      RETURN;
    END IF;

    SELECT ei.user_id
    INTO v_existing_user_id
    FROM public.external_identities ei
    WHERE ei.provider = v_provider
      AND ei.provider_user_id = v_provider_user_id;

    IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> p_user_id THEN
      RETURN QUERY SELECT 'identity_already_linked'::text;
      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.external_identities other
      WHERE other.provider = v_provider
        AND other.user_id = p_user_id
        AND other.provider_user_id <> v_provider_user_id
    ) THEN
      RETURN QUERY SELECT 'user_already_has_max_identity'::text;
      RETURN;
    END IF;

    RETURN QUERY SELECT 'invalid_args'::text;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'external_identities_provider_linked_user_uidx' THEN
        RETURN QUERY SELECT 'user_already_has_max_identity'::text;
      ELSIF v_constraint = 'external_identities_provider_user_unique' THEN
        RETURN QUERY SELECT 'identity_already_linked'::text;
      ELSE
        SELECT ei.user_id
        INTO v_existing_user_id
        FROM public.external_identities ei
        WHERE ei.provider = v_provider
          AND ei.provider_user_id = v_provider_user_id;

        IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> p_user_id THEN
          RETURN QUERY SELECT 'identity_already_linked'::text;
        ELSIF EXISTS (
          SELECT 1
          FROM public.external_identities other
          WHERE other.provider = v_provider
            AND other.user_id = p_user_id
            AND other.provider_user_id <> v_provider_user_id
        ) THEN
          RETURN QUERY SELECT 'user_already_has_max_identity'::text;
        ELSE
          RETURN QUERY SELECT 'user_already_has_max_identity'::text;
        END IF;
      END IF;
  END;
END;
$$;

COMMENT ON FUNCTION public.link_external_identity(text, text, uuid) IS
  'Atomically link provider identity to auth.users.id. Never unlinks. Never sets user_id NULL. Rollback: DROP FUNCTION only.';

REVOKE ALL ON FUNCTION public.link_external_identity(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_external_identity(text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.link_external_identity(text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_external_identity(text, text, uuid) TO service_role;

COMMIT;
