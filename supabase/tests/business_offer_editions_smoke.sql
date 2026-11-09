-- Disposable smoke for 20270218120000_business_offer_editions.sql and the edition 2 seed
-- (20270303120000_business_offer_edition_2.sql). Rolls back.
\set ON_ERROR_STOP on
BEGIN;
-- Minimal Auth fixture in CI compile lacks these GoTrue columns (rolled back with the smoke).
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_manager uuid := gen_random_uuid();
  v_newcomer uuid := gen_random_uuid();
  v_lone_guest uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_org_guest uuid := gen_random_uuid();
  v_offer_version constant text := 'offer-v1-2026-11-04';
  v_offer_hash constant text := '9d4046f36c20f5702697eac0af26de1c3579c6929c61d8ac4441c0b39617c7dc';
  v_offer2_version constant text := 'offer-v2-2026-11-09';
  v_offer2_hash constant text := 'fb57866ccb90a333fd240bfcb2b3c85bacf12e8751bac1bbfab8946c6930105b';
  v_annex_version constant text := 'r8-2026-10-18';
  v_annex_hash constant text := '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a';
  v_accepted boolean;
  v_count integer;
BEGIN
  IF has_function_privilege('anon', 'public.accept_business_offer_edition(text, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_business_offer_edition_acceptance(uuid, text, text, text, text, text, text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.business_offer_edition_acceptances', 'SELECT')
     OR has_table_privilege('authenticated', 'public.business_offer_editions', 'UPDATE') THEN
    RAISE EXCEPTION 'privilege: clients must use the accept function only';
  END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_owner, 'offer-owner@example.test'),
    (v_guest, NULL),
    (v_manager, 'offer-manager@example.test'),
    (v_newcomer, 'offer-newcomer@example.test');
  INSERT INTO auth.users (id, email, is_anonymous) VALUES (v_lone_guest, NULL, true);
  INSERT INTO public.business_organizations (id, name) VALUES
    (v_org, 'Кафе оферты'),
    (v_org_guest, 'Кафе гостя');
  INSERT INTO public.business_organization_members (organization_id, user_id, role) VALUES
    (v_org, v_owner, 'owner'),
    (v_org, v_manager, 'manager'),
    (v_org_guest, v_guest, 'owner');

  -- Guest start: server-side writer (service_role path), twice = one row.
  SELECT r.already_accepted INTO v_accepted
  FROM public.record_business_offer_edition_acceptance(
    v_guest, v_offer_version, v_offer_hash, v_annex_version, v_annex_hash, 'guest_start'
  ) AS r;
  IF v_accepted THEN
    RAISE EXCEPTION 'first guest acceptance looked stored';
  END IF;
  SELECT r.already_accepted INTO v_accepted
  FROM public.record_business_offer_edition_acceptance(
    v_guest, v_offer_version, v_offer_hash, v_annex_version, v_annex_hash, 'guest_start'
  ) AS r;
  IF NOT v_accepted THEN
    RAISE EXCEPTION 'repeated guest acceptance was not idempotent';
  END IF;
  SELECT count(*) INTO v_count FROM public.business_offer_edition_acceptances WHERE user_id = v_guest;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'guest acceptance rows: %', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.business_offer_acceptances
  WHERE user_id = v_guest AND document_key = 'b2b-terms' AND document_version = v_annex_version;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'annex 1 acceptance was not recorded for the payment gate';
  END IF;

  BEGIN
    PERFORM * FROM public.record_business_offer_edition_acceptance(
      v_manager, v_offer_version, v_offer_hash, v_annex_version, v_annex_hash, 'guest_start'
    );
    RAISE EXCEPTION 'manager accepted the offer';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%not_organization_owner%' THEN
        RAISE;
      END IF;
  END;

  -- Registered account without any Business membership: the gift-start checkbox is
  -- stored (account-level), so onboarding never asks for the same edition again.
  SELECT r.already_accepted INTO v_accepted
  FROM public.record_business_offer_edition_acceptance(
    v_newcomer, v_offer_version, v_offer_hash, v_annex_version, v_annex_hash, 'guest_start'
  ) AS r;
  IF v_accepted THEN
    RAISE EXCEPTION 'first newcomer acceptance looked stored';
  END IF;
  SELECT count(*) INTO v_count FROM public.business_offer_edition_acceptances
  WHERE user_id = v_newcomer AND source = 'guest_start';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'newcomer acceptance rows: %', v_count;
  END IF;
  -- The cabinet path still needs an owner; an anonymous account without a point cannot accept.
  BEGIN
    PERFORM * FROM public.record_business_offer_edition_acceptance(
      v_newcomer, v_offer_version, v_offer_hash, v_annex_version, v_annex_hash, 'cabinet'
    );
    RAISE EXCEPTION 'non-owner accepted from the cabinet';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%not_organization_owner%' THEN
        RAISE;
      END IF;
  END;
  BEGIN
    PERFORM * FROM public.record_business_offer_edition_acceptance(
      v_lone_guest, v_offer_version, v_offer_hash, v_annex_version, v_annex_hash, 'guest_start'
    );
    RAISE EXCEPTION 'anonymous account without a point accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%not_organization_owner%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM set_config('audiolad.author_support_token_hash', 'support-proof', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.accept_business_offer_edition(
      'business-offer', v_offer_version, v_offer_hash, v_annex_version, v_annex_hash
    );
    RAISE EXCEPTION 'support mode accepted the offer';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%support_mode_consent_forbidden%' THEN
        RAISE;
      END IF;
  END;
  RESET ROLE;
  PERFORM set_config('audiolad.author_support_token_hash', '', true);

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.business_offer_edition_acceptances_for_caller();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'owner saw acceptances before accepting';
  END IF;
  BEGIN
    PERFORM * FROM public.accept_business_offer_edition(
      'business-offer', v_offer_version, repeat('a', 64), v_annex_version, v_annex_hash
    );
    RAISE EXCEPTION 'unknown offer hash accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE '%offer_document_unknown%' THEN
        RAISE;
      END IF;
  END;
  BEGIN
    PERFORM * FROM public.accept_business_offer_edition(
      'business-offer', v_offer_version, v_offer_hash, v_annex_version, repeat('b', 64)
    );
    RAISE EXCEPTION 'unknown annex hash accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE '%offer_document_unknown%' THEN
        RAISE;
      END IF;
  END;
  SELECT r.already_accepted INTO v_accepted
  FROM public.accept_business_offer_edition(
    'business-offer', v_offer_version, v_offer_hash, v_annex_version, v_annex_hash
  ) AS r;
  IF v_accepted THEN
    RAISE EXCEPTION 'first cabinet acceptance looked stored';
  END IF;
  SELECT r.already_accepted INTO v_accepted
  FROM public.accept_business_offer_edition(
    'business-offer', v_offer_version, v_offer_hash, v_annex_version, v_annex_hash
  ) AS r;
  IF NOT v_accepted THEN
    RAISE EXCEPTION 'same edition was accepted twice';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.business_offer_edition_acceptances_for_caller() AS a
  WHERE a.document_version = v_offer_version AND a.content_hash = v_offer_hash;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner acceptance not visible to the owner';
  END IF;
  -- Edition 2: the owner of edition 1 accepts the new edition once more, for the same account.
  BEGIN
    PERFORM * FROM public.accept_business_offer_edition(
      'business-offer', v_offer2_version, v_offer_hash, v_annex_version, v_annex_hash
    );
    RAISE EXCEPTION 'edition 2 accepted with the edition 1 hash';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE '%offer_document_unknown%' THEN
        RAISE;
      END IF;
  END;
  SELECT r.already_accepted INTO v_accepted
  FROM public.accept_business_offer_edition(
    'business-offer', v_offer2_version, v_offer2_hash, v_annex_version, v_annex_hash
  ) AS r;
  IF v_accepted THEN
    RAISE EXCEPTION 'edition 2 looked accepted before the owner accepted it';
  END IF;
  SELECT r.already_accepted INTO v_accepted
  FROM public.accept_business_offer_edition(
    'business-offer', v_offer2_version, v_offer2_hash, v_annex_version, v_annex_hash
  ) AS r;
  IF NOT v_accepted THEN
    RAISE EXCEPTION 'edition 2 was accepted twice';
  END IF;
  SELECT count(*) INTO v_count FROM public.business_offer_edition_acceptances_for_caller();
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'owner should keep edition 1 and add edition 2, rows: %', v_count;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.business_offer_edition_acceptances_for_caller() AS a
  WHERE a.document_version = v_offer_version AND a.content_hash = v_offer_hash;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'edition 1 acceptance changed after edition 2';
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.business_offer_edition_acceptances_for_caller();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'manager saw another account acceptance';
  END IF;
  RESET ROLE;

  SELECT count(*) INTO v_count FROM public.business_offer_acceptances WHERE user_id = v_owner;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner annex 1 acceptance rows: %', v_count;
  END IF;

  RAISE NOTICE 'business_offer_editions_smoke: ok';
END $$;

ROLLBACK;
