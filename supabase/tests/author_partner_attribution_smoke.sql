-- Attribution behavioral smoke (PR2 final harden).
-- Requires foundation + attribution migrations on an isolated DB.
DO $$
DECLARE
  v jsonb;
  v_user_a uuid := 'a1111111-1111-4111-8111-111111111111';
  v_user_b uuid := 'a2222222-2222-4222-8222-222222222222';
  v_user_c uuid := 'a3333333-3333-4333-8333-333333333333';
  v_user_d uuid := 'a4444444-4444-4444-8444-444444444444';
  v_user_e uuid := 'a5555555-5555-4555-8555-555555555555';
  v_user_f uuid := 'a6666666-6666-4666-8666-666666666666';
  v_user_g uuid := 'a7777777-7777-4777-8777-777777777777';
  v_author_a uuid := 'aa111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_author_b uuid := 'aa222222-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_author_empty uuid := 'aa333333-cccc-4ccc-8ccc-ccccccccccc1';
  v_author_dis uuid := 'aa444444-dddd-4ddd-8ddd-ddddddddddd1';
  v_cnt int;
  v_ref_author uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES
    (v_user_a), (v_user_b), (v_user_c), (v_user_d),
    (v_user_e), (v_user_f), (v_user_g)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.authors (id, name, slug) VALUES
    (v_author_a, 'Sergey', 'sergey-attr'),
    (v_author_b, 'Marina', 'marina-attr'),
    (v_author_empty, 'Empty', 'empty-attr'),
    (v_author_dis, 'Disabled', 'disabled-attr')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_author_a, v_user_a, 'owner'),
    (v_author_b, v_user_b, 'owner'),
    (v_author_empty, v_user_e, 'owner'),
    (v_author_dis, v_user_f, 'owner'),
    (v_author_a, v_user_g, 'editor')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM public.ensure_author_partner_profile(v_author_a);
  PERFORM public.change_author_partner_code(v_author_a, 'SERGEY');

  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM public.ensure_author_partner_profile(v_author_b);
  PERFORM public.change_author_partner_code(v_author_b, 'MARINA');

  PERFORM set_config('request.jwt.claim.sub', v_user_e::text, true);
  PERFORM public.ensure_author_partner_profile(v_author_empty);
  PERFORM public.change_author_partner_code(v_author_empty, 'EMPTYX');

  PERFORM set_config('request.jwt.claim.sub', v_user_f::text, true);
  PERFORM public.ensure_author_partner_profile(v_author_dis);
  PERFORM public.change_author_partner_code(v_author_dis, 'DISABL');

  -- Alias: SERGEY → SERGEY2; old alias still resolves to author A
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM public.change_author_partner_code(v_author_a, 'SERGEY2');
  v := public.author_partner_touch_invite('SERGEY', repeat('a', 64), NULL);
  IF coalesce(v->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'alias touch failed: %', v;
  END IF;
  IF coalesce(v->>'referrer_author_id', '') <> v_author_a::text THEN
    RAISE EXCEPTION 'alias must resolve to author A: %', v;
  END IF;
  DELETE FROM public.author_partner_attributions WHERE token_hash = repeat('a', 64);

  -- Disabled profile → no attribution row
  UPDATE public.author_partner_profiles
  SET status = 'disabled'
  WHERE author_id = v_author_dis;
  v := public.author_partner_touch_invite('DISABL', repeat('b', 64), NULL);
  IF coalesce(v->>'result', '') = 'created' THEN
    RAISE EXCEPTION 'disabled profile must not create attribution: %', v;
  END IF;
  SELECT count(*) INTO v_cnt
  FROM public.author_partner_attributions
  WHERE token_hash = repeat('b', 64);
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'disabled profile left attribution rows: %', v_cnt;
  END IF;

  -- First-touch preserve (A then B on same anonymous token)
  v := public.author_partner_touch_invite('SERGEY2', repeat('1', 64), NULL);
  IF coalesce(v->>'result', '') <> 'created' THEN
    RAISE EXCEPTION 'expected created, got %', v;
  END IF;
  v := public.author_partner_touch_invite('MARINA', repeat('1', 64), NULL);
  IF coalesce(v->>'result', '') <> 'preserved_first_touch' THEN
    RAISE EXCEPTION 'expected preserved_first_touch, got %', v;
  END IF;

  v := public.author_partner_touch_invite('NOPE', repeat('2', 64), NULL);
  IF coalesce(v->>'ok', 'true') = 'true' THEN
    RAISE EXCEPTION 'invalid should fail: %', v;
  END IF;

  -- Pending cookie wins over manual (preserved_first_touch)
  v := public.author_partner_bind_manual_code('MARINA', v_user_c, repeat('1', 64));
  IF coalesce(v->>'code', '') NOT IN ('SERGEY', 'SERGEY2') THEN
    RAISE EXCEPTION 'pending cookie must win over manual: %', v;
  END IF;

  -- Stale bound token: TTL expired → new first-touch B (not browser Max-Age)
  UPDATE public.author_referrals
  SET attribution_expires_at = now() - interval '1 day'
  WHERE invitee_user_id = v_user_c;
  v := public.author_partner_touch_invite('MARINA', repeat('3', 64), v_user_c);
  IF coalesce(v->>'code', '') <> 'MARINA' THEN
    RAISE EXCEPTION 'expired should allow new first-touch B: %', v;
  END IF;
  SELECT referrer_author_id INTO v_ref_author
  FROM public.author_referrals
  WHERE invitee_user_id = v_user_c;
  IF v_ref_author IS DISTINCT FROM v_author_b THEN
    RAISE EXCEPTION 'stale bound A→B: expected Marina, got %', v_ref_author;
  END IF;

  -- Existing owner author → already_author, no new referral
  SELECT count(*) INTO v_cnt FROM public.author_referrals WHERE invitee_user_id = v_user_a;
  v := public.author_partner_touch_invite('MARINA', repeat('4', 64), v_user_a);
  IF coalesce(v->>'result', '') <> 'already_author' THEN
    RAISE EXCEPTION 'owner invitee must be already_author: %', v;
  END IF;
  IF (SELECT count(*) FROM public.author_referrals WHERE invitee_user_id = v_user_a) <> v_cnt THEN
    RAISE EXCEPTION 'already_author must not insert referral';
  END IF;

  -- Owner of an author space binding any code → already_author (no new referral).
  -- True self_referral (foundation helper) is covered by the member/editor case below.
  v := public.author_partner_bind_manual_code('SERGEY2', v_user_a, NULL);
  IF coalesce(v->>'result', '') <> 'already_author' THEN
    RAISE EXCEPTION 'owner bind must be already_author: %', v;
  END IF;

  -- Member/editor self-referral
  v := public.author_partner_bind_manual_code('SERGEY2', v_user_g, NULL);
  IF coalesce(v->>'error', '') <> 'self_referral' THEN
    RAISE EXCEPTION 'member self-referral must reject: %', v;
  END IF;

  -- Cascade: empty author delete
  v := public.author_partner_touch_invite('EMPTYX', repeat('5', 64), NULL);
  IF coalesce(v->>'result', '') <> 'created' THEN
    RAISE EXCEPTION 'empty touch failed: %', v;
  END IF;
  DELETE FROM public.author_members WHERE author_id = v_author_empty;
  DELETE FROM public.author_partner_profiles WHERE author_id = v_author_empty;
  DELETE FROM public.author_partner_code_aliases WHERE author_id = v_author_empty;
  DELETE FROM public.author_partner_code_claims WHERE author_id = v_author_empty;
  DELETE FROM public.authors WHERE id = v_author_empty;
  SELECT count(*) INTO v_cnt
  FROM public.author_partner_attributions
  WHERE referrer_author_id = v_author_empty;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'attributions should cascade on author delete, left %', v_cnt;
  END IF;

  -- Claim + cascade on referral delete
  v := public.author_partner_touch_invite('SERGEY2', repeat('6', 64), NULL);
  v := public.author_partner_claim_attribution(repeat('6', 64), v_user_d);
  IF coalesce(v->>'result', '') <> 'bound' THEN
    RAISE EXCEPTION 'claim failed: %', v;
  END IF;
  DELETE FROM public.author_referrals
  WHERE invitee_user_id = v_user_d AND activated_at IS NULL;
  SELECT count(*) INTO v_cnt
  FROM public.author_partner_attributions
  WHERE token_hash = repeat('6', 64);
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'attribution should cascade when referral deleted, left %', v_cnt;
  END IF;

  RAISE NOTICE 'author_partner_attribution_smoke: ok';
END $$;
