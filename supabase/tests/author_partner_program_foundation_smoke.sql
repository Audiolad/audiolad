-- Isolated smoke for author partner program foundation.
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  user_editor uuid := '33333333-3333-4333-8333-333333333333';
  user_c uuid := '44444444-4444-4444-8444-444444444444';
  author_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  author_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  author_a2 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_json jsonb;
  v_code text;
  v_code2 text;
  v_norm text;
  cnt integer;
  raised boolean;
  v_err text;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b), (user_editor), (user_c);
  INSERT INTO public.authors (id, name, slug) VALUES
    (author_a, 'Sergey Petrov', 'sergey-petrov'),
    (author_b, 'Jazz Relax', 'jazz-relax'),
    (author_a2, 'Sergey Second Space', 'sergey-second');

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (author_a, user_a, 'owner'),
    (author_a2, user_a, 'owner'),
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

  -- Second author space for same user gets its own profile/code
  v_json := public.ensure_author_partner_profile(author_a2);
  IF coalesce(v_json->>'created', 'false') <> 'true' THEN
    RAISE EXCEPTION 'A2: second author space profile missing: %', v_json;
  END IF;
  IF v_json->>'primary_code' IS NOT DISTINCT FROM v_code THEN
    RAISE EXCEPTION 'A2: second space must get a distinct primary code';
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
  IF v_json ? 'user_id' OR v_json ? 'email' OR v_json ? 'referrer_owner_user_id' THEN
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

  -- editor can read profile
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

  SELECT primary_code INTO v_code2
  FROM public.author_partner_profiles
  WHERE author_id = author_a;
  -- as stranger SELECT should see 0 via RLS; check as owner below
  RESET ROLE;
  SELECT primary_code INTO v_code2
  FROM public.author_partner_profiles
  WHERE author_id = author_a;
  IF v_code2 IS DISTINCT FROM 'SERGEY78' THEN
    RAISE EXCEPTION 'F: primary code corrupted by direct update: %', v_code2;
  END IF;

  -- -------------------------------------------------------------------------
  -- G. Referral uniqueness + self-referral defenses
  -- -------------------------------------------------------------------------
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
  );

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

  RAISE NOTICE 'author_partner_program_foundation_smoke: ok';
END;
$$;
