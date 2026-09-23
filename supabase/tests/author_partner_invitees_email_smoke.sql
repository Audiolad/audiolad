-- Isolated smoke for invitee list + activation email outbox.
-- Requires the author-partner stub and foundation/attribution/activation
-- migrations plus 20261031120000. Never apply to production.

-- Columns the enqueue trigger reads. The isolated stub does not create them.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS full_name text;

DO $$
DECLARE
  v_referrer_user uuid := 'e1111111-1111-4111-8111-111111111111';
  v_other_user uuid := 'e2222222-2222-4222-8222-222222222222';
  v_invitee_user uuid := 'e3333333-3333-4333-8333-333333333333';
  v_pending_user uuid := 'e4444444-4444-4444-8444-444444444444';
  v_no_email_owner uuid := 'e5555555-5555-4555-8555-555555555555';
  v_no_email_invitee uuid := 'e6666666-6666-4666-8666-666666666666';
  v_referrer_author uuid := 'ee111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_other_author uuid := 'ee222222-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_invitee_author uuid := 'ee333333-cccc-4ccc-8ccc-ccccccccccc1';
  v_no_email_author uuid := 'ee444444-dddd-4ddd-8ddd-ddddddddddd1';
  v_no_email_workspace uuid := 'ee555555-eeee-4eee-8eee-eeeeeeeeeee1';
  v_referral_id uuid;
  v_pending_id uuid;
  v_no_email_referral uuid;
  v_activated_at timestamptz;
  v_expires_at timestamptz;
  v_activated_at_2 timestamptz;
  v_expires_at_2 timestamptz;
  v_count integer;
  v_result jsonb;
  v_list jsonb;
  v_item jsonb;
  v_invitee_email text := 'invitee-secret@example.test';
  v_pending_at timestamptz;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_referrer_user, 'partner-owner@example.test'),
    (v_other_user, 'other-owner@example.test'),
    (v_invitee_user, v_invitee_email),
    (v_pending_user, 'pending-listener@example.test'),
    (v_no_email_owner, NULL),
    (v_no_email_invitee, 'no-email-invitee@example.test')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.profiles (id, email, full_name) VALUES
    (v_referrer_user, 'partner-owner@example.test', 'Сергей'),
    (v_other_user, 'other-owner@example.test', 'Другой'),
    (v_invitee_user, v_invitee_email, 'Слушатель'),
    (v_pending_user, 'pending-listener@example.test', 'Ожидающий'),
    (v_no_email_invitee, 'no-email-invitee@example.test', 'Без письма')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;

  INSERT INTO public.profiles (id) VALUES (v_no_email_owner)
  ON CONFLICT (id) DO UPDATE SET email = NULL, contact_email = NULL;

  INSERT INTO public.authors (id, name, slug) VALUES
    (v_referrer_author, 'Сергей', 'sergey-invitees'),
    (v_other_author, 'Другой владелец', 'other-invitees'),
    (v_invitee_author, 'Мария Соколова', 'maria-invitees'),
    (v_no_email_author, 'Без почты', 'no-email-referrer'),
    (v_no_email_workspace, 'Новый автор', 'no-email-workspace')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_referrer_author, v_referrer_user, 'owner'),
    (v_other_author, v_other_user, 'owner'),
    (v_no_email_author, v_no_email_owner, 'owner')
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

  SELECT count(*) INTO v_count
  FROM public.author_partner_activation_email_outbox;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'pending referral must not enqueue email, got %', v_count;
  END IF;

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_invitee_author, v_invitee_user, 'owner');

  v_result := public.finalize_author_partner_referral(v_invitee_user, v_invitee_author);
  IF coalesce(v_result->>'result', '') <> 'activated' THEN
    RAISE EXCEPTION 'expected activated, got %', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.author_partner_activation_email_outbox
  WHERE referral_id = v_referral_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'first activation must enqueue exactly one outbox row, got %', v_count;
  END IF;

  SELECT r.activated_at, r.expires_at
  INTO v_activated_at, v_expires_at
  FROM public.author_referrals AS r
  WHERE r.id = v_referral_id;

  IF v_activated_at IS NULL OR v_expires_at IS NULL THEN
    RAISE EXCEPTION 'canonical activation timestamps missing';
  END IF;
  IF v_expires_at <> v_activated_at + interval '3 years' THEN
    RAISE EXCEPTION 'expires_at must stay activated_at + 3 years';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_partner_activation_email_outbox AS o
    WHERE o.referral_id = v_referral_id
      AND o.recipient_email = 'partner-owner@example.test'
      AND o.payload->>'invitee_author_name' = 'Мария Соколова'
      AND o.payload::text NOT LIKE '%' || v_invitee_email || '%'
      AND (o.payload->>'activated_at')::timestamptz = v_activated_at
      AND (o.payload->>'expires_at')::timestamptz = v_expires_at
  ) THEN
    RAISE EXCEPTION 'outbox payload must keep canonical dates and hide invitee email';
  END IF;

  v_result := public.finalize_author_partner_referral(v_invitee_user, v_invitee_author);
  IF coalesce(v_result->>'result', '') <> 'already_activated' THEN
    RAISE EXCEPTION 'expected already_activated, got %', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.author_partner_activation_email_outbox
  WHERE referral_id = v_referral_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'repeated finalize must keep a single outbox row, got %', v_count;
  END IF;

  SELECT r.activated_at, r.expires_at
  INTO v_activated_at_2, v_expires_at_2
  FROM public.author_referrals AS r
  WHERE r.id = v_referral_id;
  IF v_activated_at_2 IS DISTINCT FROM v_activated_at
     OR v_expires_at_2 IS DISTINCT FROM v_expires_at THEN
    RAISE EXCEPTION 'repeated finalize must preserve activated_at and expires_at';
  END IF;

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
    v_pending_user,
    'SERGEY',
    public.author_partner_normalize_code('SERGEY'),
    now(),
    now() + interval '60 days',
    'attributed'
  )
  RETURNING id, attributed_at INTO v_pending_id, v_pending_at;

  SELECT count(*) INTO v_count
  FROM public.author_partner_activation_email_outbox;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a still-pending invitee must not add an outbox row, got %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  BEGIN
    PERFORM public.list_author_partner_invitees(v_referrer_author);
    RAISE EXCEPTION 'other owner must not see referrals';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  v_list := public.list_author_partner_invitees(v_other_author);
  IF coalesce(jsonb_array_length(v_list->'invitees'), -1) <> 0 THEN
    RAISE EXCEPTION 'other owner own list must be empty, got %', v_list;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_referrer_user::text, true);
  v_list := public.list_author_partner_invitees(v_referrer_author);
  IF v_list::text LIKE '%' || v_invitee_email || '%' THEN
    RAISE EXCEPTION 'owner list must not contain invitee email';
  END IF;

  SELECT item INTO v_item
  FROM jsonb_array_elements(v_list->'invitees') AS item
  WHERE item->>'state' = 'activated';
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'owner list missing activated invitee: %', v_list;
  END IF;
  IF (v_item->>'activated_at')::timestamptz IS DISTINCT FROM v_activated_at
     OR (v_item->>'expires_at')::timestamptz IS DISTINCT FROM v_expires_at THEN
    RAISE EXCEPTION 'list must return canonical activated_at/expires_at, got %', v_item;
  END IF;
  IF v_item->>'display_name' IS DISTINCT FROM 'Мария Соколова' THEN
    RAISE EXCEPTION 'list display name mismatch: %', v_item;
  END IF;

  SELECT item INTO v_item
  FROM jsonb_array_elements(v_list->'invitees') AS item
  WHERE item->>'state' = 'pending';
  IF (v_item->>'registered_at')::timestamptz IS DISTINCT FROM v_pending_at THEN
    RAISE EXCEPTION 'pending list date must be attributed_at, got %', v_item;
  END IF;
  IF v_item ? 'expires_at' OR v_item ? 'activated_at' THEN
    RAISE EXCEPTION 'pending list must not include activation dates: %', v_item;
  END IF;

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
    v_no_email_author,
    v_no_email_owner,
    v_no_email_invitee,
    'NOEMAIL',
    public.author_partner_normalize_code('NOEMAIL'),
    now(),
    now() + interval '60 days',
    'attributed'
  )
  RETURNING id INTO v_no_email_referral;

  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (v_no_email_workspace, v_no_email_invitee, 'owner');

  BEGIN
    PERFORM public.finalize_author_partner_referral(v_no_email_invitee, v_no_email_workspace);
    RAISE EXCEPTION 'missing partner email must not commit activation';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM NOT LIKE '%partner_activation_email_recipient_missing%' THEN
        RAISE;
      END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.author_referrals AS r
    WHERE r.id = v_no_email_referral
      AND (r.activated_at IS NOT NULL OR r.status IS DISTINCT FROM 'attributed')
  ) THEN
    RAISE EXCEPTION 'failed enqueue must roll activation back';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.author_partner_activation_email_outbox
    WHERE referral_id = v_no_email_referral
  ) THEN
    RAISE EXCEPTION 'failed enqueue must not leave an outbox row';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.author_partner_activation_email_outbox;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'failed enqueue must not change the successful outbox row, got %', v_count;
  END IF;
END;
$$;

-- Marker so the runner can see the script completed.
SELECT 'author_partner_invitees_email_smoke_ok' AS author_partner_invitees_email_smoke;
