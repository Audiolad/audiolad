BEGIN;

DO $$
DECLARE
  grant_function_comment text;
  eligible_starter_count integer;
  expected_grant_contract constant text :=
    'audiolad:starter-grant:v1; grants active published free zero-price starter practices; idempotent; returns inserted row count';
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Required table public.profiles does not exist';
  END IF;

  IF to_regclass('public.user_practices') IS NULL THEN
    RAISE EXCEPTION 'Required table public.user_practices does not exist';
  END IF;

  IF to_regclass('public.starter_practices') IS NULL THEN
    RAISE EXCEPTION 'Required table public.starter_practices does not exist';
  END IF;

  IF to_regprocedure('public.grant_active_starter_practices(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Required function public.grant_active_starter_practices(uuid) does not exist';
  END IF;

  SELECT obj_description(
    'public.grant_active_starter_practices(uuid)'::regprocedure,
    'pg_proc'
  )
  INTO grant_function_comment;

  IF grant_function_comment IS DISTINCT FROM expected_grant_contract THEN
    RAISE EXCEPTION 'Required starter grant function contract version v1 is not installed';
  END IF;

  SELECT count(*)
  INTO eligible_starter_count
  FROM public.starter_practices AS sp
  INNER JOIN public.practices AS p ON p.id = sp.practice_id
  WHERE sp.is_active = true
    AND p.status = 'published'
    AND p.is_free = true
    AND p.price = 0;

  IF eligible_starter_count <> 3 THEN
    RAISE EXCEPTION 'Expected exactly 3 eligible starter practices, found %', eligible_starter_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_schema = 'auth'
      AND event_object_table = 'users'
      AND trigger_name = 'on_auth_user_created'
      AND action_timing = 'AFTER'
      AND event_manipulation = 'INSERT'
      AND action_statement ILIKE '%handle_new_user%'
  ) THEN
    RAISE EXCEPTION 'Required trigger on_auth_user_created does not call public.handle_new_user()';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
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

DO $$
DECLARE
  handle_new_user_comment text;
  expected_handle_new_user_contract constant text :=
    'audiolad:new-user:v1; creates listener profile and grants starter library using audiolad:starter-grant:v1';
  is_security_definer boolean;
  search_path_config text[];
BEGIN
  SELECT obj_description(
    'public.handle_new_user()'::regprocedure,
    'pg_proc'
  )
  INTO handle_new_user_comment;

  IF handle_new_user_comment IS DISTINCT FROM expected_handle_new_user_contract THEN
    RAISE EXCEPTION 'handle_new_user contract marker v1 was not installed';
  END IF;

  SELECT p.prosecdef, p.proconfig
  INTO is_security_definer, search_path_config
  FROM pg_proc AS p
  INNER JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'handle_new_user';

  IF is_security_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'handle_new_user must be SECURITY DEFINER';
  END IF;

  IF search_path_config IS NULL
    OR NOT (
      'search_path=public, pg_temp' = ANY (search_path_config)
      OR 'search_path=public,pg_temp' = ANY (search_path_config)
    )
  THEN
    RAISE EXCEPTION 'handle_new_user search_path must include public and pg_temp';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_schema = 'auth'
      AND event_object_table = 'users'
      AND trigger_name = 'on_auth_user_created'
      AND action_timing = 'AFTER'
      AND event_manipulation = 'INSERT'
      AND action_statement ILIKE '%handle_new_user%'
  ) THEN
    RAISE EXCEPTION 'Required trigger on_auth_user_created does not call public.handle_new_user()';
  END IF;
END;
$$;

COMMIT;
