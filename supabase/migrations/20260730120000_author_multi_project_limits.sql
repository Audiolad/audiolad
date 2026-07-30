BEGIN;

-- ---------------------------------------------------------------------------
-- Multi-project (multi-author workspace) limits for one user account.
-- Extends profiles; authors + author_members remain the project model.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS author_project_limit_override integer;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS author_premium_enabled boolean;

UPDATE public.profiles
SET author_premium_enabled = false
WHERE author_premium_enabled IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN author_premium_enabled SET DEFAULT false,
  ALTER COLUMN author_premium_enabled SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_author_project_limit_override_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_author_project_limit_override_check
      CHECK (
        author_project_limit_override IS NULL
        OR author_project_limit_override >= 1
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.author_project_limit_override IS
  'audiolad:author-project-limit:v1; admin override for owned author projects; NULL = use premium/default';

COMMENT ON COLUMN public.profiles.author_premium_enabled IS
  'audiolad:author-premium:v1; when true and no override, owned project limit is 3';

-- Sergey (1@audiolad.ru): individual limit 5 for existing 3 owned projects.
UPDATE public.profiles
SET author_project_limit_override = 5
WHERE id = 'e5d273d0-9b4d-4e0e-836a-bdcf0332b9bb';

-- Users must not self-elevate project limits via profiles UPDATE RLS.
CREATE OR REPLACE FUNCTION public.protect_profiles_author_project_limit_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  v_jwt_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL THEN
      NEW.author_project_limit_override := NULL;
      NEW.author_premium_enabled := false;
    END IF;
    RETURN NEW;
  END IF;

  IF v_jwt_sub IS NOT NULL THEN
    IF NEW.author_project_limit_override IS DISTINCT FROM OLD.author_project_limit_override THEN
      NEW.author_project_limit_override := OLD.author_project_limit_override;
    END IF;
    IF NEW.author_premium_enabled IS DISTINCT FROM OLD.author_premium_enabled THEN
      NEW.author_premium_enabled := OLD.author_premium_enabled;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_author_project_limits_on_insert
  ON public.profiles;
CREATE TRIGGER profiles_protect_author_project_limits_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_author_project_limit_columns();

DROP TRIGGER IF EXISTS profiles_protect_author_project_limits_on_update
  ON public.profiles;
CREATE TRIGGER profiles_protect_author_project_limits_on_update
  BEFORE UPDATE OF author_project_limit_override, author_premium_enabled
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_author_project_limit_columns();

COMMENT ON FUNCTION public.protect_profiles_author_project_limit_columns() IS
  'audiolad:author-project-limit-guard:v1; blocks JWT self-updates of project limit columns';

CREATE OR REPLACE FUNCTION public.count_user_owned_author_projects(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT count(*)::integer
    FROM public.author_members AS am
    WHERE am.user_id = p_user_id
      AND am.role = 'owner'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_user_owned_author_projects(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_user_owned_author_projects(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_user_author_project_limit(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_override integer;
  v_premium boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 1;
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    p.author_project_limit_override,
    coalesce(p.author_premium_enabled, false)
  INTO v_override, v_premium
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF v_override IS NOT NULL AND v_override >= 1 THEN
    RETURN v_override;
  END IF;

  IF v_premium IS TRUE THEN
    RETURN 3;
  END IF;

  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_user_author_project_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_user_author_project_limit(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_author_project(
  p_name text,
  p_slug text DEFAULT NULL,
  p_short_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug_input text := nullif(btrim(coalesce(p_slug, '')), '');
  v_slug text;
  v_description text := nullif(btrim(coalesce(p_short_description, '')), '');
  v_limit integer;
  v_used integer;
  v_author_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'invalid_project_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 280 THEN
    RAISE EXCEPTION 'invalid_project_description'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize limit checks per user (concurrent create).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Lock profile row when present and resolve limit in-place
  -- (avoid nested auth checks on helper RPCs during SECURITY DEFINER create).
  SELECT
    CASE
      WHEN p.author_project_limit_override IS NOT NULL
           AND p.author_project_limit_override >= 1
        THEN p.author_project_limit_override
      WHEN coalesce(p.author_premium_enabled, false) THEN 3
      ELSE 1
    END
  INTO v_limit
  FROM public.profiles AS p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF v_limit IS NULL THEN
    v_limit := 1;
  END IF;

  SELECT count(*)::integer
  INTO v_used
  FROM public.author_members AS am
  WHERE am.user_id = v_user_id
    AND am.role = 'owner';

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'author_project_limit_reached'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_slug_input IS NOT NULL THEN
    v_slug := public.slugify_author_display_name(v_slug_input);

    IF v_slug IS NULL OR char_length(v_slug) < 2 THEN
      RAISE EXCEPTION 'invalid_project_slug'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.authors AS a WHERE a.slug = v_slug
    ) THEN
      RAISE EXCEPTION 'project_slug_taken'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    v_slug := public.allocate_unique_author_slug(v_name);
  END IF;

  INSERT INTO public.authors (
    name,
    slug,
    author_type,
    access_status,
    short_bio,
    description
  ) VALUES (
    v_name,
    v_slug,
    'project',
    'free',
    v_description,
    v_description
  )
  RETURNING id INTO v_author_id;

  INSERT INTO public.author_members (
    author_id,
    user_id,
    role
  ) VALUES (
    v_author_id,
    v_user_id,
    'owner'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', v_author_id,
    'slug', v_slug,
    'name', v_name,
    'used', v_used + 1,
    'limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_author_project(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_author_project(text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_author_project(text, text, text) IS
  'audiolad:create-author-project:v1; creates authors row + owner membership under project limit';

COMMIT;
