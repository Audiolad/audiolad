-- PREPARE ONLY. Human Gate: PostgreSQL backup and Sergey's explicit approval before apply.
-- Task 8142d69a, Sergey t1338u + t1339u: the 72-hour hold of a partner code is counted ONCE per
-- code and business account, from the first time that account enters that code (the personal
-- link, the cabinet field, or the automatic re-reserve after partner_terms_changed).
-- Before this migration every visit to /podarok or to a payment screen called
-- reserve_business_partner_code, which reset reserved_until to now + 72 hours, and opening
-- a personal-price payment link moved it to now + 72 hours as well.
--
-- What changes:
--   1. New service-only table business_partner_code_windows: one row per (code, account) with
--      the moment the account first held the code and the fixed end of its 72 hours.
--   2. reserve_business_partner_code: the account's first entry of a code opens 72 hours for that
--      code; every later entry of the same code keeps the original end. A NEW code (Sergey t1339u:
--      «если я новый код делаю, чтобы он заново начинался») opens its own fresh 72 hours, so nobody
--      has to reset anything by hand; an ended old code never blocks a new one. After the end of a
--      code the same account cannot hold that code again (partner_code_expired), unless its own
--      payment link at the personal price for that code, opened in time, is still open: then
--      nothing changes and the link can still be paid (existing rule «an open link keeps the price»).
--   3. A trigger on business_partner_codes never lets reserved_until move past the end of that
--      code's window for the holder account. This covers create_business_subscription_order, which
--      used to push the hold to now + 72 hours when a payment link was opened.
--   4. A trigger on business_subscription_order_scopes refuses a NEW personal-price link for the
--      first payment after the end of that code's window (partner_terms_changed, the cabinet
--      re-reads the quote). A link opened in time stays payable.
-- What does not change: prices, the quote, binding on the first real payment, one personal price
-- per account (entitlement), revoke, another account taking a code whose hold ran out (existing
-- behaviour), every order and payment.
--
-- Existing rows: every currently held, not bound code gets a window whose end is exactly its current
-- reserved_until (start = end - 72 hours); nothing is shortened or extended. The migration stops
-- before any change on a shape it cannot keep exactly (see the pre-flight).
--
-- Rollback (restores the previous restart-on-every-visit behaviour; no money data is touched),
-- one transaction, full SQL in supabase/rollbacks/20270304120000_business_partner_code_window_once.rollback.sql:
--   drop triggers business_partner_scope_window_guard, business_partner_codes_window_cap and their functions;
--   re-create reserve_business_partner_code(text) exactly as in 20270302120000 section 6
--   (grants: authenticated only); drop table business_partner_code_windows;
--   delete version 20270304120000 from supabase_migrations.schema_migrations.
-- Holds keep their current reserved_until after a rollback; the next visit restarts 72 hours again.
BEGIN;

CREATE TABLE public.business_partner_code_windows (
  code_id uuid NOT NULL REFERENCES public.business_partner_codes(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  first_user_id uuid NULL,
  first_reserved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT business_partner_code_windows_pkey PRIMARY KEY (code_id, organization_id),
  CONSTRAINT business_partner_code_windows_order CHECK (expires_at > first_reserved_at)
);
ALTER TABLE public.business_partner_code_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_partner_code_windows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.business_partner_code_windows TO service_role;
COMMENT ON TABLE public.business_partner_code_windows IS
  'Task 8142d69a t1338u/t1339u: the 72-hour hold of a partner code, counted once per code and business account from its first entry. Service role only.';

-- Pre-flight: the backfill only takes data it can keep exactly. It stops (nothing applied) when an
-- open first-payment personal-price link was created after its hold end. Such rows need a manual
-- decision; the migration never cancels or reprices a payment link. Production 09.11.2026: 1 held code, 0 such rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.business_subscription_order_scopes s
    JOIN public.orders o ON o.id = s.order_id
    JOIN public.business_partner_codes c ON c.id = s.partner_code_id
    WHERE o.status = 'pending' AND c.bound_organization_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.business_subscription_superseded_orders x WHERE x.order_id = o.id)
      AND NOT EXISTS (SELECT 1 FROM public.business_partner_entitlements e WHERE e.organization_id = s.organization_id)
      AND c.reserved_until IS NOT NULL AND o.created_at > c.reserved_until
  ) THEN
    RAISE EXCEPTION 'Pre-check failed: an open personal-price link was created after its hold end; reconcile manually first';
  END IF;
END;
$$;

-- Existing holds: each held code keeps exactly its current end. Never extended or shortened.
INSERT INTO public.business_partner_code_windows(code_id, organization_id, first_user_id, first_reserved_at, expires_at)
SELECT c.id, public.business_partner_owner_organization(c.reserved_by_user_id), c.reserved_by_user_id,
  c.reserved_until - interval '72 hours', c.reserved_until
FROM public.business_partner_codes c
WHERE c.reserved_by_user_id IS NOT NULL AND c.bound_organization_id IS NULL
  AND public.business_partner_owner_organization(c.reserved_by_user_id) IS NOT NULL
ON CONFLICT (code_id, organization_id) DO NOTHING;

-- The hold of a code never ends later than the first 72 hours of that code for the holder account.
CREATE FUNCTION public.business_partner_codes_window_cap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_end timestamptz;
BEGIN
  IF NEW.reserved_by_user_id IS NULL OR NEW.reserved_until IS NULL OR NEW.bound_organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT w.expires_at INTO v_end FROM public.business_partner_code_windows w
  WHERE w.code_id = NEW.id AND w.organization_id = public.business_partner_owner_organization(NEW.reserved_by_user_id);
  IF v_end IS NOT NULL AND NEW.reserved_until > v_end THEN
    NEW.reserved_until := v_end;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.business_partner_codes_window_cap() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_partner_codes_window_cap
  BEFORE INSERT OR UPDATE OF reserved_by_user_id, reserved_until ON public.business_partner_codes
  FOR EACH ROW EXECUTE FUNCTION public.business_partner_codes_window_cap();

-- After the end of a code's 72 hours no NEW personal-price link for the first payment under that code
-- can be opened (also when the checkout RPC is called directly or an open link is replaced).
-- A link opened in time stays payable.
CREATE FUNCTION public.business_partner_scope_window_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_end timestamptz;
BEGIN
  IF NEW.partner_code_id IS NULL
     OR EXISTS (SELECT 1 FROM public.business_partner_entitlements e WHERE e.organization_id = NEW.organization_id) THEN
    RETURN NEW;
  END IF;
  SELECT w.expires_at INTO v_end FROM public.business_partner_code_windows w
  WHERE w.code_id = NEW.partner_code_id AND w.organization_id = NEW.organization_id;
  IF v_end IS NOT NULL AND v_end <= clock_timestamp() THEN
    RAISE EXCEPTION 'partner_terms_changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.business_partner_scope_window_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_partner_scope_window_guard
  BEFORE INSERT ON public.business_subscription_order_scopes
  FOR EACH ROW EXECUTE FUNCTION public.business_partner_scope_window_guard();

-- Same checks as 20270302120000 section 6; only the countdown is counted once per code and account.
CREATE OR REPLACE FUNCTION public.reserve_business_partner_code(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid(); v_org uuid; v_code text; v_c public.business_partner_codes%ROWTYPE;
  v_e public.business_partner_entitlements%ROWTYPE; v_w public.business_partner_code_windows%ROWTYPE;
  v_first boolean := false;
BEGIN
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  v_org := public.business_partner_owner_organization(v_user);
  IF v_org IS NULL THEN RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.business_organizations WHERE id = v_org FOR UPDATE;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  SELECT * INTO v_c FROM public.business_partner_codes WHERE code = v_code FOR UPDATE;
  IF NOT FOUND OR v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'partner_code_invalid' USING ERRCODE = 'P0001';
  END IF;

  -- Same account again after the first payment: nothing changes, no new countdown.
  IF v_c.bound_organization_id = v_org THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'quote', public.business_partner_quote_json(v_user));
  END IF;
  IF v_c.bound_organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'partner_code_unavailable' USING ERRCODE = 'P0001';
  END IF;

  -- One personal price per account: after the first payment a second code is never applied.
  SELECT * INTO v_e FROM public.business_partner_entitlements WHERE organization_id = v_org;
  IF FOUND THEN RAISE EXCEPTION 'partner_code_already_applied' USING ERRCODE = 'P0001'; END IF;

  -- Held by another owner: a live reservation or an open payment link at this price.
  IF v_c.reserved_by_user_id IS NOT NULL AND v_c.reserved_by_user_id <> v_user AND (
    v_c.reserved_until > clock_timestamp() OR EXISTS (
      SELECT 1 FROM public.business_subscription_order_scopes s JOIN public.orders o ON o.id = s.order_id
      WHERE s.partner_code_id = v_c.id AND o.status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM public.business_subscription_superseded_orders x WHERE x.order_id = o.id))) THEN
    RAISE EXCEPTION 'partner_code_unavailable' USING ERRCODE = 'P0001';
  END IF;

  -- An open payment link of this owner under another code keeps that code.
  IF EXISTS (SELECT 1 FROM public.business_subscription_order_scopes s JOIN public.orders o ON o.id = s.order_id
    WHERE o.user_id = v_user AND o.status = 'pending' AND s.partner_code_id IS NOT NULL AND s.partner_code_id <> v_c.id
      AND NOT EXISTS (SELECT 1 FROM public.business_subscription_superseded_orders x WHERE x.order_id = o.id)) THEN
    RAISE EXCEPTION 'partner_code_already_applied' USING ERRCODE = 'P0001';
  END IF;

  -- The 72 hours of this code for this account: opened once by its first entry, never restarted.
  SELECT * INTO v_w FROM public.business_partner_code_windows
  WHERE code_id = v_c.id AND organization_id = v_org FOR UPDATE;
  IF v_w.code_id IS NOT NULL AND v_w.expires_at <= clock_timestamp() THEN
    -- This owner's own open link at the personal price, opened in time, can still be paid.
    IF v_c.reserved_by_user_id = v_user AND EXISTS (
      SELECT 1 FROM public.business_subscription_order_scopes s JOIN public.orders o ON o.id = s.order_id
      WHERE s.partner_code_id = v_c.id AND o.user_id = v_user AND o.status = 'pending' AND o.created_at <= v_w.expires_at
        AND NOT EXISTS (SELECT 1 FROM public.business_subscription_superseded_orders x WHERE x.order_id = o.id)) THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'reserved_until', v_c.reserved_until,
        'quote', public.business_partner_quote_json(v_user));
    END IF;
    RAISE EXCEPTION 'partner_code_expired' USING ERRCODE = 'P0001';
  END IF;
  IF v_w.code_id IS NULL THEN
    -- A code this account has never entered: its own fresh 72 hours (t1339u).
    INSERT INTO public.business_partner_code_windows(code_id, organization_id, first_user_id, first_reserved_at, expires_at)
    VALUES (v_c.id, v_org, v_user, clock_timestamp(), clock_timestamp() + interval '72 hours')
    RETURNING * INTO v_w;
    v_first := true;
  END IF;

  -- Only one code is held at a time. Its own window stays, so coming back to it does not restart it.
  UPDATE public.business_partner_codes SET reserved_by_user_id = NULL, reserved_until = NULL
  WHERE reserved_by_user_id = v_user AND id <> v_c.id AND bound_organization_id IS NULL;
  UPDATE public.business_partner_codes
  SET reserved_by_user_id = v_user, reserved_until = v_w.expires_at
  WHERE id = v_c.id;
  RETURN jsonb_build_object('ok', true, 'already', NOT v_first, 'reserved_until', v_w.expires_at,
    'quote', public.business_partner_quote_json(v_user));
END; $$;
REVOKE ALL ON FUNCTION public.reserve_business_partner_code(text) FROM PUBLIC, anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.business_partner_codes c
    WHERE c.reserved_by_user_id IS NOT NULL AND c.bound_organization_id IS NULL
      AND public.business_partner_owner_organization(c.reserved_by_user_id) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.business_partner_code_windows w
        WHERE w.code_id = c.id AND w.expires_at = c.reserved_until
          AND w.organization_id = public.business_partner_owner_organization(c.reserved_by_user_id))
  ) THEN
    RAISE EXCEPTION 'Post-check failed: a held partner code has no window with its exact end';
  END IF;
  IF has_table_privilege('authenticated', 'public.business_partner_code_windows', 'SELECT')
     OR has_table_privilege('anon', 'public.business_partner_code_windows', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: partner code windows must be service-only';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.reserve_business_partner_code(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reserve_business_partner_code(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: reserve grants changed';
  END IF;
END;
$$;

COMMIT;
