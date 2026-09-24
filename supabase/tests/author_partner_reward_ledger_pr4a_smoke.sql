-- Behavioral smoke for PR4A. Runs only against the isolated stub database.
DO $$
DECLARE
  partner uuid := '11111111-1111-4111-8111-111111111111';
  invitee uuid := '22222222-2222-4222-8222-222222222222';
  referral uuid := '33333333-3333-4333-8333-333333333333';
  payment uuid := '44444444-4444-4444-8444-444444444444';
  sale uuid := '55555555-5555-4555-8555-555555555555';
  refund uuid := '66666666-6666-4666-8666-666666666666';
  refund_full uuid := '77777777-7777-4777-8777-777777777777';
  before_sale uuid := '88888888-8888-4888-8888-888888888888';
  expiry_sale uuid := '99999999-9999-4999-8999-999999999999';
  manual_event uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  delayed_invitee uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  delayed_referral uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
  delayed_sale uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
  delayed_payment uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7';
  delayed_user uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0';
  retry_payment uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
  retry_sale uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
  retry_refund uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10';
  net bigint;
  count_before integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (invitee, 'invitee@example.test');
  INSERT INTO public.authors (id, name) VALUES (partner, 'Partner'), (invitee, 'Invitee');
  INSERT INTO public.author_referrals (
    id, referrer_author_id, invitee_author_id, invitee_user_id, status, activated_at, expires_at
  ) VALUES (
    referral, partner, invitee, invitee, 'activated',
    '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z'
  );

  -- 10 001 × 20% floors to 2 000; the queue writes only after explicit drain.
  INSERT INTO public.author_ledger_entries (
    id, author_id, entry_type, amount_minor, currency, payment_id, effective_at, available_at
  ) VALUES (sale, invitee, 'sale_accrual', 10001, 'RUB', payment, '2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z');
  PERFORM public.process_due_author_partner_reward_obligations(50);
  SELECT coalesce(sum(amount_minor), 0) INTO net
  FROM public.author_partner_reward_ledger_entries WHERE source_sale_ledger_entry_id = sale;
  IF net <> 2000 THEN RAISE EXCEPTION 'expected 2000 partner accrual, got %', net; END IF;

  -- Same source event is terminal and cannot create a duplicate.
  SELECT count(*) INTO count_before FROM public.author_partner_reward_ledger_entries;
  PERFORM public.process_due_author_partner_reward_obligations(50);
  IF (SELECT count(*) FROM public.author_partner_reward_ledger_entries) <> count_before THEN
    RAISE EXCEPTION 'partner reward replay created duplicate';
  END IF;

  -- Refund after referral expiry: author net is 6 668, target is 1 333, delta -667.
  INSERT INTO public.author_ledger_entries (
    id, author_id, entry_type, amount_minor, currency, payment_id, effective_at
  ) VALUES (refund, invitee, 'refund_reversal', -3333, 'RUB', payment, '2030-01-01T00:00:00Z');
  PERFORM public.process_due_author_partner_reward_obligations(50);
  SELECT coalesce(sum(amount_minor), 0) INTO net
  FROM public.author_partner_reward_ledger_entries WHERE source_sale_ledger_entry_id = sale;
  IF net <> 1333 THEN RAISE EXCEPTION 'expected cumulative partner net 1333, got %', net; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.author_partner_reward_ledger_entries
    WHERE source_event_ledger_entry_id = refund AND amount_minor = -667
  ) THEN RAISE EXCEPTION 'expected -667 partner reversal'; END IF;

  -- A sale before activation, and a sale exactly at exclusive expires_at,
  -- both finish as skipped events without creating partner money.
  INSERT INTO public.author_ledger_entries (
    id, author_id, entry_type, amount_minor, currency, payment_id, effective_at
  ) VALUES
    (before_sale, invitee, 'sale_accrual', 100, 'RUB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '2025-12-31T23:59:59Z'),
    (expiry_sale, invitee, 'sale_accrual', 100, 'RUB', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '2029-01-01T00:00:00Z');
  PERFORM public.process_due_author_partner_reward_obligations(50);
  IF EXISTS (
    SELECT 1 FROM public.author_partner_reward_ledger_entries
    WHERE source_sale_ledger_entry_id IN (before_sale, expiry_sale)
  ) THEN RAISE EXCEPTION 'out-of-window sale created partner reward'; END IF;

  -- Unsupported manual events never enqueue a partner reward obligation.
  INSERT INTO public.author_ledger_entries (
    id, author_id, entry_type, amount_minor, currency, payment_id, effective_at
  ) VALUES (manual_event, invitee, 'manual_credit', 5, 'RUB', payment, now());
  IF EXISTS (
    SELECT 1 FROM public.author_partner_reward_obligations
    WHERE source_event_ledger_entry_id = manual_event
  ) THEN RAISE EXCEPTION 'manual adjustment enqueued partner reward'; END IF;

  -- Full cumulative refund converges exactly to zero.
  INSERT INTO public.author_ledger_entries (
    id, author_id, entry_type, amount_minor, currency, payment_id, effective_at
  ) VALUES (refund_full, invitee, 'refund_reversal', -6668, 'RUB', payment, '2030-02-01T00:00:00Z');
  PERFORM public.process_due_author_partner_reward_obligations(50);
  SELECT coalesce(sum(amount_minor), 0) INTO net
  FROM public.author_partner_reward_ledger_entries WHERE source_sale_ledger_entry_id = sale;
  IF net <> 0 THEN RAISE EXCEPTION 'expected full refund partner net 0, got %', net; END IF;

  -- The economic timestamp, not processing time, decides eligibility.
  INSERT INTO auth.users (id, email) VALUES (delayed_user, 'delayed@example.test');
  INSERT INTO public.authors (id, name) VALUES (delayed_invitee, 'Delayed Invitee');
  INSERT INTO public.author_referrals (
    id, referrer_author_id, invitee_author_id, invitee_user_id, status, activated_at, expires_at
  ) VALUES (
    delayed_referral, partner, delayed_invitee, delayed_user, 'expired',
    '2000-01-01T00:00:00Z', '2001-01-01T00:00:00Z'
  );
  INSERT INTO public.author_ledger_entries (
    id, author_id, entry_type, amount_minor, currency, payment_id, effective_at, available_at
  ) VALUES (
    delayed_sale, delayed_invitee, 'sale_accrual', 101, 'RUB', delayed_payment,
    '2000-06-01T00:00:00Z', '2000-06-15T00:00:00Z'
  );
  PERFORM public.process_due_author_partner_reward_obligations(50);
  IF (SELECT amount_minor FROM public.author_partner_reward_ledger_entries
      WHERE source_sale_ledger_entry_id = delayed_sale) <> 20 THEN
    RAISE EXCEPTION 'delayed processing after expiry must use source effective_at';
  END IF;

  -- A refund queued before its sale is retryable. Once the sale arrives,
  -- the same deterministic refund event converges without a duplicate.
  INSERT INTO public.author_ledger_entries (
    id, author_id, entry_type, amount_minor, currency, payment_id, effective_at
  ) VALUES (retry_refund, invitee, 'refund_reversal', -10, 'RUB', retry_payment, now());
  PERFORM public.process_due_author_partner_reward_obligations(50);
  IF (SELECT status FROM public.author_partner_reward_obligations
      WHERE source_event_ledger_entry_id = retry_refund) <> 'failed' THEN
    RAISE EXCEPTION 'out-of-order refund must remain retryable';
  END IF;
  INSERT INTO public.author_ledger_entries (
    id, author_id, entry_type, amount_minor, currency, payment_id, effective_at, available_at
  ) VALUES (retry_sale, invitee, 'sale_accrual', 100, 'RUB', retry_payment, '2026-06-01T00:00:00Z', '2026-06-15T00:00:00Z');
  PERFORM public.process_due_author_partner_reward_obligations(50);
  IF (SELECT coalesce(sum(amount_minor), 0) FROM public.author_partner_reward_ledger_entries
      WHERE source_sale_ledger_entry_id = retry_sale) <> 18 THEN
    RAISE EXCEPTION 'out-of-order source events did not converge';
  END IF;

  BEGIN
    UPDATE public.author_partner_reward_ledger_entries SET amount_minor = 1;
    RAISE EXCEPTION 'append-only UPDATE unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '0A000' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.author_partner_reward_ledger_entries;
    RAISE EXCEPTION 'append-only DELETE unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '0A000' THEN NULL;
  END;
END $$;

SELECT 'author_partner_reward_ledger_pr4a_smoke: ok' AS result;
