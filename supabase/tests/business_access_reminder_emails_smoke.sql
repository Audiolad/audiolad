-- Disposable smoke for 20270207140000_business_access_reminder_emails.sql.
-- No SMTP. Rolls back.
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
DECLARE
  v_before uuid := gen_random_uuid();
  v_marketing uuid := gen_random_uuid();
  v_opt uuid := gen_random_uuid();
  v_blocked uuid := gen_random_uuid();
  v_soft uuid := gen_random_uuid();
  v_grace uuid := gen_random_uuid();
  v_last uuid := gen_random_uuid();
  v_extended uuid := gen_random_uuid();
  v_quiet uuid := gen_random_uuid();
  v_contact uuid;
  v_now timestamptz := clock_timestamp();
  v_before_end timestamptz := clock_timestamp() + interval '2 days';
  v_grace_end timestamptz := clock_timestamp() - interval '12 hours';
  v_last_playback timestamptz := (
    date_trunc('day', clock_timestamp() AT TIME ZONE 'Europe/Moscow') + interval '1 day'
  ) AT TIME ZONE 'Europe/Moscow';
  v_last_end timestamptz;
  v_count integer;
  v_kind text;
  v_send uuid;
  v_token uuid;
  v_email text;
  v_completed boolean;
  v_renewed timestamptz := clock_timestamp() + interval '3 days';
BEGIN
  v_last_end := v_last_playback - interval '3 days';

  IF has_function_privilege('anon', 'public.claim_business_access_reminders(integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_business_access_reminders(integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.complete_business_access_reminder(uuid, uuid)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.business_access_reminder_sends', 'SELECT')
     OR has_table_privilege('authenticated', 'public.business_access_reminder_sends', 'SELECT') THEN
    RAISE EXCEPTION 'privilege: clients must not claim or read reminder sends';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_business_access_reminders(integer, integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.complete_business_access_reminder(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fail_business_access_reminder(uuid, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privilege: service_role must claim and finish reminders';
  END IF;

  IF public.business_access_reminder_kind(v_before_end, v_now) IS DISTINCT FROM 'before_end' THEN
    RAISE EXCEPTION 'kind: two days ahead must be before_end';
  END IF;
  IF public.business_access_reminder_kind(v_grace_end, v_now) IS DISTINCT FROM 'grace_start' THEN
    RAISE EXCEPTION 'kind: twelve hours after the end must be grace_start';
  END IF;
  IF public.business_access_reminder_kind(v_last_end, v_now) IS DISTINCT FROM 'grace_last' THEN
    RAISE EXCEPTION 'kind: last grace day must be grace_last';
  END IF;
  IF public.business_access_reminder_kind(v_now + interval '10 days', v_now) IS NOT NULL THEN
    RAISE EXCEPTION 'kind: ten days ahead must be quiet';
  END IF;
  IF public.business_access_reminder_kind(v_now - interval '4 days', v_now) IS NOT NULL THEN
    RAISE EXCEPTION 'kind: after grace must be quiet';
  END IF;

  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (v_before, 'before-end@example.test', v_now),
    (v_marketing, 'marketing-ok@example.test', v_now),
    (v_opt, 'opt-out@example.test', v_now),
    (v_blocked, 'blocked-all@example.test', v_now),
    (v_soft, 'blocked-noncritical@example.test', v_now),
    (v_grace, 'grace-start@example.test', v_now),
    (v_last, 'grace-last@example.test', v_now),
    (v_extended, 'paid-extends@example.test', v_now),
    (v_quiet, 'unconfirmed@example.test', NULL);

  INSERT INTO public.access_grants (email_hash, user_id, kind, starts_at, ends_at, source) VALUES
    (repeat('a', 64), v_before, 'business_new_client', v_before_end - interval '30 days', v_before_end, 'trial'),
    (repeat('b', 64), v_marketing, 'business_new_client', v_before_end - interval '30 days', v_before_end, 'trial'),
    (repeat('c', 64), v_opt, 'business_new_client', v_before_end - interval '30 days', v_before_end, 'trial'),
    (repeat('d', 64), v_blocked, 'business_new_client', v_before_end - interval '30 days', v_before_end, 'trial'),
    (repeat('e', 64), v_soft, 'business_new_client', v_before_end - interval '30 days', v_before_end, 'trial'),
    (repeat('f', 64), v_grace, 'business_new_client', v_grace_end - interval '30 days', v_grace_end, 'trial'),
    (repeat('1', 64), v_last, 'business_new_client', v_last_end - interval '30 days', v_last_end, 'trial'),
    (repeat('2', 64), v_extended, 'business_new_client', v_grace_end - interval '30 days', v_grace_end, 'trial'),
    (repeat('3', 64), v_quiet, 'business_new_client', v_before_end - interval '30 days', v_before_end, 'trial');

  INSERT INTO public.access_paid_periods (email_hash, user_id, kind, paid_until)
  VALUES (repeat('2', 64), v_extended, 'business_new_client', v_now + interval '40 days');

  -- Auth insert already syncs a contact and default preferences. Reuse that row.
  SELECT c.id INTO v_contact
  FROM public.email_contacts AS c
  WHERE c.user_id = v_opt
    AND c.status = 'active'
  ORDER BY c.created_at
  LIMIT 1;
  IF v_contact IS NULL THEN
    INSERT INTO public.email_contacts (user_id, email, normalized_email, contact_type, source)
    VALUES (v_opt, 'opt-out@example.test', 'opt-out@example.test', 'registered_user', 'signup')
    RETURNING id INTO v_contact;
  END IF;
  INSERT INTO public.email_preferences (contact_id, user_id, service_notifications)
  VALUES (v_contact, v_opt, false)
  ON CONFLICT (user_id) DO UPDATE
  SET service_notifications = false,
      contact_id = EXCLUDED.contact_id;

  INSERT INTO public.email_suppressions (normalized_email, reason, scope, source) VALUES
    ('marketing-ok@example.test', 'unsubscribe', 'marketing', 'user_unsubscribe'),
    ('blocked-all@example.test', 'admin_block', 'all', 'admin'),
    ('blocked-noncritical@example.test', 'admin_block', 'all_non_critical', 'admin');

  SELECT count(*) INTO v_count FROM public.claim_business_access_reminders(50, 300);
  IF v_count IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'claim: expected 4 service letters, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.claim_business_access_reminders(50, 300);
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'claim: leased rows were claimed again';
  END IF;

  SELECT s.id, s.lease_token, public.normalize_contact_email(u.email), s.reminder_kind
  INTO v_send, v_token, v_email, v_kind
  FROM public.business_access_reminder_sends AS s
  JOIN auth.users AS u ON u.id = s.user_id
  WHERE s.user_id = v_marketing;
  IF v_kind IS DISTINCT FROM 'before_end' OR v_email IS DISTINCT FROM 'marketing-ok@example.test' THEN
    RAISE EXCEPTION 'marketing unsubscribe must not block the service letter';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_access_reminder_sends
    WHERE user_id = v_before AND reminder_kind = 'before_end' AND message_type = 'business_access_service'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.business_access_reminder_sends
    WHERE user_id = v_grace AND reminder_kind = 'grace_start'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.business_access_reminder_sends
    WHERE user_id = v_last AND reminder_kind = 'grace_last'
  ) THEN
    RAISE EXCEPTION 'claim missed one of the three windows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_access_reminder_sends
    WHERE user_id IN (v_opt, v_blocked, v_soft, v_extended, v_quiet)
  ) THEN
    RAISE EXCEPTION 'claim wrote a letter that service rules or a later paid period should skip';
  END IF;

  v_completed := public.fail_business_access_reminder(v_send, v_token, false);
  IF NOT v_completed THEN
    RAISE EXCEPTION 'transient fail did not release the lease';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.claim_business_access_reminders(50, 300) AS c
  WHERE c.user_id = v_marketing;
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'released lease was not claimed again';
  END IF;

  SELECT s.id, s.lease_token INTO v_send, v_token
  FROM public.business_access_reminder_sends AS s
  WHERE s.user_id = v_marketing;
  v_completed := public.fail_business_access_reminder(v_send, v_token, true);
  IF NOT v_completed THEN
    RAISE EXCEPTION 'permanent fail did not skip';
  END IF;
  SELECT count(*) INTO v_count FROM public.claim_business_access_reminders(50, 300);
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'skipped or still-leased rows were claimed';
  END IF;

  FOR v_send, v_token IN
    SELECT s.id, s.lease_token
    FROM public.business_access_reminder_sends AS s
    WHERE s.status = 'pending'
  LOOP
    IF NOT public.complete_business_access_reminder(v_send, v_token) THEN
      RAISE EXCEPTION 'complete rejected a live lease';
    END IF;
  END LOOP;
  IF public.complete_business_access_reminder(v_send, v_token) THEN
    RAISE EXCEPTION 'complete ran twice for one send';
  END IF;

  INSERT INTO public.access_paid_periods (email_hash, user_id, kind, paid_until)
  VALUES (repeat('a', 64), v_before, 'business_new_client', v_renewed);
  SELECT c.reminder_kind, c.period_end
  INTO v_kind, v_before_end
  FROM public.claim_business_access_reminders(50, 300) AS c;
  IF v_kind IS DISTINCT FROM 'before_end' OR v_before_end IS DISTINCT FROM v_renewed THEN
    RAISE EXCEPTION 'a new paid_until must open one new before_end letter';
  END IF;
  SELECT count(*) INTO v_count FROM public.claim_business_access_reminders(50, 300);
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'the renewed period was claimed twice';
  END IF;

  RAISE NOTICE 'business_access_reminder_emails_smoke: ok';
END $$;

DO $$
DECLARE
  v_yes uuid := gen_random_uuid();
  v_no uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_end timestamptz := clock_timestamp() + interval '2 days';
  v_paid timestamptz := clock_timestamp() + interval '3 days';
  v_count integer;
  v_kind text;
  v_seen timestamptz;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (v_yes, 'renew-yes@example.test', v_now),
    (v_no, 'renew-no@example.test', v_now);
  INSERT INTO public.access_grants (email_hash, user_id, kind, starts_at, ends_at, source) VALUES
    (repeat('4', 64), v_yes, 'business_new_client', v_end - interval '30 days', v_end, 'trial'),
    (repeat('5', 64), v_no, 'business_new_client', v_end - interval '30 days', v_end, 'trial');
  INSERT INTO public.business_access_renewal_choices (user_id, period_end, answer) VALUES
    (v_yes, v_end, 'yes'),
    (v_no, v_end, 'no');
  INSERT INTO public.business_access_renewal_notes (user_id, period_end, improvement_note)
  VALUES (v_no, v_end, 'Больше тихих вечеров');

  CREATE TEMP TABLE renewal_claimed ON COMMIT DROP AS
  SELECT * FROM public.claim_business_access_reminders(50, 300);
  IF EXISTS (SELECT 1 FROM renewal_claimed WHERE user_id = v_no) THEN
    RAISE EXCEPTION 'a no must stop later letters for this period';
  END IF;
  SELECT count(*) INTO v_count FROM renewal_claimed WHERE user_id = v_yes;
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'a yes must leave the letter in the queue, got %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_no::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.business_access_renewal_choices WHERE user_id = v_no) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'owner must see their own answer';
  END IF;
  IF (SELECT count(*) FROM public.business_access_renewal_choices WHERE user_id = v_yes) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'owner must not see another account answer';
  END IF;
  IF (SELECT count(*) FROM public.business_access_renewal_notes) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'the improvement note is not visible to the owner';
  END IF;
  RESET ROLE;

  INSERT INTO public.access_paid_periods (email_hash, user_id, kind, paid_until)
  VALUES (repeat('5', 64), v_no, 'business_new_client', v_paid);
  IF EXISTS (
    SELECT 1 FROM public.business_access_renewal_choices
    WHERE user_id = v_no AND answer = 'no'
  ) THEN
    RAISE EXCEPTION 'payment must clear the no';
  END IF;
  SELECT c.reminder_kind, c.period_end INTO v_kind, v_seen
  FROM public.claim_business_access_reminders(50, 300) AS c
  WHERE c.user_id = v_no;
  IF v_kind IS DISTINCT FROM 'before_end' OR v_seen IS DISTINCT FROM v_paid THEN
    RAISE EXCEPTION 'after payment the new period can be reminded';
  END IF;

  RAISE NOTICE 'business_access_renewal_choice_smoke: ok';
END $$;

ROLLBACK;
