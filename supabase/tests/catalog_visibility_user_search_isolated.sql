-- Isolated selected_users allowlist search RPC checks.
-- Run only through scripts/catalog-visibility-user-search-isolated.mjs
-- against an isolated/test database. This file rolls back all fixtures.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_id uuid := 'ca810001-0000-4000-8000-000000000001';
  v_editor_id uuid := 'ca810002-0000-4000-8000-000000000002';
  v_unrelated_id uuid := 'ca810003-0000-4000-8000-000000000003';
  v_german_id uuid := 'ca810004-0000-4000-8000-000000000004';
  v_anna_id uuid := 'ca810005-0000-4000-8000-000000000005';
  v_anna_other_id uuid := 'ca810006-0000-4000-8000-000000000006';
  v_author_id uuid;
  v_practice_id uuid;
  v_count integer;
  v_grants_before integer;
  v_grants_after integer;
  v_hit record;
  v_hits integer;
  v_sqlstate text;
  v_i integer;
BEGIN
  IF to_regprocedure('public.search_practice_visibility_users(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'search_practice_visibility_users is missing';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.search_practice_visibility_users(uuid,text)',
    'execute'
  ) IS TRUE THEN
    RAISE EXCEPTION 'anon must not EXECUTE search_practice_visibility_users';
  END IF;

  INSERT INTO public.authors (name, slug, author_type, access_status)
  VALUES (
    'Visibility search isolated',
    'visibility-search-isolated-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'person',
    'free'
  )
  RETURNING id INTO v_author_id;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price,
    is_catalog_listed, catalog_visibility
  ) VALUES (
    v_author_id,
    'Visibility search isolated practice',
    'visibility-search-isolated-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'draft',
    true,
    0,
    false,
    'selected_users'
  )
  RETURNING id INTO v_practice_id;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  SELECT
    seed.id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    seed.email,
    crypt('test-password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '',
    '',
    '',
    ''
  FROM (VALUES
    (v_owner_id, 'visibility.search.owner@example.com'),
    (v_editor_id, 'visibility.search.editor@example.com'),
    (v_unrelated_id, 'visibility.search.unrelated@example.com'),
    (v_german_id, 'german@example.com'),
    (v_anna_id, 'anna.ivanova@example.com'),
    (v_anna_other_id, 'anna.other@example.com')
  ) AS seed(id, email)
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = seed.id);

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES
    (v_owner_id, 'visibility.search.owner@example.com', 'Owner Isolated', 'listener'),
    (v_editor_id, 'visibility.search.editor@example.com', 'Editor Isolated', 'listener'),
    (v_unrelated_id, 'visibility.search.unrelated@example.com', 'Unrelated Isolated', 'listener'),
    (v_german_id, 'german@example.com', 'Герман Иванов', 'listener'),
    (v_anna_id, 'anna.ivanova@example.com', 'Анна Иванова', 'listener'),
    (v_anna_other_id, 'anna.other@example.com', 'Анна Иванова', 'listener')
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  FOR v_i IN 1..12 LOOP
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    VALUES (
      ('ca810100-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test' || v_i::text || '@example.com',
      crypt('test-password', gen_salt('bf')),
      now(), now(), now(), '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
      ('ca810100-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid,
      'test' || v_i::text || '@example.com',
      'Тест Пользователь ' || v_i::text,
      'listener'
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name;
  END LOOP;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES
    (v_author_id, v_owner_id, 'owner'),
    (v_author_id, v_editor_id, 'editor');

  SELECT count(*) INTO v_grants_before
  FROM public.user_practices
  WHERE user_id = v_german_id AND practice_id = v_practice_id;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'Герман');
  IF v_hits < 1 THEN
    RAISE EXCEPTION 'owner cannot search first name';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.search_practice_visibility_users(v_practice_id, 'Герман') AS s
  WHERE s.user_id = v_german_id;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'first name search must include the fixture user';
  END IF;

  SELECT s.* INTO v_hit
  FROM public.search_practice_visibility_users(v_practice_id, 'Герман') AS s
  WHERE s.user_id = v_german_id;
  IF v_hit.masked_email IS DISTINCT FROM 'ge***an@example.com' THEN
    RAISE EXCEPTION 'masked email mismatch: %', v_hit.masked_email;
  END IF;
  IF v_hit.masked_email LIKE '%german@%' OR to_jsonb(v_hit) ? 'email' THEN
    RAISE EXCEPTION 'search result leaked raw email';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'Иванов');
  IF v_hits < 1 THEN
    RAISE EXCEPTION 'last name search failed';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.search_practice_visibility_users(v_practice_id, 'Иванов') AS s
  WHERE s.user_id = v_german_id;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'last name search must include the fixture user';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'Герман Иванов');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'first+last must uniquely find Герман';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'герман');
  IF v_hits < 1 THEN
    RAISE EXCEPTION 'case-insensitive name search failed';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'german@example.com');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'exact email must resolve';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'gmail.com');
  IF v_hits <> 0 THEN
    RAISE EXCEPTION 'partial email gmail.com must not match';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, '@example.com');
  IF v_hits <> 0 THEN
    RAISE EXCEPTION 'partial email @example.com must not match';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'german@');
  IF v_hits <> 0 THEN
    RAISE EXCEPTION 'partial email german@ must not match';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'man@example');
  IF v_hits <> 0 THEN
    RAISE EXCEPTION 'partial email man@example must not match';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, v_german_id::text);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'exact UUID must resolve';
  END IF;

  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'Тест');
  IF v_hits > 10 THEN
    RAISE EXCEPTION 'search must cap at 10 rows: %', v_hits;
  END IF;

  PERFORM public.add_practice_visibility_user(v_practice_id, v_german_id);
  RESET ROLE;

  SELECT count(*) INTO v_count
  FROM public.practice_visibility_users
  WHERE practice_id = v_practice_id AND user_id = v_german_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'add must write practice_visibility_users';
  END IF;

  SELECT count(*) INTO v_grants_after
  FROM public.user_practices
  WHERE user_id = v_german_id AND practice_id = v_practice_id;
  IF v_grants_after IS DISTINCT FROM v_grants_before THEN
    RAISE EXCEPTION 'search/add must not write user_practices';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_hits
  FROM public.list_practice_visibility_users(v_practice_id);
  IF v_hits < 1 THEN
    RAISE EXCEPTION 'list_practice_visibility_users failed after migration';
  END IF;

  SELECT * INTO v_hit
  FROM public.list_practice_visibility_users(v_practice_id)
  LIMIT 1;
  IF v_hit.masked_email IS NULL OR v_hit.masked_email NOT LIKE '%***%' THEN
    RAISE EXCEPTION 'list must return masked email';
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_editor_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_editor_id, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_hits
  FROM public.search_practice_visibility_users(v_practice_id, 'Герман');
  IF v_hits < 1 THEN
    RAISE EXCEPTION 'editor cannot search';
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_unrelated_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_unrelated_id, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM 1 FROM public.search_practice_visibility_users(v_practice_id, 'Герман');
    RAISE EXCEPTION 'unrelated authenticated must not search';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT IN ('not_authorized', 'not_authenticated') THEN
        RAISE;
      END IF;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM 1 FROM public.search_practice_visibility_users(v_practice_id, 'Герман');
    RAISE EXCEPTION 'anon must not search';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT IN ('not_authorized', 'not_authenticated') THEN
        RAISE;
      END IF;
  END;
  RESET ROLE;
END;
$$;

ROLLBACK;
