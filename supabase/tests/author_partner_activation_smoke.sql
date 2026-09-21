-- Partner activation + bonus behavioral smoke (PR3).
-- Requires foundation + attribution + activation migrations on an isolated DB.
DO $$
DECLARE
  v jsonb;
  v_referrer_user uuid := 'b1111111-1111-4111-8111-111111111111';
  v_invitee_user uuid := 'b2222222-2222-4222-8222-222222222222';
  v_invitee_expired uuid := 'b3333333-3333-4333-8333-333333333333';
  v_invitee_none uuid := 'b4444444-4444-4444-8444-444444444444';
  v_invitee_premium uuid := 'b5555555-5555-4555-8555-555555555555';
  v_referrer_author uuid := 'bb111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_activation_author uuid := 'bb222222-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_activation_author_2 uuid := 'bb333333-cccc-4ccc-8ccc-ccccccccccc1';
  v_no_ref_author uuid := 'bb444444-dddd-4ddd-8ddd-ddddddddddd1';
  v_expired_author uuid := 'bb555555-eeee-4eee-8eee-eeeeeeeeeee1';
  v_premium_author uuid := 'bb666666-ffff-4fff-8fff-ffffffffffff';
  v_referral_id uuid;
  v_activated_at timestamptz;
  v_expires_at timestamptz;
  v_bonus integer;
  v_race_claim_first uuid := 'c1111111-1111-4111-8111-111111111111';
  v_race_create_first uuid := 'c2222222-2222-4222-8222-222222222222';
  v_race_post_owner uuid := 'c3333333-3333-4333-8333-333333333333';
  v_race_recon uuid := 'c4444444-4444-4444-8444-444444444444';
  v_race_referrer uuid := 'cc111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_race_author_a uuid := 'cc222222-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_race_author_b uuid := 'cc333333-cccc-4ccc-8ccc-ccccccccccc1';
  v_race_author_c uuid := 'cc444444-dddd-4ddd-8ddd-ddddddddddd1';
  v_race_author_d uuid := 'cc555555-eeee-4eee-8eee-eeeeeeeeeee1';
  v_token_a text := repeat('a', 64);
  v_token_b text := repeat('b', 64);
  v_token_c text := repeat('c', 64);
  v_token_d text := repeat('d', 64);
  v_owned_at timestamptz;
  v_attr_at timestamptz;
  v_status text;
  v_snapshot uuid;
  v_live_invitee uuid;
  v_blockers text[];
  v_limit integer;
  v_hook_user uuid := 'd1111111-1111-4111-8111-111111111111';
  v_hook_approve_user uuid := 'd2222222-2222-4222-8222-222222222222';
  v_hook_studio_user uuid := 'd3333333-3333-4333-8333-333333333333';
  v_ttl59_user uuid := 'd4444444-4444-4444-8444-444444444444';
  v_ttl61_user uuid := 'd5555555-5555-4555-8555-555555555555';
  v_touch_user uuid := 'd6666666-6666-4666-8666-666666666666';
  v_miss_user uuid := 'd7777777-7777-4777-8777-777777777777';
  v_hook_author uuid;
  v_create_hook_author uuid;
  v_app_id uuid;
  v_token_touch text := repeat('e', 64);
  v_token_ttl59 text := repeat('f', 64);
  v_token_ttl61 text := repeat('0', 64);
  v_token_miss text := repeat('1', 64);
  v_man_pend_user uuid := 'd8888888-8888-4888-8888-888888888888';
  v_man_bound_user uuid := 'd9999999-9999-4999-8999-999999999999';
  v_man_late_user uuid := 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_token_man_pend text := repeat('7', 64);
  v_token_man_bound text := repeat('8', 64);
  v_token_man_late text := repeat('9', 64);
  v_man_author uuid;
  v_touch_at timestamptz;
  v_own_at timestamptz;
BEGIN
  INSERT INTO auth.users (id) VALUES
    (v_referrer_user), (v_invitee_user), (v_invitee_expired),
    (v_invitee_none), (v_invitee_premium)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id) VALUES
    (v_referrer_user), (v_invitee_user), (v_invitee_expired),
    (v_invitee_none), (v_invitee_premium)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.authors (id, name, slug) VALUES
    (v_referrer_author, 'Sergey', 'sergey-act'),
    (v_activation_author, 'Marina First', 'marina-first'),
    (v_activation_author_2, 'Marina Second', 'marina-second'),
    (v_no_ref_author, 'No Ref', 'noref-act'),
    (v_expired_author, 'Expired', 'expired-act'),
    (v_premium_author, 'Prem', 'prem-act')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_referrer_author, v_referrer_user, 'owner')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.author_referrals (
    referrer_author_id,
    referrer_owner_user_id,
    invitee_user_id,
    code_used,
    code_normalized,
    attributed_at,
    attribution_expires_at,
    status
  ) VALUES (
    v_referrer_author,
    v_referrer_user,
    v_invitee_user,
    'SERGEY',
    public.author_partner_normalize_code('SERGEY'),
    now(),
    now() + interval '60 days',
    'attributed'
  )
  RETURNING id INTO v_referral_id;

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_activation_author, v_invitee_user, 'owner');

  v := public.finalize_author_partner_referral(v_invitee_user, v_activation_author);
  IF coalesce(v->>'result', '') <> 'activated' THEN
    RAISE EXCEPTION 'expected activated, got %', v;
  END IF;
  IF coalesce((v->>'bonus_granted')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'expected bonus_granted true: %', v;
  END IF;

  SELECT
    r.activated_at,
    r.expires_at,
    r.status,
    r.activation_author_id_snapshot,
    r.invitee_author_id
  INTO v_activated_at, v_expires_at, v_status, v_snapshot, v_live_invitee
  FROM public.author_referrals AS r
  WHERE r.id = v_referral_id;

  IF v_status <> 'activated' OR v_activated_at IS NULL OR v_expires_at IS NULL THEN
    RAISE EXCEPTION 'activation fields missing';
  END IF;
  IF v_expires_at <> v_activated_at + interval '3 years' THEN
    RAISE EXCEPTION 'expires_at must be activated_at + 3 years';
  END IF;
  IF v_snapshot IS DISTINCT FROM v_activation_author THEN
    RAISE EXCEPTION 'snapshot mismatch';
  END IF;
  IF v_live_invitee IS DISTINCT FROM v_activation_author THEN
    RAISE EXCEPTION 'live invitee_author_id should be activation author';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.author_referrals
    WHERE id = v_referral_id AND bonus_slot_granted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'bonus_slot_granted_at must be set';
  END IF;

  SELECT p.author_project_slots_partner_bonus INTO v_bonus
  FROM public.profiles AS p WHERE p.id = v_invitee_user;
  IF v_bonus <> 1 THEN
    RAISE EXCEPTION 'partner bonus must be 1, got %', v_bonus;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_invitee_user::text, true);
  v_limit := public.resolve_user_author_project_limit(v_invitee_user);
  IF v_limit <> 2 THEN
    RAISE EXCEPTION 'expected limit 2 after bonus, got %', v_limit;
  END IF;

  v := public.finalize_author_partner_referral(v_invitee_user, v_activation_author);
  IF coalesce(v->>'result', '') <> 'already_activated' THEN
    RAISE EXCEPTION 'expected already_activated, got %', v;
  END IF;

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_activation_author_2, v_invitee_user, 'owner');
  v := public.finalize_author_partner_referral(v_invitee_user, v_activation_author_2);
  IF coalesce(v->>'result', '') <> 'already_activated' THEN
    RAISE EXCEPTION 'second path must be idempotent: %', v;
  END IF;

  SELECT r.activation_author_id_snapshot INTO v_snapshot
  FROM public.author_referrals AS r WHERE r.id = v_referral_id;
  IF v_snapshot IS DISTINCT FROM v_activation_author THEN
    RAISE EXCEPTION 'snapshot must stay first activation author';
  END IF;

  DELETE FROM public.author_members WHERE author_id = v_activation_author;
  v_blockers := public.author_space_delete_blockers(v_activation_author);
  IF 'has_partner_referrals_as_invitee' = ANY (v_blockers) THEN
    RAISE EXCEPTION 'invitee referral must not block empty delete: %', v_blockers;
  END IF;
  DELETE FROM public.authors WHERE id = v_activation_author;

  SELECT
    r.status,
    r.activation_author_id_snapshot,
    r.invitee_author_id
  INTO v_status, v_snapshot, v_live_invitee
  FROM public.author_referrals AS r
  WHERE r.id = v_referral_id;

  IF v_status <> 'activated' OR v_snapshot IS DISTINCT FROM v_activation_author THEN
    RAISE EXCEPTION 'referral/snapshot must survive author delete';
  END IF;
  IF v_live_invitee IS NOT NULL THEN
    RAISE EXCEPTION 'invitee_author_id must SET NULL on author delete';
  END IF;
  SELECT p.author_project_slots_partner_bonus INTO v_bonus
  FROM public.profiles AS p WHERE p.id = v_invitee_user;
  IF v_bonus <> 1 THEN
    RAISE EXCEPTION 'bonus must survive author delete';
  END IF;

  v := public.finalize_author_partner_referral(v_invitee_user, v_activation_author_2);
  IF coalesce(v->>'result', '') <> 'already_activated' THEN
    RAISE EXCEPTION 'replacement finalize must be idempotent: %', v;
  END IF;

  -- Expired attribution
  INSERT INTO public.author_referrals (
    referrer_author_id, referrer_owner_user_id, invitee_user_id,
    code_used, code_normalized, attributed_at, attribution_expires_at, status
  ) VALUES (
    v_referrer_author, v_referrer_user, v_invitee_expired,
    'SERGEY', public.author_partner_normalize_code('SERGEY'),
    now() - interval '70 days', now() - interval '10 days', 'attributed'
  );
  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_expired_author, v_invitee_expired, 'owner');
  v := public.finalize_author_partner_referral(v_invitee_expired, v_expired_author);
  IF coalesce(v->>'result', '') <> 'expired' THEN
    RAISE EXCEPTION 'expected expired, got %', v;
  END IF;
  SELECT r.status, r.activated_at, p.author_project_slots_partner_bonus
  INTO v_status, v_activated_at, v_bonus
  FROM public.author_referrals AS r
  JOIN public.profiles AS p ON p.id = v_invitee_expired
  WHERE r.invitee_user_id = v_invitee_expired;
  IF v_status <> 'expired' OR v_activated_at IS NOT NULL OR v_bonus <> 0 THEN
    RAISE EXCEPTION 'expired path invalid';
  END IF;

  -- No referral
  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_no_ref_author, v_invitee_none, 'owner');
  v := public.finalize_author_partner_referral(v_invitee_none, v_no_ref_author);
  IF coalesce(v->>'result', '') <> 'no_referral' THEN
    RAISE EXCEPTION 'expected no_referral, got %', v;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_invitee_none::text, true);
  IF public.resolve_user_author_project_limit(v_invitee_none) <> 1 THEN
    RAISE EXCEPTION 'no-referral free limit must stay 1';
  END IF;

  -- Premium + purchased + bonus = 3 + 1 + 1 = 5
  INSERT INTO public.author_referrals (
    referrer_author_id, referrer_owner_user_id, invitee_user_id,
    code_used, code_normalized, attributed_at, attribution_expires_at, status
  ) VALUES (
    v_referrer_author, v_referrer_user, v_invitee_premium,
    'SERGEY', public.author_partner_normalize_code('SERGEY'),
    now(), now() + interval '60 days', 'attributed'
  );
  -- Clear JWT so protect trigger allows server-style entitlement writes in smoke.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.profiles
  SET
    author_project_slots_purchased = 1,
    author_premium_enabled = true
  WHERE id = v_invitee_premium;
  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_premium_author, v_invitee_premium, 'owner');
  v := public.finalize_author_partner_referral(v_invitee_premium, v_premium_author);
  IF coalesce(v->>'result', '') <> 'activated' THEN
    RAISE EXCEPTION 'premium path expected activated: %', v;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_invitee_premium::text, true);
  IF public.resolve_user_author_project_limit(v_invitee_premium) <> 5 THEN
    RAISE EXCEPTION 'expected premium+purchased+bonus=5, got %',
      public.resolve_user_author_project_limit(v_invitee_premium);
  END IF;

  -- Client JWT cannot raise partner bonus
  PERFORM set_config('audiolad.trusted_profile_limit_write', '', true);
  PERFORM set_config('request.jwt.claim.sub', v_invitee_none::text, true);
  UPDATE public.profiles
  SET author_project_slots_partner_bonus = 1
  WHERE id = v_invitee_none;
  SELECT p.author_project_slots_partner_bonus INTO v_bonus
  FROM public.profiles AS p WHERE p.id = v_invitee_none;
  IF v_bonus <> 0 THEN
    RAISE EXCEPTION 'client must not raise partner bonus, got %', v_bonus;
  END IF;


  -- =========================================================================
  -- Race A: attribution claimed before ownership → later finalize activates
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_race_claim_first), (v_race_create_first), (v_race_post_owner), (v_race_recon)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_race_claim_first), (v_race_create_first), (v_race_post_owner), (v_race_recon)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.authors (id, name, slug) VALUES
    (v_race_referrer, 'Race Ref', 'race-ref'),
    (v_race_author_a, 'Race A', 'race-a'),
    (v_race_author_b, 'Race B', 'race-b'),
    (v_race_author_c, 'Race C', 'race-c'),
    (v_race_author_d, 'Race D', 'race-d')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_race_referrer, v_referrer_user, 'owner')
  ON CONFLICT DO NOTHING;

  -- Attributions inserted directly (claim path does not require partner profile row).

  -- Cookie attribution for claim-first user (created in the past)
  v_attr_at := now() - interval '2 days';
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_a, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', v_attr_at, now() + interval '60 days'
  );

  PERFORM set_config('request.jwt.claim.sub', v_race_claim_first::text, true);
  v := public.author_partner_claim_attribution(v_token_a, v_race_claim_first);
  IF coalesce(v->>'result', '') <> 'bound' THEN
    RAISE EXCEPTION 'race A claim-first expected bound, got %', v;
  END IF;

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_race_author_a, v_race_claim_first, 'owner');
  v := public.finalize_author_partner_referral(v_race_claim_first, v_race_author_a);
  IF coalesce(v->>'result', '') <> 'activated' THEN
    RAISE EXCEPTION 'race A finalize expected activated, got %', v;
  END IF;
  SELECT p.author_project_slots_partner_bonus INTO v_bonus FROM public.profiles p WHERE p.id = v_race_claim_first;
  IF v_bonus <> 1 THEN
    RAISE EXCEPTION 'race A bonus expected 1, got %', v_bonus;
  END IF;

  -- =========================================================================
  -- Race B: ownership first, then claim of pre-ownership cookie → activate
  -- =========================================================================
  v_attr_at := now() - interval '3 days';
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_b, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', v_attr_at, now() + interval '60 days'
  );

  -- Ownership created AFTER cookie
  INSERT INTO public.author_members (author_id, user_id, role, created_at) VALUES
    (v_race_author_b, v_race_create_first, 'owner', now() - interval '1 day');

  PERFORM set_config('request.jwt.claim.sub', v_race_create_first::text, true);
  v := public.author_partner_claim_attribution(v_token_b, v_race_create_first);
  IF coalesce(v->>'result', '') NOT IN ('bound_and_activated', 'preserved_first_touch_activated', 'already_bound_activated') THEN
    RAISE EXCEPTION 'race B create-then-claim expected activate path, got %', v;
  END IF;
  SELECT r.status, p.author_project_slots_partner_bonus
  INTO v_status, v_bonus
  FROM public.profiles p
  LEFT JOIN public.author_referrals r ON r.invitee_user_id = p.id
  WHERE p.id = v_race_create_first;
  IF v_status <> 'activated' OR v_bonus <> 1 THEN
    RAISE EXCEPTION 'race B expected activated+bonus1, status=% bonus=%', v_status, v_bonus;
  END IF;

  -- =========================================================================
  -- Post-ownership invite/cookie → already_author, no referral/bonus
  -- =========================================================================
  INSERT INTO public.author_members (author_id, user_id, role, created_at) VALUES
    (v_race_author_c, v_race_post_owner, 'owner', now() - interval '5 days');
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_c, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', now() - interval '1 hour', now() + interval '60 days'
  );
  PERFORM set_config('request.jwt.claim.sub', v_race_post_owner::text, true);
  v := public.author_partner_claim_attribution(v_token_c, v_race_post_owner);
  IF coalesce(v->>'result', '') <> 'already_author' THEN
    RAISE EXCEPTION 'post-ownership claim expected already_author, got %', v;
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_referrals r WHERE r.invitee_user_id = v_race_post_owner) THEN
    RAISE EXCEPTION 'post-ownership must not create referral';
  END IF;
  SELECT p.author_project_slots_partner_bonus INTO v_bonus FROM public.profiles p WHERE p.id = v_race_post_owner;
  IF v_bonus <> 0 THEN
    RAISE EXCEPTION 'post-ownership must not grant bonus';
  END IF;

  -- Manual bind after ownership also already_author
  v := public.author_partner_bind_manual_code('RACEREF', v_race_post_owner, NULL);
  IF coalesce(v->>'result', '') <> 'already_author' THEN
    RAISE EXCEPTION 'post-ownership manual bind expected already_author, got %', v;
  END IF;

  -- =========================================================================
  -- Reconciliation shape: attributed row with historical ownership timestamp
  -- =========================================================================
  v_owned_at := now() - interval '10 days';
  INSERT INTO public.author_referrals (
    referrer_author_id, referrer_owner_user_id, invitee_user_id,
    code_used, code_normalized, attributed_at, attribution_expires_at, status, created_at
  ) VALUES (
    v_race_referrer, v_referrer_user, v_race_recon,
    'RACEREF', public.author_partner_normalize_code('RACEREF'),
    v_owned_at - interval '1 day', now() + interval '30 days', 'attributed',
    v_owned_at - interval '1 day'
  );
  INSERT INTO public.author_members (author_id, user_id, role, created_at) VALUES
    (v_race_author_d, v_race_recon, 'owner', v_owned_at);
  v := public.finalize_author_partner_referral(v_race_recon, v_race_author_d, v_owned_at);
  IF coalesce(v->>'result', '') <> 'activated' THEN
    RAISE EXCEPTION 'recon finalize expected activated, got %', v;
  END IF;
  SELECT r.activated_at, p.author_project_slots_partner_bonus
  INTO v_activated_at, v_bonus
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_race_recon;
  IF v_activated_at IS DISTINCT FROM v_owned_at OR v_bonus <> 1 THEN
    RAISE EXCEPTION 'recon expected historical activated_at and bonus1';
  END IF;
  -- Idempotent second call
  v := public.finalize_author_partner_referral(v_race_recon, v_race_author_d, v_owned_at);
  IF coalesce(v->>'result', '') <> 'already_activated' THEN
    RAISE EXCEPTION 'recon idempotent expected already_activated, got %', v;
  END IF;

  -- =========================================================================
  -- Delete activation workspace: snapshot remains, bonus remains, no invitee blocker
  -- =========================================================================
  v_blockers := public.author_space_delete_blockers(v_race_author_d);
  IF 'has_partner_referrals_as_invitee' = ANY (v_blockers) THEN
    RAISE EXCEPTION 'invitee activation workspace must not block delete, got %', v_blockers;
  END IF;
  -- Referrer still blocks
  v_blockers := public.author_space_delete_blockers(v_race_referrer);
  IF NOT ('has_partner_referrals_as_referrer' = ANY (v_blockers)) THEN
    RAISE EXCEPTION 'referrer must block delete, got %', v_blockers;
  END IF;



  UPDATE auth.users SET email = id::text || '@test.local' WHERE email IS NULL;

  -- =========================================================================
  -- Seed resolvable invite code for race referrer (touch/bind resolve path)
  PERFORM set_config('request.jwt.claim.sub', v_referrer_user::text, true);
  PERFORM public.ensure_author_partner_profile(v_race_referrer);
  PERFORM public.change_author_partner_code(v_race_referrer, 'RACEREF');

  -- Authenticated touch recovery: pending cookie → become author → /invite again
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_touch_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_touch_user) ON CONFLICT DO NOTHING;

  v_touch_at := now() - interval '2 days';
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_touch, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', v_touch_at, v_touch_at + interval '60 days'
  );

  -- User becomes author (ownership) with pending cookie still present
  INSERT INTO public.authors (id, name, slug)
  VALUES ('dd666666-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'Touch Author', 'touch-author')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role, created_at)
  VALUES ('dd666666-aaaa-4aaa-8aaa-aaaaaaaaaaa6', v_touch_user, 'owner', now() - interval '1 day');

  PERFORM set_config('request.jwt.claim.sub', v_touch_user::text, true);
  v := public.author_partner_touch_invite('RACEREF', v_token_touch, v_touch_user);
  IF coalesce(v->>'result', '') NOT IN (
    'bound_and_activated', 'preserved_first_touch_activated', 'already_bound_activated'
  ) THEN
    RAISE EXCEPTION 'authenticated touch recovery expected activate path, got %', v;
  END IF;
  SELECT r.status, p.author_project_slots_partner_bonus
  INTO v_status, v_bonus
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_touch_user;
  IF v_status <> 'activated' OR v_bonus <> 1 THEN
    RAISE EXCEPTION 'touch recovery expected activated+bonus1, status=% bonus=%', v_status, v_bonus;
  END IF;

  -- =========================================================================
  -- 60d window: touch day0, ownership day59, recovery day61 → ACTIVATED
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_ttl59_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_ttl59_user) ON CONFLICT DO NOTHING;
  v_touch_at := now() - interval '61 days';
  v_own_at := v_touch_at + interval '59 days';
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_ttl59, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', v_touch_at, v_touch_at + interval '60 days'
  );
  INSERT INTO public.authors (id, name, slug)
  VALUES ('dd444444-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'TTL59', 'ttl59-author')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role, created_at)
  VALUES ('dd444444-aaaa-4aaa-8aaa-aaaaaaaaaaa4', v_ttl59_user, 'owner', v_own_at);

  PERFORM set_config('request.jwt.claim.sub', v_ttl59_user::text, true);
  v := public.author_partner_claim_attribution(v_token_ttl59, v_ttl59_user);
  IF coalesce(v->>'result', '') NOT IN ('bound_and_activated', 'preserved_first_touch_activated', 'already_bound_activated') THEN
    RAISE EXCEPTION 'day59 ownership / day61 claim expected activate, got %', v;
  END IF;
  SELECT r.activated_at, p.author_project_slots_partner_bonus
  INTO v_activated_at, v_bonus
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_ttl59_user;
  IF v_activated_at IS DISTINCT FROM v_own_at OR v_bonus <> 1 THEN
    RAISE EXCEPTION 'day59 path expected activated_at=ownership and bonus1';
  END IF;
  IF v_activated_at + interval '3 years' IS DISTINCT FROM (
    SELECT expires_at FROM public.author_referrals WHERE invitee_user_id = v_ttl59_user
  ) THEN
    RAISE EXCEPTION 'day59 expires_at must be ownership+3y';
  END IF;

  -- =========================================================================
  -- 60d window: touch day0, ownership day61 → NOT activated
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_ttl61_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_ttl61_user) ON CONFLICT DO NOTHING;
  v_touch_at := now() - interval '70 days';
  v_own_at := v_touch_at + interval '61 days';
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_ttl61, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', v_touch_at, v_touch_at + interval '60 days'
  );
  INSERT INTO public.authors (id, name, slug)
  VALUES ('dd555555-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'TTL61', 'ttl61-author')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role, created_at)
  VALUES ('dd555555-aaaa-4aaa-8aaa-aaaaaaaaaaa5', v_ttl61_user, 'owner', v_own_at);

  PERFORM set_config('request.jwt.claim.sub', v_ttl61_user::text, true);
  v := public.author_partner_claim_attribution(v_token_ttl61, v_ttl61_user);
  IF coalesce(v->>'ok', 'true') = 'true' AND coalesce(v->>'result', '') IN (
    'bound_and_activated', 'preserved_first_touch_activated', 'already_bound_activated', 'bound', 'activated'
  ) THEN
    RAISE EXCEPTION 'day61 ownership must NOT activate, got %', v;
  END IF;
  SELECT coalesce(p.author_project_slots_partner_bonus, 0) INTO v_bonus
  FROM public.profiles p WHERE p.id = v_ttl61_user;
  IF v_bonus <> 0 THEN
    RAISE EXCEPTION 'day61 ownership must leave bonus=0, got %', v_bonus;
  END IF;


  -- =========================================================================
  -- Manual bind TTL A: pending day0, owner day59, recovery day61 → ACTIVATED
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_man_pend_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_man_pend_user) ON CONFLICT DO NOTHING;
  v_touch_at := now() - interval '61 days';
  v_own_at := v_touch_at + interval '59 days';
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_man_pend, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', v_touch_at, v_touch_at + interval '60 days'
  );
  INSERT INTO public.authors (id, name, slug)
  VALUES ('dd888888-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 'ManPend', 'man-pend-author')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role, created_at)
  VALUES ('dd888888-aaaa-4aaa-8aaa-aaaaaaaaaaa8', v_man_pend_user, 'owner', v_own_at);
  PERFORM set_config('request.jwt.claim.sub', v_man_pend_user::text, true);
  v := public.author_partner_bind_manual_code('RACEREF', v_man_pend_user, v_token_man_pend);
  IF coalesce(v->>'result', '') NOT IN (
    'bound_and_activated', 'preserved_first_touch_activated', 'already_bound_activated'
  ) AND coalesce(v->'finalize'->>'result', '') NOT IN ('activated', 'already_activated') THEN
    RAISE EXCEPTION 'manual pending day59/day61 expected activate, got %', v;
  END IF;
  SELECT r.status, p.author_project_slots_partner_bonus, r.activated_at
  INTO v_status, v_bonus, v_activated_at
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_man_pend_user;
  IF v_status <> 'activated' OR v_bonus <> 1 OR v_activated_at IS DISTINCT FROM v_own_at THEN
    RAISE EXCEPTION 'manual pending recovery expected activated+bonus1+owned_at';
  END IF;

  -- =========================================================================
  -- Manual bind TTL B: bound referral day0, owner day59, recovery day61
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_man_bound_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_man_bound_user) ON CONFLICT DO NOTHING;
  -- Claim while wall-clock window still open (no ownership yet).
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_man_bound, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', now() - interval '2 days', now() + interval '58 days'
  );
  PERFORM set_config('request.jwt.claim.sub', v_man_bound_user::text, true);
  v := public.author_partner_claim_attribution(v_token_man_bound, v_man_bound_user);
  IF coalesce(v->>'result', '') <> 'bound' THEN
    RAISE EXCEPTION 'manual bound prep expected bound, got %', v;
  END IF;
  -- Backdate to day0 touch / day60 expiry; ownership at day59; recovery is "now"=day61.
  v_touch_at := now() - interval '61 days';
  v_own_at := v_touch_at + interval '59 days';
  UPDATE public.author_partner_attributions
  SET created_at = v_touch_at, expires_at = v_touch_at + interval '60 days'
  WHERE token_hash = v_token_man_bound;
  UPDATE public.author_referrals
  SET created_at = v_touch_at,
      attributed_at = v_touch_at,
      attribution_expires_at = v_touch_at + interval '60 days'
  WHERE invitee_user_id = v_man_bound_user;
  INSERT INTO public.authors (id, name, slug)
  VALUES ('dd999999-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'ManBound', 'man-bound-author')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role, created_at)
  VALUES ('dd999999-aaaa-4aaa-8aaa-aaaaaaaaaaa9', v_man_bound_user, 'owner', v_own_at);
  -- Late recovery via manual bind with bound cookie (wall-clock past expires_at)
  v := public.author_partner_bind_manual_code('RACEREF', v_man_bound_user, v_token_man_bound);
  IF coalesce(v->>'result', '') NOT IN (
    'preserved_first_touch_activated', 'bound_and_activated', 'already_bound_activated'
  ) AND coalesce(v->'finalize'->>'result', '') NOT IN ('activated', 'already_activated') THEN
    RAISE EXCEPTION 'manual bound day59/day61 expected activate, got %', v;
  END IF;
  SELECT r.status, p.author_project_slots_partner_bonus, r.activated_at
  INTO v_status, v_bonus, v_activated_at
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_man_bound_user;
  IF v_status <> 'activated' OR v_bonus <> 1 OR v_activated_at IS DISTINCT FROM v_own_at THEN
    RAISE EXCEPTION 'manual bound recovery expected activated+bonus1+owned_at';
  END IF;

  -- =========================================================================
  -- Manual bind TTL C: touch day0, owner day61, recovery day62 → NOT activated
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_man_late_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_man_late_user) ON CONFLICT DO NOTHING;
  v_touch_at := now() - interval '62 days';
  v_own_at := v_touch_at + interval '61 days';
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    v_token_man_late, v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', v_touch_at, v_touch_at + interval '60 days'
  );
  INSERT INTO public.authors (id, name, slug)
  VALUES ('ddaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ManLate', 'man-late-author')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role, created_at)
  VALUES ('ddaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_man_late_user, 'owner', v_own_at);
  PERFORM set_config('request.jwt.claim.sub', v_man_late_user::text, true);
  v := public.author_partner_bind_manual_code('RACEREF', v_man_late_user, v_token_man_late);
  IF coalesce(v->>'result', '') IN (
    'bound_and_activated', 'preserved_first_touch_activated', 'already_bound_activated', 'bound', 'activated'
  ) OR coalesce(v->'finalize'->>'result', '') = 'activated' THEN
    RAISE EXCEPTION 'manual late day61 ownership must NOT activate, got %', v;
  END IF;
  IF NOT (
    (coalesce(v->>'ok', 'true') = 'false' AND coalesce(v->>'error', '') IN ('attribution_expired', 'expired'))
    OR coalesce(v->>'result', '') IN ('already_author', 'expired')
  ) THEN
    RAISE EXCEPTION 'manual late expected already_author/expired, got %', v;
  END IF;
  SELECT coalesce(p.author_project_slots_partner_bonus, 0),
         coalesce((SELECT r.status FROM public.author_referrals r WHERE r.invitee_user_id = v_man_late_user), 'none')
  INTO v_bonus, v_status
  FROM public.profiles p WHERE p.id = v_man_late_user;
  IF v_bonus <> 0 THEN
    RAISE EXCEPTION 'manual late must leave bonus=0, got %', v_bonus;
  END IF;
  IF v_status = 'activated' THEN
    RAISE EXCEPTION 'manual late must not activate referral';
  END IF;

  -- =========================================================================
  -- Real hook: create_author_project
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_hook_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_hook_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    repeat('2', 64), v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', now() - interval '1 day', now() + interval '50 days'
  );
  PERFORM set_config('request.jwt.claim.sub', v_hook_user::text, true);
  v := public.author_partner_claim_attribution(repeat('2', 64), v_hook_user);
  IF coalesce(v->>'result', '') NOT IN ('bound', 'bound_and_activated') THEN
    -- may already be author-less bound
    IF coalesce(v->>'ok', 'false') <> 'true' THEN
      RAISE EXCEPTION 'hook prep claim failed: %', v;
    END IF;
  END IF;
  v := public.create_author_project('Hook Project', NULL, NULL);
  IF coalesce(v->>'ok', 'false') <> 'true' AND v->>'author_id' IS NULL THEN
    -- create_author_project may return author id directly as jsonb
    NULL;
  END IF;
  -- Accept either jsonb with author_id or ok
  SELECT am.author_id INTO v_hook_author
  FROM public.author_members am
  WHERE am.user_id = v_hook_user AND am.role = 'owner'
  ORDER BY am.created_at ASC
  LIMIT 1;
  IF v_hook_author IS NULL THEN
    RAISE EXCEPTION 'create_author_project did not create owner membership: %', v;
  END IF;
  SELECT r.status, r.activation_author_id_snapshot, p.author_project_slots_partner_bonus,
         public.resolve_user_author_project_limit(v_hook_user)
  INTO v_status, v_snapshot, v_bonus, v_limit
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_hook_user;
  IF v_status <> 'activated' OR v_bonus <> 1 OR v_snapshot IS DISTINCT FROM v_hook_author THEN
    RAISE EXCEPTION 'create_author_project hook activation failed status=% bonus=% snap=%', v_status, v_bonus, v_snapshot;
  END IF;
  IF v_limit < 2 THEN
    RAISE EXCEPTION 'expected free limit used path limit>=2 (base1+bonus1), got %', v_limit;
  END IF;
  v_create_hook_author := v_hook_author;


  -- =========================================================================
  -- Real hook: approve_author_application (+ idempotent re-approve)
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_hook_approve_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_hook_approve_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    repeat('3', 64), v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', now() - interval '1 day', now() + interval '50 days'
  );
  PERFORM set_config('request.jwt.claim.sub', v_hook_approve_user::text, true);
  v := public.author_partner_claim_attribution(repeat('3', 64), v_hook_approve_user);
  INSERT INTO public.author_applications (user_id, display_name, status)
  VALUES (v_hook_approve_user, 'Approve Hook', 'submitted')
  RETURNING id INTO v_app_id;
  -- staff actor
  PERFORM set_config('request.jwt.claim.sub', v_referrer_user::text, true);
  v := public.approve_author_application(v_app_id, 'ok');
  SELECT am.author_id INTO v_hook_author
  FROM public.author_members am
  WHERE am.user_id = v_hook_approve_user AND am.role = 'owner'
  LIMIT 1;
  IF v_hook_author IS NULL THEN
    RAISE EXCEPTION 'approve_author_application did not create author: %', v;
  END IF;
  SELECT r.status, r.activated_at, r.activation_author_id_snapshot, p.author_project_slots_partner_bonus
  INTO v_status, v_activated_at, v_snapshot, v_bonus
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_hook_approve_user;
  IF v_status <> 'activated' OR v_bonus <> 1 OR v_snapshot IS DISTINCT FROM v_hook_author THEN
    RAISE EXCEPTION 'approve hook activation failed';
  END IF;
  -- idempotent second approve
  v := public.approve_author_application(v_app_id, 'again');
  IF (
    SELECT author_project_slots_partner_bonus FROM public.profiles WHERE id = v_hook_approve_user
  ) <> 1 THEN
    RAISE EXCEPTION 'second approve must not change bonus';
  END IF;
  IF (
    SELECT activated_at FROM public.author_referrals WHERE invitee_user_id = v_hook_approve_user
  ) IS DISTINCT FROM v_activated_at THEN
    RAISE EXCEPTION 'second approve must not change activated_at';
  END IF;

  -- =========================================================================
  -- Real hook: provision_studio_author_workspace
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_hook_studio_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id) VALUES (v_hook_studio_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.author_partner_attributions (
    token_hash, referrer_author_id, code_used, code_normalized, source, status, created_at, expires_at
  ) VALUES (
    repeat('4', 64), v_race_referrer, 'RACEREF', public.author_partner_normalize_code('RACEREF'),
    'invite_link', 'pending', now() - interval '1 day', now() + interval '50 days'
  );
  PERFORM set_config('request.jwt.claim.sub', v_hook_studio_user::text, true);
  PERFORM public.author_partner_claim_attribution(repeat('4', 64), v_hook_studio_user);
  PERFORM set_config('request.jwt.claim.sub', v_referrer_user::text, true);
  v := public.provision_studio_author_workspace('Studio Hook', 'studio-hook-ws', v_hook_studio_user);
  SELECT am.author_id INTO v_hook_author
  FROM public.author_members am
  WHERE am.user_id = v_hook_studio_user AND am.role = 'owner'
  LIMIT 1;
  IF v_hook_author IS NULL THEN
    RAISE EXCEPTION 'studio provision did not create owner: %', v;
  END IF;
  SELECT r.status, p.author_project_slots_partner_bonus, r.activation_author_id_snapshot
  INTO v_status, v_bonus, v_snapshot
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_hook_studio_user;
  IF v_status <> 'activated' OR v_bonus <> 1 OR v_snapshot IS DISTINCT FROM v_hook_author THEN
    RAISE EXCEPTION 'studio hook activation failed';
  END IF;

  -- =========================================================================
  -- Profile missing → rollback (no activation stamps)
  -- =========================================================================
  INSERT INTO auth.users (id) VALUES (v_miss_user) ON CONFLICT DO NOTHING;
  -- deliberately NO profiles row
  INSERT INTO public.authors (id, name, slug)
  VALUES ('dd777777-aaaa-4aaa-8aaa-aaaaaaaaaaa7', 'Miss', 'miss-author')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES ('dd777777-aaaa-4aaa-8aaa-aaaaaaaaaaa7', v_miss_user, 'owner');
  INSERT INTO public.author_referrals (
    referrer_author_id, referrer_owner_user_id, invitee_user_id,
    code_used, code_normalized, attributed_at, attribution_expires_at, status
  ) VALUES (
    v_race_referrer, v_referrer_user, v_miss_user,
    'RACEREF', public.author_partner_normalize_code('RACEREF'),
    now() - interval '1 day', now() + interval '30 days', 'attributed'
  );
  BEGIN
    PERFORM public.finalize_author_partner_referral(
      v_miss_user, 'dd777777-aaaa-4aaa-8aaa-aaaaaaaaaaa7'::uuid
    );
    RAISE EXCEPTION 'expected profile-missing raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%bonus_profile_missing%' AND SQLERRM NOT ILIKE '%profile_missing%' AND SQLERRM NOT ILIKE '%author_partner_bonus%' THEN
        RAISE EXCEPTION 'expected profile missing error, got %', SQLERRM;
      END IF;
  END;
  SELECT r.status, r.activated_at, r.expires_at, r.bonus_slot_granted_at
  INTO v_status, v_activated_at, v_expires_at, v_owned_at
  FROM public.author_referrals r WHERE r.invitee_user_id = v_miss_user;
  IF v_status <> 'attributed' OR v_activated_at IS NOT NULL OR v_expires_at IS NOT NULL OR v_owned_at IS NOT NULL THEN
    RAISE EXCEPTION 'profile-missing must leave attributed with null stamps';
  END IF;

  -- =========================================================================
  -- Delete activation workspace + replacement: no second bonus
  -- =========================================================================
  -- Use create-hook author: delete empty workspace (studio overwrote v_hook_author)
  DELETE FROM public.author_members WHERE author_id = v_create_hook_author AND user_id = v_hook_user;
  DELETE FROM public.authors WHERE id = v_create_hook_author;
  SELECT r.status, r.activation_author_id_snapshot, r.invitee_author_id, p.author_project_slots_partner_bonus,
         r.activated_at
  INTO v_status, v_snapshot, v_live_invitee, v_bonus, v_activated_at
  FROM public.author_referrals r
  JOIN public.profiles p ON p.id = r.invitee_user_id
  WHERE r.invitee_user_id = v_hook_user;
  IF v_status <> 'activated' OR v_bonus <> 1 OR v_snapshot IS NULL THEN
    RAISE EXCEPTION 'after delete referral must stay activated with snapshot';
  END IF;
  IF v_live_invitee IS NOT NULL THEN
    RAISE EXCEPTION 'invitee_author_id should be NULL after SET NULL delete';
  END IF;
  -- replacement project must not re-grant bonus / restart activation
  PERFORM set_config('request.jwt.claim.sub', v_hook_user::text, true);
  v := public.create_author_project('Replacement', NULL, NULL);
  IF (
    SELECT author_project_slots_partner_bonus FROM public.profiles WHERE id = v_hook_user
  ) <> 1 THEN
    RAISE EXCEPTION 'replacement must keep bonus=1';
  END IF;
  IF (
    SELECT activated_at FROM public.author_referrals WHERE invitee_user_id = v_hook_user
  ) IS DISTINCT FROM v_activated_at THEN
    RAISE EXCEPTION 'replacement must not restart activated_at';
  END IF;


  RAISE NOTICE 'author_partner_activation_smoke_ok';
END;
$$;
