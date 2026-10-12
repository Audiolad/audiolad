-- Isolated smoke for 20261229120000 (task 0e05333f, final concept 2026-10-12 10:20 MSK). Rolls back.
BEGIN;
CREATE FUNCTION pg_temp.u(text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5($1)::uuid $$;
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
  INSERT INTO public.business_royalty_plays (period_id, location_id, audio_item_id, played_ms, offline, dedup_key) VALUES
    (pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tS'), 30*m, false, 'e1'),
    (pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tO'), 25*m, false, 'e2'),
    (pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tO'), 15*m, true, 'e3'),
    (pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tA'), 30*m, false, 'e4'),
    (pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tH'), 50*m, false, 'e5');  -- NotAdmitted: excluded from denominator
  INSERT INTO public.business_royalty_plays (period_id, location_id, audio_item_id, played_ms, offline, dedup_key)
    VALUES (pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tO'), 15*m, true, 'e3') ON CONFLICT (dedup_key) DO NOTHING;
  BEGIN
    INSERT INTO public.business_royalty_plays (period_id, location_id, audio_item_id, played_ms, dedup_key)
      VALUES (pg_temp.u('p10'), pg_temp.u('L1'), pg_temp.u('tO'), 15*m, 'e3');
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
    RAISE EXCEPTION 'expected'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'business_royalty_formula_immutable' THEN RAISE; END IF; END;

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
  INSERT INTO public.business_royalty_plays (period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES
    (pg_temp.u('p11'), pg_temp.u('L1'), pg_temp.u('tO'), 60*m, 'n1'),
    (pg_temp.u('p11'), pg_temp.u('L1'), pg_temp.u('tA'), 30*m, 'n2'),
    (pg_temp.u('p11'), pg_temp.u('L2'), pg_temp.u('tS'), 10*m, 'n3');
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
  INSERT INTO public.business_royalty_plays (period_id, location_id, audio_item_id, played_ms, dedup_key) VALUES
    (pg_temp.u('p12'), pg_temp.u('L1'), pg_temp.u('tO'), 10*m, 'd1'), (pg_temp.u('p12'), pg_temp.u('L2'), pg_temp.u('tS'), 10*m, 'd2');
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
SELECT 'business_royalty_ledger_smoke ok';
ROLLBACK;
