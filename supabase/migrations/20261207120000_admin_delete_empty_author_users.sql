-- Allow admin deletion of users with empty author workspaces.
-- This is intentionally fail-closed: products, finance, foreign memberships,
-- referrer-side partner history and other author-space blockers prevent cleanup.

BEGIN;

CREATE OR REPLACE FUNCTION public.author_referrals_protect_activated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_reset_target text;
  v_admin_delete_target text;
  v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.activated_at IS NOT NULL THEN
      v_reset_target := nullif(
        btrim(coalesce(current_setting('audiolad.allowlisted_test_user_reset', true), '')),
        ''
      );
      v_admin_delete_target := nullif(
        btrim(coalesce(current_setting('audiolad.admin_empty_user_delete', true), '')),
        ''
      );

      -- Existing allowlisted test reset stays constrained to audiolad@mail.ru.
      IF v_reset_target IS NOT NULL
         AND v_reset_target = OLD.invitee_user_id::text THEN
        SELECT lower(btrim(u.email))
        INTO v_email
        FROM auth.users AS u
        WHERE u.id = OLD.invitee_user_id;

        IF v_email = 'audiolad@mail.ru' THEN
          RETURN OLD;
        END IF;
      END IF;

      -- General admin cleanup is available only inside a trusted
      -- SECURITY DEFINER/service-role transaction and only for the target invitee.
      IF v_admin_delete_target IS NOT NULL
         AND v_admin_delete_target = OLD.invitee_user_id::text
         AND current_user IN ('postgres', 'service_role') THEN
        RETURN OLD;
      END IF;

      RAISE EXCEPTION 'author_referral_activated_immutable'
        USING ERRCODE = '22023';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.activated_at IS NOT NULL THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.referrer_author_id IS DISTINCT FROM OLD.referrer_author_id
      OR NEW.referrer_owner_user_id IS DISTINCT FROM OLD.referrer_owner_user_id
      OR NEW.invitee_user_id IS DISTINCT FROM OLD.invitee_user_id
      OR NEW.code_used IS DISTINCT FROM OLD.code_used
      OR NEW.code_normalized IS DISTINCT FROM OLD.code_normalized
      OR NEW.attributed_at IS DISTINCT FROM OLD.attributed_at
      OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.activation_author_id_snapshot IS DISTINCT FROM OLD.activation_author_id_snapshot
      OR NEW.bonus_slot_granted_at IS DISTINCT FROM OLD.bonus_slot_granted_at
    THEN
      RAISE EXCEPTION 'author_referral_activated_immutable'
        USING ERRCODE = '22023';
    END IF;

    IF NEW.invitee_author_id IS DISTINCT FROM OLD.invitee_author_id THEN
      IF NOT (
        OLD.invitee_author_id IS NOT NULL
        AND NEW.invitee_author_id IS NULL
      ) THEN
        RAISE EXCEPTION 'author_referral_activated_immutable'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.author_referrals_protect_activated() IS
  'Activated referrals stay immutable except the allowlisted test reset and trusted admin deletion of the same empty invitee account.';

CREATE OR REPLACE FUNCTION public.admin_cleanup_deletable_user(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owned uuid[] := ARRAY[]::uuid[];
  v_author uuid;
  v_raw text[];
  v_blockers text[];
  v_referrals integer := 0;
  v_attributions integer := 0;
  v_authors integer := 0;
  v_applications integer := 0;
  v_bonus integer := 0;
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_target';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p_target_user_id) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'alreadyClean', true,
      'counts', jsonb_build_object(
        'inviteeReferrals', 0,
        'attributions', 0,
        'ownedAuthors', 0,
        'authorApplications', 0,
        'partnerBonusCleared', 0
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = p_target_user_id
      AND p.role IN ('platform_owner', 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'platform_role_target';
  END IF;

  SELECT coalesce(array_agg(m.author_id), ARRAY[]::uuid[])
  INTO v_owned
  FROM public.author_members AS m
  WHERE m.user_id = p_target_user_id
    AND m.role = 'owner';

  IF EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.user_id = p_target_user_id
      AND (
        m.role IS DISTINCT FROM 'owner'
        OR NOT (m.author_id = ANY (v_owned))
      )
  ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'foreign_membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.author_id = ANY (v_owned)
      AND m.user_id IS DISTINCT FROM p_target_user_id
  ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'other_members_on_owned_authors';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders AS o WHERE o.user_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'orders';
  END IF;

  IF to_regclass('public.author_project_capacity_grants') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.author_project_capacity_grants AS g
       WHERE g.user_id = p_target_user_id
     ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'capacity_grants';
  END IF;

  IF to_regclass('public.personal_material_templates') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.personal_material_templates AS t
       WHERE t.created_by = p_target_user_id
     ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'personal_material_templates';
  END IF;

  IF to_regclass('public.author_referrals') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.author_referrals AS r
       WHERE r.invitee_user_id IS DISTINCT FROM p_target_user_id
         AND (
           r.referrer_owner_user_id = p_target_user_id
           OR r.referrer_author_id = ANY (v_owned)
         )
     ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'referrer_history';
  END IF;

  IF to_regclass('public.author_partner_attributions') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.author_partner_attributions AS a
       WHERE a.referrer_author_id = ANY (v_owned)
         AND (
           a.invitee_user_id IS NULL
           OR a.invitee_user_id IS DISTINCT FROM p_target_user_id
         )
     ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'referrer_attribution';
  END IF;

  IF to_regclass('public.author_partner_reward_ledger_entries') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.author_partner_reward_ledger_entries AS e
       WHERE e.partner_author_id = ANY (v_owned)
          OR e.invitee_author_id = ANY (v_owned)
     ) THEN
    RAISE EXCEPTION 'admin_user_delete_blocked'
      USING ERRCODE = 'P0001', DETAIL = 'partner_reward';
  END IF;

  FOREACH v_author IN ARRAY v_owned LOOP
    v_raw := public.author_space_delete_blockers(v_author);
    v_blockers := array_remove(coalesce(v_raw, ARRAY[]::text[]), 'has_terms_acceptance');

    IF coalesce(array_length(v_blockers, 1), 0) > 0 THEN
      RAISE EXCEPTION 'admin_user_delete_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'owned_author_blocked:' || array_to_string(v_blockers, ',');
    END IF;

    IF 'has_terms_acceptance' = ANY (coalesce(v_raw, ARRAY[]::text[]))
       AND EXISTS (
         SELECT 1
         FROM public.author_terms_acceptances AS t
         WHERE t.author_id = v_author
           AND t.accepted_by_user_id IS DISTINCT FROM p_target_user_id
       ) THEN
      RAISE EXCEPTION 'admin_user_delete_blocked'
        USING ERRCODE = 'P0001', DETAIL = 'foreign_terms';
    END IF;
  END LOOP;

  PERFORM set_config(
    'audiolad.admin_empty_user_delete',
    p_target_user_id::text,
    true
  );
  PERFORM set_config('audiolad.trusted_profile_limit_write', '1', true);

  IF coalesce(array_length(v_owned, 1), 0) > 0 THEN
    DELETE FROM public.author_terms_acceptances AS t
    WHERE t.author_id = ANY (v_owned)
      AND t.accepted_by_user_id = p_target_user_id;
  END IF;

  IF to_regclass('public.author_partner_attributions') IS NOT NULL THEN
    DELETE FROM public.author_partner_attributions AS a
    WHERE a.invitee_user_id = p_target_user_id;
    GET DIAGNOSTICS v_attributions = ROW_COUNT;
  END IF;

  IF to_regclass('public.author_referrals') IS NOT NULL THEN
    DELETE FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_target_user_id;
    GET DIAGNOSTICS v_referrals = ROW_COUNT;
  END IF;

  IF to_regclass('public.author_applications') IS NOT NULL THEN
    SELECT count(*)
    INTO v_applications
    FROM public.author_applications AS app
    WHERE app.user_id = p_target_user_id;

    DELETE FROM public.author_applications AS app
    WHERE app.user_id = p_target_user_id;

    UPDATE public.author_applications AS app
    SET reviewed_by = NULL
    WHERE app.reviewed_by = p_target_user_id;
  END IF;

  UPDATE public.profiles AS p
  SET author_project_slots_partner_bonus = 0
  WHERE p.id = p_target_user_id
    AND p.author_project_slots_partner_bonus IS DISTINCT FROM 0;
  GET DIAGNOSTICS v_bonus = ROW_COUNT;

  FOREACH v_author IN ARRAY v_owned LOOP
    v_blockers := public.author_space_delete_blockers(v_author);
    IF coalesce(array_length(v_blockers, 1), 0) > 0 THEN
      RAISE EXCEPTION 'admin_user_delete_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'owned_author_blocked:' || array_to_string(v_blockers, ',');
    END IF;
  END LOOP;

  IF coalesce(array_length(v_owned, 1), 0) > 0 THEN
    DELETE FROM public.authors AS a
    WHERE a.id = ANY (v_owned);
    GET DIAGNOSTICS v_authors = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'counts', jsonb_build_object(
      'inviteeReferrals', v_referrals,
      'attributions', v_attributions,
      'ownedAuthors', v_authors,
      'authorApplications', v_applications,
      'partnerBonusCleared', v_bonus
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cleanup_deletable_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cleanup_deletable_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_cleanup_deletable_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_deletable_user(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_cleanup_deletable_user(uuid) IS
  'Service-role-only cleanup for admin deletion. Removes only empty owned author workspaces and invitee-side referral footprint; blocks products, finance and foreign/shared relationships.';

COMMIT;
