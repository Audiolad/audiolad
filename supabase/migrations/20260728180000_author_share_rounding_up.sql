-- audiolad:payments-p332
-- Round fractional kopeks up in favour of the author.
-- Historical ledger rows are not rewritten (none exist at apply time; new
-- events use the updated pure helper). Share ratio 70/30 is unchanged.

-- 1) Pure helper: ceil(basis * bps / 10000) in integer kopeks.
CREATE OR REPLACE FUNCTION public.author_share_minor(
  p_basis_minor bigint,
  p_share_bps integer
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  -- ceil for non-negative integers: (n + d - 1) / d, with n = basis * bps, d = 10000.
  -- Platform share is the remainder: basis - author_share. No float money.
  SELECT CASE
    WHEN p_basis_minor IS NULL OR p_share_bps IS NULL THEN 0::bigint
    WHEN p_basis_minor <= 0 OR p_share_bps <= 0 THEN 0::bigint
    ELSE (p_basis_minor * p_share_bps::bigint + 9999) / 10000::bigint
  END;
$$;

COMMENT ON FUNCTION public.author_share_minor IS
  'audiolad:payments-p332; ceil(basis * bps / 10000) in integer kopeks (author_rounding_up_v1). Platform remainder = basis - author share.';

-- 2) Allow both legacy and new rounding policy labels for audit continuity.
ALTER TABLE public.author_commercial_terms
  DROP CONSTRAINT IF EXISTS author_commercial_terms_rounding_policy_check;

ALTER TABLE public.author_commercial_terms
  ADD CONSTRAINT author_commercial_terms_rounding_policy_check
  CHECK (rounding_policy IN (
    'floor_author_remainder_platform',
    'ceil_author_remainder_platform'
  ));

COMMENT ON COLUMN public.author_commercial_terms.rounding_policy IS
  'ceil_author_remainder_platform: ceil(base * author_share_bps / 10000); platform gets the remainder. Legacy floor_author_remainder_platform retained for audit only.';

ALTER TABLE public.author_commercial_terms
  ALTER COLUMN rounding_policy SET DEFAULT 'ceil_author_remainder_platform';

ALTER TABLE public.author_commercial_terms
  ALTER COLUMN calculation_version SET DEFAULT 'p332.author_rounding_up_v1';

-- Existing terms without ledger history adopt the new rule for future accruals.
-- Approved rows are normally frozen; migration briefly disables the immutability
-- trigger so the policy label/version can track the new pure helper. Ledger
-- amounts are never rewritten here.
-- Wrapped in one DO block so DISABLE cannot stick if UPDATE fails: the
-- EXCEPTION path re-enables the trigger before re-raising.
DO $relabel_terms$
BEGIN
  ALTER TABLE public.author_commercial_terms
    DISABLE TRIGGER author_commercial_terms_immutability_trg;

  UPDATE public.author_commercial_terms
  SET
    rounding_policy = 'ceil_author_remainder_platform',
    calculation_version = 'p332.author_rounding_up_v1',
    updated_at = now()
  WHERE rounding_policy = 'floor_author_remainder_platform'
    AND NOT EXISTS (
      SELECT 1
      FROM public.author_ledger_entries AS e
      WHERE e.terms_id = author_commercial_terms.id
    );

  ALTER TABLE public.author_commercial_terms
    ENABLE TRIGGER author_commercial_terms_immutability_trg;
EXCEPTION
  WHEN OTHERS THEN
    ALTER TABLE public.author_commercial_terms
      ENABLE TRIGGER author_commercial_terms_immutability_trg;
    RAISE;
END
$relabel_terms$;

-- 3) New drafts use the ceil policy.
CREATE OR REPLACE FUNCTION public.create_author_commercial_terms_draft(
  p_author_id uuid,
  p_author_share_bps integer,
  p_valid_from timestamp with time zone,
  p_valid_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_hold_days integer DEFAULT 14,
  p_currency text DEFAULT 'RUB'::text,
  p_notes text DEFAULT NULL::text,
  p_actor_user_id uuid DEFAULT NULL::uuid,
  p_correlation_id text DEFAULT NULL::text,
  p_approve_immediately boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_terms public.author_commercial_terms%ROWTYPE;
  v_currency text := upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'RUB'));
  v_valid_from timestamptz := coalesce(p_valid_from, now());
  v_approve boolean := coalesce(p_approve_immediately, false);
  v_now timestamptz := now();
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF p_author_share_bps IS NULL OR p_author_share_bps < 0 OR p_author_share_bps > 10000 THEN
    RAISE EXCEPTION 'invalid_author_share_bps' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_hold_days, 14) < 0 OR coalesce(p_hold_days, 14) > 365 THEN
    RAISE EXCEPTION 'invalid_hold_days' USING ERRCODE = '22023';
  END IF;

  IF p_valid_to IS NOT NULL AND p_valid_to <= v_valid_from THEN
    RAISE EXCEPTION 'invalid_validity_window' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.authors AS a WHERE a.id = p_author_id) THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.author_commercial_terms (
    author_id,
    currency,
    author_share_bps,
    platform_fee_bps,
    hold_days,
    provider_fee_policy,
    refund_policy,
    rounding_policy,
    calculation_version,
    status,
    valid_from,
    valid_to,
    notes,
    created_by,
    approved_by,
    approved_at
  )
  VALUES (
    p_author_id,
    v_currency,
    p_author_share_bps,
    10000 - p_author_share_bps,
    coalesce(p_hold_days, 14),
    'platform_absorbs',
    'proportional_reversal',
    'ceil_author_remainder_platform',
    'p332.author_rounding_up_v1',
    CASE WHEN v_approve THEN 'approved' ELSE 'draft' END,
    v_valid_from,
    p_valid_to,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_actor_user_id,
    CASE WHEN v_approve THEN p_actor_user_id ELSE NULL END,
    CASE WHEN v_approve THEN v_now ELSE NULL END
  )
  RETURNING * INTO v_terms;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    CASE WHEN v_approve THEN 'author_terms_created_approved' ELSE 'author_terms_draft_created' END,
    'author_commercial_terms',
    v_terms.id,
    v_terms.notes,
    jsonb_build_object(
      'author_id', v_terms.author_id,
      'author_share_bps', v_terms.author_share_bps,
      'hold_days', v_terms.hold_days,
      'currency', v_terms.currency,
      'valid_from', v_terms.valid_from,
      'valid_to', v_terms.valid_to,
      'status', v_terms.status,
      'rounding_policy', v_terms.rounding_policy,
      'calculation_version', v_terms.calculation_version
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_terms.status,
    'terms_id', v_terms.id,
    'status', v_terms.status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_author_commercial_terms_draft(
  uuid, integer, timestamptz, timestamptz, integer, text, text, uuid, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_author_commercial_terms_draft(
  uuid, integer, timestamptz, timestamptz, integer, text, text, uuid, text, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_author_commercial_terms_draft(
  uuid, integer, timestamptz, timestamptz, integer, text, text, uuid, text, boolean
) TO service_role;

-- 4) Sanity: new rounding examples (70/30 unchanged on exact splits).
DO $$
BEGIN
  IF public.author_share_minor(139400::bigint, 7000) <> 97580::bigint
     OR public.author_share_minor(29900::bigint, 7000) <> 20930::bigint
     OR public.author_share_minor(99900::bigint, 7000) <> 69930::bigint
     OR public.author_share_minor(29900::bigint, 3333) <> 9966::bigint
     OR public.author_share_minor(1::bigint, 5000) <> 1::bigint
     OR public.author_share_minor(3::bigint, 3333) <> 1::bigint
     OR public.author_share_minor(99::bigint, 9999) <> 99::bigint
  THEN
    RAISE EXCEPTION 'Post-check failed: author share ceil math is wrong';
  END IF;

  IF EXISTS (SELECT 1 FROM public.author_ledger_entries) THEN
    RAISE NOTICE 'author_share_rounding_up: ledger already has rows; historical amounts were not rewritten';
  END IF;
END
$$;

-- 5) Relabel admin/report calculation_version constants + author ledger detail.
DO $patch_labels$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_author_finance_p332_summary',
        'admin_author_finance_p332_integrity_snapshot',
        'admin_author_finance_p332_historical_dry_run',
        'author_finance_p334_ledger_detail'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('''p332.v1''' in v_def) > 0 THEN
      v_def := replace(v_def, '''p332.v1''', '''p332.author_rounding_up_v1''');
    END IF;
    IF position('''floor_author_remainder_platform''' in v_def) > 0 THEN
      v_def := replace(
        v_def,
        '''floor_author_remainder_platform''',
        '''ceil_author_remainder_platform'''
      );
    END IF;
    IF v_def IS DISTINCT FROM pg_get_functiondef(r.oid) THEN
      EXECUTE v_def;
    END IF;
  END LOOP;
END
$patch_labels$;
