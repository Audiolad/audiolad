-- Isolated Phase 5 smoke. Never apply to production.

DO $$
DECLARE
  author_user uuid := '33333333-3333-4333-8333-333333333333';
  buyer_a uuid := '44444444-4444-4444-8444-444444444444';
  buyer_b uuid := '55555555-5555-4555-8555-555555555555';
  buyer_c uuid := '66666666-6666-4666-8666-666666666666';
  ordinary_id uuid := 'c1111111-1111-4111-8111-111111111111';
  course_id uuid := 'c2222222-2222-4222-8222-222222222222';
  tok_l1 text := 'ordinaryL1Token00000000000000000000000001';
  tok_l2 text := 'courseL2Token0000000000000000000000000002';
  tok_l2b text := 'courseL2Token0000000000000000000000000003';
  tok_l2c text := 'courseL2Token0000000000000000000000000004';
  tok_revoked text := 'revokedToken00000000000000000000000000005';
  tok_expired text := 'expiredToken00000000000000000000000000006';
  tok_retry text := 'retrySameUserToken00000000000000000000007';
  tok_preview text := 'previewNoConsumeToken00000000000000000008';
  hash_l1 text;
  hash_l2 text;
  hash_l2b text;
  hash_l2c text;
  hash_revoked text;
  hash_expired text;
  hash_retry text;
  hash_preview text;
  preview jsonb;
  grant_row jsonb;
  v_level integer;
  v_source text;
  v_status text;
  v_count integer;
  v_raw_in_db integer;
  v_order_count integer;
BEGIN
  INSERT INTO auth.users (id) VALUES
    (buyer_a),
    (buyer_b),
    (buyer_c)
  ON CONFLICT DO NOTHING;

  UPDATE public.practices
  SET price = 3333
  WHERE id = course_id;

  INSERT INTO public.practice_access_levels (
    practice_id, level, title, description, upgrade_price, currency
  ) VALUES
    (course_id, 1, 'Работа с собой', 'Базовый уровень', NULL, 'RUB'),
    (course_id, 2, 'Работа с другими людьми', 'Второй уровень', 2222, 'RUB')
  ON CONFLICT (practice_id, level) DO UPDATE
  SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    upgrade_price = EXCLUDED.upgrade_price;

  hash_l1 := encode(digest(tok_l1, 'sha256'), 'hex');
  hash_l2 := encode(digest(tok_l2, 'sha256'), 'hex');
  hash_l2b := encode(digest(tok_l2b, 'sha256'), 'hex');
  hash_l2c := encode(digest(tok_l2c, 'sha256'), 'hex');
  hash_revoked := encode(digest(tok_revoked, 'sha256'), 'hex');
  hash_expired := encode(digest(tok_expired, 'sha256'), 'hex');
  hash_retry := encode(digest(tok_retry, 'sha256'), 'hex');
  hash_preview := encode(digest(tok_preview, 'sha256'), 'hex');

  -- 1. Raw token never stored; hash unique
  PERFORM public.create_practice_access_link(
    ordinary_id, 1, hash_l1, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  PERFORM public.create_practice_access_link(
    course_id, 2, hash_l2, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  PERFORM public.create_practice_access_link(
    course_id, 2, hash_l2b, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  PERFORM public.create_practice_access_link(
    course_id, 2, hash_l2c, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  PERFORM public.create_practice_access_link(
    course_id, 2, hash_revoked, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  PERFORM public.create_practice_access_link(
    course_id, 2, hash_expired, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    now() - interval '1 minute'
  );
  PERFORM public.create_practice_access_link(
    course_id, 2, hash_retry, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  PERFORM public.create_practice_access_link(
    course_id, 2, hash_preview, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

  SELECT count(*) INTO v_raw_in_db
  FROM public.practice_access_links
  WHERE token_hash IN (tok_l1, tok_l2, tok_preview);

  IF v_raw_in_db <> 0 THEN
    RAISE EXCEPTION 'raw token leaked into token_hash';
  END IF;

  BEGIN
    PERFORM public.create_practice_access_link(
      ordinary_id, 1, hash_l1, author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    RAISE EXCEPTION 'duplicate hash must fail';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  -- 2. Invalid / revoked / expired
  BEGIN
    PERFORM public.preview_practice_access_link(repeat('0', 64));
    RAISE EXCEPTION 'invalid token should fail preview';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%invalid_token%' THEN
        RAISE EXCEPTION 'expected invalid_token, got %', SQLERRM;
      END IF;
  END;

  PERFORM public.revoke_practice_access_link(
    (SELECT id FROM public.practice_access_links WHERE token_hash = hash_revoked),
    author_user
  );

  BEGIN
    PERFORM public.redeem_practice_access_link(hash_revoked, buyer_a);
    RAISE EXCEPTION 'revoked link must not redeem';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%link_revoked%' THEN
        RAISE EXCEPTION 'expected link_revoked, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.redeem_practice_access_link(hash_expired, buyer_a);
    RAISE EXCEPTION 'expired link must not redeem';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%link_expired%' THEN
        RAISE EXCEPTION 'expected link_expired, got %', SQLERRM;
      END IF;
  END;

  -- 3. GET/preview does not consume
  preview := public.preview_practice_access_link(hash_preview, NULL);
  IF preview ->> 'status' IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'preview must stay active, got %', preview;
  END IF;
  SELECT status INTO v_status
  FROM public.practice_access_links
  WHERE token_hash = hash_preview;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'preview consumed the link';
  END IF;
  IF preview ? 'token_hash' OR preview ? 'redeemed_by_user_id' THEN
    RAISE EXCEPTION 'preview leaked secrets: %', preview;
  END IF;

  -- 4. Arbitrary target rejected
  BEGIN
    PERFORM public.create_practice_access_link(
      ordinary_id, 999, encode(digest('badTarget00000000000000000000000000009', 'sha256'), 'hex'),
      author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    RAISE EXCEPTION 'ordinary target 999 must fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%access_level_not_available%'
         AND SQLERRM NOT LIKE '%target_level_not_configured%' THEN
        RAISE EXCEPTION 'expected target reject, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.create_practice_access_link(
      course_id, 999, encode(digest('badCourse99900000000000000000000000010', 'sha256'), 'hex'),
      author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    RAISE EXCEPTION 'course target 999 must fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%target_level_not_configured%' THEN
        RAISE EXCEPTION 'expected target_level_not_configured, got %', SQLERRM;
      END IF;
  END;

  -- 5. A: no entitlement + L1
  grant_row := public.redeem_practice_access_link(hash_l1, buyer_a);
  SELECT access_level, access_source INTO v_level, v_source
  FROM public.user_practices
  WHERE user_id = buyer_a AND practice_id = ordinary_id;
  IF v_level IS DISTINCT FROM 1 OR v_source IS DISTINCT FROM 'external_manual' THEN
    RAISE EXCEPTION 'A: expected L1/external_manual, got % %', v_level, v_source;
  END IF;
  IF coalesce((grant_row -> 'grant' ->> 'inserted')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A: expected insert';
  END IF;

  -- 6. B: no entitlement + L2
  grant_row := public.redeem_practice_access_link(hash_l2, buyer_b);
  SELECT access_level, access_source INTO v_level, v_source
  FROM public.user_practices
  WHERE user_id = buyer_b AND practice_id = course_id;
  IF v_level IS DISTINCT FROM 2 OR v_source IS DISTINCT FROM 'external_manual' THEN
    RAISE EXCEPTION 'B: expected L2/external_manual, got % %', v_level, v_source;
  END IF;

  -- 7. C: existing L1 + L2 raise
  PERFORM public.grant_practice_access(buyer_c, course_id, 1, 'purchase');
  grant_row := public.redeem_practice_access_link(hash_l2b, buyer_c);
  SELECT access_level, access_source INTO v_level, v_source
  FROM public.user_practices
  WHERE user_id = buyer_c AND practice_id = course_id;
  IF v_level IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'C: expected raise to L2, got %', v_level;
  END IF;
  IF coalesce((grant_row -> 'grant' ->> 'raised')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'C: expected raised=true';
  END IF;

  -- 8. D: existing L2 + L2, no raise, link redeemed
  PERFORM public.create_practice_access_link(
    course_id, 2,
    encode(digest('alreadyL2Token00000000000000000000000011', 'sha256'), 'hex'),
    author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  grant_row := public.redeem_practice_access_link(
    encode(digest('alreadyL2Token00000000000000000000000011', 'sha256'), 'hex'),
    buyer_b
  );
  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer_b AND practice_id = course_id;
  IF v_level IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'D: must stay L2, got %', v_level;
  END IF;
  IF coalesce((grant_row -> 'grant' ->> 'raised')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'D: expected raised=false';
  END IF;

  -- 9. E: existing L3 + L2 stay L3
  PERFORM public.grant_practice_access(buyer_a, course_id, 3, 'admin');
  PERFORM public.create_practice_access_link(
    course_id, 2,
    encode(digest('l3keepToken0000000000000000000000000012', 'sha256'), 'hex'),
    author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  grant_row := public.redeem_practice_access_link(
    encode(digest('l3keepToken0000000000000000000000000012', 'sha256'), 'hex'),
    buyer_a
  );
  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer_a AND practice_id = course_id;
  IF v_level IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'E: must stay L3, got %', v_level;
  END IF;

  -- 10. F: expired entitlement follows grant_practice_access
  INSERT INTO public.user_practices (
    user_id, practice_id, access_source, access_level, expires_at
  ) VALUES (
    buyer_c, ordinary_id, 'purchase', 1, now() - interval '1 day'
  )
  ON CONFLICT (user_id, practice_id) DO UPDATE
  SET expires_at = now() - interval '1 day', access_level = 1;

  PERFORM public.create_practice_access_link(
    ordinary_id, 1,
    encode(digest('expiredEntitlementTok000000000000000013', 'sha256'), 'hex'),
    author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  PERFORM public.redeem_practice_access_link(
    encode(digest('expiredEntitlementTok000000000000000013', 'sha256'), 'hex'),
    buyer_c
  );
  SELECT access_level INTO v_level
  FROM public.user_practices
  WHERE user_id = buyer_c AND practice_id = ordinary_id;
  IF v_level IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F: grant must keep/set L1, got %', v_level;
  END IF;

  -- 11. Same user retry → already_redeemed_by_you
  PERFORM public.redeem_practice_access_link(hash_retry, buyer_b);
  BEGIN
    PERFORM public.redeem_practice_access_link(hash_retry, buyer_b);
    RAISE EXCEPTION 'same-user retry must be already_redeemed_by_you';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%already_redeemed_by_you%' THEN
        RAISE EXCEPTION 'expected already_redeemed_by_you, got %', SQLERRM;
      END IF;
  END;

  -- 12. Other user after redemption
  BEGIN
    PERFORM public.redeem_practice_access_link(hash_retry, buyer_c);
    RAISE EXCEPTION 'other user must see link_already_used';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%link_already_used%' THEN
        RAISE EXCEPTION 'expected link_already_used, got %', SQLERRM;
      END IF;
  END;

  -- 13. Level deleted before redeem → target_level_not_configured
  INSERT INTO public.practice_access_levels (
    practice_id, level, title, description, upgrade_price, currency
  ) VALUES (
    course_id, 3, 'Временный', NULL, 1000, 'RUB'
  );
  PERFORM public.create_practice_access_link(
    course_id, 3,
    encode(digest('deletedLevelToken0000000000000000000014', 'sha256'), 'hex'),
    author_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  DELETE FROM public.practice_access_levels
  WHERE practice_id = course_id AND level = 3;
  BEGIN
    PERFORM public.redeem_practice_access_link(
      encode(digest('deletedLevelToken0000000000000000000014', 'sha256'), 'hex'),
      buyer_c
    );
    RAISE EXCEPTION 'deleted target must fail redeem';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%target_level_not_configured%'
         AND SQLERRM NOT LIKE '%access_level_not_configured%' THEN
        RAISE EXCEPTION 'expected target_level_not_configured, got %', SQLERRM;
      END IF;
  END;

  SELECT count(*) INTO v_status
  FROM public.practice_access_links
  WHERE token_hash = encode(digest('deletedLevelToken0000000000000000000014', 'sha256'), 'hex')
    AND status = 'active';
  IF v_status <> 1 THEN
    RAISE EXCEPTION 'failed redeem must not consume the link';
  END IF;

  -- 14. External link is not a sale
  SELECT count(*) INTO v_order_count FROM public.orders;
  IF v_order_count <> 0 THEN
    RAISE EXCEPTION 'access links must not create orders, got %', v_order_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_practices
  WHERE access_source = 'external_manual';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'expected external_manual entitlements';
  END IF;

  IF has_table_privilege('authenticated', 'public.practice_access_links', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not SELECT practice_access_links';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.redeem_practice_access_link(text, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE redeem';
  END IF;
END;
$$;
