-- BASELINE FOR EMPTY DATABASES ONLY.
-- DO NOT APPLY TO THE EXISTING PRODUCTION DATABASE.
--
-- Functions and triggers required by registration and starter library.
-- Prerequisites: 0001_core_schema.sql applied; auth.users must exist.

BEGIN;

-- ---------------------------------------------------------------------------
-- validate_starter_practice
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.validate_starter_practice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  practice_status text;
  practice_is_free boolean;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT p.status, p.is_free
  INTO practice_status, practice_is_free
  FROM public.practices AS p
  WHERE p.id = NEW.practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Starter practice must reference an existing practice';
  END IF;

  IF practice_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Starter practice must be published';
  END IF;

  IF practice_is_free IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Starter practice must be free';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_starter_practice()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_starter_practice_before_write
  BEFORE INSERT OR UPDATE OF practice_id, is_active
  ON public.starter_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_starter_practice();

-- ---------------------------------------------------------------------------
-- grant_active_starter_practices
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.grant_active_starter_practices(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  SELECT
    p_user_id,
    sp.practice_id,
    'starter'
  FROM public.starter_practices AS sp
  INNER JOIN public.practices AS p ON p.id = sp.practice_id
  WHERE sp.is_active = true
    AND p.status = 'published'
    AND p.is_free = true
    AND p.price = 0
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM authenticated;

COMMENT ON FUNCTION public.grant_active_starter_practices(uuid) IS
  'audiolad:starter-grant:v1; grants active published free zero-price starter practices; idempotent; returns inserted row count';

-- ---------------------------------------------------------------------------
-- handle_new_user (registration hook)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  grant_function_comment text;
  expected_grant_contract constant text :=
    'audiolad:starter-grant:v1; grants active published free zero-price starter practices; idempotent; returns inserted row count';
BEGIN
  SELECT obj_description(
    'public.grant_active_starter_practices(uuid)'::regprocedure,
    'pg_proc'
  )
  INTO grant_function_comment;

  IF grant_function_comment IS DISTINCT FROM expected_grant_contract THEN
    RAISE EXCEPTION 'Required starter grant function contract version v1 is not installed';
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    'listener'
  );

  PERFORM public.grant_active_starter_practices(NEW.id);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
  'audiolad:new-user:v1; creates listener profile and grants starter library using audiolad:starter-grant:v1';

-- ---------------------------------------------------------------------------
-- on_auth_user_created (auth.users trigger)
-- Prerequisites: auth.users table from Supabase Auth schema.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;
