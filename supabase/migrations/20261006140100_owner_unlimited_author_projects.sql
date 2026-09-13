BEGIN;

-- A true per-user entitlement. NULL numeric limits remain finite; this flag is
-- the only way to represent unlimited owned author projects.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS author_projects_unlimited boolean;

UPDATE public.profiles
SET author_projects_unlimited = false
WHERE author_projects_unlimited IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN author_projects_unlimited SET DEFAULT false,
  ALTER COLUMN author_projects_unlimited SET NOT NULL;

COMMENT ON COLUMN public.profiles.author_projects_unlimited IS
  'audiolad:author-project-limit:v2; protected per-user entitlement; true = unlimited owned author projects';

-- Keep the entitlement server-managed, like the existing numeric override.
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
      NEW.author_projects_unlimited := false;
      NEW.author_premium_enabled := false;
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_author_project_limits_on_update
  ON public.profiles;
CREATE TRIGGER profiles_protect_author_project_limits_on_update
  BEFORE UPDATE OF author_project_limit_override, author_projects_unlimited, author_premium_enabled
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_author_project_limit_columns();

-- Replace the authoritative RPC check. It derives both entitlement and user
-- identity inside SECURITY DEFINER code, so callers cannot supply an email or
-- privilege flag to bypass the cap.
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
  v_unlimited boolean;
  v_used integer;
  v_author_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'invalid_project_name' USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 280 THEN
    RAISE EXCEPTION 'invalid_project_description' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT
    coalesce(p.author_projects_unlimited, false),
    CASE
      WHEN p.author_project_limit_override IS NOT NULL
           AND p.author_project_limit_override >= 1
        THEN p.author_project_limit_override
      WHEN coalesce(p.author_premium_enabled, false) THEN 3
      ELSE 1
    END
  INTO v_unlimited, v_limit
  FROM public.profiles AS p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF v_unlimited IS NULL THEN
    v_unlimited := false;
  END IF;
  IF v_limit IS NULL THEN
    v_limit := 1;
  END IF;

  SELECT count(*)::integer
  INTO v_used
  FROM public.author_members AS am
  WHERE am.user_id = v_user_id
    AND am.role = 'owner';

  IF NOT v_unlimited AND v_used >= v_limit THEN
    RAISE EXCEPTION 'author_project_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  IF v_slug_input IS NOT NULL THEN
    v_slug := public.slugify_author_display_name(v_slug_input);
    IF v_slug IS NULL OR char_length(v_slug) < 2 THEN
      RAISE EXCEPTION 'invalid_project_slug' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.authors AS a WHERE a.slug = v_slug) THEN
      RAISE EXCEPTION 'project_slug_taken' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_slug := public.allocate_unique_author_slug(v_name);
  END IF;

  INSERT INTO public.authors (
    name, slug, author_type, access_status, short_bio, description
  ) VALUES (
    v_name, v_slug, 'project', 'free', v_description, v_description
  )
  RETURNING id INTO v_author_id;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, v_user_id, 'owner');

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', v_author_id,
    'slug', v_slug,
    'name', v_name,
    'used', v_used + 1,
    'limit', CASE WHEN v_unlimited THEN NULL ELSE v_limit END,
    'unlimited', v_unlimited
  );
END;
$$;

-- Resolve the official account at migration time; email is never part of the
-- runtime authorization decision.
DO $$
DECLARE
  v_email text := public.normalize_contact_email('1@audiolad.ru');
  v_user_id uuid;
  v_user_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_user_count
  FROM auth.users AS u
  WHERE public.normalize_contact_email(u.email) = v_email;

  IF v_user_count = 1 THEN
    SELECT u.id
    INTO v_user_id
    FROM auth.users AS u
    WHERE public.normalize_contact_email(u.email) = v_email;
  END IF;

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles AS p WHERE p.id = v_user_id
  ) THEN
    UPDATE public.profiles
    SET author_projects_unlimited = true
    WHERE id = v_user_id
      AND author_projects_unlimited IS DISTINCT FROM true;
  ELSE
    RAISE NOTICE
      'owner_unlimited_author_projects_skipped: expected one auth user and profile for %, found % users',
      v_email, v_user_count;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.create_author_project(text, text, text) IS
  'audiolad:create-author-project:v2; authenticated owner creates project; per-user unlimited entitlement returns unlimited=true and limit=null';

COMMIT;
