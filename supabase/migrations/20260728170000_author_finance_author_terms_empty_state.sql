-- audiolad:payments-p334 / author-terms
-- 1) Empty-state: commercial_active + Author Terms must not look like
--    "finance terms missing".
-- 2) Backfill payee setup for commercial_active authors who already accepted
--    the current Author Terms edition but have no approved commercial terms.

CREATE OR REPLACE FUNCTION public.author_finance_p334_empty_state_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'not_payout_eligible_free',
    'not_payout_eligible_pending',
    'not_payout_eligible_commercial',
    'commercial_onboarding_incomplete',
    'author_terms_required',
    'access_suspended',
    'access_terminated',
    'terms_missing',
    'no_sales',
    'held_only',
    'below_threshold',
    'reserved_in_progress',
    'has_paid_history',
    'active_ok'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.author_finance_p334_select_empty_state(
  p_payout_eligible boolean,
  p_access_status text,
  p_approved_terms integer,
  p_entry_count integer,
  p_payable bigint,
  p_reserved bigint,
  p_held bigint,
  p_paid_count integer,
  p_threshold bigint
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_access_status IN ('suspended', 'commercial_suspended') THEN 'access_suspended'
    WHEN p_access_status = 'terminated' THEN 'access_terminated'
    WHEN p_access_status = 'commercial_onboarding' THEN 'commercial_onboarding_incomplete'
    -- commercial_active falls through even when payout_eligible is false and
    -- even when approved finance terms are not yet materialised.
    WHEN NOT coalesce(p_payout_eligible, false)
         AND coalesce(p_access_status, '') IS DISTINCT FROM 'commercial_active'
    THEN
      CASE p_access_status
        WHEN 'commercial' THEN 'not_payout_eligible_commercial'
        WHEN 'commercial_pending' THEN 'not_payout_eligible_pending'
        ELSE 'not_payout_eligible_free'
      END
    WHEN coalesce(p_approved_terms, 0) = 0
         AND coalesce(p_access_status, '') IS DISTINCT FROM 'commercial_active'
      THEN 'terms_missing'
    WHEN coalesce(p_entry_count, 0) = 0 THEN 'no_sales'
    WHEN coalesce(p_payable, 0) >= coalesce(p_threshold, 100000) THEN 'active_ok'
    WHEN coalesce(p_payable, 0) > 0 THEN 'below_threshold'
    WHEN coalesce(p_reserved, 0) > 0 THEN 'reserved_in_progress'
    WHEN coalesce(p_held, 0) > 0 THEN 'held_only'
    WHEN coalesce(p_paid_count, 0) > 0 THEN 'has_paid_history'
    ELSE 'no_sales'
  END;
$$;

COMMENT ON FUNCTION public.author_finance_p334_select_empty_state IS
  'audiolad:payments-p334; commercial_active never maps to free or terms_missing solely because payout_eligible/finance terms lag Author Terms acceptance.';

-- Backfill: commercial_active + current Author Terms accepted → default 70/30
-- terms and payout_eligible. Does not touch authors without Author Terms.
-- Skips cleanly on scratch DBs that do not have the Author Terms tables yet.
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.author_terms_acceptances') IS NULL
     OR to_regclass('public.author_terms_versions') IS NULL THEN
    RAISE NOTICE 'author_finance_author_terms_empty_state: skip payee backfill (author terms tables missing)';
    RETURN;
  END IF;

  FOR r IN
    SELECT
      a.id AS author_id,
      acc.accepted_by_user_id,
      acc.accepted_at
    FROM public.authors AS a
    INNER JOIN public.author_terms_acceptances AS acc
      ON acc.author_id = a.id
    INNER JOIN public.author_terms_versions AS v
      ON v.id = acc.terms_version_id
     AND v.is_current = true
    WHERE a.access_status = 'commercial_active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.author_commercial_terms AS t
        WHERE t.author_id = a.id
          AND t.status = 'approved'
      )
  LOOP
    UPDATE public.authors
    SET payout_eligible = true,
        updated_at = now()
    WHERE id = r.author_id
      AND payout_eligible = false;

    PERFORM public.create_author_commercial_terms_draft(
      r.author_id,
      7000,
      coalesce(r.accepted_at, now()),
      NULL,
      14,
      'RUB',
      'default_after_author_terms_accepted',
      r.accepted_by_user_id,
      'backfill_author_terms_payee_setup:' || r.author_id::text,
      true
    );
  END LOOP;
END
$$;
