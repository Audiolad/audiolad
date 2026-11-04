-- ---------------------------------------------------------------------------
-- Coffee test-account reset (Sergey 2026-11-04).
-- NOT APPLIED. Applying after backup is Sergey's Human Gate.
-- Additive only: two new tables and three new functions. No existing table,
-- function or row is changed by this file.
--
-- Lets the platform owner replay the coffee.audiolad.ru journey (guest
-- 30 minutes → «Получить 7 дней бесплатно» → offer → payment) with one test
-- account. The account must be in business_test_account_allowlist (sha256 of
-- the normalised email, the same hash as business_subscription_email_hash).
-- The address itself is never stored in the repository or in this table.
--
-- Hard rules enforced here:
--   * orders, payments and business_subscription_periods are never touched;
--   * the auth user, profile and listener history stay;
--   * every removed row is kept as JSON in business_test_account_resets;
--   * the venue is closed (status), not deleted, so payment and playback
--     history keep their organisation.
--
-- Rollback (deploy the previous app first; export the archive first if any
-- reset was run: COPY (SELECT * FROM public.business_test_account_resets) TO STDOUT):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.reset_business_test_account(uuid, uuid, text[], text, text);
--   DROP FUNCTION IF EXISTS public.business_test_accounts_for_owner(uuid);
--   DROP FUNCTION IF EXISTS public.business_test_account_target(uuid, uuid);
--   DROP TABLE IF EXISTS public.business_test_account_resets;
--   DROP TABLE IF EXISTS public.business_test_account_allowlist;
--   COMMIT;
-- Rows removed by a reset can be restored from the archive, e.g.
--   INSERT INTO public.access_grants SELECT * FROM jsonb_populate_recordset(
--     NULL::public.access_grants, (SELECT archived->'access_grants'
--     FROM public.business_test_account_resets WHERE id = '<reset id>'));
-- (same for every key of archived; closed venues: UPDATE status back to 'active').
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.business_test_account_allowlist (
  email_hash text PRIMARY KEY CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  note text CHECK (note IS NULL OR (char_length(note) <= 120 AND note !~ '@')),
  added_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_test_account_allowlist IS
  'audiolad:coffee-test-reset; sha256(lower(btrim(email))) of accounts the platform owner may reset. No clear-text email.';

CREATE TABLE IF NOT EXISTS public.business_test_account_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_email_hash text NOT NULL CHECK (target_email_hash ~ '^[0-9a-f]{64}$'),
  closed_organization_ids uuid[] NOT NULL DEFAULT '{}',
  counts jsonb NOT NULL,
  archived jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_test_account_resets_target_idx
  ON public.business_test_account_resets (target_user_id, created_at DESC);

COMMENT ON TABLE public.business_test_account_resets IS
  'audiolad:coffee-test-reset; archive of rows detached by a test-account reset (JSON per table). Never holds payments.';

ALTER TABLE public.business_test_account_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_test_account_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_test_account_allowlist FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_test_account_resets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.business_test_account_allowlist TO service_role;
GRANT SELECT ON TABLE public.business_test_account_resets TO service_role;

-- Resolves and validates the target. Raises on any refusal.
CREATE OR REPLACE FUNCTION public.business_test_account_target(
  p_actor uuid,
  p_target uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_anon boolean;
  v_hash text;
BEGIN
  IF p_actor IS NULL OR p_target IS NULL THEN
    RAISE EXCEPTION 'test_reset_input_required' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(public.is_platform_owner(p_actor), false) THEN
    RAISE EXCEPTION 'test_reset_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_actor = p_target OR coalesce(public.is_platform_staff(p_target), false) THEN
    RAISE EXCEPTION 'test_reset_target_protected' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, coalesce(u.is_anonymous, false)
  INTO v_email, v_anon
  FROM auth.users AS u
  WHERE u.id = p_target;
  IF NOT FOUND OR v_anon OR v_email IS NULL THEN
    RAISE EXCEPTION 'test_reset_target_not_allowlisted' USING ERRCODE = '42501';
  END IF;

  v_hash := public.business_subscription_email_hash(v_email);
  IF v_hash IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_test_account_allowlist AS a WHERE a.email_hash = v_hash
  ) THEN
    RAISE EXCEPTION 'test_reset_target_not_allowlisted' USING ERRCODE = '42501';
  END IF;
  RETURN v_hash;
END;
$$;

-- Owner screen: allowlisted accounts with a masked address and live counts.
CREATE OR REPLACE FUNCTION public.business_test_accounts_for_owner(p_actor uuid)
RETURNS TABLE (
  user_id uuid,
  email_masked text,
  organizations integer,
  gifts integer,
  paid_summaries integer,
  offer_acceptances integer,
  subscription_periods integer,
  last_reset_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_actor IS NULL OR NOT coalesce(public.is_platform_owner(p_actor), false) THEN
    RAISE EXCEPTION 'test_reset_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH t AS (
    SELECT u.id, u.email, public.business_subscription_email_hash(u.email) AS h
    FROM auth.users AS u
    JOIN public.business_test_account_allowlist AS a
      ON a.email_hash = public.business_subscription_email_hash(u.email)
    WHERE coalesce(u.is_anonymous, false) = false
      AND u.id <> p_actor
  )
  SELECT
    t.id,
    left(split_part(t.email, '@', 1), 1) || '•••@' || split_part(t.email, '@', 2),
    (SELECT count(*)::int FROM public.business_organization_members AS m WHERE m.user_id = t.id),
    (SELECT count(*)::int FROM public.access_grants AS g WHERE g.user_id = t.id OR g.email_hash = t.h),
    (SELECT count(*)::int FROM public.access_paid_periods AS p WHERE p.user_id = t.id OR p.email_hash = t.h),
    (SELECT count(*)::int FROM public.business_offer_edition_acceptances AS o WHERE o.user_id = t.id),
    (SELECT count(*)::int FROM public.business_subscription_periods AS s WHERE s.user_id = t.id),
    (SELECT max(r.created_at) FROM public.business_test_account_resets AS r WHERE r.target_user_id = t.id)
  FROM t
  ORDER BY t.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_business_test_account(
  p_actor uuid,
  p_target uuid,
  p_device_hashes text[] DEFAULT '{}',
  p_meter_network_hash text DEFAULT NULL,
  p_start_network_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text;
  v_orgs uuid[];
  v_devices text[];
  v_counts jsonb := '{}'::jsonb;
  v_archived jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_n integer;
  v_reset_id uuid;
BEGIN
  v_hash := public.business_test_account_target(p_actor, p_target);

  SELECT coalesce(array_agg(d), '{}') INTO v_devices
  FROM unnest(coalesce(p_device_hashes, '{}')) AS d
  WHERE d ~ '^[0-9a-f]{64}$';
  IF p_meter_network_hash IS NOT NULL AND p_meter_network_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'test_reset_input_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_start_network_hash IS NOT NULL AND p_start_network_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'test_reset_input_invalid' USING ERRCODE = '22023';
  END IF;

  -- Same lock as the gift and the payment fulfilment: no gift or renewal
  -- can interleave with the reset of this account.
  PERFORM pg_advisory_xact_lock(hashtextextended('access_grants:business_new_client', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('business_test_account_reset:' || p_target::text, 0));

  SELECT coalesce(array_agg(DISTINCT m.organization_id), '{}') INTO v_orgs
  FROM public.business_organization_members AS m
  WHERE m.user_id = p_target;

  -- A venue shared with another person is never closed by a test reset.
  IF EXISTS (
    SELECT 1 FROM public.business_organization_members AS m
    WHERE m.organization_id = ANY (v_orgs) AND m.user_id <> p_target
  ) THEN
    RAISE EXCEPTION 'test_reset_shared_organization' USING ERRCODE = '42501';
  END IF;

  -- 1. Close the venue (kept for payment / playback history).
  UPDATE public.business_organizations SET status = 'closed', updated_at = now()
  WHERE id = ANY (v_orgs) AND status <> 'closed';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('organizations_closed', v_n);
  UPDATE public.business_locations SET status = 'closed', updated_at = now()
  WHERE organization_id = ANY (v_orgs) AND status <> 'closed';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('locations_closed', v_n);
  UPDATE public.business_zones AS z SET status = 'closed', updated_at = now()
  FROM public.business_locations AS l
  WHERE z.location_id = l.id AND l.organization_id = ANY (v_orgs) AND z.status <> 'closed';
  UPDATE public.business_players SET status = 'retired', updated_at = now()
  WHERE organization_id = ANY (v_orgs) AND status <> 'retired';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('players_retired', v_n);
  UPDATE public.business_player_assignments AS a SET unassigned_at = now()
  FROM public.business_players AS p
  WHERE a.player_id = p.id AND p.organization_id = ANY (v_orgs) AND a.unassigned_at IS NULL;
  UPDATE public.business_point_sessions SET revoked_at = now()
  WHERE organization_id = ANY (v_orgs) AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('point_sessions_revoked', v_n);
  UPDATE public.business_point_pairings SET retired_at = now()
  WHERE organization_id = ANY (v_orgs) AND retired_at IS NULL;

  -- 2. Detach and archive (row copies go to the archive table).
  WITH d AS (DELETE FROM public.business_organization_members WHERE user_id = p_target RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('memberships', v_n);
  v_archived := v_archived || jsonb_build_object('business_organization_members', v_rows);

  WITH d AS (DELETE FROM public.business_guest_starts
             WHERE user_id = p_target OR organization_id = ANY (v_orgs) RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('guest_starts', v_n);
  v_archived := v_archived || jsonb_build_object('business_guest_starts', v_rows);

  WITH d AS (DELETE FROM public.business_trial_activity_days WHERE organization_id = ANY (v_orgs) RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('trial_activity_days', v_n);
  v_archived := v_archived || jsonb_build_object('business_trial_activity_days', v_rows);

  WITH d AS (DELETE FROM public.access_grants WHERE user_id = p_target OR email_hash = v_hash RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('gifts', v_n);
  v_archived := v_archived || jsonb_build_object('access_grants', v_rows);

  WITH d AS (DELETE FROM public.access_grant_identities WHERE user_id = p_target OR email_hash = v_hash RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('gift_identities', v_n);
  v_archived := v_archived || jsonb_build_object('access_grant_identities', v_rows);

  WITH d AS (DELETE FROM public.access_grant_events WHERE user_id = p_target OR email_hash = v_hash RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('gift_events', v_n);
  v_archived := v_archived || jsonb_build_object('access_grant_events', v_rows);

  -- Summary of paid_until only. The paid periods themselves (order_id rows)
  -- and orders/payments stay untouched.
  WITH d AS (DELETE FROM public.access_paid_periods WHERE user_id = p_target OR email_hash = v_hash RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('paid_summaries', v_n);
  v_archived := v_archived || jsonb_build_object('access_paid_periods', v_rows);

  WITH d AS (DELETE FROM public.business_offer_edition_acceptances WHERE user_id = p_target RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('offer_edition_acceptances', v_n);
  v_archived := v_archived || jsonb_build_object('business_offer_edition_acceptances', v_rows);

  WITH d AS (DELETE FROM public.business_offer_acceptances WHERE user_id = p_target RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('offer_acceptances', v_n);
  v_archived := v_archived || jsonb_build_object('business_offer_acceptances', v_rows);

  WITH d AS (DELETE FROM public.business_workspace_playback WHERE user_id = p_target RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('workspace_playback', v_n);
  v_archived := v_archived || jsonb_build_object('business_workspace_playback', v_rows);

  -- 3. The pressing device and its network: fresh 30-minute guest meter.
  WITH d AS (DELETE FROM public.business_guest_listening WHERE device_hash = ANY (v_devices) RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('guest_meter_devices', v_n);
  v_archived := v_archived || jsonb_build_object('business_guest_listening', v_rows);

  WITH d AS (DELETE FROM public.business_guest_listening_ip_day
             WHERE device_hash = ANY (v_devices)
                OR (p_meter_network_hash IS NOT NULL AND ip_hash = p_meter_network_hash) RETURNING *)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(d)), '[]') INTO v_n, v_rows FROM d;
  v_counts := v_counts || jsonb_build_object('guest_meter_network_days', v_n);
  v_archived := v_archived || jsonb_build_object('business_guest_listening_ip_day', v_rows);

  DELETE FROM public.business_guest_start_network_hits
  WHERE p_start_network_hash IS NOT NULL AND network_hash = p_start_network_hash;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('guest_start_limit_hits', v_n);

  -- 4. Platform analytics of the business pages: marked as test, not removed.
  UPDATE public.analytics_events SET is_test = true
  WHERE user_id = p_target AND is_test IS NOT TRUE
    AND (event_name LIKE 'business%' OR path LIKE '/business%' OR path LIKE '/guest/coffee%');
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('analytics_events_marked_test', v_n);

  INSERT INTO public.business_test_account_resets (
    actor_user_id, target_user_id, target_email_hash, closed_organization_ids, counts, archived
  ) VALUES (p_actor, p_target, v_hash, v_orgs, v_counts, v_archived)
  RETURNING id INTO v_reset_id;

  INSERT INTO public.admin_operation_log (
    operation, actor_user_id, target_auth_user_id, target_email_hash, counts, status
  ) VALUES (
    'coffee_test_account_reset', p_actor, p_target, v_hash,
    v_counts || jsonb_build_object('reset_id', v_reset_id), 'success'
  );

  RETURN jsonb_build_object('reset_id', v_reset_id, 'counts', v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.business_test_account_target(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_test_accounts_for_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_business_test_account(uuid, uuid, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_test_accounts_for_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_business_test_account(uuid, uuid, text[], text, text) TO service_role;

COMMENT ON FUNCTION public.reset_business_test_account(uuid, uuid, text[], text, text) IS
  'audiolad:coffee-test-reset; platform owner only, allowlisted account only. Closes the venue, archives gift/offer/paid-summary rows, clears the pressing device meter. Never touches orders, payments or business_subscription_periods.';

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.reset_business_test_account(uuid, uuid, text[], text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.business_test_accounts_for_owner(uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.business_test_account_allowlist', 'SELECT')
     OR has_table_privilege('authenticated', 'public.business_test_account_resets', 'SELECT')
     OR NOT has_function_privilege('service_role', 'public.reset_business_test_account(uuid, uuid, text[], text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: test reset service-role boundary';
  END IF;
END;
$$;

COMMIT;
