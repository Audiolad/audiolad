-- Isolated smoke for 20261229120000 (task 0e05333f). Rolls back.
BEGIN;
INSERT INTO public.music_rightsholders (id, display_name, entity_type) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Smoke composer', 'person'),
  ('00000000-0000-4000-8000-000000000002', 'Smoke third-party artist', 'person');
INSERT INTO public.business_service_operators (id, legal_name, legal_form, same_subject_rightsholder_id, active_from) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Smoke sole trader', 'sole_trader', '00000000-0000-4000-8000-000000000001', '2026-10-01');
INSERT INTO public.business_royalty_rate_models (id, code, kind, params) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'smoke.per_minute', 'per_minute', '{"rub_per_minute": 0.05}');
INSERT INTO public.business_royalty_periods (id, period_start, period_end) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '2026-10-01', '2026-11-01');
INSERT INTO public.business_royalty_usage (id, period_id, audio_item_id, rightsholder_id, rights_layer, share_bps, played_ms, source) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'recording', 10000, 600000, 'business_playback_log'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'recording', 10000, 600000, 'business_playback_log');
-- Estimated: same formula for both rightsholders; operator's own = management.
INSERT INTO public.business_royalty_accruals (id, usage_id, period_id, rightsholder_id, audio_item_id, rate_model_id, calculation_basis, applied_rate, amount_minor, settlement_mode, operator_id_snapshot)
SELECT ('00000000-0000-4000-8000-0000000000e' || right(u.id::text, 1))::uuid, u.id, u.period_id, u.rightsholder_id, u.audio_item_id, '00000000-0000-4000-8000-0000000000b1',
  jsonb_build_object('minutes', u.played_ms / 60000.0), 0.05, (u.played_ms / 60000.0 * 5)::bigint,
  CASE WHEN u.rightsholder_id = o.same_subject_rightsholder_id THEN 'management' ELSE 'payable' END, o.id
FROM public.business_royalty_usage u CROSS JOIN public.business_service_operators o;
DO $$ BEGIN
  -- EstimatedNotPayable:
  BEGIN UPDATE public.business_royalty_accruals SET payout_status = 'pending' WHERE id = '00000000-0000-4000-8000-0000000000e2';
    RAISE EXCEPTION 'expected failure'; EXCEPTION WHEN check_violation THEN NULL; END;
  -- UnapprovedRate:
  BEGIN UPDATE public.business_royalty_accruals SET calculation_status = 'calculated' WHERE id = '00000000-0000-4000-8000-0000000000e2';
    RAISE EXCEPTION 'expected failure'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'business_royalty_rate_not_approved' THEN RAISE; END IF; END;
  -- Immutable:
  BEGIN UPDATE public.business_royalty_accruals SET amount_minor = 1 WHERE id = '00000000-0000-4000-8000-0000000000e2';
    RAISE EXCEPTION 'expected failure'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'business_royalty_accrual_immutable' THEN RAISE; END IF; END;
  -- AppendOnly:
  BEGIN DELETE FROM public.business_royalty_accruals WHERE id = '00000000-0000-4000-8000-0000000000e2';
    RAISE EXCEPTION 'expected failure'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'business_royalty_accrual_append_only' THEN RAISE; END IF; END;
  -- UnapprovedModelCannotApproveWithoutDocument:
  BEGIN UPDATE public.business_royalty_rate_models SET status = 'approved' WHERE id = '00000000-0000-4000-8000-0000000000b1';
    RAISE EXCEPTION 'expected failure'; EXCEPTION WHEN check_violation THEN NULL; END;
  -- ManagementNeverPayable:
  IF (SELECT settlement_mode FROM public.business_royalty_accruals WHERE id = '00000000-0000-4000-8000-0000000000e1') <> 'management' THEN RAISE EXCEPTION 'management expected'; END IF;
  -- UniversalFormula: same amount for both rightsholders
  IF (SELECT count(DISTINCT amount_minor) FROM public.business_royalty_accruals) <> 1 THEN RAISE EXCEPTION 'formula differs'; END IF;
  -- OperatorChange: closing the operator does not touch rightsholder history
  UPDATE public.business_service_operators SET active_until = '2026-12-01';
  IF (SELECT count(*) FROM public.business_royalty_accruals WHERE rightsholder_id = '00000000-0000-4000-8000-000000000001') <> 1 THEN RAISE EXCEPTION 'history lost'; END IF;
END $$;
SELECT 'business_royalty_ledger_smoke ok';
ROLLBACK;
