-- Isolated smoke for 20261229120000 (task 0e05333f, final concept 2026-10-12 10:20 MSK). Rolls back.
BEGIN;
CREATE FUNCTION pg_temp.u(text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5($1)::uuid $$;
CREATE FUNCTION pg_temp.d(text) RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT CASE $1 WHEN 'p10' THEN date '2026-10-10' WHEN 'p11' THEN date '2026-11-10' WHEN 'p12' THEN date '2026-12-10' ELSE date '2027-01-10' END $$;
CREATE FUNCTION pg_temp.eq(label text, got numeric, want numeric) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF got IS DISTINCT FROM want THEN RAISE EXCEPTION '% : got %, want %', label, got, want; END IF; END $$;
CREATE FUNCTION pg_temp.holder(p_run uuid, p_holder text, p_loc text DEFAULT NULL) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(amount_minor), 0) FROM public.business_royalty_accruals
  WHERE run_id = p_run AND rightsholder_id = pg_temp.u(p_holder) AND (p_loc IS NULL OR location_id = pg_temp.u(p_loc)) $$;

INSERT INTO public.music_rightsholders (id, display_name, entity_type) VALUES
  (pg_temp.u('sergey'), 'Сергей Петров', 'person'), (pg_temp.u('olga'), 'Ольга', 'person'),
  (pg_temp.u('alex'), 'Александр', 'person'), (pg_temp.u('half'), 'Неполные права', 'person');
INSERT INTO public.business_service_operators (id, legal_name, legal_form, same_subject_rightsholder_id, active_from)
  VALUES (pg_temp.u('op'), 'ИП Петров С. С.', 'sole_trader', pg_temp.u('sergey'), '2026-10-01');
INSERT INTO public.business_royalty_formula_versions (id, version, author_fund_bps)
  VALUES (pg_temp.u('f1'), 'v1', 5000);
-- Shares: Sergey track = composition 5000 + recording 5000 (same holder, separate layers);
-- Olga = recording only; Alexander = composition only; half = 5000 total -> not admitted.
INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from) VALUES
  (pg_temp.u('tS'), pg_temp.u('sergey'), 'composition', 5000, '2026-01-01'),
  (pg_temp.u('tS'), pg_temp.u('sergey'), 'recording', 5000, '2026-01-01'),
  (pg_temp.u('tO'), pg_temp.u('olga'), 'recording', 10000, '2026-01-01'),
  (pg_temp.u('tA'), pg_temp.u('alex'), 'composition', 10000, '2026-01-01'),
  (pg_temp.u('tH'), pg_temp.u('half'), 'recording', 5000, '2026-01-01');
INSERT INTO public.business_royalty_periods (id, period_month) VALUES
  (pg_temp.u('p10'), '2026-10-01'), (pg_temp.u('p11'), '2026-11-01'), (pg_temp.u('p12'), '2026-12-01'), (pg_temp.u('p01'), '2027-01-01');

DO $$
DECLARE r uuid; r2 uuid; pr record; m bigint := 60000;
BEGIN
  -- ExactExample: revenue 1000, deductions 100, base 900, fund 450, AudioLad 450; 30/40/30 -> 135/180/135.
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at)
    VALUES (pg_temp.u('pay10'), pg_temp.u('p10'), 'pay-10', 'payment', 100000, 'single_point', '2026-10-05');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id) VALUES (pg_temp.u('pay10'), pg_temp.u('L1'));
  INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, location_id, document_reference, status, approved_by, approved_at)
    VALUES (pg_temp.u('p10'), 'acquiring_fee', 10000, pg_temp.u('L1'), 'реестр эквайринга 10/2026', 'approved', 'smoke', now());
  -- not approved -> ignored
  INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, location_id, document_reference)
    VALUES (pg_temp.u('p10'), 'direct_point_service_cost', 5000, pg_temp.u('L1'), 'черновик');
  -- Offline: Olga 25 min online + 15 min offline (equal weight); duplicate offline sync ignored (Dedup).
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, offline, dedup_key) VALUES
    (pg_temp.d('p10'), pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tS'), 30*m, false, 'e1'),
    (pg_temp.d('p10'), pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tO'), 25*m, false, 'e2'),
    (pg_temp.d('p10'), pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tO'), 15*m, true, 'e3'),
    (pg_temp.d('p10'), pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tA'), 30*m, false, 'e4'),
    (pg_temp.d('p10'), pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tH'), 50*m, false, 'e5');  -- NotAdmitted: excluded from denominator
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, offline, dedup_key)
    VALUES (pg_temp.d('p10'), pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tO'), 15*m, true, 'e3') ON CONFLICT (dedup_key) DO NOTHING;
  BEGIN
    INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key)
      VALUES (pg_temp.d('p10'), pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tO'), 15*m, 'e3');
    RAISE EXCEPTION 'Dedup: duplicate event accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  r := public.business_royalty_run_preliminary(pg_temp.u('p10'), pg_temp.u('f1'));
  SELECT * INTO pr FROM public.business_royalty_point_results WHERE run_id = r;
  PERFORM pg_temp.eq('ExactExample: payments', pr.payments_minor, 100000);
  PERFORM pg_temp.eq('ExactExample: deductions', pr.deductions_minor, 10000);
  PERFORM pg_temp.eq('ExactExample: base', pr.base_minor, 90000);
  PERFORM pg_temp.eq('ExactExample: fund', pr.author_fund_minor, 45000);
  PERFORM pg_temp.eq('ExactExample: audiolad', pr.audiolad_income_minor, 45000);
  PERFORM pg_temp.eq('ExactExample: confirmed minutes (offline+dedup)', pr.confirmed_ms, 100*m);
  PERFORM pg_temp.eq('ExactExample: sergey', pg_temp.holder(r, 'sergey'), 13500);
  PERFORM pg_temp.eq('ExactExample: olga', pg_temp.holder(r, 'olga'), 18000);
  PERFORM pg_temp.eq('ExactExample: alexander', pg_temp.holder(r, 'alex'), 13500);
  PERFORM pg_temp.eq('NotAdmitted: half', pg_temp.holder(r, 'half'), 0);
  -- Layers: Sergey composition and recording accounted separately, minute not doubled.
  PERFORM pg_temp.eq('Layers: sergey rows', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('sergey')), 2);
  PERFORM pg_temp.eq('Layers: sergey composition', (SELECT amount_minor FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('sergey') AND rights_layer = 'composition'), 6750);
  PERFORM pg_temp.eq('NoDoubleMinute: distributed <= fund', pr.distributed_minor, 45000);
  -- Management: Sergey (operator is same subject) is management; others payable.
  PERFORM pg_temp.eq('Management: sergey', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('sergey') AND settlement_mode = 'management'), 2);
  PERFORM pg_temp.eq('Management: olga payable', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('olga') AND settlement_mode = 'payable'), 1);

  -- States/guards: preliminary cannot be approved under a proposed formula; payout only approved+payable.
  BEGIN UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
    RAISE EXCEPTION 'expected'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'business_royalty_formula_not_approved' THEN RAISE; END IF; END;
  BEGIN UPDATE public.business_royalty_accruals SET payout_state = 'in_payout' WHERE run_id = r AND rightsholder_id = pg_temp.u('olga');
    RAISE EXCEPTION 'expected'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.business_royalty_accruals SET amount_minor = 1 WHERE run_id = r AND rightsholder_id = pg_temp.u('olga');
    RAISE EXCEPTION 'expected'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'business_royalty_accrual_immutable' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.business_royalty_accruals WHERE run_id = r;
    RAISE EXCEPTION 'expected'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'business_royalty_append_only' THEN RAISE; END IF; END;
  BEGIN INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, location_id, document_reference)
      VALUES (pg_temp.u('p10'), 'marketing', 1, pg_temp.u('L1'), 'x');
    RAISE EXCEPTION 'expected'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.business_royalty_formula_versions SET author_fund_bps = 4000 WHERE id = pg_temp.u('f1');
    RAISE EXCEPTION 'expected'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'business_royalty_append_only' THEN RAISE; END IF; END;

  -- History: rerun -> run 2, run 1 preliminary superseded; then approve with approved formula.
  r2 := public.business_royalty_run_preliminary(pg_temp.u('p10'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('History: run_no', (SELECT run_no FROM public.business_royalty_calc_runs WHERE id = r2), 2);
  PERFORM pg_temp.eq('History: superseded', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r AND calculation_state = 'superseded'), 4);
  UPDATE public.business_royalty_formula_versions SET status = 'approved', approved_by = 'Сергей Петров', approved_at = now(),
    approval_document = 'концепция 2026-10-12 10:20' WHERE id = pg_temp.u('f1');
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r2;
  UPDATE public.business_royalty_accruals SET payout_state = 'in_payout' WHERE run_id = r2 AND rightsholder_id = pg_temp.u('olga');
  BEGIN UPDATE public.business_royalty_accruals SET payout_state = 'in_payout' WHERE run_id = r2 AND rightsholder_id = pg_temp.u('sergey');
    RAISE EXCEPTION 'expected'; EXCEPTION WHEN check_violation THEN NULL; END;  -- management never paid out

  -- MultiPoint + SharedPayment: 3000 weighted 2:1 over L1/L2; deduction 300 on the payment split the same way.
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, allocation_rule_note, occurred_at)
    VALUES (pg_temp.u('pay11'), pg_temp.u('p11'), 'pay-11', 'payment', 300000, 'weighted', 'вес = число кабинетов', '2026-11-03');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id, weight) VALUES
    (pg_temp.u('pay11'), pg_temp.u('L1'), 2), (pg_temp.u('pay11'), pg_temp.u('L2'), 1);
  INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, payment_id, document_reference, status, approved_by, approved_at)
    VALUES (pg_temp.u('p11'), 'sales_tax', 30000, pg_temp.u('pay11'), 'предварительно, до решения бухгалтера', 'approved', 'smoke', now());
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES
    (pg_temp.d('p11'), pg_temp.u('p11'), pg_temp.u('L1'), pg_temp.u('tO'), 60*m, 'n1'),
    (pg_temp.d('p11'), pg_temp.u('p11'), pg_temp.u('L1'), pg_temp.u('tA'), 30*m, 'n2'),
    (pg_temp.d('p11'), pg_temp.u('p11'), pg_temp.u('L2'), pg_temp.u('tS'), 10*m, 'n3');
  r := public.business_royalty_run_preliminary(pg_temp.u('p11'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('SharedPayment: L1 payments', (SELECT payments_minor FROM public.business_royalty_point_results WHERE run_id = r AND location_id = pg_temp.u('L1')), 200000);
  PERFORM pg_temp.eq('SharedPayment: L2 payments', (SELECT payments_minor FROM public.business_royalty_point_results WHERE run_id = r AND location_id = pg_temp.u('L2')), 100000);
  PERFORM pg_temp.eq('SharedPayment: L1 fund', (SELECT author_fund_minor FROM public.business_royalty_point_results WHERE run_id = r AND location_id = pg_temp.u('L1')), 90000);
  PERFORM pg_temp.eq('MultiPoint: olga L1', pg_temp.holder(r, 'olga', 'L1'), 60000);
  PERFORM pg_temp.eq('MultiPoint: alex L1', pg_temp.holder(r, 'alex', 'L1'), 30000);
  PERFORM pg_temp.eq('MultiPoint: sergey L2 (100% of L2 fund)', pg_temp.holder(r, 'sergey', 'L2'), 45000);
  PERFORM pg_temp.eq('MultiPoint: sergey not on L1', pg_temp.holder(r, 'sergey', 'L1'), 0);

  -- Refunds + NegativeClamp: L1 1000 - refund 800 - deduction 400 = -200 -> base 0, fund 0;
  -- L2 1000 - refund 200 = 800 -> fund 400.
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at) VALUES
    (pg_temp.u('a'), pg_temp.u('p12'), 'pay-12a', 'payment', 100000, 'single_point', '2026-12-01'),
    (pg_temp.u('b'), pg_temp.u('p12'), 'pay-12a', 'refund', -80000, 'single_point', '2026-12-10'),
    (pg_temp.u('c'), pg_temp.u('p12'), 'pay-12c', 'payment', 100000, 'single_point', '2026-12-01'),
    (pg_temp.u('d'), pg_temp.u('p12'), 'pay-12c', 'refund', -20000, 'single_point', '2026-12-11');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id) VALUES
    (pg_temp.u('a'), pg_temp.u('L1')), (pg_temp.u('b'), pg_temp.u('L1')), (pg_temp.u('c'), pg_temp.u('L2')), (pg_temp.u('d'), pg_temp.u('L2'));
  INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, location_id, document_reference, status, approved_by, approved_at)
    VALUES (pg_temp.u('p12'), 'direct_point_service_cost', 40000, pg_temp.u('L1'), 'акт', 'approved', 'smoke', now());
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES
    (pg_temp.d('p12'), pg_temp.u('p12'), pg_temp.u('L1'), pg_temp.u('tO'), 10*m, 'd1'), (pg_temp.d('p12'), pg_temp.u('p12'), pg_temp.u('L2'), pg_temp.u('tS'), 10*m, 'd2');
  r := public.business_royalty_run_preliminary(pg_temp.u('p12'), pg_temp.u('f1'));
  SELECT * INTO pr FROM public.business_royalty_point_results WHERE run_id = r AND location_id = pg_temp.u('L1');
  PERFORM pg_temp.eq('NegativeClamp: raw base', pr.raw_base_minor, -20000);
  PERFORM pg_temp.eq('NegativeClamp: base', pr.base_minor, 0);
  PERFORM pg_temp.eq('NegativeClamp: fund', pr.author_fund_minor, 0);
  PERFORM pg_temp.eq('NegativeClamp: olga', pg_temp.holder(r, 'olga'), 0);
  PERFORM pg_temp.eq('Refunds: L2 fund', (SELECT author_fund_minor FROM public.business_royalty_point_results WHERE run_id = r AND location_id = pg_temp.u('L2')), 40000);
  PERFORM pg_temp.eq('Refunds: sergey', pg_temp.holder(r, 'sergey'), 40000);

  -- NoPlays: payment but no confirmed plays -> fund held, nothing distributed, no accruals.
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at)
    VALUES (pg_temp.u('e'), pg_temp.u('p01'), 'pay-01', 'payment', 100000, 'single_point', '2027-01-02');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id) VALUES (pg_temp.u('e'), pg_temp.u('L1'));
  r := public.business_royalty_run_preliminary(pg_temp.u('p01'), pg_temp.u('f1'));
  SELECT * INTO pr FROM public.business_royalty_point_results WHERE run_id = r;
  IF pr.status <> 'held_no_plays' THEN RAISE EXCEPTION 'NoPlays: status %', pr.status; END IF;
  PERFORM pg_temp.eq('NoPlays: fund kept', pr.author_fund_minor, 50000);
  PERFORM pg_temp.eq('NoPlays: distributed', pr.distributed_minor, 0);
  PERFORM pg_temp.eq('NoPlays: accruals', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r), 0);
END $$;

-- ---------------------------------------------------------------- review fixes (PR #826 review @a84d92d9)
CREATE FUNCTION pg_temp.expect_err(label text, stmt text, want text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN
    IF want IS NOT NULL AND SQLERRM NOT LIKE want || '%' THEN RAISE EXCEPTION '% : got error %, want %', label, SQLERRM, want; END IF;
    RETURN; END;
  RAISE EXCEPTION '% : statement succeeded, expected %', label, want;
END $$;
INSERT INTO public.music_rightsholders (id, display_name, entity_type) VALUES (pg_temp.u('boris'), 'Борис', 'person');
INSERT INTO public.business_royalty_periods (id, period_month) VALUES
  (pg_temp.u('q02'), '2027-02-01'), (pg_temp.u('q03'), '2027-03-01'), (pg_temp.u('q04'), '2027-04-01'),
  (pg_temp.u('q05'), '2027-05-01'), (pg_temp.u('q06'), '2027-06-01'), (pg_temp.u('q07'), '2027-07-01'), (pg_temp.u('q08'), '2027-08-01');
DO $$
DECLARE r uuid; r2 uuid; v uuid; pr record; m bigint := 60000;
BEGIN
  -- Rounding: fund 500.00 over three equal holders -> 166.67 + 166.67 + 166.66 = 500.00 exactly (largest remainder).
  INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from) VALUES
    (pg_temp.u('r1'), pg_temp.u('olga'), 'recording', 10000, '2027-01-01'),
    (pg_temp.u('r2'), pg_temp.u('alex'), 'recording', 10000, '2027-01-01'),
    (pg_temp.u('r3'), pg_temp.u('boris'), 'recording', 10000, '2027-01-01');
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at)
    VALUES (pg_temp.u('q02pay'), pg_temp.u('q02'), 'q02', 'payment', 100000, 'single_point', '2027-02-01');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id) VALUES (pg_temp.u('q02pay'), pg_temp.u('L5'));
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES
    ('2027-02-02', pg_temp.u('q02'), pg_temp.u('L5'), pg_temp.u('r1'), 10*m, 'q02-1'),
    ('2027-02-02', pg_temp.u('q02'), pg_temp.u('L5'), pg_temp.u('r2'), 10*m, 'q02-2'),
    ('2027-02-02', pg_temp.u('q02'), pg_temp.u('L5'), pg_temp.u('r3'), 10*m, 'q02-3');
  r := public.business_royalty_run_preliminary(pg_temp.u('q02'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('Rounding: distributed = fund', (SELECT sum(amount_minor) FROM public.business_royalty_accruals WHERE run_id = r), 50000);
  PERFORM pg_temp.eq('Rounding: max', (SELECT max(amount_minor) FROM public.business_royalty_accruals WHERE run_id = r), 16667);
  PERFORM pg_temp.eq('Rounding: min', (SELECT min(amount_minor) FROM public.business_royalty_accruals WHERE run_id = r), 16666);
  PERFORM pg_temp.eq('Rounding: point distributed', (SELECT distributed_minor FROM public.business_royalty_point_results WHERE run_id = r), 50000);

  -- StateMachine on approved run 2 of October.
  r2 := (SELECT id FROM public.business_royalty_calc_runs WHERE period_id = pg_temp.u('p10') AND run_no = 2);
  PERFORM pg_temp.expect_err('StateMachine: approved->preliminary', format(
    'UPDATE public.business_royalty_accruals SET calculation_state = %L WHERE run_id = %L', 'preliminary', r2), 'business_royalty_accrual_state_transition');
  PERFORM pg_temp.expect_err('StateMachine: approved->void', format(
    'UPDATE public.business_royalty_accruals SET calculation_state = %L WHERE run_id = %L', 'void', r2), 'business_royalty_accrual_state_transition');
  UPDATE public.business_royalty_accruals SET payout_state = 'paid' WHERE run_id = r2 AND rightsholder_id = pg_temp.u('olga');
  PERFORM pg_temp.expect_err('StateMachine: paid->none', format(
    'UPDATE public.business_royalty_accruals SET payout_state = %L WHERE run_id = %L AND rightsholder_id = %L', 'none', r2, pg_temp.u('olga')), 'business_royalty_payout_state_transition');
  PERFORM pg_temp.expect_err('StateMachine: none->paid skip', format(
    'UPDATE public.business_royalty_accruals SET payout_state = %L WHERE run_id = %L AND rightsholder_id = %L', 'paid', r2, pg_temp.u('alex')), 'business_royalty_payout_state_transition');
  PERFORM pg_temp.expect_err('StateMachine: insert approved', format(
    'INSERT INTO public.business_royalty_accruals (run_id, period_id, location_id, rightsholder_id, rights_layer, holder_ms, point_confirmed_ms, author_fund_minor, amount_minor, calculation_basis, settlement_mode, calculation_state) VALUES (%L, %L, %L, %L, %L, 0, 1, 0, 1, %L, %L, %L)',
    r2, pg_temp.u('p10'), pg_temp.u('L9'), pg_temp.u('boris'), 'recording', '{}', 'payable', 'approved'), 'business_royalty_accrual_must_start_preliminary');

  -- RecalcAfterApproval: one more confirmed play -> adjustment deltas only; approved + delta = new result.
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key)
    VALUES ('2026-10-20', pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tA'), 10*m, 'e6');
  r := public.business_royalty_run_preliminary(pg_temp.u('p10'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('RecalcAfterApproval: mode', (SELECT CASE mode WHEN 'adjustment' THEN 1 ELSE 0 END FROM public.business_royalty_calc_runs WHERE id = r), 1);
  PERFORM pg_temp.eq('RecalcAfterApproval: only adjustments', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r AND entry_kind <> 'adjustment'), 0);
  PERFORM pg_temp.eq('RecalcAfterApproval: approved count unchanged', (SELECT count(*) FROM public.business_royalty_accruals WHERE period_id = pg_temp.u('p10') AND calculation_state = 'approved'), 4);
  PERFORM pg_temp.eq('RecalcAfterApproval: olga delta', pg_temp.holder(r, 'olga'), 16364 - 18000);
  PERFORM pg_temp.eq('RecalcAfterApproval: alex delta', pg_temp.holder(r, 'alex'), 16364 - 13500);
  PERFORM pg_temp.eq('RecalcAfterApproval: sergey delta', pg_temp.holder(r, 'sergey'), 12272 - 13500);
  PERFORM pg_temp.eq('RecalcAfterApproval: approved+delta = fund', (SELECT sum(amount_minor) FROM public.business_royalty_accruals
    WHERE period_id = pg_temp.u('p10') AND (calculation_state = 'approved' OR run_id = r)), 45000);
  r := public.business_royalty_run_preliminary(pg_temp.u('p10'), pg_temp.u('f1'));
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
  r := public.business_royalty_run_preliminary(pg_temp.u('p10'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('RecalcAfterApproval: no change -> no rows', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r), 0);

  -- Reversal: explicit audited reversal entry; no second reversal; reason required.
  v := public.business_royalty_reverse_accrual((SELECT id FROM public.business_royalty_accruals WHERE run_id = r2 AND rightsholder_id = pg_temp.u('alex')), 'ошибка в отчёте точки');
  PERFORM pg_temp.eq('Reversal: amount', (SELECT amount_minor FROM public.business_royalty_accruals WHERE id = v), -13500);
  PERFORM pg_temp.expect_err('Reversal: twice', format('SELECT public.business_royalty_reverse_accrual(%L, %L)',
    (SELECT id FROM public.business_royalty_accruals WHERE run_id = r2 AND rightsholder_id = pg_temp.u('alex')), 'x'), NULL);
  PERFORM pg_temp.expect_err('Reversal: reason', format('SELECT public.business_royalty_reverse_accrual(%L, %L)',
    (SELECT id FROM public.business_royalty_accruals WHERE run_id = r2 AND rightsholder_id = pg_temp.u('olga')), ' '), 'business_royalty_reason_required');

  -- AppendOnly registries.
  PERFORM pg_temp.expect_err('AppendOnly: allocation update', format('UPDATE public.business_royalty_payment_allocations SET location_id = %L', pg_temp.u('Lx')), 'business_royalty_append_only');
  PERFORM pg_temp.expect_err('AppendOnly: share delete', 'DELETE FROM public.business_royalty_track_shares', 'business_royalty_append_only');
  PERFORM pg_temp.expect_err('AppendOnly: share bps', 'UPDATE public.business_royalty_track_shares SET share_bps = 1', 'business_royalty_append_only');
  PERFORM pg_temp.expect_err('AppendOnly: period month', format('UPDATE public.business_royalty_periods SET period_month = %L WHERE id = %L', '2030-01-01', pg_temp.u('p01')), 'business_royalty_append_only');
  PERFORM pg_temp.expect_err('AppendOnly: operator name', format('UPDATE public.business_service_operators SET legal_name = %L', 'x'), 'business_royalty_append_only');
  PERFORM pg_temp.expect_err('AppendOnly: truncate plays', 'TRUNCATE public.business_royalty_plays CASCADE', 'business_royalty_append_only');
  PERFORM pg_temp.expect_err('AppendOnly: truncate accruals', 'TRUNCATE public.business_royalty_accruals CASCADE', 'business_royalty_append_only');
  PERFORM pg_temp.expect_err('AppendOnly: deduction approved->proposed', format('UPDATE public.business_royalty_deductions SET status = %L WHERE period_id = %L AND status = %L', 'proposed', pg_temp.u('p10'), 'approved'), 'business_royalty_append_only');
  UPDATE public.business_royalty_deductions SET status = 'rejected' WHERE period_id = pg_temp.u('p10') AND status = 'proposed';
  PERFORM pg_temp.eq('AppendOnly: deduction audit', (SELECT count(*) FROM public.business_royalty_deduction_status_events e
    JOIN public.business_royalty_deductions d ON d.id = e.deduction_id WHERE d.period_id = pg_temp.u('p10') AND e.to_status = 'rejected' AND e.from_status = 'proposed'), 1);
  UPDATE public.business_royalty_periods SET status = 'closed' WHERE id = pg_temp.u('p01');
  PERFORM pg_temp.expect_err('AppendOnly: closed reopen', format('UPDATE public.business_royalty_periods SET status = %L WHERE id = %L', 'open', pg_temp.u('p01')), 'business_royalty_append_only');
  PERFORM pg_temp.expect_err('AppendOnly: closed play', format('INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES (%L, %L, %L, %L, 1, %L)',
    '2027-01-05', pg_temp.u('p01'), pg_temp.u('L1'), pg_temp.u('tO'), 'closed-1'), 'business_royalty_period_closed');
  PERFORM pg_temp.expect_err('AppendOnly: closed run', format('SELECT public.business_royalty_run_preliminary(%L, %L)', pg_temp.u('p01'), pg_temp.u('f1')), 'business_royalty_period_closed');
  PERFORM pg_temp.expect_err('AppendOnly: play outside month', format('INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES (%L, %L, %L, %L, 1, %L)',
    '2027-09-05', pg_temp.u('q02'), pg_temp.u('L1'), pg_temp.u('tO'), 'out-1'), 'business_royalty_play_outside_period');

  -- Allocation: unallocated / single_point with two points / fixed sum mismatch are visible and block the run.
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at) VALUES
    (pg_temp.u('q03pay'), pg_temp.u('q03'), 'q03', 'payment', 50000, 'single_point', '2027-03-01'),
    (pg_temp.u('q04pay'), pg_temp.u('q04'), 'q04', 'payment', 50000, 'single_point', '2027-04-01'),
    (pg_temp.u('q05pay'), pg_temp.u('q05'), 'q05', 'payment', 100000, 'fixed_amounts', '2027-05-01'),
    (pg_temp.u('q06pay'), pg_temp.u('q06'), 'q06', 'payment', 100000, 'fixed_amounts', '2027-06-01');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id, fixed_amount_minor) VALUES
    (pg_temp.u('q04pay'), pg_temp.u('L1'), NULL), (pg_temp.u('q04pay'), pg_temp.u('L2'), NULL),
    (pg_temp.u('q05pay'), pg_temp.u('L1'), 70000), (pg_temp.u('q05pay'), pg_temp.u('L2'), 20000),
    (pg_temp.u('q06pay'), pg_temp.u('L1'), 70000), (pg_temp.u('q06pay'), pg_temp.u('L2'), 30000);
  PERFORM pg_temp.eq('Allocation: unallocated visible', (SELECT count(*) FROM public.business_royalty_allocation_issues(pg_temp.u('q03')) WHERE issue = 'unallocated'), 1);
  PERFORM pg_temp.expect_err('Allocation: unallocated run', format('SELECT public.business_royalty_run_preliminary(%L, %L)', pg_temp.u('q03'), pg_temp.u('f1')), 'business_royalty_payment_allocation_invalid');
  PERFORM pg_temp.eq('Allocation: single_point visible', (SELECT count(*) FROM public.business_royalty_allocation_issues(pg_temp.u('q04')) WHERE issue = 'single_point_requires_one_point'), 1);
  PERFORM pg_temp.expect_err('Allocation: single_point run', format('SELECT public.business_royalty_run_preliminary(%L, %L)', pg_temp.u('q04'), pg_temp.u('f1')), 'business_royalty_payment_allocation_invalid');
  PERFORM pg_temp.eq('Allocation: fixed mismatch visible', (SELECT count(*) FROM public.business_royalty_allocation_issues(pg_temp.u('q05')) WHERE issue = 'fixed_amounts_sum_mismatch'), 1);
  PERFORM pg_temp.expect_err('Allocation: fixed mismatch run', format('SELECT public.business_royalty_run_preliminary(%L, %L)', pg_temp.u('q05'), pg_temp.u('f1')), 'business_royalty_payment_allocation_invalid');
  r := public.business_royalty_run_preliminary(pg_temp.u('q06'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('Allocation: fixed L1 exact', (SELECT payments_minor FROM public.business_royalty_point_results WHERE run_id = r AND location_id = pg_temp.u('L1')), 70000);
  PERFORM pg_temp.eq('Allocation: fixed L2 exact', (SELECT payments_minor FROM public.business_royalty_point_results WHERE run_id = r AND location_id = pg_temp.u('L2')), 30000);

  -- MidMonthShare: Olga holds the recording until 15 July, Boris from 15 July; plays on 10th and 20th.
  INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from, valid_until) VALUES
    (pg_temp.u('tM'), pg_temp.u('olga'), 'recording', 10000, '2027-07-01', '2027-07-15'),
    (pg_temp.u('tM'), pg_temp.u('boris'), 'recording', 10000, '2027-07-15', NULL);
  PERFORM pg_temp.expect_err('MidMonthShare: overlap', format('INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from) VALUES (%L, %L, %L, 10000, %L)',
    pg_temp.u('tM'), pg_temp.u('olga'), 'recording', '2027-07-01'), 'business_royalty_share_overlap');
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at)
    VALUES (pg_temp.u('q07pay'), pg_temp.u('q07'), 'q07', 'payment', 20000, 'single_point', '2027-07-01');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id) VALUES (pg_temp.u('q07pay'), pg_temp.u('L7'));
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES
    ('2027-07-10', pg_temp.u('q07'), pg_temp.u('L7'), pg_temp.u('tM'), 10*m, 'q07-1'),
    ('2027-07-20', pg_temp.u('q07'), pg_temp.u('L7'), pg_temp.u('tM'), 10*m, 'q07-2');
  r := public.business_royalty_run_preliminary(pg_temp.u('q07'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('MidMonthShare: olga', pg_temp.holder(r, 'olga'), 5000);
  PERFORM pg_temp.eq('MidMonthShare: boris', pg_temp.holder(r, 'boris'), 5000);
  UPDATE public.business_royalty_track_shares SET valid_until = '2027-12-01' WHERE audio_item_id = pg_temp.u('tM') AND rightsholder_id = pg_temp.u('boris');
  PERFORM pg_temp.expect_err('MidMonthShare: reopen', format('UPDATE public.business_royalty_track_shares SET valid_until = NULL WHERE audio_item_id = %L', pg_temp.u('tM')), 'business_royalty_append_only');

  -- DeductionRounding: 1000 equal over 3 points (333.34/333.33/333.33); 100 deduction on the payment sums to 100.00 exactly.
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at)
    VALUES (pg_temp.u('q08pay'), pg_temp.u('q08'), 'q08', 'payment', 100000, 'equal', '2027-08-01');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id) VALUES
    (pg_temp.u('q08pay'), pg_temp.u('L1')), (pg_temp.u('q08pay'), pg_temp.u('L2')), (pg_temp.u('q08pay'), pg_temp.u('L3'));
  INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, payment_id, document_reference, status, approved_by, approved_at)
    VALUES (pg_temp.u('q08'), 'acquiring_fee', 10000, pg_temp.u('q08pay'), 'реестр эквайринга 08/2027', 'approved', 'smoke', now());
  r := public.business_royalty_run_preliminary(pg_temp.u('q08'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('DeductionRounding: payments sum', (SELECT sum(payments_minor) FROM public.business_royalty_point_results WHERE run_id = r), 100000);
  PERFORM pg_temp.eq('DeductionRounding: deductions sum', (SELECT sum(deductions_minor) FROM public.business_royalty_point_results WHERE run_id = r), 10000);
  PERFORM pg_temp.eq('DeductionRounding: max point', (SELECT max(deductions_minor) FROM public.business_royalty_point_results WHERE run_id = r), 3334);

  -- RunNumbering: runs of a period are numbered sequentially under a period row lock.
  PERFORM pg_temp.eq('RunNumbering: p10', (SELECT max(run_no) FROM public.business_royalty_calc_runs WHERE period_id = pg_temp.u('p10')), 5);
END $$;

-- ---------------------------------------------------------------- re-review fixes (PR #826 re-review @c11158de)
INSERT INTO public.business_royalty_periods (id, period_month) VALUES
  (pg_temp.u('q09'), '2027-09-01'), (pg_temp.u('q10'), '2027-10-01'), (pg_temp.u('q11'), '2027-11-01');
INSERT INTO public.business_royalty_formula_versions (id, version, author_fund_bps, status, approved_by, approved_at, approval_document)
  VALUES (pg_temp.u('f3'), 'v3-smoke', 5000, 'approved', 'smoke', now(), 'smoke');
DO $$
DECLARE r uuid; v uuid; v2 uuid; a_olga uuid; a_alex uuid; m bigint := 60000;
BEGIN
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at) VALUES
    (pg_temp.u('q09pay'), pg_temp.u('q09'), 'q09', 'payment', 100000, 'single_point', '2027-09-01'),
    (pg_temp.u('q10pay'), pg_temp.u('q10'), 'q10', 'payment', 100000, 'single_point', '2027-10-01'),
    (pg_temp.u('q11pay'), pg_temp.u('q11'), 'q11', 'payment', 100000, 'single_point', '2027-11-01');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id) VALUES
    (pg_temp.u('q09pay'), pg_temp.u('L9')), (pg_temp.u('q10pay'), pg_temp.u('L9')), (pg_temp.u('q11pay'), pg_temp.u('L9'));
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES
    ('2027-09-02', pg_temp.u('q09'), pg_temp.u('L9'), pg_temp.u('r1'), 10*m, 'q09-1'),
    ('2027-09-02', pg_temp.u('q09'), pg_temp.u('L9'), pg_temp.u('r2'), 10*m, 'q09-2'),
    ('2027-10-02', pg_temp.u('q10'), pg_temp.u('L9'), pg_temp.u('r1'), 10*m, 'q10-1'),
    ('2027-11-02', pg_temp.u('q11'), pg_temp.u('L9'), pg_temp.u('r1'), 10*m, 'q11-1');
  r := public.business_royalty_run_preliminary(pg_temp.u('q09'), pg_temp.u('f1'));
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
  a_olga := (SELECT id FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('olga'));
  a_alex := (SELECT id FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('alex'));
  PERFORM pg_temp.eq('ReversalSurvivesRecalc: olga approved', (SELECT amount_minor FROM public.business_royalty_accruals WHERE id = a_olga), 25000);

  -- ReversalSurvivesRecalc: preliminary reversal is not superseded by the next run; key frozen meanwhile.
  v := public.business_royalty_reverse_accrual(a_olga, 'ошибочная точка');
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key)
    VALUES ('2027-09-03', pg_temp.u('q09'), pg_temp.u('L9'), pg_temp.u('r1'), 10*m, 'q09-3');
  r := public.business_royalty_run_preliminary(pg_temp.u('q09'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('ReversalSurvivesRecalc: still preliminary', (SELECT CASE calculation_state WHEN 'preliminary' THEN 1 ELSE 0 END FROM public.business_royalty_accruals WHERE id = v), 1);
  PERFORM pg_temp.eq('ReversalSurvivesRecalc: frozen key, no olga delta', pg_temp.holder(r, 'olga'), 0);
  PERFORM pg_temp.expect_err('ReversalSurvivesRecalc: second live reversal', format('SELECT public.business_royalty_reverse_accrual(%L, %L)', a_olga, 'x'), 'business_royalty_already_reversed');
  -- Repeatable: voided reversal frees the slot (partial unique index), a new reversal can be made.
  UPDATE public.business_royalty_accruals SET calculation_state = 'void' WHERE id = v;
  v2 := public.business_royalty_reverse_accrual(a_olga, 'ошибочная точка, повторно');
  PERFORM pg_temp.eq('ReversalRepeatable: amount', (SELECT amount_minor FROM public.business_royalty_accruals WHERE id = v2), -25000);
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE id = v2;
  PERFORM pg_temp.expect_err('ReversalRepeatable: after approved', format('SELECT public.business_royalty_reverse_accrual(%L, %L)', a_olga, 'x'), 'business_royalty_already_reversed');
  PERFORM pg_temp.expect_err('ReversalRepeatable: reverse a reversal', format('SELECT public.business_royalty_reverse_accrual(%L, %L)', v2, 'x'), 'business_royalty_cannot_reverse_reversal');
  -- NoReaccrue (revised after review #3): an approved reversal is part of the approved net; the next run accrues
  -- new result - net exactly once (olga 2 plays r1 of 3 on L9 -> 2/3 of fund 50000 = 33333), repeat run adds nothing.
  r := public.business_royalty_run_preliminary(pg_temp.u('q09'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('NoReaccrue: one olga row', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('olga')), 1);
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
  r := public.business_royalty_run_preliminary(pg_temp.u('q09'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('NoReaccrue: repeat run no rows', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r), 0);
  PERFORM pg_temp.eq('NoReaccrue: olga approved net = recalculated value', (SELECT sum(amount_minor) FROM public.business_royalty_accruals
    WHERE period_id = pg_temp.u('q09') AND rightsholder_id = pg_temp.u('olga') AND calculation_state = 'approved'),
    (SELECT amount_minor FROM public.business_royalty_compute(pg_temp.u('q09'), pg_temp.u('f1')) WHERE rightsholder_id = pg_temp.u('olga')));

  -- ClosedPeriodUpdate: after close, reverse rejected; payout progress allowed.
  UPDATE public.business_royalty_periods SET status = 'closed' WHERE id = pg_temp.u('q09');
  PERFORM pg_temp.expect_err('ClosedPeriodUpdate: reverse', format('SELECT public.business_royalty_reverse_accrual(%L, %L)', a_alex, 'x'), 'business_royalty_period_closed');
  UPDATE public.business_royalty_accruals SET payout_state = 'in_payout' WHERE id = a_alex;

  -- DeductionOtherPeriod: deduction for October linked to the September payment is an error.
  PERFORM pg_temp.expect_err('DeductionOtherPeriod: insert', format('INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, payment_id, document_reference) VALUES (%L, %L, 1, %L, %L)',
    pg_temp.u('q10'), 'acquiring_fee', pg_temp.u('q09pay'), 'x'), 'business_royalty_deduction_payment_other_period');

  -- ShareRetroEnd: valid_until inside a calculated/closed month rejected.
  PERFORM pg_temp.expect_err('ShareRetroEnd: calculated month', format('UPDATE public.business_royalty_track_shares SET valid_until = %L WHERE audio_item_id = %L', '2027-09-15', pg_temp.u('r2')), 'business_royalty_share_retroactive_end');

  -- ReversalFormula: approving a reversal checks the formula of the reversed entry (retired -> rejected).
  r := public.business_royalty_run_preliminary(pg_temp.u('q10'), pg_temp.u('f3'));
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
  v := public.business_royalty_reverse_accrual((SELECT id FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('olga')), 'проверка формулы');
  UPDATE public.business_royalty_formula_versions SET status = 'retired' WHERE id = pg_temp.u('f3');
  PERFORM pg_temp.expect_err('ReversalFormula: retired', format('UPDATE public.business_royalty_accruals SET calculation_state = %L WHERE id = %L', 'approved', v), 'business_royalty_formula_not_approved');
END $$;
-- ---------------------------------------------------------------- review #3 fixes (PR #826 @0749b9eb)
INSERT INTO public.music_rightsholders (id, display_name, entity_type) VALUES (pg_temp.u('h8'), 'Правообладатель 8', 'person');
INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from)
  VALUES (pg_temp.u('t8'), pg_temp.u('h8'), 'recording', 10000, '2028-01-01');
INSERT INTO public.business_royalty_periods (id, period_month) VALUES
  (pg_temp.u('c1'), '2028-01-01'), (pg_temp.u('c2'), '2028-02-01'), (pg_temp.u('c3'), '2028-03-01');
DO $$
DECLARE r uuid; v uuid; a8 uuid; n bigint;
BEGIN
  INSERT INTO public.business_royalty_payments (id, period_id, payment_reference, kind, amount_minor, allocation_rule, occurred_at) VALUES
    (pg_temp.u('c1pay'), pg_temp.u('c1'), 'c1', 'payment', 1000, 'single_point', '2028-01-01'),
    (pg_temp.u('c2pay'), pg_temp.u('c2'), 'c2', 'payment', 1000, 'single_point', '2028-02-01'),
    (pg_temp.u('c3pay'), pg_temp.u('c3'), 'c3', 'payment', 1000, 'single_point', '2028-03-01');
  INSERT INTO public.business_royalty_payment_allocations (payment_id, location_id) VALUES
    (pg_temp.u('c1pay'), pg_temp.u('L8')), (pg_temp.u('c2pay'), pg_temp.u('L8')), (pg_temp.u('c3pay'), pg_temp.u('L8'));
  INSERT INTO public.business_royalty_plays (played_on, period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES
    ('2028-01-02', pg_temp.u('c1'), pg_temp.u('L8'), pg_temp.u('t8'), 600000, 'c1-1'),
    ('2028-02-02', pg_temp.u('c2'), pg_temp.u('L8'), pg_temp.u('t8'), 600000, 'c2-1'),
    ('2028-03-02', pg_temp.u('c3'), pg_temp.u('L8'), pg_temp.u('t8'), 600000, 'c3-1');

  -- CorrectionAfterReversal: approved 500 -> reversal approved (net 0) -> corrected input (approved deduction 200,
  -- base 800, fund 400) -> recalculation accrues 400 exactly once; repeat recalculation adds no rows.
  r := public.business_royalty_run_preliminary(pg_temp.u('c1'), pg_temp.u('f1'));
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
  a8 := (SELECT id FROM public.business_royalty_accruals WHERE run_id = r AND rightsholder_id = pg_temp.u('h8'));
  PERFORM pg_temp.eq('CorrectionAfterReversal: approved', (SELECT amount_minor FROM public.business_royalty_accruals WHERE id = a8), 500);
  v := public.business_royalty_reverse_accrual(a8, 'неверный вычет');
  -- Pending reversal freezes the key.
  r := public.business_royalty_run_preliminary(pg_temp.u('c1'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('CorrectionAfterReversal: frozen while pending', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r), 0);
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE id = v;
  INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, location_id, document_reference, status, approved_by, approved_at)
    VALUES (pg_temp.u('c1'), 'acquiring_fee', 200, pg_temp.u('L8'), 'исправленный реестр', 'approved', 'smoke', now());
  r := public.business_royalty_run_preliminary(pg_temp.u('c1'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('CorrectionAfterReversal: one row', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r), 1);
  PERFORM pg_temp.eq('CorrectionAfterReversal: accrues 400', pg_temp.holder(r, 'h8'), 400);
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
  PERFORM pg_temp.eq('CorrectionAfterReversal: net 400', (SELECT sum(amount_minor) FROM public.business_royalty_accruals
    WHERE period_id = pg_temp.u('c1') AND calculation_state = 'approved'), 400);
  r := public.business_royalty_run_preliminary(pg_temp.u('c1'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('CorrectionAfterReversal: repeat no rows', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r), 0);
  r := public.business_royalty_run_preliminary(pg_temp.u('c1'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('CorrectionAfterReversal: repeat again no rows', (SELECT count(*) FROM public.business_royalty_accruals WHERE run_id = r), 0);
  -- Reversal supersedes pending deltas of its key (no double correction).
  INSERT INTO public.business_royalty_deductions (period_id, category, amount_minor, location_id, document_reference, status, approved_by, approved_at)
    VALUES (pg_temp.u('c1'), 'acquiring_fee', 200, pg_temp.u('L8'), 'ещё вычет', 'approved', 'smoke', now());
  r := public.business_royalty_run_preliminary(pg_temp.u('c1'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('CorrectionAfterReversal: delta -100', pg_temp.holder(r, 'h8'), -100);
  v := public.business_royalty_reverse_accrual((SELECT id FROM public.business_royalty_accruals WHERE period_id = pg_temp.u('c1')
    AND calculation_state = 'approved' AND reverses_id IS NULL AND amount_minor = 400), 'проверка');
  PERFORM pg_temp.eq('CorrectionAfterReversal: pending delta superseded', (SELECT count(*) FROM public.business_royalty_accruals
    WHERE run_id = r AND calculation_state = 'preliminary'), 0);
  UPDATE public.business_royalty_accruals SET calculation_state = 'void' WHERE id = v;
  r := public.business_royalty_run_preliminary(pg_temp.u('c1'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('CorrectionAfterReversal: delta -100 once', pg_temp.holder(r, 'h8'), -100);
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
  PERFORM pg_temp.eq('CorrectionAfterReversal: final net 300', (SELECT sum(amount_minor) FROM public.business_royalty_accruals
    WHERE period_id = pg_temp.u('c1') AND calculation_state = 'approved'),
    (SELECT sum(amount_minor) FROM public.business_royalty_compute(pg_temp.u('c1'), pg_temp.u('f1'))));

  -- CloseWithPreliminary: closing is rejected while preliminary accruals (incl. reversals) remain.
  r := public.business_royalty_run_preliminary(pg_temp.u('c2'), pg_temp.u('f1'));
  PERFORM pg_temp.expect_err('CloseWithPreliminary: open->closed', format('UPDATE public.business_royalty_periods SET status = %L WHERE id = %L', 'closed', pg_temp.u('c2')), 'business_royalty_period_has_preliminary');
  UPDATE public.business_royalty_periods SET status = 'reconciliation' WHERE id = pg_temp.u('c2');
  PERFORM pg_temp.expect_err('CloseWithPreliminary: reconciliation->closed', format('UPDATE public.business_royalty_periods SET status = %L WHERE id = %L', 'closed', pg_temp.u('c2')), 'business_royalty_period_has_preliminary');
  UPDATE public.business_royalty_accruals SET calculation_state = 'approved' WHERE run_id = r;
  v := public.business_royalty_reverse_accrual((SELECT id FROM public.business_royalty_accruals WHERE run_id = r), 'проверка закрытия');
  PERFORM pg_temp.expect_err('CloseWithPreliminary: pending reversal', format('UPDATE public.business_royalty_periods SET status = %L WHERE id = %L', 'closed', pg_temp.u('c2')), 'business_royalty_period_has_preliminary');
  UPDATE public.business_royalty_accruals SET calculation_state = 'void' WHERE id = v;
  UPDATE public.business_royalty_periods SET status = 'closed' WHERE id = pg_temp.u('c2');

  -- ShareRetroStart: new share starting inside an approved (c1) or closed (c2) month rejected;
  -- preliminary-only open month (c3) accepts both a new share and an end date, picked up by recalculation.
  r := public.business_royalty_run_preliminary(pg_temp.u('c3'), pg_temp.u('f1'));
  PERFORM pg_temp.expect_err('ShareRetroStart: approved month', format('INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from) VALUES (%L, %L, %L, 10000, %L)',
    pg_temp.u('t9'), pg_temp.u('h8'), 'recording', '2028-01-15'), 'business_royalty_share_retroactive_start');
  PERFORM pg_temp.expect_err('ShareRetroStart: closed month', format('INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from) VALUES (%L, %L, %L, 10000, %L)',
    pg_temp.u('t9'), pg_temp.u('h8'), 'recording', '2028-02-15'), 'business_royalty_share_retroactive_start');
  PERFORM pg_temp.expect_err('ShareRetroStart: spans locked month', format('INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from, valid_until) VALUES (%L, %L, %L, 10000, %L, %L)',
    pg_temp.u('t9'), pg_temp.u('h8'), 'recording', '2027-12-01', '2028-01-02'), 'business_royalty_share_retroactive_start');
  PERFORM pg_temp.expect_err('ShareRetroEnd: approved month', format('UPDATE public.business_royalty_track_shares SET valid_until = %L WHERE audio_item_id = %L', '2028-01-20', pg_temp.u('t8')), 'business_royalty_share_retroactive_end');
  INSERT INTO public.business_royalty_track_shares (audio_item_id, rightsholder_id, rights_layer, share_bps, valid_from)
    VALUES (pg_temp.u('t9'), pg_temp.u('h8'), 'recording', 10000, '2028-03-05');
  UPDATE public.business_royalty_track_shares SET valid_until = '2028-03-02' WHERE audio_item_id = pg_temp.u('t8');
  r := public.business_royalty_run_preliminary(pg_temp.u('c3'), pg_temp.u('f1'));
  PERFORM pg_temp.eq('ShareRetroStart: preliminary month recalculated', pg_temp.holder(r, 'h8'), 0);
  PERFORM pg_temp.eq('ShareRetroStart: point held', (SELECT count(*) FROM public.business_royalty_point_results WHERE run_id = r AND status = 'held_no_plays'), 1);
END $$;
SELECT 'business_royalty_ledger_smoke ok';
ROLLBACK;
