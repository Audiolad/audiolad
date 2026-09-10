-- Isolated Studio music license PR1 smoke. Scratch database only.

DO $$
DECLARE
  author uuid := 'a1111111-1111-4111-8111-111111111111';
  owner_user uuid := 'a2222222-2222-4222-8222-222222222222';
  buyer uuid := 'b1111111-1111-4111-8111-111111111111';
  listener uuid := 'b2222222-2222-4222-8222-222222222222';
  new_user uuid := 'c1111111-1111-4111-8111-111111111111';
  paid_music uuid := 'd1111111-1111-4111-8111-111111111111';
  free_music uuid := 'd2222222-2222-4222-8222-222222222222';
  album_music uuid := 'd3333333-3333-4333-8333-333333333333';
  plain_practice uuid := 'e1111111-1111-4111-8111-111111111111';
  key1 uuid := 'f1111111-1111-4111-8111-111111111111';
  key2 uuid := 'f2222222-2222-4222-8222-222222222222';
  key3 uuid := 'f3333333-3333-4333-8333-333333333333';
  pay1 uuid := '11111111-1111-4111-8111-111111111111';
  pay2 uuid := '12222222-2222-4222-8222-222222222222';
  ev1 uuid := '21111111-1111-4111-8111-111111111111';
  ev2 uuid := '22222222-2222-4222-8222-222222222222';
  ev3 uuid := '23333333-3333-4333-8333-333333333333';
  ev4 uuid := '24444444-4444-4444-8444-444444444444';
  ev5 uuid := '25555555-5555-4555-8555-555555555555';
  ev6 uuid := '26666666-6666-4666-8666-666666666666';
  pay3 uuid := '13333333-3333-4333-8333-333333333333';
  listen_pay uuid := '31111111-1111-4111-8111-111111111111';
  listen_ev uuid := '41111111-1111-4111-8111-111111111111';
  listen_order uuid;
  v_order uuid;
  v_order2 uuid;
  v_order_b uuid;
  v_free_paid_order uuid;
  v_grant jsonb;
  v_revoke jsonb;
  v_amount bigint;
  v_kind text;
  v_count integer;
  v_ent uuid;
  v_inserted boolean;
  v_source text;
  v_fulfill jsonb;
  v_locked boolean;
  v_err text;
BEGIN
  INSERT INTO auth.users (id) VALUES (owner_user), (buyer), (listener), (new_user);
  INSERT INTO public.authors (id, name) VALUES (author, 'Musician');
  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (author, owner_user, 'owner');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, price, is_free, product_kind,
    publication_class, music_usage_permission, catalog_visibility
  ) VALUES
    (paid_music, author, 'Paid music', 'paid-music', 'published', 500, false,
     'music', 'release', 'platform_reuse_allowed', 'listed'),
    (free_music, author, 'Free music', 'free-music', 'published', 0, true,
     'music', 'release', 'platform_reuse_allowed', 'listed'),
    (album_music, author, 'Album', 'album-music', 'published', 700, false,
     'music', 'release', 'platform_reuse_allowed', 'listed'),
    (plain_practice, author, 'Practice', 'plain-practice', 'published', 500, false,
     'practice', 'practice', NULL, 'listed');

  INSERT INTO public.audio_items (practice_id, title, position) VALUES
    (album_music, 'A', 0),
    (album_music, 'B', 1);

  -- 1. paid music + permission → Studio amount = 2 × effective (500 RUB = 50000, studio 100000)
  PERFORM set_config('request.jwt.claim.sub', buyer::text, true);

  SELECT order_id, amount_minor, order_kind
  INTO v_order, v_amount, v_kind
  FROM public.create_studio_music_order(paid_music, key1, NULL);

  IF v_kind IS DISTINCT FROM 'studio_music_license'
     OR v_amount IS DISTINCT FROM 100000 THEN
    RAISE EXCEPTION '1: studio amount must be 2x effective, got % %', v_kind, v_amount;
  END IF;

  -- expected-amount race
  BEGIN
    PERFORM public.create_studio_music_order(paid_music, key2, 50000);
    RAISE EXCEPTION '1: expected price_changed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%price_changed%' THEN
        RAISE EXCEPTION '1: expected price_changed, got %', SQLERRM;
      END IF;
  END;

  -- 2. listener purchase ≠ Studio entitlement
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    author_id_snapshot, idempotency_key, order_kind, paid_at
  ) VALUES (
    gen_random_uuid(), listener, paid_music, 'paid', 50000, 'RUB',
    'Paid music', 'paid-music', 50000, author, 'listen-paid', 'product_purchase', now()
  )
  RETURNING id INTO listen_order;

  INSERT INTO public.payments (
    id, order_id, provider, provider_payment_id, idempotency_key, status,
    amount_minor, currency, confirmed_at
  ) VALUES (
    listen_pay, listen_order, 'tochka', 'tochka-listen', 'listen-paid',
    'pending', 50000, 'RUB', NULL
  );

  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, event_type, processing_status
  ) VALUES (
    listen_ev, 'tochka', 'listen-paid', 'incomingPayment', 'received'
  );

  v_fulfill := public.fulfill_tochka_payment_transactional(
    listen_ev, 'tochka-listen', listen_pay, 50000, 'RUB', 'APPROVED'
  );

  IF coalesce(v_fulfill ->> 'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION '2: listener fulfill failed %', v_fulfill;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_practices
  WHERE user_id = listener AND practice_id = paid_music;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '2: listener fulfill must write user_practices';
  END IF;

  IF public.has_studio_music_entitlement(listener, paid_music)
     OR public.can_use_music_in_studio(listener, paid_music) THEN
    RAISE EXCEPTION '2: listener purchase must not grant Studio';
  END IF;

  -- 3/4. Studio payment → exactly one entitlement, no user_practices
  INSERT INTO public.payments (
    id, order_id, provider, provider_payment_id, idempotency_key, status,
    amount_minor, currency
  ) VALUES (
    pay1, v_order, 'tochka', 'tochka-studio-1', 'studio-1', 'pending', 100000, 'RUB'
  );

  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, event_type, processing_status
  ) VALUES (
    ev1, 'tochka', 'studio-1', 'incomingPayment', 'received'
  );

  v_fulfill := public.fulfill_tochka_payment_transactional(
    ev1, 'tochka-studio-1', pay1, 100000, 'RUB', 'APPROVED'
  );

  IF coalesce(v_fulfill ->> 'ok', 'false') <> 'true'
     OR coalesce(v_fulfill ->> 'outcome', '') <> 'completed' THEN
    RAISE EXCEPTION '4: studio fulfill %', v_fulfill;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer AND practice_id = paid_music AND revoked_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '4: expected one studio entitlement, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_practices
  WHERE user_id = buyer AND practice_id = paid_music;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '3: Studio purchase must not write user_practices';
  END IF;

  IF NOT public.has_studio_music_entitlement(buyer, paid_music)
     OR NOT public.can_use_music_in_studio(buyer, paid_music) THEN
    RAISE EXCEPTION '4: buyer must be able to use music in Studio';
  END IF;

  -- 5. duplicate webhook (same event replay + second event) still one entitlement
  v_fulfill := public.fulfill_tochka_payment_transactional(
    ev1, 'tochka-studio-1', pay1, 100000, 'RUB', 'APPROVED'
  );
  IF coalesce(v_fulfill ->> 'outcome', '') <> 'already_complete' THEN
    RAISE EXCEPTION '5: same-event replay should be already_complete %', v_fulfill;
  END IF;

  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, event_type, processing_status
  ) VALUES (
    ev2, 'tochka', 'studio-1-retry', 'incomingPayment', 'received'
  );

  v_fulfill := public.fulfill_tochka_payment_transactional(
    ev2, 'tochka-studio-1', pay1, 100000, 'RUB', 'APPROVED'
  );
  IF coalesce(v_fulfill ->> 'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION '5: second event fulfill failed %', v_fulfill;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer AND practice_id = paid_music;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '5: duplicate webhook created extra entitlement %', v_count;
  END IF;

  -- 6. re-buy with active entitlement forbidden
  BEGIN
    PERFORM public.create_studio_music_order(paid_music, key3, NULL);
    RAISE EXCEPTION '6: expected already_studio_entitled';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%already_studio_entitled%' THEN
        RAISE EXCEPTION '6: expected already_studio_entitled, got %', SQLERRM;
      END IF;
  END;

  -- 7. price change after purchase → entitlement remains
  UPDATE public.practices SET price = 900 WHERE id = paid_music;
  IF NOT public.has_studio_music_entitlement(buyer, paid_music)
     OR NOT public.can_use_music_in_studio(buyer, paid_music) THEN
    RAISE EXCEPTION '7: price change must not revoke Studio entitlement';
  END IF;

  -- 8. disable platform_reuse_allowed after purchase → entitlement remains
  UPDATE public.practices
  SET music_usage_permission = 'listen_only'
  WHERE id = paid_music;
  IF NOT public.has_studio_music_entitlement(buyer, paid_music)
     OR NOT public.can_use_music_in_studio(buyer, paid_music) THEN
    RAISE EXCEPTION '8: permission flip must not revoke Studio entitlement';
  END IF;

  -- 9. unpublish after purchase → entitlement remains
  UPDATE public.practices SET status = 'unpublished' WHERE id = paid_music;
  IF NOT public.has_studio_music_entitlement(buyer, paid_music)
     OR NOT public.can_use_music_in_studio(buyer, paid_music) THEN
    RAISE EXCEPTION '9: unpublish must not revoke Studio entitlement';
  END IF;

  -- 10. new user after permission off cannot acquire
  PERFORM set_config('request.jwt.claim.sub', new_user::text, true);
  UPDATE public.practices
  SET status = 'published', music_usage_permission = 'listen_only'
  WHERE id = paid_music;

  BEGIN
    PERFORM public.create_studio_music_order(paid_music, gen_random_uuid(), NULL);
    RAISE EXCEPTION '10: expected studio_reuse_not_allowed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%studio_reuse_not_allowed%' THEN
        RAISE EXCEPTION '10: expected studio_reuse_not_allowed, got %', SQLERRM;
      END IF;
  END;

  -- restore paid music for later finance / lock checks
  UPDATE public.practices
  SET music_usage_permission = 'platform_reuse_allowed', status = 'published', price = 500
  WHERE id = paid_music;

  -- 11. free allowed → free entitlement without order
  PERFORM set_config('request.jwt.claim.sub', buyer::text, true);
  SELECT entitlement_id, grant_source, inserted
  INTO v_ent, v_source, v_inserted
  FROM public.acquire_free_studio_music(free_music);

  IF v_source IS DISTINCT FROM 'free' OR v_inserted IS NOT TRUE THEN
    RAISE EXCEPTION '11: free acquire % %', v_source, v_inserted;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.orders
  WHERE user_id = buyer AND practice_id = free_music;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '11: free acquire must not create an order';
  END IF;

  -- idempotent free acquire
  SELECT inserted INTO v_inserted
  FROM public.acquire_free_studio_music(free_music);
  IF v_inserted IS NOT FALSE THEN
    RAISE EXCEPTION '11: second free acquire must be idempotent';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer AND practice_id = free_music AND revoked_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '11: expected one free entitlement';
  END IF;

  -- 12. free entitlement survives later permission off
  UPDATE public.practices
  SET music_usage_permission = 'listen_only'
  WHERE id = free_music;
  IF NOT public.has_studio_music_entitlement(buyer, free_music)
     OR NOT public.can_use_music_in_studio(buyer, free_music) THEN
    RAISE EXCEPTION '12: free entitlement must survive permission off';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', new_user::text, true);
  BEGIN
    PERFORM public.acquire_free_studio_music(free_music);
    RAISE EXCEPTION '12b: new user must not acquire after permission off';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%studio_reuse_not_allowed%' THEN
        RAISE EXCEPTION '12b: expected studio_reuse_not_allowed, got %', SQLERRM;
      END IF;
  END;

  -- 13. album entitlement is publication-level, not per audio_item
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'studio_music_entitlements'
      AND column_name = 'audio_item_id'
  ) THEN
    RAISE EXCEPTION '13: studio_music_entitlements must not have audio_item_id';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', buyer::text, true);
  SELECT order_id INTO v_order2
  FROM public.create_studio_music_order(album_music, gen_random_uuid(), NULL);

  INSERT INTO public.payments (
    id, order_id, provider, provider_payment_id, idempotency_key, status,
    amount_minor, currency
  ) VALUES (
    pay2, v_order2, 'tochka', 'tochka-album', 'studio-album', 'pending', 140000, 'RUB'
  );
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, event_type, processing_status
  ) VALUES (
    ev3, 'tochka', 'studio-album', 'incomingPayment', 'received'
  );
  v_fulfill := public.fulfill_tochka_payment_transactional(
    ev3, 'tochka-album', pay2, 140000, 'RUB', 'APPROVED'
  );
  IF coalesce(v_fulfill ->> 'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION '13: album fulfill %', v_fulfill;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer AND practice_id = album_music AND revoked_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '13: album must have one publication-level entitlement, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.audio_items WHERE practice_id = album_music;
  IF v_count <> 2 THEN
    RAISE EXCEPTION '13: album fixture must have two audio_items';
  END IF;

  -- 14. Studio sale appears in canonical sale pipeline without user_practices
  IF public.canonical_sale_has_paid_access('studio_music_license', buyer, paid_music)
       IS NOT TRUE THEN
    RAISE EXCEPTION '14: studio_music_license must qualify as canonical sale';
  END IF;
  IF public.canonical_sale_has_paid_access('product_purchase', listener, paid_music)
       IS NOT TRUE THEN
    RAISE EXCEPTION '15: listener purchase must still qualify';
  END IF;
  IF public.canonical_sale_has_paid_access('product_purchase', buyer, paid_music)
       IS NOT FALSE THEN
    RAISE EXCEPTION '14: Studio buyer must not fake listener purchase access';
  END IF;

  -- 15. listener regression: still entitled, Studio buyer is not
  IF NOT EXISTS (
    SELECT 1 FROM public.user_practices
    WHERE user_id = listener AND practice_id = paid_music AND access_source = 'purchase'
  ) THEN
    RAISE EXCEPTION '15: listener user_practices regression';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_practices
    WHERE user_id = buyer AND practice_id = paid_music
  ) THEN
    RAISE EXCEPTION '15: Studio buyer must still lack user_practices';
  END IF;

  -- pending uniqueness scoped by order_kind: listener pending + studio pending coexist
  INSERT INTO public.orders (
    user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    idempotency_key, order_kind
  ) VALUES (
    new_user, album_music, 'pending', 70000, 'RUB',
    'Album', 'album-music', 70000, 'pending-listen', 'product_purchase'
  );
  INSERT INTO public.orders (
    user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    idempotency_key, order_kind
  ) VALUES (
    new_user, album_music, 'pending', 140000, 'RUB',
    'Album', 'album-music', 140000, 'pending-studio', 'studio_music_license'
  );

  -- sale lock: free entitlement locks content
  SELECT public.practice_is_content_locked_after_sale(free_music) INTO v_locked;
  IF v_locked IS NOT TRUE THEN
    RAISE EXCEPTION 'sale-lock: free studio entitlement must lock content';
  END IF;

  -- owner live path without stored entitlement
  IF public.can_use_music_in_studio(owner_user, paid_music) IS NOT TRUE THEN
    RAISE EXCEPTION 'owner must use music via live author_members';
  END IF;
  IF public.has_studio_music_entitlement(owner_user, paid_music) IS NOT FALSE THEN
    RAISE EXCEPTION 'owner must not require a stored entitlement';
  END IF;

  -- refund hook
  PERFORM public.revoke_studio_music_entitlement_for_order(v_order);
  IF public.has_studio_music_entitlement(buyer, paid_music) THEN
    RAISE EXCEPTION 'refund hook must revoke Studio entitlement';
  END IF;

  -- B. Fulfillment replay after revoke cannot re-grant old order A
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, event_type, processing_status
  ) VALUES (
    ev4, 'tochka', 'studio-1-after-revoke', 'incomingPayment', 'received'
  );
  v_fulfill := public.fulfill_tochka_payment_transactional(
    ev4, 'tochka-studio-1', pay1, 100000, 'RUB', 'APPROVED'
  );
  IF coalesce(v_fulfill ->> 'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'B: fulfill replay after revoke should not fail %', v_fulfill;
  END IF;
  IF coalesce((v_fulfill ->> 'access_inserted')::boolean, false) THEN
    RAISE EXCEPTION 'B: fulfill replay after revoke must not insert';
  END IF;

  v_grant := public.grant_studio_music_purchase_entitlement(v_order);
  IF coalesce((v_grant ->> 'inserted')::boolean, false)
     OR coalesce((v_grant ->> 'already_revoked')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'B: grant replay after revoke must be already_revoked %', v_grant;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE order_id = v_order AND revoked_at IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'B: no active entitlement from revoked order A, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer AND practice_id = paid_music AND revoked_at IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'B: buyer must have no active paid_music entitlement after A revoke+replay';
  END IF;

  BEGIN
    INSERT INTO public.studio_music_entitlements (
      user_id, practice_id, grant_source, order_id
    ) VALUES (
      buyer, paid_music, 'purchase', v_order
    );
    RAISE EXCEPTION 'B: UNIQUE(order_id) must reject a second row for A';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
    WHEN others THEN
      IF SQLERRM LIKE '%UNIQUE(order_id) must reject%' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> '23505' THEN
        RAISE EXCEPTION 'B: expected unique_violation for order_id, got % %', SQLSTATE, SQLERRM;
      END IF;
  END;

  -- D. Paid revoke cannot revoke grant_source=free
  INSERT INTO public.orders (
    user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    author_id_snapshot, idempotency_key, order_kind, paid_at
  ) VALUES (
    buyer, free_music, 'paid', 100, 'RUB',
    'Free music', 'free-music', 100, author, 'studio-on-free-race',
    'studio_music_license', now()
  )
  RETURNING id INTO v_free_paid_order;

  INSERT INTO public.studio_music_entitlements (
    user_id, practice_id, grant_source, order_id, revoked_at, revoke_reason
  ) VALUES (
    buyer, free_music, 'purchase', v_free_paid_order, now(), 'prior-refund'
  );

  v_revoke := public.revoke_studio_music_entitlement_for_order(v_free_paid_order);
  IF coalesce((v_revoke ->> 'revoked')::boolean, true) THEN
    RAISE EXCEPTION 'D: already-revoked purchase must not report a new revoke %', v_revoke;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer
    AND practice_id = free_music
    AND grant_source = 'free'
    AND revoked_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D: revoke order A must never revoke grant_source=free';
  END IF;

  v_revoke := public.revoke_studio_music_entitlement_for_order(v_order);
  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer
    AND practice_id = free_music
    AND grant_source = 'free'
    AND revoked_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D: revoke of unrelated paid order must leave free grant';
  END IF;

  IF public.can_use_music_in_studio(owner_user, paid_music) IS NOT TRUE THEN
    RAISE EXCEPTION 'D: paid revoke must not remove live owner access';
  END IF;

  -- E / A / C. New lawful purchase B after revoke A; old revoke cannot kill B;
  -- duplicate fulfill of B stays one row.
  PERFORM set_config('request.jwt.claim.sub', buyer::text, true);
  SELECT order_id INTO v_order_b
  FROM public.create_studio_music_order(paid_music, gen_random_uuid(), NULL);

  INSERT INTO public.payments (
    id, order_id, provider, provider_payment_id, idempotency_key, status,
    amount_minor, currency
  ) VALUES (
    pay3, v_order_b, 'tochka', 'tochka-studio-b', 'studio-b', 'pending', 100000, 'RUB'
  );
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, event_type, processing_status
  ) VALUES (
    ev5, 'tochka', 'studio-b', 'incomingPayment', 'received'
  );
  v_fulfill := public.fulfill_tochka_payment_transactional(
    ev5, 'tochka-studio-b', pay3, 100000, 'RUB', 'APPROVED'
  );
  IF coalesce(v_fulfill ->> 'ok', 'false') <> 'true'
     OR coalesce((v_fulfill ->> 'access_inserted')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'E: new purchase after revoke must create entitlement B %', v_fulfill;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE order_id = v_order_b AND revoked_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'E: expected one active entitlement for new order B';
  END IF;

  -- C. Normal duplicate fulfillment remains idempotent
  INSERT INTO public.payment_webhook_events (
    id, provider, dedup_key, event_type, processing_status
  ) VALUES (
    ev6, 'tochka', 'studio-b-retry', 'incomingPayment', 'received'
  );
  v_fulfill := public.fulfill_tochka_payment_transactional(
    ev6, 'tochka-studio-b', pay3, 100000, 'RUB', 'APPROVED'
  );
  IF coalesce(v_fulfill ->> 'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'C: duplicate fulfill of B failed %', v_fulfill;
  END IF;
  IF coalesce((v_fulfill ->> 'access_inserted')::boolean, true) THEN
    RAISE EXCEPTION 'C: duplicate fulfill must not insert a second row';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer AND practice_id = paid_music;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'C: expected revoked A + one B, got % rows', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE user_id = buyer AND practice_id = paid_music AND revoked_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'C: expected exactly one active entitlement after duplicate fulfill';
  END IF;

  -- A. Old revoke cannot kill new purchase
  v_revoke := public.revoke_studio_music_entitlement_for_order(v_order);
  IF coalesce((v_revoke ->> 'revoked')::boolean, true) THEN
    RAISE EXCEPTION 'A: replay revoke of A must not revoke another entitlement %', v_revoke;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_music_entitlements
  WHERE order_id = v_order_b AND revoked_at IS NULL AND grant_source = 'purchase';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'A: entitlement B must stay active after late revoke of A';
  END IF;

  IF public.has_studio_music_entitlement(buyer, paid_music) IS NOT TRUE THEN
    RAISE EXCEPTION 'A: buyer must still have Studio access via B';
  END IF;

  -- non-music cannot be acquired
  PERFORM set_config('request.jwt.claim.sub', buyer::text, true);
  BEGIN
    PERFORM public.create_studio_music_order(plain_practice, gen_random_uuid(), NULL);
    RAISE EXCEPTION 'expected not_studio_music';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%not_studio_music%' THEN
        RAISE EXCEPTION 'expected not_studio_music, got %', SQLERRM;
      END IF;
  END;

  -- PR3.1 independent pricing: listener free + Studio fixed 600
  UPDATE public.practices
  SET
    is_free = true,
    price = 0,
    music_usage_permission = 'platform_reuse_allowed',
    status = 'published',
    studio_music_pricing_mode = 'fixed',
    studio_music_price_minor = 60000
  WHERE id = free_music;

  PERFORM set_config('request.jwt.claim.sub', new_user::text, true);
  BEGIN
    PERFORM public.acquire_free_studio_music(free_music);
    RAISE EXCEPTION 'PR3.1: free acquire must reject Studio fixed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%practice_not_free%' THEN
        RAISE EXCEPTION 'PR3.1: expected practice_not_free, got %', SQLERRM;
      END IF;
  END;

  SELECT amount_minor INTO v_amount
  FROM public.create_studio_music_order(free_music, gen_random_uuid(), NULL);
  IF v_amount IS DISTINCT FROM 60000 THEN
    RAISE EXCEPTION 'PR3.1: fixed Studio amount must be 60000, got %', v_amount;
  END IF;

  -- listener paid + Studio free → free acquire, no paid order
  UPDATE public.practices
  SET
    is_free = false,
    price = 300,
    studio_music_pricing_mode = 'free',
    studio_music_price_minor = NULL
  WHERE id = album_music;

  BEGIN
    PERFORM public.create_studio_music_order(album_music, gen_random_uuid(), NULL);
    RAISE EXCEPTION 'PR3.1: paid order must reject Studio free';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%practice_not_for_sale%' THEN
        RAISE EXCEPTION 'PR3.1: expected practice_not_for_sale, got %', SQLERRM;
      END IF;
  END;

  SELECT inserted INTO v_inserted
  FROM public.acquire_free_studio_music(album_music);
  IF v_inserted IS NOT TRUE THEN
    RAISE EXCEPTION 'PR3.1: paid listener + Studio free must allow free acquire';
  END IF;
END
$$;
