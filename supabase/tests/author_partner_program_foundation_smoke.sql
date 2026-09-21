-- Isolated smoke for author partner program foundation (hardened).
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  user_editor uuid := '33333333-3333-4333-8333-333333333333';
  user_c uuid := '44444444-4444-4444-8444-444444444444';
  user_d uuid := '55555555-5555-4555-8555-555555555555';
  author_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  author_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  author_a2 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  author_empty uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_json jsonb;
  v_code text;
  v_code2 text;
  cnt integer;
  raised boolean;
  v_err text;
  v_blockers text[];
  v_ref_id uuid;
  v_can_exec boolean;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b), (user_editor), (user_c), (user_d);
  INSERT INTO public.authors (id, name, slug) VALUES
    (author_a, 'Sergey Petrov', 'sergey-petrov'),
    (author_b, 'Jazz Relax', 'jazz-relax'),
    (author_a2, 'Sergey Second Space', 'sergey-second'),
    (author_empty, 'Empty Partner Space', 'empty-partner');

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (author_a, user_a, 'owner'),
    (author_a2, user_a, 'owner'),
    (author_empty, user_d, 'owner'),
    (author_b, user_b, 'owner'),
    (author_a, user_editor, 'editor');

  -- -------------------------------------------------------------------------
  -- A. Owner can ensure partner profile; one profile per author; generated code
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';

  v_json := public.ensure_author_partner_profile(author_a);
  IF coalesce(v_json->>'ok', 'false') <> 'true' OR coalesce(v_json->>'created', 'false') <> 'true' THEN
    RAISE EXCEPTION 'A: ensure create failed: %', v_json;
  END IF;
  v_code := v_json->>'primary_code';
  IF v_code IS NULL OR char_length(v_code) < 3 THEN
    RAISE EXCEPTION 'A: missing generated code: %', v_json;
  END IF;

  v_json := public.ensure_author_partner_profile(author_a);
  IF coalesce(v_json->>'created', 'true') <> 'false' THEN
    RAISE EXCEPTION 'A: second ensure must not recreate: %', v_json;
  END IF;

  v_json := public.ensure_author_partner_profile(author_a2);
  IF coalesce(v_json->>'created', 'false') <> 'true' THEN
    RAISE EXCEPTION 'A2: second author space profile missing: %', v_json;
  END IF;
  IF v_json->>'primary_code' IS NOT DISTINCT FROM v_code THEN
    RAISE EXCEPTION 'A2: second space must get a distinct primary code';
  END IF;

  -- -------------------------------------------------------------------------
  -- A3. ensure unique_violation re-read path (idempotent after profile exists)
  -- -------------------------------------------------------------------------
  -- Simulate post-race re-entry: profile already present → created=false.
  v_json := public.ensure_author_partner_profile(author_a);
  IF coalesce(v_json->>'created', 'true') <> 'false'
     OR coalesce(v_json->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'A3: ensure must stay idempotent: %', v_json;
  END IF;

  -- -------------------------------------------------------------------------
  -- B. Case-insensitive uniqueness across authors
  -- -------------------------------------------------------------------------
  raised := false;
  BEGIN
    PERFORM public.change_author_partner_code(author_a, 'SERGEY');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF raised THEN
    RAISE EXCEPTION 'B: owner should set SERGEY, got %', v_err;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.ensure_author_partner_profile(author_b);

  raised := false;
  BEGIN
    PERFORM public.change_author_partner_code(author_b, 'sergey');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'B: sergey must collide with SERGEY owned by author_a';
  END IF;

  -- -------------------------------------------------------------------------
  -- C. Change primary keeps old as alias; resolve works for both
  -- -------------------------------------------------------------------------
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';

  v_json := public.change_author_partner_code(author_a, 'SERGEY78');
  IF coalesce(v_json->>'primary_code', '') <> 'SERGEY78' THEN
    RAISE EXCEPTION 'C: primary not updated: %', v_json;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.author_partner_code_aliases
  WHERE author_id = author_a
    AND code_normalized = 'sergey';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'C: old SERGEY must become alias, cnt=%', cnt;
  END IF;

  RESET ROLE;
  EXECUTE 'SET ROLE anon';
  v_json := public.resolve_author_partner_code('SERGEY');
  IF coalesce(v_json->>'ok', 'false') <> 'true'
     OR (v_json->>'author_id')::uuid IS DISTINCT FROM author_a
     OR coalesce(v_json->>'code_kind', '') <> 'alias' THEN
    RAISE EXCEPTION 'C: alias resolve failed: %', v_json;
  END IF;
  IF v_json ? 'user_id' OR v_json ? 'email' OR v_json ? 'referrer_owner_user_id'
     OR v_json ? 'owner_user_id' THEN
    RAISE EXCEPTION 'C: resolve leaked private fields: %', v_json;
  END IF;

  v_json := public.resolve_author_partner_code('sergey78');
  IF coalesce(v_json->>'ok', 'false') <> 'true'
     OR coalesce(v_json->>'code_kind', '') <> 'primary' THEN
    RAISE EXCEPTION 'C: primary resolve failed: %', v_json;
  END IF;

  -- -------------------------------------------------------------------------
  -- D. Alias cannot be claimed by another author
  -- -------------------------------------------------------------------------
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  EXECUTE 'SET ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM public.change_author_partner_code(author_b, 'SERGEY');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'D: other author must not take alias SERGEY';
  END IF;

  -- -------------------------------------------------------------------------
  -- E. Reserved codes rejected
  -- -------------------------------------------------------------------------
  raised := false;
  BEGIN
    PERFORM public.change_author_partner_code(author_b, 'admin');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'E: reserved code admin must be rejected';
  END IF;

  -- -------------------------------------------------------------------------
  -- F. Editor cannot change code; stranger cannot; direct UPDATE blocked
  -- -------------------------------------------------------------------------
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_editor::text, true);
  EXECUTE 'SET ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM public.change_author_partner_code(author_a, 'EDITORCODE');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'F: editor must not change partner code';
  END IF;

  v_json := public.get_author_partner_profile(author_a);
  IF coalesce(v_json->>'exists', 'false') <> 'true' THEN
    RAISE EXCEPTION 'F: editor should read profile: %', v_json;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_c::text, true);
  EXECUTE 'SET ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM public.change_author_partner_code(author_a, 'STRANGER');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'F: stranger must not change partner code';
  END IF;

  raised := false;
  cnt := -1;
  BEGIN
    UPDATE public.author_partner_profiles
    SET primary_code = 'HACKED'
    WHERE author_id = author_a;
    GET DIAGNOSTICS cnt = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    cnt := 0;
  END;
  IF NOT raised AND cnt <> 0 THEN
    RAISE EXCEPTION 'F: direct UPDATE must not modify partner profile (rows=%)', cnt;
  END IF;

  RESET ROLE;
  SELECT primary_code INTO v_code2
  FROM public.author_partner_profiles
  WHERE author_id = author_a;
  IF v_code2 IS DISTINCT FROM 'SERGEY78' THEN
    RAISE EXCEPTION 'F: primary code corrupted by direct update: %', v_code2;
  END IF;

  -- -------------------------------------------------------------------------
  -- F2. owner_user_id helper not executable by authenticated
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM public.author_partner_owner_user_id(author_a);
  EXCEPTION WHEN insufficient_privilege THEN
    raised := true;
  WHEN OTHERS THEN
    -- Some PG builds surface revoke as undefined_function / 42501 text
    IF SQLSTATE = '42501' OR SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%denied%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'F2: authenticated must not execute author_partner_owner_user_id';
  END IF;

  SELECT has_function_privilege('authenticated', 'public.author_partner_owner_user_id(uuid)', 'EXECUTE')
  INTO v_can_exec;
  IF coalesce(v_can_exec, true) THEN
    RAISE EXCEPTION 'F2: EXECUTE still granted to authenticated on owner_user_id';
  END IF;

  -- -------------------------------------------------------------------------
  -- G. Referral uniqueness + self-referral defenses
  -- -------------------------------------------------------------------------
  RESET ROLE;

  raised := false;
  BEGIN
    INSERT INTO public.author_referrals (
      referrer_author_id,
      referrer_owner_user_id,
      invitee_user_id,
      code_used,
      code_normalized,
      status
    ) VALUES (
      author_a, user_a, user_a, 'SERGEY78', 'sergey78', 'attributed'
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'G: self-referral CHECK must reject invitee=owner';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.author_partner_assert_not_self_referral(author_a, user_a);
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'G: assert_not_self_referral must reject owner';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.author_partner_assert_not_self_referral(author_a, user_editor);
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'G: assert_not_self_referral must reject member';
  END IF;

  INSERT INTO public.author_referrals (
    referrer_author_id,
    referrer_owner_user_id,
    invitee_user_id,
    code_used,
    code_normalized,
    status
  ) VALUES (
    author_a, user_a, user_c, 'SERGEY78', 'sergey78', 'attributed'
  )
  RETURNING id INTO v_ref_id;

  raised := false;
  BEGIN
    INSERT INTO public.author_referrals (
      referrer_author_id,
      referrer_owner_user_id,
      invitee_user_id,
      code_used,
      code_normalized,
      status
    ) VALUES (
      author_b, user_b, user_c, 'x', 'x', 'attributed'
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'G: invitee_user_id must be unique across referrals';
  END IF;

  -- Activate + immutability
  UPDATE public.author_referrals
  SET
    invitee_author_id = author_b,
    activated_at = now(),
    expires_at = now() + interval '3 years',
    status = 'activated'
  WHERE invitee_user_id = user_c;

  raised := false;
  BEGIN
    UPDATE public.author_referrals
    SET referrer_author_id = author_a2
    WHERE invitee_user_id = user_c;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'G: activated referral must be immutable';
  END IF;

  -- -------------------------------------------------------------------------
  -- G2. Status move to expired must NOT unlock identity UPDATE/DELETE
  -- -------------------------------------------------------------------------
  UPDATE public.author_referrals
  SET status = 'expired'
  WHERE invitee_user_id = user_c;

  raised := false;
  BEGIN
    UPDATE public.author_referrals
    SET referrer_author_id = author_a2
    WHERE invitee_user_id = user_c;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'G2: expired referral identity must stay immutable';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.author_referrals WHERE invitee_user_id = user_c;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'G2: ever-activated referral must not DELETE';
  END IF;

  -- status-only transition still allowed
  UPDATE public.author_referrals
  SET status = 'void'
  WHERE invitee_user_id = user_c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'G2: status transition void should succeed';
  END IF;

  -- -------------------------------------------------------------------------
  -- H. Referral RLS is current author ownership + invitee; SELECT grant works
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO cnt
  FROM public.author_referrals
  WHERE invitee_user_id = user_c;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'H: current referrer owner must SELECT referral, cnt=%', cnt;
  END IF;

  -- invitee can read own
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_c::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO cnt
  FROM public.author_referrals
  WHERE invitee_user_id = user_c;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'H: invitee must SELECT own referral, cnt=%', cnt;
  END IF;

  -- stranger cannot
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_d::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO cnt
  FROM public.author_referrals
  WHERE invitee_user_id = user_c;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'H: stranger must not SELECT referral, cnt=%', cnt;
  END IF;

  -- ownership transfer A → B: new owner sees, old owner does not
  RESET ROLE;
  UPDATE public.author_members
  SET role = 'editor'
  WHERE author_id = author_a AND user_id = user_a;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (author_a, user_b, 'owner')
  ON CONFLICT (author_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- remove old owner membership so snapshot user_a is no longer owner
  DELETE FROM public.author_members
  WHERE author_id = author_a AND user_id = user_a;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO cnt
  FROM public.author_referrals
  WHERE invitee_user_id = user_c;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'H: new owner after transfer must SELECT referral, cnt=%', cnt;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO cnt
  FROM public.author_referrals
  WHERE invitee_user_id = user_c;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'H: former owner must not SELECT via snapshot, cnt=%', cnt;
  END IF;

  -- restore owner for later delete tests
  RESET ROLE;
  DELETE FROM public.author_members
  WHERE author_id = author_a AND user_id = user_b AND role = 'owner';
  -- user_b may still own author_b; keep that.
  -- If conflict: user_b was already owner of author_b only. For author_a re-add user_a.
  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (author_a, user_a, 'owner')
  ON CONFLICT (author_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  -- demote user_b on author_a if still present
  UPDATE public.author_members
  SET role = 'editor'
  WHERE author_id = author_a AND user_id = user_b;
  DELETE FROM public.author_members
  WHERE author_id = author_a AND user_id = user_b;

  -- -------------------------------------------------------------------------
  -- I. Profile/alias ↔ claims integrity (composite FK + claim_kind)
  -- -------------------------------------------------------------------------
  RESET ROLE;

  -- Wrong author_id on profile FK (same code, different author) must fail
  raised := false;
  BEGIN
    INSERT INTO public.author_partner_profiles (
      author_id, primary_code, primary_code_normalized, status
    ) VALUES (
      author_empty, 'SERGEY78', 'sergey78', 'active'
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'I: profile must not attach another author''s claim code';
  END IF;

  -- claim_kind mismatch: profile requires primary claim
  raised := false;
  BEGIN
    INSERT INTO public.author_partner_profiles (
      author_id, primary_code, primary_code_normalized, status
    ) VALUES (
      author_a, 'SERGEY', 'sergey', 'active'
    );
  EXCEPTION WHEN unique_violation THEN
    -- PK conflict on author_a is also a fail-closed outcome
    raised := true;
  WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'I: profile must reject alias claim_kind';
  END IF;

  -- Explicit kind mismatch on fresh author: create alias-only claim then profile
  INSERT INTO public.author_partner_code_claims (
    code_normalized, author_id, claim_kind, code_display
  ) VALUES (
    'emptyalias01', author_empty, 'alias', 'emptyalias01'
  );

  raised := false;
  BEGIN
    INSERT INTO public.author_partner_profiles (
      author_id, primary_code, primary_code_normalized, status
    ) VALUES (
      author_empty, 'emptyalias01', 'emptyalias01', 'active'
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'I: profile insert must require claim_kind=primary';
  END IF;

  DELETE FROM public.author_partner_code_claims
  WHERE code_normalized = 'emptyalias01';

  -- -------------------------------------------------------------------------
  -- J. Author delete: empty partner profile CASCADE; referrer RESTRICT + blocker
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_d::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_json := public.ensure_author_partner_profile(author_empty);
  IF coalesce(v_json->>'created', 'false') <> 'true' THEN
    RAISE EXCEPTION 'J: empty space ensure failed: %', v_json;
  END IF;

  RESET ROLE;
  v_blockers := public.author_space_delete_blockers(author_empty);
  IF 'has_partner_referrals_as_referrer' = ANY (v_blockers)
     OR 'has_partner_referrals_as_invitee' = ANY (v_blockers) THEN
    RAISE EXCEPTION 'J: empty partner space must not have referral blockers: %', v_blockers;
  END IF;

  DELETE FROM public.authors WHERE id = author_empty;
  SELECT count(*) INTO cnt FROM public.author_partner_profiles WHERE author_id = author_empty;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'J: empty partner profile must CASCADE on author delete';
  END IF;
  SELECT count(*) INTO cnt FROM public.author_partner_code_claims WHERE author_id = author_empty;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'J: empty partner claims must CASCADE on author delete';
  END IF;

  v_blockers := public.author_space_delete_blockers(author_a);
  IF NOT ('has_partner_referrals_as_referrer' = ANY (v_blockers)) THEN
    RAISE EXCEPTION 'J: referrer must surface has_partner_referrals_as_referrer: %', v_blockers;
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.authors WHERE id = author_a;
  EXCEPTION WHEN foreign_key_violation THEN
    raised := true;
  WHEN OTHERS THEN
    IF SQLSTATE = '23503' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'J: referrer author delete must RESTRICT while referrals exist';
  END IF;

  v_blockers := public.author_space_delete_blockers(author_b);
  IF NOT ('has_partner_referrals_as_invitee' = ANY (v_blockers)) THEN
    RAISE EXCEPTION 'J: invitee author must surface has_partner_referrals_as_invitee: %', v_blockers;
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.authors WHERE id = author_b;
  EXCEPTION WHEN foreign_key_violation THEN
    raised := true;
  WHEN OTHERS THEN
    IF SQLSTATE = '23503' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'J: invitee author delete must RESTRICT while referrals exist';
  END IF;

  RAISE NOTICE 'author_partner_program_foundation_smoke: ok';
END;
$$;
