-- Behavioral smoke for allowlisted test-user reset. Throwaway database only.

CREATE OR REPLACE FUNCTION public._reset_fixture_clear()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.hidden_author_blocker;
  DELETE FROM public.author_partner_attributions;
  ALTER TABLE public.author_referrals DISABLE TRIGGER author_referrals_protect_activated_trg;
  DELETE FROM public.author_referrals;
  ALTER TABLE public.author_referrals ENABLE TRIGGER author_referrals_protect_activated_trg;
  DELETE FROM public.author_terms_acceptances;
  DELETE FROM public.author_applications;
  DELETE FROM public.author_project_capacity_grants;
  DELETE FROM public.payments;
  DELETE FROM public.orders;
  DELETE FROM public.author_ledger_entries;
  DELETE FROM public.author_payouts;
  DELETE FROM public.author_payout_profiles;
  DELETE FROM public.practices;
  DELETE FROM public.personal_materials;
  DELETE FROM public.promotion_campaigns;
  DELETE FROM public.personal_material_templates;
  DELETE FROM public.author_members;
  DELETE FROM public.authors;
  DELETE FROM public.profiles;
  DELETE FROM auth.users;
END;
$$;

CREATE OR REPLACE FUNCTION public._reset_fixture_seed()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_allow uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_sergey uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_other uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  v_sergey_author uuid := '7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c';
  v_author1 uuid := '11111111-1111-4111-8111-111111111111';
  v_author2 uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  PERFORM public._reset_fixture_clear();

  INSERT INTO auth.users (id, email) VALUES
    (v_allow, 'Audiolad@Mail.RU'),
    (v_sergey, 'sergey@example.com'),
    (v_other, 'other@example.com');

  INSERT INTO public.profiles (id, role, author_project_slots_partner_bonus) VALUES
    (v_allow, 'listener', 1),
    (v_sergey, 'listener', 0),
    (v_other, 'listener', 0);

  INSERT INTO public.authors (id, slug, name) VALUES
    (v_sergey_author, 'sergey-petrov', 'Sergey'),
    (v_author1, 'allow-author-1', 'Allow 1'),
    (v_author2, 'allow-author-2', 'Allow 2');

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_sergey_author, v_sergey, 'owner'),
    (v_author1, v_allow, 'owner'),
    (v_author2, v_allow, 'owner');

  INSERT INTO public.author_referrals (
    id, referrer_author_id, referrer_owner_user_id, invitee_user_id, invitee_author_id,
    code_used, code_normalized, activated_at, expires_at, activation_author_id_snapshot,
    bonus_slot_granted_at, status
  ) VALUES (
    'fed82185-88c3-409e-92c2-6e3dd64582d8',
    v_sergey_author, v_sergey, v_allow, v_author1,
    'sergey', 'sergey', now(), now() + interval '3 years', v_author1, now(), 'activated'
  ), (
    '44444444-4444-4444-8444-444444444444',
    v_sergey_author, v_sergey, v_other, NULL,
    'sergey', 'sergey', now(), now() + interval '3 years', v_sergey_author, now(), 'activated'
  );

  INSERT INTO public.author_partner_attributions (
    referrer_author_id, invitee_user_id, bound_referral_id, status
  ) VALUES (
    v_sergey_author, v_allow, 'fed82185-88c3-409e-92c2-6e3dd64582d8', 'bound'
  );

  INSERT INTO public.author_applications (user_id, author_id, reviewed_by, status)
  VALUES (v_allow, v_author1, v_sergey, 'approved');

  INSERT INTO public.author_terms_acceptances (author_id, accepted_by_user_id)
  VALUES (v_author1, v_allow);
END;
$$;

CREATE OR REPLACE FUNCTION public._assert_reset_blocked(p_user uuid, p_detail text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
  v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.reset_allowlisted_test_user_db(p_user);
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      IF v_detail IS DISTINCT FROM p_detail AND coalesce(v_detail, '') NOT LIKE p_detail || '%' THEN
        RAISE EXCEPTION 'expected detail %, got %', p_detail, v_detail;
      END IF;
      v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'reset was not blocked for %', p_detail;
  END IF;
END;
$$;

DO $$
DECLARE
  v_del "char";
BEGIN
  SELECT c.confdeltype INTO v_del
  FROM pg_constraint AS c
  JOIN pg_attribute AS a
    ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.author_referrals'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'auth.users'::regclass
    AND a.attname = 'invitee_user_id';

  IF v_del IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'invitee_user_id FK must stay RESTRICT, got %', v_del;
  END IF;
END
$$;

SELECT public._reset_fixture_seed();

-- Ordinary activated referral cannot be deleted, and GUC alone is not enough.
DO $$
BEGIN
  DELETE FROM public.author_referrals
  WHERE id = 'fed82185-88c3-409e-92c2-6e3dd64582d8';
  RAISE EXCEPTION 'activated referral delete must fail without reset context';
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%author_referral_activated_immutable%' THEN
      RAISE;
    END IF;
END
$$;

DO $$
BEGIN
  PERFORM set_config(
    'audiolad.allowlisted_test_user_reset',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    true
  );
  DELETE FROM public.author_referrals
  WHERE id = '44444444-4444-4444-8444-444444444444';
  RAISE EXCEPTION 'GUC for a non-allowlisted email must not delete an activated referral';
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM set_config(
    'audiolad.allowlisted_test_user_reset',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    true
  );
  DELETE FROM public.author_referrals
  WHERE id = '44444444-4444-4444-8444-444444444444';
  RAISE EXCEPTION 'allowlisted GUC must not delete another invitee referral';
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM set_config(
    'audiolad.allowlisted_test_user_reset',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    true
  );
  UPDATE public.author_referrals
  SET code_used = 'changed'
  WHERE id = 'fed82185-88c3-409e-92c2-6e3dd64582d8';
  RAISE EXCEPTION 'GUC must not allow UPDATE of an activated referral';
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    NULL;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.author_referrals) <> 2 THEN
    RAISE EXCEPTION 'protection tests must leave both activated referrals';
  END IF;
END
$$;

-- Protected Sergey slug, finance, referrer, hidden FK, and injected rollback.
UPDATE public.authors
SET slug = 'sergey'
WHERE id = '11111111-1111-4111-8111-111111111111';

SELECT public._assert_reset_blocked(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'protected_author'
);

UPDATE public.authors
SET slug = 'allow-author-1'
WHERE id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.orders (id, user_id, status)
VALUES ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'paid');

SELECT public._assert_reset_blocked(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'orders'
);

DELETE FROM public.orders;

INSERT INTO public.orders (id, user_id, status)
VALUES ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'refunded');

SELECT public._assert_reset_blocked(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'refunds'
);

DELETE FROM public.orders;

INSERT INTO public.practices (id, author_id)
VALUES ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111');

SELECT public._assert_reset_blocked(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'owned_author_blocked:'
);

DELETE FROM public.practices;

INSERT INTO public.hidden_author_blocker (id, author_id)
VALUES ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111');

SELECT public._assert_reset_blocked(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'author_fk:hidden_author_blocker.author_id'
);

DELETE FROM public.hidden_author_blocker;

ALTER TABLE public.author_referrals DISABLE TRIGGER author_referrals_protect_activated_trg;
DELETE FROM public.author_referrals
WHERE id = '44444444-4444-4444-8444-444444444444';
ALTER TABLE public.author_referrals ENABLE TRIGGER author_referrals_protect_activated_trg;

INSERT INTO public.author_referrals (
  id, referrer_author_id, referrer_owner_user_id, invitee_user_id,
  code_used, code_normalized, activated_at, expires_at, activation_author_id_snapshot,
  status
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'allow-code', 'allow-code', now(), now() + interval '3 years',
  '11111111-1111-4111-8111-111111111111', 'activated'
);

SELECT public._assert_reset_blocked(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'test_as_referrer'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.author_referrals
    WHERE id = '44444444-4444-4444-8444-444444444444'
      AND invitee_user_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
      AND activated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'downstream referral must survive a blocked reset';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.authors WHERE id = '11111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'owned author must survive a blocked reset';
  END IF;
END
$$;

SELECT public._reset_fixture_seed();

CREATE OR REPLACE FUNCTION public._fail_author_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'injected_author_delete_failure';
END;
$$;

CREATE TRIGGER fail_author_delete
  BEFORE DELETE ON public.authors
  FOR EACH ROW
  EXECUTE FUNCTION public._fail_author_delete();

DO $$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.reset_allowlisted_test_user_db('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%injected_author_delete_failure%' THEN
        RAISE;
      END IF;
      v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'injected author delete failure did not abort the RPC';
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT author_project_slots_partner_bonus FROM public.profiles
      WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') <> 1 THEN
    RAISE EXCEPTION 'mid-RPC failure must roll back partner bonus';
  END IF;
  IF (SELECT count(*) FROM public.author_referrals
      WHERE invitee_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') <> 1 THEN
    RAISE EXCEPTION 'mid-RPC failure must roll back invitee referral delete';
  END IF;
  IF (SELECT count(*) FROM public.authors
      WHERE id IN (
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222'
      )) <> 2 THEN
    RAISE EXCEPTION 'mid-RPC failure must roll back author delete';
  END IF;
END
$$;

DROP TRIGGER fail_author_delete ON public.authors;

-- Happy path, idempotent second call, Sergey untouched, then phase-2-shaped auth delete.
DO $$
DECLARE
  v_first jsonb;
  v_second jsonb;
BEGIN
  v_first := public.reset_allowlisted_test_user_db('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  IF coalesce((v_first ->> 'dbCleanupCompleted')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'phase 1 did not complete: %', v_first;
  END IF;
  IF (v_first -> 'counts' ->> 'inviteeReferrals')::int <> 1 THEN
    RAISE EXCEPTION 'expected one invitee referral deleted, got %', v_first;
  END IF;
  IF (v_first -> 'counts' ->> 'ownedAuthors')::int <> 2 THEN
    RAISE EXCEPTION 'expected two owned authors deleted, got %', v_first;
  END IF;
  IF (v_first -> 'counts' ->> 'partnerBonusCleared')::int <> 1 THEN
    RAISE EXCEPTION 'expected partner bonus cleared, got %', v_first;
  END IF;
  IF (v_first -> 'counts' ->> 'capacityGrants')::int <> 0 THEN
    RAISE EXCEPTION 'capacity grants must not be deleted, got %', v_first;
  END IF;

  v_second := public.reset_allowlisted_test_user_db('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  IF coalesce((v_second ->> 'alreadyClean')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'second phase 1 call must be already clean: %', v_second;
  END IF;
  IF (v_second -> 'counts' ->> 'inviteeReferrals')::int <> 0
     OR (v_second -> 'counts' ->> 'ownedAuthors')::int <> 0 THEN
    RAISE EXCEPTION 'second phase 1 call must be a no-op: %', v_second;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') IS NOT TRUE THEN
    RAISE EXCEPTION 'phase 1 must not delete auth.users';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.author_referrals
    WHERE id = '44444444-4444-4444-8444-444444444444'
      AND code_normalized = 'sergey'
      AND invitee_user_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
      AND activated_at IS NOT NULL
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sergey referral to another invitee was touched';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.authors
    WHERE id = '7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c' AND slug = 'sergey-petrov'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sergey author was touched';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1') IS NOT TRUE THEN
    RAISE EXCEPTION 'Sergey user was touched';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.author_referrals
    WHERE invitee_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ) THEN
    RAISE EXCEPTION 'allowlisted invitee referral remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.authors
    WHERE id IN (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
  ) THEN
    RAISE EXCEPTION 'owned authors remain';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.author_applications
    WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ) THEN
    RAISE EXCEPTION 'allowlisted application remains';
  END IF;
  IF (SELECT author_project_slots_partner_bonus FROM public.profiles
      WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') <> 0 THEN
    RAISE EXCEPTION 'partner bonus remains';
  END IF;
END
$$;

DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') THEN
    RAISE EXCEPTION 'phase 2 auth delete still blocked';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.author_referrals
    WHERE id = '44444444-4444-4444-8444-444444444444'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'foreign referral disappeared with auth delete';
  END IF;
END
$$;

DO $$
DECLARE
  v_missing jsonb;
BEGIN
  v_missing := public.reset_allowlisted_test_user_db('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  IF coalesce((v_missing ->> 'alreadyClean')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'missing user must be an idempotent already-clean result: %', v_missing;
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.reset_allowlisted_test_user_db('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');
    RAISE EXCEPTION 'non-allowlisted user must be rejected';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;
END
$$;

DO $$
BEGIN
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM public.reset_allowlisted_test_user_db('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
    RAISE EXCEPTION 'authenticated must not execute reset RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';
END
$$;

DO $$
BEGIN
  EXECUTE 'SET ROLE anon';
  BEGIN
    PERFORM public.reset_allowlisted_test_user_db('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
    RAISE EXCEPTION 'anon must not execute reset RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';
END
$$;

SET ROLE service_role;
SELECT public.reset_allowlisted_test_user_db('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
RESET ROLE;
