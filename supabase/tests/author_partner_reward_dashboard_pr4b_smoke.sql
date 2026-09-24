CREATE TABLE public.author_members (
  author_id uuid NOT NULL REFERENCES public.authors(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (author_id, user_id)
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.author_partner_is_owner(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS m
      WHERE m.author_id = p_author_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    );
$$;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'owner@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'other@example.test');

INSERT INTO public.authors (id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Partner'),
  ('10000000-0000-0000-0000-000000000002', 'Other partner'),
  ('20000000-0000-0000-0000-000000000001', 'Invitee');

INSERT INTO public.author_members (author_id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner');

INSERT INTO public.author_referrals (
  id, referrer_author_id, invitee_author_id, status, activated_at, expires_at
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'activated',
  now() - interval '1 day',
  now() + interval '3 years'
);

INSERT INTO public.author_ledger_entries (
  id, author_id, entry_type, amount_minor, currency, payment_id, effective_at, available_at
) VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'sale_accrual',
    10000,
    'RUB',
    '50000000-0000-0000-0000-000000000001',
    now() - interval '2 days',
    now() - interval '1 day'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'refund_reversal',
    -2500,
    'RUB',
    '50000000-0000-0000-0000-000000000001',
    now() - interval '1 day',
    now() + interval '1 day'
  );

INSERT INTO public.author_partner_reward_ledger_entries (
  id, referral_id, partner_author_id, invitee_author_id,
  source_sale_ledger_entry_id, source_event_ledger_entry_id,
  entry_type, amount_minor, currency, effective_at, available_at, idempotency_key
) VALUES
  (
    '60000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    'reward_accrual', 2000, 'RUB', now() - interval '2 days', now() - interval '1 day',
    'dashboard-accrual'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'reward_reversal', -500, 'RUB', now() - interval '1 day', now() + interval '1 day',
    'dashboard-reversal'
  );

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_dashboard jsonb;
  v_balance jsonb;
  v_history jsonb;
BEGIN
  v_dashboard := public.get_author_partner_reward_dashboard(
    '10000000-0000-0000-0000-000000000001', 1
  );
  v_balance := v_dashboard -> 'balances' -> 0;
  v_history := v_dashboard -> 'history';

  IF jsonb_array_length(v_dashboard -> 'balances') <> 1
    OR v_balance ->> 'currency' <> 'RUB'
    OR (v_balance ->> 'accrued_minor')::bigint <> 1500
    OR (v_balance ->> 'held_minor')::bigint <> -500
    OR (v_balance ->> 'available_minor')::bigint <> 2000
    OR (v_balance ->> 'paid_minor')::bigint <> 0
    OR (v_balance ->> 'invariant_ok')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'dashboard balances must be currency-aware and invariant';
  END IF;

  IF jsonb_array_length(v_history) <> 1
    OR (v_history -> 0) ? 'id'
    OR (v_history -> 0) ? 'partner_author_id'
    OR (v_history -> 0) ? 'available_at'
    OR (v_history -> 0) ->> 'availability_state' <> 'held'
  THEN
    RAISE EXCEPTION 'dashboard history must be bounded and safe';
  END IF;
END;
$$;

SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

DO $$
BEGIN
  PERFORM public.get_author_partner_reward_dashboard(
    '10000000-0000-0000-0000-000000000001', 25
  );
  RAISE EXCEPTION 'non-owner must not read partner dashboard';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END;
$$;

RESET ROLE;
