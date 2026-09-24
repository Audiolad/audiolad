-- Extends the allowlisted reset with a fail-closed partner financial-history guard.
-- The canonical function body is intentionally restated so production applies this guard before cleanup.

-- Allowlisted test-user reset, phase 1 (DB only).
--
-- Hard-coded exception for auth email audiolad@mail.ru inside
-- public.reset_allowlisted_test_user_db(uuid). Does not delete auth.users.
-- Does not change author_referrals.invitee_user_id ON DELETE RESTRICT.
-- Ordinary activated referrals stay immutable: the protect trigger allows
-- DELETE of an activated row only when ALL of these hold:
--   * transaction-local GUC audiolad.allowlisted_test_user_reset equals that
--     row's invitee_user_id (set by the RPC with is_local = true)
--   * the invitee auth.users.email is exactly audiolad@mail.ru
-- A GUC alone is not enough. UPDATE of an activated row stays fully immutable.
-- There is no general admin bypass.

BEGIN;

CREATE OR REPLACE FUNCTION public.author_referrals_protect_activated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_reset_target text;
  v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.activated_at IS NOT NULL THEN
      v_reset_target := nullif(
        btrim(coalesce(current_setting('audiolad.allowlisted_test_user_reset', true), '')),
        ''
      );

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

    -- invitee_author_id may only move A → NULL (empty workspace delete). No A → B.
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
  'Activated author_referrals stay immutable. DELETE of an activated invitee row is allowed only for the transaction-local allowlisted test-user reset of audiolad@mail.ru.';

DROP TRIGGER IF EXISTS author_referrals_protect_activated_trg ON public.author_referrals;
CREATE TRIGGER author_referrals_protect_activated_trg
  BEFORE UPDATE OR DELETE ON public.author_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.author_referrals_protect_activated();

CREATE OR REPLACE FUNCTION public.reset_allowlisted_test_user_db(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_owned uuid[] := ARRAY[]::uuid[];
  v_author uuid;
  v_blockers text[];
  v_raw text[];
  v_count integer;
  v_count2 integer;
  v_referrals integer := 0;
  v_attributions integer := 0;
  v_authors integer := 0;
  v_members integer := 0;
  v_applications integer := 0;
  v_terms integer := 0;
  v_bonus integer := 0;
  v_schema text;
  v_table text;
  v_column text;
  v_key_len integer;
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'allowlisted_test_user_reset_not_allowlisted'
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(u.email))
  INTO v_email
  FROM auth.users AS u
  WHERE u.id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dbCleanupCompleted', true,
      'alreadyClean', true,
      'targetUserId', NULL,
      'counts', jsonb_build_object(
        'inviteeReferrals', 0,
        'attributions', 0,
        'ownedAuthors', 0,
        'authorMembers', 0,
        'authorApplications', 0,
        'capacityGrants', 0,
        'partnerBonusCleared', 0,
        'termsAcceptances', 0
      )
    );
  END IF;

  IF v_email IS DISTINCT FROM 'audiolad@mail.ru' THEN
    RAISE EXCEPTION 'allowlisted_test_user_reset_not_allowlisted'
      USING ERRCODE = '42501';
  END IF;

  IF to_regprocedure('public.author_space_delete_blockers(uuid)') IS NULL THEN
    RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
      USING ERRCODE = 'P0001',
            DETAIL = 'author_space_delete_blockers_missing';
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = p_target_user_id
        AND p.role IN ('platform_owner', 'platform_admin')
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'platform_role_target';
    END IF;
  END IF;

  SELECT coalesce(array_agg(m.author_id), ARRAY[]::uuid[])
  INTO v_owned
  FROM public.author_members AS m
  WHERE m.user_id = p_target_user_id
    AND m.role = 'owner';

  IF EXISTS (
    SELECT 1
    FROM public.authors AS a
    WHERE a.id = ANY (v_owned)
      AND (
        a.id = '7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c'::uuid
        OR a.slug IN ('sergey', 'sergey-petrov')
      )
  ) THEN
    RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
      USING ERRCODE = 'P0001',
            DETAIL = 'protected_author';
  END IF;

  IF to_regclass('public.author_partner_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_partner_profiles AS p
      WHERE p.author_id = ANY (v_owned)
        AND p.primary_code_normalized = 'sergey'
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'protected_author';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.author_id = ANY (v_owned)
      AND m.user_id IS DISTINCT FROM p_target_user_id
  ) THEN
    RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
      USING ERRCODE = 'P0001',
            DETAIL = 'other_members_on_owned_authors';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.user_id = p_target_user_id
      AND (
        m.role IS DISTINCT FROM 'owner'
        OR NOT (m.author_id = ANY (v_owned))
      )
  ) THEN
    RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
      USING ERRCODE = 'P0001',
            DETAIL = 'foreign_membership';
  END IF;

  IF to_regclass('public.author_referrals') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_referrals AS r
      WHERE r.invitee_user_id IS DISTINCT FROM p_target_user_id
        AND (
          r.referrer_owner_user_id = p_target_user_id
          OR r.referrer_author_id = ANY (v_owned)
        )
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'test_as_referrer';
    END IF;
  END IF;

  IF to_regclass('public.author_partner_attributions') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_partner_attributions AS a
      WHERE a.referrer_author_id = ANY (v_owned)
        AND a.invitee_user_id IS NOT NULL
        AND a.invitee_user_id IS DISTINCT FROM p_target_user_id
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'foreign_attribution';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.author_partner_attributions AS a
      WHERE a.referrer_author_id = ANY (v_owned)
        AND a.invitee_user_id IS NULL
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'pending_referrer_attribution';
    END IF;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.orders AS o
      WHERE o.user_id = p_target_user_id
        AND o.status = 'refunded'
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'refunds';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.orders AS o
      WHERE o.user_id = p_target_user_id
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'orders';
    END IF;
  END IF;

  IF to_regclass('public.payments') IS NOT NULL
     AND to_regclass('public.orders') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.payments AS pay
      JOIN public.orders AS o ON o.id = pay.order_id
      WHERE o.user_id = p_target_user_id
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'payments';
    END IF;
  END IF;

  IF to_regclass('public.author_project_capacity_grants') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_project_capacity_grants AS g
      WHERE g.user_id = p_target_user_id
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'capacity_grants';
    END IF;
  END IF;

  -- Financial partner rewards are immutable history. The allowlisted reset
  -- must stop before any cleanup and never delete/cascade these rows.
  IF to_regclass('public.author_partner_reward_ledger_entries') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_partner_reward_ledger_entries AS e
      WHERE e.partner_author_id = ANY (v_owned)
         OR e.invitee_author_id = ANY (v_owned)
         OR e.referral_id IN (
           SELECT r.id FROM public.author_referrals AS r
           WHERE r.invitee_user_id = p_target_user_id
         )
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'partner_reward';
    END IF;
  END IF;

  IF to_regclass('public.author_ledger_entries') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_ledger_entries AS e
      WHERE e.author_id = ANY (v_owned)
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'royalty';
    END IF;
  END IF;

  IF to_regclass('public.author_payouts') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_payouts AS p
      WHERE p.author_id = ANY (v_owned)
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'payout';
    END IF;
  END IF;

  IF to_regclass('public.author_payout_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_payout_profiles AS p
      WHERE p.author_id = ANY (v_owned)
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'payout_profile';
    END IF;
  END IF;

  IF to_regclass('public.personal_materials') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.personal_materials AS m
      WHERE m.created_by = p_target_user_id
         OR m.claimed_by_user_id = p_target_user_id
         OR m.author_id = ANY (v_owned)
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'personal_materials';
    END IF;
  END IF;

  IF to_regclass('public.promotion_campaigns') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.promotion_campaigns AS c
      WHERE c.created_by = p_target_user_id
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'promotion_campaigns';
    END IF;
  END IF;

  IF to_regclass('public.personal_material_templates') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.personal_material_templates AS t
      WHERE t.created_by = p_target_user_id
    ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'personal_material_templates';
    END IF;
  END IF;

  FOREACH v_author IN ARRAY v_owned LOOP
    v_raw := public.author_space_delete_blockers(v_author);
    v_blockers := array_remove(coalesce(v_raw, ARRAY[]::text[]), 'has_terms_acceptance');

    IF coalesce(array_length(v_blockers, 1), 0) > 0 THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'owned_author_blocked:' || array_to_string(v_blockers, ',');
    END IF;

    IF 'has_terms_acceptance' = ANY (coalesce(v_raw, ARRAY[]::text[]))
       AND to_regclass('public.author_terms_acceptances') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.author_terms_acceptances AS t
         WHERE t.author_id = v_author
           AND t.accepted_by_user_id IS DISTINCT FROM p_target_user_id
       ) THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'foreign_terms';
    END IF;
  END LOOP;

  -- Transaction-local context. Cleared before return. Never session-level.
  PERFORM set_config('audiolad.allowlisted_test_user_reset', p_target_user_id::text, true);
  PERFORM set_config('audiolad.trusted_profile_limit_write', '1', true);

  IF to_regclass('public.author_terms_acceptances') IS NOT NULL THEN
    DELETE FROM public.author_terms_acceptances AS t
    WHERE t.author_id = ANY (v_owned)
      AND t.accepted_by_user_id = p_target_user_id;
    GET DIAGNOSTICS v_terms = ROW_COUNT;
  END IF;

  FOREACH v_author IN ARRAY v_owned LOOP
    v_blockers := public.author_space_delete_blockers(v_author);
    IF coalesce(array_length(v_blockers, 1), 0) > 0 THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = 'owned_author_blocked:' || array_to_string(v_blockers, ',');
    END IF;
  END LOOP;

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

  -- Hidden RESTRICT / NO ACTION children of owned authors, including composite
  -- keys. Single-column hits use author_fk:. Composite hits use composite_fk:.
  -- Fail closed before DELETE. No cleanup of those rows.
  IF coalesce(array_length(v_owned, 1), 0) > 0 THEN
    FOR v_schema, v_table, v_column, v_key_len IN
      SELECT ns.nspname, cl.relname, att.attname, array_length(c.conkey, 1)
      FROM pg_constraint AS c
      JOIN pg_class AS cl ON cl.oid = c.conrelid
      JOIN pg_namespace AS ns ON ns.oid = cl.relnamespace
      JOIN LATERAL unnest(c.conkey, c.confkey) AS fkcols(local_attnum, ref_attnum)
        ON true
      JOIN pg_attribute AS att
        ON att.attrelid = c.conrelid
       AND att.attnum = fkcols.local_attnum
      JOIN pg_attribute AS refatt
        ON refatt.attrelid = c.confrelid
       AND refatt.attnum = fkcols.ref_attnum
      WHERE c.contype = 'f'
        AND c.confrelid = 'public.authors'::regclass
        AND c.confdeltype IN ('a', 'r')
        AND ns.nspname = 'public'
        AND refatt.attname = 'id'
    LOOP
      FOREACH v_author IN ARRAY v_owned LOOP
        EXECUTE format(
          'SELECT count(*) FROM %I.%I WHERE %I = $1',
          v_schema,
          v_table,
          v_column
        )
        INTO v_count
        USING v_author;

        IF v_count > 0 THEN
          RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
            USING ERRCODE = 'P0001',
                  DETAIL = format(
                    '%s:%s.%s',
                    CASE WHEN v_key_len > 1 THEN 'composite_fk' ELSE 'author_fk' END,
                    v_table,
                    v_column
                  );
        END IF;
      END LOOP;
    END LOOP;

    FOR v_schema, v_table IN
      SELECT ns.nspname, cl.relname
      FROM pg_constraint AS c
      JOIN pg_class AS cl ON cl.oid = c.conrelid
      JOIN pg_namespace AS ns ON ns.oid = cl.relnamespace
      WHERE c.contype = 'f'
        AND c.confrelid = 'public.authors'::regclass
        AND c.confdeltype IN ('a', 'r')
        AND ns.nspname = 'public'
        AND array_length(c.conkey, 1) > 1
        AND NOT EXISTS (
          SELECT 1
          FROM LATERAL unnest(c.conkey, c.confkey) AS fkcols(local_attnum, ref_attnum)
          JOIN pg_attribute AS refatt
            ON refatt.attrelid = c.confrelid
           AND refatt.attnum = fkcols.ref_attnum
          WHERE refatt.attname = 'id'
        )
    LOOP
      EXECUTE format('SELECT count(*) FROM %I.%I', v_schema, v_table)
      INTO v_count;

      IF v_count > 0 THEN
        RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
          USING ERRCODE = 'P0001',
                DETAIL = format('composite_fk:%s.*', v_table);
      END IF;
    END LOOP;
  END IF;

  SELECT count(*)
  INTO v_members
  FROM public.author_members AS m
  WHERE m.user_id = p_target_user_id
    AND m.author_id = ANY (v_owned);

  IF coalesce(array_length(v_owned, 1), 0) > 0 THEN
    DELETE FROM public.authors AS a
    WHERE a.id = ANY (v_owned);
    GET DIAGNOSTICS v_authors = ROW_COUNT;
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

  -- Anything still RESTRICT / NO ACTION to auth.users in public, including a
  -- composite key, would make phase 2 auth.admin.deleteUser fail.
  -- Roll the cleanup back instead. Composite hits use composite_fk:.
  FOR v_schema, v_table, v_column, v_key_len IN
    SELECT ns.nspname, cl.relname, att.attname, array_length(c.conkey, 1)
    FROM pg_constraint AS c
    JOIN pg_class AS cl ON cl.oid = c.conrelid
    JOIN pg_namespace AS ns ON ns.oid = cl.relnamespace
    JOIN LATERAL unnest(c.conkey, c.confkey) AS fkcols(local_attnum, ref_attnum)
      ON true
    JOIN pg_attribute AS att
      ON att.attrelid = c.conrelid
     AND att.attnum = fkcols.local_attnum
    JOIN pg_attribute AS refatt
      ON refatt.attrelid = c.confrelid
     AND refatt.attnum = fkcols.ref_attnum
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype IN ('a', 'r')
      AND ns.nspname = 'public'
      AND refatt.attname = 'id'
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I = $1',
      v_schema,
      v_table,
      v_column
    )
    INTO v_count2
    USING p_target_user_id;

    IF v_count2 > 0 THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = format(
                '%s:%s.%s',
                CASE WHEN v_key_len > 1 THEN 'composite_fk' ELSE 'auth_fk' END,
                v_table,
                v_column
              );
    END IF;
  END LOOP;

  FOR v_schema, v_table IN
    SELECT ns.nspname, cl.relname
    FROM pg_constraint AS c
    JOIN pg_class AS cl ON cl.oid = c.conrelid
    JOIN pg_namespace AS ns ON ns.oid = cl.relnamespace
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype IN ('a', 'r')
      AND ns.nspname = 'public'
      AND array_length(c.conkey, 1) > 1
      AND NOT EXISTS (
        SELECT 1
        FROM LATERAL unnest(c.conkey, c.confkey) AS fkcols(local_attnum, ref_attnum)
        JOIN pg_attribute AS refatt
          ON refatt.attrelid = c.confrelid
         AND refatt.attnum = fkcols.ref_attnum
        WHERE refatt.attname = 'id'
      )
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', v_schema, v_table)
    INTO v_count2;

    IF v_count2 > 0 THEN
      RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
        USING ERRCODE = 'P0001',
              DETAIL = format('composite_fk:%s.*', v_table);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_target_user_id
       OR (
         r.invitee_user_id IS DISTINCT FROM p_target_user_id
         AND (
           r.referrer_owner_user_id = p_target_user_id
           OR r.referrer_author_id = ANY (v_owned)
         )
       )
  ) THEN
    RAISE EXCEPTION 'allowlisted_test_user_reset_blocked'
      USING ERRCODE = 'P0001',
            DETAIL = 'verify_referrals';
  END IF;

  PERFORM set_config('audiolad.allowlisted_test_user_reset', '', true);
  PERFORM set_config('audiolad.trusted_profile_limit_write', '', true);

  RETURN jsonb_build_object(
    'ok', true,
    'dbCleanupCompleted', true,
    'alreadyClean', (
      v_referrals = 0
      AND v_attributions = 0
      AND v_authors = 0
      AND v_members = 0
      AND v_applications = 0
      AND v_terms = 0
      AND v_bonus = 0
    ),
    'targetUserId', p_target_user_id,
    'counts', jsonb_build_object(
      'inviteeReferrals', v_referrals,
      'attributions', v_attributions,
      'ownedAuthors', v_authors,
      'authorMembers', v_members,
      'authorApplications', v_applications,
      'capacityGrants', 0,
      'partnerBonusCleared', v_bonus,
      'termsAcceptances', v_terms
    )
  );
END;
$$;

COMMENT ON FUNCTION public.reset_allowlisted_test_user_db(uuid) IS
  'Phase 1 allowlisted test-user DB cleanup for audiolad@mail.ru only. One transaction. Does not delete auth.users. service_role only.';

REVOKE ALL ON FUNCTION public.reset_allowlisted_test_user_db(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_allowlisted_test_user_db(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reset_allowlisted_test_user_db(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_allowlisted_test_user_db(uuid) TO service_role;

-- Prove this migration did not weaken the global invitee / referrer RESTRICT FKs.
DO $$
DECLARE
  v_invitee "char";
  v_referrer_author "char";
  v_referrer_owner "char";
BEGIN
  SELECT c.confdeltype
  INTO v_invitee
  FROM pg_constraint AS c
  JOIN pg_attribute AS a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.author_referrals'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'auth.users'::regclass
    AND a.attname = 'invitee_user_id';

  SELECT c.confdeltype
  INTO v_referrer_owner
  FROM pg_constraint AS c
  JOIN pg_attribute AS a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.author_referrals'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'auth.users'::regclass
    AND a.attname = 'referrer_owner_user_id';

  SELECT c.confdeltype
  INTO v_referrer_author
  FROM pg_constraint AS c
  JOIN pg_attribute AS a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.author_referrals'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'public.authors'::regclass
    AND a.attname = 'referrer_author_id';

  IF v_invitee IS DISTINCT FROM 'r'
     OR v_referrer_owner IS DISTINCT FROM 'r'
     OR v_referrer_author IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'author_referrals RESTRICT FKs must stay unchanged';
  END IF;
END
$$;

COMMIT;
