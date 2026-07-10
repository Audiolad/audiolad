BEGIN;

DO $$
DECLARE
  user_count integer;
  profile_count integer;
  eligible_starter_count integer;
  grant_function_comment text;
  expected_grant_contract constant text :=
    'audiolad:starter-grant:v1; grants active published free zero-price starter practices; idempotent; returns inserted row count';
BEGIN
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

  SELECT count(*)
  INTO user_count
  FROM auth.users;

  IF user_count = 0 THEN
    RAISE EXCEPTION 'No users found in auth.users for starter backfill';
  END IF;

  SELECT count(*)
  INTO profile_count
  FROM public.profiles;

  IF user_count <> profile_count THEN
    RAISE EXCEPTION 'auth.users and public.profiles counts do not match';
  END IF;
END;
$$;

DO $$
DECLARE
  current_user_id uuid;
  inserted_for_user integer;
  processed_users integer := 0;
  total_inserted integer := 0;
BEGIN
  FOR current_user_id IN
    SELECT id
    FROM auth.users
    ORDER BY created_at, id
  LOOP
    inserted_for_user :=
      public.grant_active_starter_practices(current_user_id);

    total_inserted := total_inserted + inserted_for_user;
    processed_users := processed_users + 1;
  END LOOP;

  RAISE NOTICE
    'Starter backfill processed % users and inserted % access records',
    processed_users,
    total_inserted;
END;
$$;

DO $$
DECLARE
  user_count integer;
  eligible_starter_count integer;
  expected_pair_count integer;
  missing_count integer;
  duplicate_count integer;
  library_count integer;
BEGIN
  SELECT count(*)
  INTO user_count
  FROM auth.users;

  SELECT count(*)
  INTO eligible_starter_count
  FROM public.starter_practices AS sp
  INNER JOIN public.practices AS p ON p.id = sp.practice_id
  WHERE sp.is_active = true
    AND p.status = 'published'
    AND p.is_free = true
    AND p.price = 0;

  expected_pair_count := user_count * eligible_starter_count;

  SELECT count(*)
  INTO missing_count
  FROM auth.users AS u
  CROSS JOIN (
    SELECT sp.practice_id
    FROM public.starter_practices AS sp
    INNER JOIN public.practices AS p ON p.id = sp.practice_id
    WHERE sp.is_active = true
      AND p.status = 'published'
      AND p.is_free = true
      AND p.price = 0
  ) AS eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_practices AS up
    WHERE up.user_id = u.id
      AND up.practice_id = eligible.practice_id
  );

  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Starter backfill is incomplete: % user-practice pairs are missing', missing_count;
  END IF;

  SELECT count(*)
  INTO duplicate_count
  FROM (
    SELECT up.user_id, up.practice_id
    FROM public.user_practices AS up
    GROUP BY up.user_id, up.practice_id
    HAVING count(*) > 1
  ) AS duplicates;

  IF duplicate_count <> 0 THEN
    RAISE EXCEPTION 'Starter backfill created duplicate user-practice pairs';
  END IF;

  SELECT count(*)
  INTO library_count
  FROM public.user_practices;

  RAISE NOTICE
    'Starter backfill coverage verified: users=%, eligible_starters=%, expected_pairs=%, missing_pairs=%, library_rows=%',
    user_count,
    eligible_starter_count,
    expected_pair_count,
    missing_count,
    library_count;
END;
$$;

COMMIT;
