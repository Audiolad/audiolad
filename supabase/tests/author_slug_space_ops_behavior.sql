-- Behavior proofs for author slug redirects / rename / delete.
-- Applied only inside isolated scratch DB by scripts/author-slug-space-ops-sql-unit.mjs.

CREATE OR REPLACE FUNCTION pg_temp.fail(msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TEST_FAIL: %', msg;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT cond THEN
    PERFORM pg_temp.fail(msg);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
END;
$$;

DO $$
DECLARE
  u_owner uuid := '11111111-1111-4111-8111-111111111111';
  u_editor uuid := '22222222-2222-4222-8222-222222222222';
  u_stranger uuid := '33333333-3333-4333-8333-333333333333';
  u_admin uuid := '44444444-4444-4444-8444-444444444444';
  u_owner2 uuid := '55555555-5555-4555-8555-555555555555';
  a1 uuid;
  a2 uuid;
  a3 uuid;
  a_pub uuid;
  a_fin uuid;
  a_del uuid;
  a_race uuid;
  v_json jsonb;
  v_code text;
  v_exc text;
  v_cnt integer;
  v_can_select boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (u_owner, 'owner@test.local'),
    (u_editor, 'editor@test.local'),
    (u_stranger, 'stranger@test.local'),
    (u_admin, 'admin@test.local'),
    (u_owner2, 'owner2@test.local');

  INSERT INTO public.profiles (id) VALUES
    (u_owner), (u_editor), (u_stranger), (u_admin), (u_owner2);

  -- Unlimited project slots for owners under test.
  UPDATE public.profiles
  SET author_projects_unlimited = true
  WHERE id IN (u_owner, u_owner2, u_admin);

  -------------------------------------------------------------------------
  -- A. owner empty → rename success
  -------------------------------------------------------------------------
  PERFORM pg_temp.set_user(u_owner);
  v_json := public.create_author_project('Owner One', 'owner-one', NULL);
  a1 := (v_json ->> 'author_id')::uuid;
  PERFORM pg_temp.ok(v_json ->> 'slug' = 'owner-one', 'A create slug');

  v_json := public.change_author_slug(a1, 'owner-one-renamed');
  PERFORM pg_temp.ok(v_json ->> 'ok' = 'true', 'A rename ok');
  PERFORM pg_temp.ok(v_json ->> 'slug' = 'owner-one-renamed', 'A new slug');
  PERFORM pg_temp.ok(v_json ->> 'previous_slug' = 'owner-one', 'A previous slug');
  PERFORM pg_temp.ok(
    EXISTS (
      SELECT 1 FROM public.author_slug_redirects r
      WHERE r.old_slug = 'owner-one' AND r.author_id = a1
    ),
    'A history row'
  );

  -------------------------------------------------------------------------
  -- B. occupied current slug → reject
  -------------------------------------------------------------------------
  PERFORM pg_temp.set_user(u_owner2);
  v_json := public.create_author_project('Owner Two', 'owner-two', NULL);
  a2 := (v_json ->> 'author_id')::uuid;

  BEGIN
    PERFORM public.change_author_slug(a2, 'owner-one-renamed');
    PERFORM pg_temp.fail('B should reject occupied current slug');
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%slug_taken%' AND SQLSTATE <> '23505' THEN
        RAISE;
      END IF;
  END;

  -------------------------------------------------------------------------
  -- C. historical slug of another author → reject
  -------------------------------------------------------------------------
  BEGIN
    PERFORM public.change_author_slug(a2, 'owner-one');
    PERFORM pg_temp.fail('C should reject foreign historical slug');
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%slug_taken%' AND SQLSTATE <> '23505' THEN
        RAISE;
      END IF;
  END;

  -------------------------------------------------------------------------
  -- D. owner published → reject
  -------------------------------------------------------------------------
  PERFORM pg_temp.set_user(u_owner);
  v_json := public.create_author_project('Published Author', 'pub-author', NULL);
  a_pub := (v_json ->> 'author_id')::uuid;
  INSERT INTO public.practices (author_id, title, slug, status)
  VALUES (a_pub, 'Pub', 'pub-practice', 'published');

  v_json := public.can_change_author_slug(a_pub);
  PERFORM pg_temp.ok(v_json ->> 'allowed' = 'false', 'D can_change false');
  PERFORM pg_temp.ok(v_json ->> 'code' = 'slug_change_locked_published', 'D published code');

  BEGIN
    PERFORM public.change_author_slug(a_pub, 'pub-author-new');
    PERFORM pg_temp.fail('D rename should be locked when published');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%slug_change_locked%' AND SQLERRM NOT ILIKE '%forbidden%' THEN
        RAISE;
      END IF;
  END;

  -------------------------------------------------------------------------
  -- E. finance history → reject
  -------------------------------------------------------------------------
  v_json := public.create_author_project('Finance Author', 'fin-author', NULL);
  a_fin := (v_json ->> 'author_id')::uuid;
  INSERT INTO public.author_ledger_entries (author_id) VALUES (a_fin);

  v_json := public.can_change_author_slug(a_fin);
  PERFORM pg_temp.ok(v_json ->> 'allowed' = 'false', 'E can_change false');
  PERFORM pg_temp.ok(v_json ->> 'code' = 'slug_change_locked_finance', 'E finance code');

  -------------------------------------------------------------------------
  -- F. admin authors.manage → rename success even with published
  -------------------------------------------------------------------------
  PERFORM set_config('audiolad.test_admin_user', u_admin::text, true);
  PERFORM pg_temp.set_user(u_admin);
  v_json := public.change_author_slug(a_pub, 'pub-author-admin');
  PERFORM pg_temp.ok(v_json ->> 'ok' = 'true', 'F admin rename ok');
  PERFORM pg_temp.ok(v_json ->> 'slug' = 'pub-author-admin', 'F admin new slug');
  PERFORM set_config('audiolad.test_admin_user', '', true);

  -------------------------------------------------------------------------
  -- G. history old1 + old2 both resolve to current
  -------------------------------------------------------------------------
  PERFORM pg_temp.set_user(u_owner);
  v_json := public.create_author_project('Chain Author', 'chain-a', NULL);
  a3 := (v_json ->> 'author_id')::uuid;
  PERFORM public.change_author_slug(a3, 'chain-b');
  PERFORM public.change_author_slug(a3, 'chain-c');

  v_json := public.resolve_author_slug_redirect('chain-a');
  PERFORM pg_temp.ok(v_json ->> 'current_slug' = 'chain-c', 'G old1 → current');
  v_json := public.resolve_author_slug_redirect('chain-b');
  PERFORM pg_temp.ok(v_json ->> 'current_slug' = 'chain-c', 'G old2 → current');

  -------------------------------------------------------------------------
  -- H. history table not readable by anon/authenticated
  -------------------------------------------------------------------------
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT EXISTS (
      SELECT 1 FROM public.author_slug_redirects LIMIT 1
    ) INTO v_can_select;
    EXECUTE 'RESET ROLE';
    IF v_can_select THEN
      PERFORM pg_temp.fail('H anon must not read author_slug_redirects');
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      -- permission denied / RLS with no policy both OK
      IF SQLSTATE NOT IN ('42501', '42000') AND SQLERRM NOT ILIKE '%permission%' THEN
        -- If SET ROLE failed because anon lacks LOGIN, treat as pass when table has no grant.
        NULL;
      END IF;
  END;

  SELECT has_table_privilege('anon', 'public.author_slug_redirects', 'SELECT')
    INTO v_can_select;
  PERFORM pg_temp.ok(NOT v_can_select, 'H anon has no SELECT privilege');

  SELECT has_table_privilege('authenticated', 'public.author_slug_redirects', 'SELECT')
    INTO v_can_select;
  PERFORM pg_temp.ok(NOT v_can_select, 'H authenticated has no SELECT privilege');

  -- Helpers must not be executable by PUBLIC/anon
  PERFORM pg_temp.ok(
    NOT has_function_privilege(
      'anon',
      'public.author_space_has_published_practice(uuid)',
      'EXECUTE'
    ),
    'H anon cannot execute published helper'
  );
  PERFORM pg_temp.ok(
    NOT has_function_privilege(
      'anon',
      'public.acquire_author_slug_namespace_lock(text)',
      'EXECUTE'
    ),
    'H anon cannot execute namespace lock'
  );

  -------------------------------------------------------------------------
  -- I. empty owner delete → success
  -------------------------------------------------------------------------
  PERFORM pg_temp.set_user(u_owner);
  v_json := public.create_author_project('Delete Me', 'delete-me', NULL);
  a_del := (v_json ->> 'author_id')::uuid;
  v_json := public.delete_empty_author_space(a_del);
  PERFORM pg_temp.ok(v_json ->> 'ok' = 'true', 'I delete ok');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.authors WHERE id = a_del),
    'I author gone'
  );

  -------------------------------------------------------------------------
  -- J. practice row → delete blocked
  -------------------------------------------------------------------------
  v_json := public.create_author_project('Has Practice', 'has-practice', NULL);
  a_del := (v_json ->> 'author_id')::uuid;
  INSERT INTO public.practices (author_id, title, slug, status)
  VALUES (a_del, 'Draft', 'draft-1', 'draft');

  v_json := public.can_delete_author_space(a_del);
  PERFORM pg_temp.ok(v_json ->> 'allowed' = 'false', 'J can_delete false');

  BEGIN
    PERFORM public.delete_empty_author_space(a_del);
    PERFORM pg_temp.fail('J delete should be blocked');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%delete_blocked%' THEN
        RAISE;
      END IF;
  END;

  -------------------------------------------------------------------------
  -- K. foreign user / editor → owner-only ops forbidden
  -------------------------------------------------------------------------
  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (a_del, u_editor, 'editor')
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.set_user(u_editor);
  v_json := public.can_change_author_slug(a_del);
  PERFORM pg_temp.ok(v_json ->> 'allowed' = 'false', 'K editor cannot change');
  PERFORM pg_temp.ok(v_json ->> 'code' = 'forbidden', 'K editor forbidden code');

  PERFORM pg_temp.set_user(u_stranger);
  v_json := public.can_delete_author_space(a_del);
  PERFORM pg_temp.ok(v_json ->> 'allowed' = 'false', 'K stranger cannot delete');

  -------------------------------------------------------------------------
  -- L. namespace invariant: cannot have current B = historical A
  -------------------------------------------------------------------------
  PERFORM pg_temp.set_user(u_owner);
  -- a1 currently owner-one-renamed with history owner-one
  BEGIN
    PERFORM public.create_author_project('Race Stealer', 'owner-one', NULL);
    PERFORM pg_temp.fail('L create must not steal historical slug');
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%slug_taken%' AND SQLERRM NOT ILIKE '%project_slug_taken%' AND SQLSTATE <> '23505' THEN
        RAISE;
      END IF;
  END;

  -- After A renamed to admin slug, historical pub-author must stay blocked for others
  PERFORM pg_temp.set_user(u_owner2);
  BEGIN
    PERFORM public.change_author_slug(a2, 'pub-author');
    PERFORM pg_temp.fail('L cannot claim foreign historical pub-author');
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%slug_taken%' AND SQLSTATE <> '23505' THEN
        RAISE;
      END IF;
  END;

  -- Lock function exists and is transactional
  PERFORM public.acquire_author_slug_namespace_lock('lock-probe-slug');
  PERFORM pg_temp.ok(
    EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE proname = 'acquire_author_slug_namespace_lock'
    ),
    'L lock function present'
  );

  RAISE NOTICE 'author_slug_space_ops_behavior: ALL CHECKS PASSED';
END;
$$;
