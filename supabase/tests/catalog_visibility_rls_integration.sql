-- Catalog visibility RLS integration: selected_users must never recurse.
-- Run only on an isolated/local/preview database, never production:
--   AUDIOLAD_VISIBILITY_RLS_DATABASE_URL='postgresql://…' \
--     npm run test:catalog-visibility:rls
--
-- Requires migrations through:
--   20260901120400_fix_visibility_allowlist_author_policy.sql
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_author_user_id uuid := 'ca710001-0000-4000-8000-000000000001';
  v_allowlisted_user_id uuid := 'ca710002-0000-4000-8000-000000000002';
  v_stranger_user_id uuid := 'ca710003-0000-4000-8000-000000000003';
  v_author_id uuid;
  v_practice_id uuid;
  v_count integer;
  v_can_read boolean;
BEGIN
  SELECT id INTO v_author_id FROM public.authors ORDER BY id LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'catalog visibility RLS integration needs an author';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_author_user_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_author_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'visibility.author@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(), '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_allowlisted_user_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_allowlisted_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'visibility.allowlisted@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(), '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_stranger_user_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_stranger_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'visibility.stranger@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(), '', '', '', ''
    );
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES
    (v_author_user_id, 'visibility.author@example.com', 'listener'),
    (v_allowlisted_user_id, 'visibility.allowlisted@example.com', 'listener'),
    (v_stranger_user_id, 'visibility.stranger@example.com', 'listener')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role;

  DELETE FROM public.practices
  WHERE slug = 'catalog-visibility-rls-cycle-test';

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price,
    is_catalog_listed, catalog_visibility
  ) VALUES (
    v_author_id, 'Catalog visibility RLS cycle test',
    'catalog-visibility-rls-cycle-test', 'published', false, 100,
    false, 'selected_users'
  )
  RETURNING id INTO v_practice_id;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, v_author_user_id, 'owner')
  ON CONFLICT (author_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.practice_visibility_users (practice_id, user_id, created_by)
  VALUES (v_practice_id, v_allowlisted_user_id, v_author_user_id);

  -- anon: no practice/children/allowlist and helper is false.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*) INTO v_count FROM public.practices WHERE id = v_practice_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'anon read selected practice'; END IF;
  SELECT count(*) INTO v_count FROM public.audio_items WHERE practice_id = v_practice_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'anon read selected audio'; END IF;
  SELECT count(*) INTO v_count FROM public.practice_topics WHERE practice_id = v_practice_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'anon read selected topics'; END IF;
  SELECT public.can_current_viewer_read_practice(v_practice_id) INTO v_can_read;
  IF v_can_read IS DISTINCT FROM false THEN RAISE EXCEPTION 'anon helper read selected'; END IF;
  RESET ROLE;

  -- Stranger must get 0 rows, not infinite-recursion error.
  PERFORM set_config('request.jwt.claim.sub', v_stranger_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_stranger_user_id, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_count FROM public.practices WHERE id = v_practice_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'stranger read selected practice'; END IF;
  SELECT count(*) INTO v_count FROM public.practice_visibility_users WHERE practice_id = v_practice_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'stranger read allowlist'; END IF;
  SELECT public.can_current_viewer_read_practice(v_practice_id) INTO v_can_read;
  IF v_can_read IS DISTINCT FROM false THEN RAISE EXCEPTION 'stranger helper read selected'; END IF;
  RESET ROLE;

  -- The allowlisted user can read the practice and own allowlist row.
  PERFORM set_config('request.jwt.claim.sub', v_allowlisted_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_allowlisted_user_id, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_count FROM public.practices WHERE id = v_practice_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'allowlisted cannot read selected practice'; END IF;
  SELECT count(*) INTO v_count FROM public.practice_visibility_users
  WHERE practice_id = v_practice_id AND user_id = v_allowlisted_user_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'allowlisted cannot read own allowlist row'; END IF;
  SELECT public.can_current_viewer_read_practice(v_practice_id) INTO v_can_read;
  IF v_can_read IS DISTINCT FROM true THEN RAISE EXCEPTION 'allowlisted helper denied selected'; END IF;
  RESET ROLE;

  -- Owner can read the product allowlist through the DEFINER helper.
  PERFORM set_config('request.jwt.claim.sub', v_author_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_author_user_id, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_count FROM public.practice_visibility_users
  WHERE practice_id = v_practice_id AND user_id = v_allowlisted_user_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'author cannot read own product allowlist'; END IF;
  RESET ROLE;

  DELETE FROM public.practices WHERE id = v_practice_id;
END;
$$;
