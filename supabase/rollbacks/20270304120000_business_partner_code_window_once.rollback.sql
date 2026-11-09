-- Rollback of 20270304120000_business_partner_code_window_once.sql (task 8142d69a, t1338u).
-- Apply only with Sergey's decision, after a PostgreSQL backup. Deploy the previous application
-- first if it depends on partner_code_expired (it does not break without it).
-- Restores the previous behaviour: every reserve_business_partner_code call restarts 72 hours.
-- No orders, payments, periods, codes or entitlements are changed or deleted.
BEGIN;
DROP TRIGGER IF EXISTS business_partner_scope_window_guard ON public.business_subscription_order_scopes;
DROP FUNCTION IF EXISTS public.business_partner_scope_window_guard();
DROP TRIGGER IF EXISTS business_partner_codes_window_cap ON public.business_partner_codes;
DROP FUNCTION IF EXISTS public.business_partner_codes_window_cap();
CREATE OR REPLACE FUNCTION public.reserve_business_partner_code(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid(); v_org uuid; v_code text; v_c public.business_partner_codes%ROWTYPE;
  v_e public.business_partner_entitlements%ROWTYPE;
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

  -- Same account again: nothing changes, no new countdown.
  IF v_c.bound_organization_id = v_org THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'quote', public.business_partner_quote_json(v_user));
  END IF;
  IF v_c.bound_organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'partner_code_unavailable' USING ERRCODE = 'P0001';
  END IF;

  -- One personal price per account: a second code never extends or restarts it.
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

  -- Only one code is held at a time.
  UPDATE public.business_partner_codes SET reserved_by_user_id = NULL, reserved_until = NULL
  WHERE reserved_by_user_id = v_user AND id <> v_c.id AND bound_organization_id IS NULL;
  UPDATE public.business_partner_codes
  SET reserved_by_user_id = v_user, reserved_until = clock_timestamp() + interval '72 hours'
  WHERE id = v_c.id;
  RETURN jsonb_build_object('ok', true, 'already', false, 'quote', public.business_partner_quote_json(v_user));
END; $$;
REVOKE ALL ON FUNCTION public.reserve_business_partner_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_business_partner_code(text) TO authenticated;
DROP TABLE IF EXISTS public.business_partner_code_windows;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270304120000';
COMMIT;
