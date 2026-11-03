-- Security fix: JWT-session column guards were bypassable on PostgREST >= 10.
--
-- The trigger guards below decided "is this a client JWT session?" by reading
-- only the legacy GUC request.jwt.claim.sub. PostgREST 10+ no longer sets the
-- per-claim GUCs; it sets request.jwt.claims (JSON). On a modern PostgREST the
-- guard therefore saw NULL and treated an authenticated client like trusted
-- server SQL, letting a user PATCH protected columns of their own row
-- (profiles.role, author limit/premium columns, playlist ownership/direction).
-- Reproduced on an isolated stand (PostgREST v12.2.12, GoTrue v2.189.0).
--
-- Fix: one helper that reads the sub from either form, and the four guards
-- re-created verbatim from their latest definitions with only the sub lookup
-- switched to the helper. Semantics are unchanged otherwise: no JWT sub (server
-- SQL, migrations, service role without sub) keeps the trusted path.

CREATE OR REPLACE FUNCTION public.request_jwt_sub_text()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
      ''
    )
  );
$$;

REVOKE ALL ON FUNCTION public.request_jwt_sub_text() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_jwt_sub_text()
  TO anon, authenticated, service_role;

-- Latest definition: 20260716160000_editorial_playlists.sql
CREATE OR REPLACE FUNCTION public.protect_profiles_role_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  v_jwt_sub := public.request_jwt_sub_text();

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL AND NEW.role IS DISTINCT FROM 'listener' THEN
      NEW.role := 'listener';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF v_jwt_sub IS NOT NULL THEN
      NEW.role := OLD.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Latest definition: 20261027120100_author_partner_activation_bonus.sql
CREATE OR REPLACE FUNCTION public.protect_profiles_author_project_limit_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  v_jwt_sub := public.request_jwt_sub_text();

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL THEN
      NEW.author_project_limit_override := NULL;
      NEW.author_projects_unlimited := false;
      NEW.author_premium_enabled := false;
      NEW.author_project_slots_purchased := 0;
      NEW.author_project_slots_partner_bonus := 0;
    END IF;
    RETURN NEW;
  END IF;

  IF v_jwt_sub IS NOT NULL THEN
    IF NEW.author_project_limit_override IS DISTINCT FROM OLD.author_project_limit_override THEN
      NEW.author_project_limit_override := OLD.author_project_limit_override;
    END IF;
    IF NEW.author_projects_unlimited IS DISTINCT FROM OLD.author_projects_unlimited THEN
      NEW.author_projects_unlimited := OLD.author_projects_unlimited;
    END IF;
    IF NEW.author_premium_enabled IS DISTINCT FROM OLD.author_premium_enabled THEN
      NEW.author_premium_enabled := OLD.author_premium_enabled;
    END IF;
    IF NEW.author_project_slots_purchased IS DISTINCT FROM OLD.author_project_slots_purchased THEN
      NEW.author_project_slots_purchased := OLD.author_project_slots_purchased;
    END IF;
    -- Partner bonus is written only by finalize_author_partner_referral under
    -- local GUC audiolad.trusted_profile_limit_write=1 (JWT sessions otherwise).
    IF coalesce(current_setting('audiolad.trusted_profile_limit_write', true), '') IS DISTINCT FROM '1'
       AND NEW.author_project_slots_partner_bonus IS DISTINCT FROM OLD.author_project_slots_partner_bonus THEN
      NEW.author_project_slots_partner_bonus := OLD.author_project_slots_partner_bonus;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Latest definition: 20260814120000_playlist_platform_ownership.sql
CREATE OR REPLACE FUNCTION public.protect_playlist_ownership_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  v_jwt_sub := public.request_jwt_sub_text();

  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_type IS DISTINCT FROM OLD.owner_type
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.is_editorial IS DISTINCT FROM OLD.is_editorial THEN
      RAISE EXCEPTION 'playlist_ownership_immutable'
        USING ERRCODE = '42501';
    END IF;

    -- created_by may become NULL via ON DELETE SET NULL (no JWT).
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
      AND v_jwt_sub IS NOT NULL THEN
      RAISE EXCEPTION 'playlist_ownership_immutable'
        USING ERRCODE = '42501';
    END IF;

    -- first_published_at: JWT may stamp NULL → value on first publish.
    -- Once set, JWT cannot clear or change it. Service without JWT may
    -- set it once (NULL → value) but cannot change or clear afterwards.
    IF OLD.first_published_at IS NOT NULL
      AND NEW.first_published_at IS DISTINCT FROM OLD.first_published_at THEN
      IF v_jwt_sub IS NOT NULL THEN
        RAISE EXCEPTION 'playlist_ownership_immutable'
          USING ERRCODE = '42501';
      END IF;

      NEW.first_published_at := OLD.first_published_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Latest definition: 20260815120000_editorial_directions_and_playlist_admin.sql
CREATE OR REPLACE FUNCTION public.protect_playlist_direction_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  IF NEW.owner_type = 'user' AND NEW.direction_id IS NOT NULL THEN
    RAISE EXCEPTION 'user_playlist_direction_forbidden'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.direction_id IS DISTINCT FROM OLD.direction_id THEN
    v_jwt_sub := public.request_jwt_sub_text();

    IF v_jwt_sub IS NOT NULL
      AND NOT public.has_platform_permission(auth.uid(), 'playlists.manage') THEN
      RAISE EXCEPTION 'playlist_direction_immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
