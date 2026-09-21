-- Author partner activation + invitee bonus (PR3).
-- Restamped to 20261027120100 (20261027120000 taken by product_published_email_context_canonical on main).
-- Activates attributed referrals on first owner workspace, starts 3-year commission window
-- (expires_at = activated_at + 3 years; future royalty: activated_at inclusive / expires_at exclusive),
-- grants permanent +1 author_project_slots_partner_bonus.
-- Hardens claim↔activation race: pending attribution created before first ownership remains claimable
-- even if claim runs after workspace create; retroactive invites after ownership stay already_author.
-- Reconciles pre-PR3 attributed+already-owner rows via the same finalizer.
-- Scope freeze: no commissions, ledger, royalty hooks, payouts, or partner UI.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. profiles.author_project_slots_partner_bonus
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS author_project_slots_partner_bonus integer;

UPDATE public.profiles
SET author_project_slots_partner_bonus = 0
WHERE author_project_slots_partner_bonus IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN author_project_slots_partner_bonus SET DEFAULT 0,
  ALTER COLUMN author_project_slots_partner_bonus SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_author_project_slots_partner_bonus_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_author_project_slots_partner_bonus_check
      CHECK (
        author_project_slots_partner_bonus >= 0
        AND author_project_slots_partner_bonus <= 1
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.author_project_slots_partner_bonus IS
  'audiolad:author-partner:v3; one-time permanent +1 author project slot from referral activation. User-scoped. Not purchased. Survives commission window expiry. Values 0 or 1.';

-- ---------------------------------------------------------------------------
-- 2. author_referrals snapshot + bonus audit; invitee FK SET NULL
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_referrals
  ADD COLUMN IF NOT EXISTS activation_author_id_snapshot uuid;

ALTER TABLE public.author_referrals
  ADD COLUMN IF NOT EXISTS bonus_slot_granted_at timestamptz;

COMMENT ON COLUMN public.author_referrals.activation_author_id_snapshot IS
  'audiolad:author-partner:v3; historical author_id at activation. No live FK so empty first workspace can be deleted.';

COMMENT ON COLUMN public.author_referrals.bonus_slot_granted_at IS
  'audiolad:author-partner:v3; when partner bonus slot was granted. Set once.';

UPDATE public.author_referrals
SET activation_author_id_snapshot = invitee_author_id
WHERE activated_at IS NOT NULL
  AND invitee_author_id IS NOT NULL
  AND activation_author_id_snapshot IS NULL;

ALTER TABLE public.author_referrals
  DROP CONSTRAINT IF EXISTS author_referrals_invitee_author_id_fkey;

ALTER TABLE public.author_referrals
  ADD CONSTRAINT author_referrals_invitee_author_id_fkey
  FOREIGN KEY (invitee_author_id)
  REFERENCES public.authors (id)
  ON DELETE SET NULL;

ALTER TABLE public.author_referrals
  DROP CONSTRAINT IF EXISTS author_referrals_activated_shape_check;

ALTER TABLE public.author_referrals
  ADD CONSTRAINT author_referrals_activated_shape_check
  CHECK (
    (
      activated_at IS NULL
      AND status IN ('attributed', 'expired', 'void')
    )
    OR (
      activated_at IS NOT NULL
      AND expires_at IS NOT NULL
      AND activation_author_id_snapshot IS NOT NULL
      AND expires_at > activated_at
      AND status IN ('activated', 'expired', 'void')
    )
  );


CREATE OR REPLACE FUNCTION public.author_referrals_protect_activated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.activated_at IS NOT NULL THEN
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


DROP TRIGGER IF EXISTS author_referrals_protect_activated_trg ON public.author_referrals;
CREATE TRIGGER author_referrals_protect_activated_trg
  BEFORE UPDATE OR DELETE ON public.author_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.author_referrals_protect_activated();

CREATE OR REPLACE FUNCTION public.author_space_delete_blockers(p_author_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_blockers text[] := ARRAY[]::text[];
BEGIN
  -- Defensive to_regclass / to_regprocedure so isolated smoke stubs and
  -- partial environments still load this replacement safely.
  IF to_regclass('public.practices') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.practices AS p WHERE p.author_id = p_author_id) THEN
      v_blockers := array_append(v_blockers, 'has_practices');
    END IF;
  END IF;

  IF to_regprocedure('public.author_space_has_finance_history(uuid)') IS NOT NULL THEN
    IF public.author_space_has_finance_history(p_author_id) THEN
      v_blockers := array_append(v_blockers, 'has_finance');
    END IF;
  END IF;

  IF to_regclass('public.author_commercial_applications') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.author_commercial_applications AS a WHERE a.author_id = p_author_id
    ) THEN
      v_blockers := array_append(v_blockers, 'has_commercial_application');
    END IF;
  END IF;

  IF to_regclass('public.author_payout_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.author_payout_profiles AS p WHERE p.author_id = p_author_id
    ) THEN
      v_blockers := array_append(v_blockers, 'has_payout_profile');
    END IF;
  END IF;

  IF to_regclass('public.author_terms_acceptances') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.author_terms_acceptances AS t WHERE t.author_id = p_author_id
    ) THEN
      v_blockers := array_append(v_blockers, 'has_terms_acceptance');
    END IF;
  END IF;

  IF to_regclass('public.personal_materials') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.personal_materials AS m WHERE m.author_id = p_author_id
    ) THEN
      v_blockers := array_append(v_blockers, 'has_personal_materials');
    END IF;
  END IF;

  IF to_regclass('public.studio_projects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.studio_projects AS s WHERE s.author_id = p_author_id) THEN
      v_blockers := array_append(v_blockers, 'has_studio_project');
    END IF;
  END IF;

  IF to_regclass('public.audiobook_projects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.audiobook_projects AS b WHERE b.author_id = p_author_id) THEN
      v_blockers := array_append(v_blockers, 'has_audiobook_project');
    END IF;
  END IF;

  IF to_regclass('public.practice_moderation_email_outbox') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.practice_moderation_email_outbox AS o WHERE o.author_id = p_author_id
    ) THEN
      v_blockers := array_append(v_blockers, 'has_moderation_outbox');
    END IF;
  END IF;

  -- Partner referrals: referrer author stays RESTRICT + blocker.
  -- Invitee activation workspace uses ON DELETE SET NULL (no invitee blocker).
  IF to_regclass('public.author_referrals') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.author_referrals AS r
      WHERE r.referrer_author_id = p_author_id
    ) THEN
      v_blockers := array_append(v_blockers, 'has_partner_referrals_as_referrer');
    END IF;

  END IF;

  RETURN v_blockers;
END;
$$;


CREATE OR REPLACE FUNCTION public.protect_profiles_author_project_limit_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  v_jwt_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL THEN
      NEW.author_project_limit_override := NULL;
      NEW.author_projects_unlimited := false;
      NEW.author_premium_enabled := false;
      NEW.author_project_slots_purchased := 0;
      NEW.author_project_slots_partner_bonus := 0;
    END IF;
    RETURN NEW;
  END IF;

  IF v_jwt_sub IS NOT NULL THEN
    IF NEW.author_project_limit_override IS DISTINCT FROM OLD.author_project_limit_override THEN
      NEW.author_project_limit_override := OLD.author_project_limit_override;
    END IF;
    IF NEW.author_projects_unlimited IS DISTINCT FROM OLD.author_projects_unlimited THEN
      NEW.author_projects_unlimited := OLD.author_projects_unlimited;
    END IF;
    IF NEW.author_premium_enabled IS DISTINCT FROM OLD.author_premium_enabled THEN
      NEW.author_premium_enabled := OLD.author_premium_enabled;
    END IF;
    IF NEW.author_project_slots_purchased IS DISTINCT FROM OLD.author_project_slots_purchased THEN
      NEW.author_project_slots_purchased := OLD.author_project_slots_purchased;
    END IF;
    -- Partner bonus is written only by finalize_author_partner_referral under
    -- local GUC audiolad.trusted_profile_limit_write=1 (JWT sessions otherwise).
    IF coalesce(current_setting('audiolad.trusted_profile_limit_write', true), '') IS DISTINCT FROM '1'
       AND NEW.author_project_slots_partner_bonus IS DISTINCT FROM OLD.author_project_slots_partner_bonus THEN
      NEW.author_project_slots_partner_bonus := OLD.author_project_slots_partner_bonus;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.resolve_user_author_project_limit(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_override integer;
  v_premium boolean;
  v_purchased integer;
  v_partner_bonus integer;
  v_base integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 1;
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    p.author_project_limit_override,
    coalesce(p.author_premium_enabled, false),
    coalesce(p.author_project_slots_purchased, 0),
    coalesce(p.author_project_slots_partner_bonus, 0)
  INTO v_override, v_premium, v_purchased, v_partner_bonus
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF v_override IS NOT NULL AND v_override >= 1 THEN
    v_base := v_override;
  ELSIF v_premium IS TRUE THEN
    v_base := 3;
  ELSE
    v_base := 1;
  END IF;

  RETURN v_base
    + greatest(coalesce(v_purchased, 0), 0)
    + greatest(coalesce(v_partner_bonus, 0), 0);
END;
$$;


-- ---------------------------------------------------------------------------
-- Earliest owner membership (canonical first-author timestamp)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_earliest_owner_membership(
  p_user_id uuid,
  OUT o_author_id uuid,
  OUT o_owned_at timestamptz
)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  o_author_id := NULL;
  o_owned_at := NULL;
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT am.author_id, am.created_at
  INTO o_author_id, o_owned_at
  FROM public.author_members AS am
  WHERE am.user_id = p_user_id
    AND am.role = 'owner'
  ORDER BY am.created_at ASC, am.author_id ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.author_partner_earliest_owner_membership(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.author_partner_earliest_owner_membership(uuid) IS
  'audiolad:author-partner:v3; earliest owner membership for claim/activation race and reconciliation.';

CREATE OR REPLACE FUNCTION public.author_partner_lock_invitee_claim(
  p_invitee_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_invitee_user_id IS NULL THEN
    RAISE EXCEPTION 'invitee_user_required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('author_partner_claim:' || p_invitee_user_id::text, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_partner_lock_invitee_claim(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.author_partner_lock_invitee_claim(uuid) IS
  'audiolad:author-partner:v3; advisory lock namespace author_partner_claim:<user_id>, shared by attribution claim and referral finalization.';


-- ---------------------------------------------------------------------------
-- Finalizer: activate referral + grant partner bonus once
-- Profile bonus write precedes bonus_slot_granted_at stamp.
-- Optional p_historical_activated_at for race recovery / pre-PR3 reconciliation.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.finalize_author_partner_referral(uuid, uuid);
DROP FUNCTION IF EXISTS public.finalize_author_partner_referral(uuid, uuid, timestamptz);


-- ---------------------------------------------------------------------------
-- Attribution window: 60 days until becoming an author (ownership), not until late claim.
-- Anonymous / not-yet-owner: now() < expires_at
-- Already owner: first_touch <= owned_at AND owned_at < expires_at (exclusive upper bound)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_attribution_window_ok(
  p_first_touch timestamptz,
  p_expires_at timestamptz,
  p_owned_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_first_touch IS NULL OR p_expires_at IS NULL THEN false
    WHEN p_owned_at IS NULL THEN (timezone('utc', now()) < p_expires_at)
    ELSE (p_first_touch <= p_owned_at AND p_owned_at < p_expires_at)
  END;
$$;

REVOKE ALL ON FUNCTION public.author_partner_attribution_window_ok(timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.author_partner_attribution_window_ok(timestamptz, timestamptz, timestamptz) IS
  'audiolad:author-partner:v3; 60d attribution validity vs ownership instant (exclusive expires_at).';

CREATE OR REPLACE FUNCTION public.finalize_author_partner_referral(
  p_invitee_user_id uuid,
  p_activation_author_id uuid,
  p_historical_activated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referral public.author_referrals%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_bonus_granted boolean := false;
  v_activated_at timestamptz;
  v_expires_at timestamptz;
  v_first_touch timestamptz;
  v_updated integer := 0;
BEGIN
  IF p_invitee_user_id IS NULL OR p_activation_author_id IS NULL THEN
    RAISE EXCEPTION 'finalize_author_partner_referral_args_required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.author_partner_lock_invitee_claim(p_invitee_user_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.authors AS a WHERE a.id = p_activation_author_id
  ) THEN
    RAISE EXCEPTION 'activation_author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = p_activation_author_id
      AND am.user_id = p_invitee_user_id
      AND am.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'activation_author_owner_required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_referral
  FROM public.author_referrals AS r
  WHERE r.invitee_user_id = p_invitee_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE LOG 'audiolad_partner_event %',
      jsonb_build_object(
        'event', 'partner_referral_activation_no_referral',
        'invitee_user_id', p_invitee_user_id,
        'activation_author_id', p_activation_author_id
      );
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'no_referral',
      'bonus_granted', false
    );
  END IF;

  IF v_referral.status = 'void' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'void',
      'bonus_granted', false,
      'referral_id', v_referral.id
    );
  END IF;

  IF v_referral.activated_at IS NOT NULL OR v_referral.status = 'activated' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_activated',
      'bonus_granted', false,
      'referral_id', v_referral.id,
      'activated_at', v_referral.activated_at,
      'expires_at', v_referral.expires_at,
      'activation_author_id_snapshot', v_referral.activation_author_id_snapshot
    );
  END IF;

  IF v_referral.status IS DISTINCT FROM 'attributed' AND v_referral.status IS DISTINCT FROM 'expired' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'not_activatable',
      'bonus_granted', false,
      'referral_id', v_referral.id
    );
  END IF;

  v_first_touch := v_referral.created_at;
  SELECT least(v_first_touch, min(a.created_at))
  INTO v_first_touch
  FROM public.author_partner_attributions AS a
  WHERE a.bound_referral_id = v_referral.id;

  IF p_historical_activated_at IS NOT NULL THEN
    v_activated_at := p_historical_activated_at;
  ELSE
    SELECT min(am.created_at) INTO v_activated_at
    FROM public.author_members AS am
    WHERE am.user_id = p_invitee_user_id
      AND am.role = 'owner';
    IF v_activated_at IS NULL THEN
      v_activated_at := v_now;
    END IF;
  END IF;

  -- Retroactive: first touch after ownership
  IF v_first_touch IS NOT NULL AND v_first_touch > v_activated_at THEN
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_author',
      'bonus_granted', false,
      'referral_id', v_referral.id
    );
  END IF;

  -- 60d window judged at ownership instant (not at late claim/recovery time).
  IF v_referral.attribution_expires_at IS NULL
     OR NOT public.author_partner_attribution_window_ok(
       v_first_touch,
       v_referral.attribution_expires_at,
       v_activated_at
     ) THEN
    UPDATE public.author_referrals AS r
    SET status = 'expired',
        updated_at = v_now
    WHERE r.id = v_referral.id
      AND r.activated_at IS NULL
      AND r.status IN ('attributed', 'expired');

    RETURN jsonb_build_object(
      'ok', true,
      'result', 'expired',
      'bonus_granted', false,
      'referral_id', v_referral.id
    );
  END IF;

  IF v_referral.status IS DISTINCT FROM 'attributed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'not_activatable',
      'bonus_granted', false,
      'referral_id', v_referral.id
    );
  END IF;

  v_expires_at := v_activated_at + interval '3 years';

  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_invitee_user_id) THEN
    RAISE EXCEPTION 'author_partner_bonus_profile_missing'
      USING ERRCODE = 'P0001',
            DETAIL = 'invitee profile missing; refuse activation stamp';
  END IF;

  -- Bonus write FIRST; only then stamp bonus_slot_granted_at.
  PERFORM set_config('audiolad.trusted_profile_limit_write', '1', true);

  UPDATE public.profiles AS p
  SET author_project_slots_partner_bonus = 1
  WHERE p.id = p_invitee_user_id
    AND coalesce(p.author_project_slots_partner_bonus, 0) = 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    v_bonus_granted := true;
  ELSE
    UPDATE public.profiles AS p
    SET author_project_slots_partner_bonus = 1
    WHERE p.id = p_invitee_user_id
      AND p.author_project_slots_partner_bonus IS DISTINCT FROM 1;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      v_bonus_granted := true;
    END IF;
  END IF;

  PERFORM set_config('audiolad.trusted_profile_limit_write', '', true);

  UPDATE public.author_referrals AS r
  SET
    activated_at = v_activated_at,
    -- Future royalty window: royalty_at >= activated_at AND royalty_at < expires_at.
    expires_at = v_expires_at,
    status = 'activated',
    invitee_author_id = p_activation_author_id,
    activation_author_id_snapshot = p_activation_author_id,
    bonus_slot_granted_at = coalesce(r.bonus_slot_granted_at, v_now),
    updated_at = v_now
  WHERE r.id = v_referral.id
    AND r.status = 'attributed'
    AND r.activated_at IS NULL
  RETURNING * INTO v_referral;

  IF NOT FOUND THEN
    SELECT * INTO v_referral
    FROM public.author_referrals
    WHERE invitee_user_id = p_invitee_user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_activated',
      'bonus_granted', false,
      'referral_id', v_referral.id
    );
  END IF;

  RAISE LOG 'audiolad_partner_event %',
    jsonb_build_object(
      'event', 'partner_referral_activated',
      'referral_id', v_referral.id,
      'activation_author_id_snapshot', v_referral.activation_author_id_snapshot,
      'activated_at', v_referral.activated_at,
      'expires_at', v_referral.expires_at
    );

  IF v_bonus_granted THEN
    RAISE LOG 'audiolad_partner_event %',
      jsonb_build_object(
        'event', 'partner_bonus_slot_granted',
        'referral_id', v_referral.id,
        'invitee_user_id', p_invitee_user_id
      );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'activated',
    'bonus_granted', v_bonus_granted,
    'referral_id', v_referral.id,
    'activated_at', v_referral.activated_at,
    'expires_at', v_referral.expires_at,
    'activation_author_id_snapshot', v_referral.activation_author_id_snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_author_partner_referral(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_author_partner_referral(uuid, uuid, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.finalize_author_partner_referral(uuid, uuid, timestamptz) IS
  'audiolad:author-partner:v3; internal finalizer. Activates attributed referral, sets 3y expires_at from activated_at (optional historical), grants partner bonus=1 once after profile write. Not client-callable.';


-- Claim attribution (race-safe rewrite)
CREATE OR REPLACE FUNCTION public.author_partner_claim_attribution(
  p_token_hash text,
  p_invitee_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attr public.author_partner_attributions%ROWTYPE;
  v_owner uuid;
  v_referral_id uuid;
  v_now timestamptz := now();
  v_lock_key bigint;
  v_referral public.author_referrals%ROWTYPE;
  v_first_author_id uuid;
  v_first_owned_at timestamptz;
  v_first_touch timestamptz;
  v_finalize jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF p_invitee_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_required');
  END IF;

  PERFORM public.author_partner_lock_invitee_claim(p_invitee_user_id);

  SELECT * FROM public.author_partner_earliest_owner_membership(p_invitee_user_id)
  INTO v_first_author_id, v_first_owned_at;

  IF EXISTS (
    SELECT 1
    FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_invitee_user_id
      AND r.activated_at IS NULL
      AND r.status = 'attributed'
      AND r.attribution_expires_at IS NOT NULL
  ) THEN
    SELECT * INTO v_referral
    FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_invitee_user_id
      AND r.status = 'attributed'
    FOR UPDATE;

    v_referral_id := v_referral.id;
    v_first_touch := v_referral.created_at;
    SELECT least(v_first_touch, min(a.created_at))
    INTO v_first_touch
    FROM public.author_partner_attributions AS a
    WHERE a.bound_referral_id = v_referral.id
       OR a.token_hash = p_token_hash;

    IF v_first_author_id IS NOT NULL THEN
      IF v_first_touch > v_first_owned_at THEN
        RETURN jsonb_build_object('ok', true, 'result', 'already_author');
      END IF;
      IF NOT public.author_partner_attribution_window_ok(
           v_first_touch,
           v_referral.attribution_expires_at,
           v_first_owned_at
         ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'attribution_expired');
      END IF;
      v_finalize := public.finalize_author_partner_referral(
        p_invitee_user_id, v_first_author_id, v_first_owned_at
      );
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'preserved_first_touch_activated',
        'referral_id', v_referral_id,
        'finalize', v_finalize
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'result', 'preserved_first_touch',
      'referral_id', v_referral_id
    );
  END IF;

  DELETE FROM public.author_referrals AS r
  WHERE r.invitee_user_id = p_invitee_user_id
    AND r.activated_at IS NULL
    AND (
      r.status IN ('expired', 'void')
      OR (
        r.status = 'attributed'
        AND (r.attribution_expires_at IS NULL OR r.attribution_expires_at <= v_now)
      )
    );

  SELECT * INTO v_attr
  FROM public.author_partner_attributions AS a
  WHERE a.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attribution_not_found');
  END IF;

  IF v_attr.status = 'bound' THEN
    IF v_attr.invitee_user_id = p_invitee_user_id THEN
      IF v_first_author_id IS NOT NULL
         AND v_attr.created_at <= v_first_owned_at
         AND v_attr.bound_referral_id IS NOT NULL THEN
        SELECT * INTO v_referral
        FROM public.author_referrals AS r
        WHERE r.id = v_attr.bound_referral_id
        FOR UPDATE;
        IF FOUND
           AND v_referral.activated_at IS NULL
           AND v_referral.status = 'attributed' THEN
          v_finalize := public.finalize_author_partner_referral(
            p_invitee_user_id, v_first_author_id, v_first_owned_at
          );
          RETURN jsonb_build_object(
            'ok', true,
            'result', 'already_bound_activated',
            'referral_id', v_attr.bound_referral_id,
            'finalize', v_finalize
          );
        END IF;
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'already_bound',
        'referral_id', v_attr.bound_referral_id
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'attribution_bound_elsewhere');
  END IF;

  IF v_attr.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attribution_not_pending');
  END IF;

  -- Cookie after first ownership is retroactive; cookie before remains claimable.
  IF v_first_author_id IS NOT NULL AND v_attr.created_at > v_first_owned_at THEN
    RETURN jsonb_build_object('ok', true, 'result', 'already_author');
  END IF;

  -- Window: not-yet-owner uses now(); already-owner uses ownership instant.
  IF NOT public.author_partner_attribution_window_ok(
       v_attr.created_at,
       v_attr.expires_at,
       v_first_owned_at
     ) THEN
    UPDATE public.author_partner_attributions
    SET status = 'expired'
    WHERE id = v_attr.id AND status = 'pending';
    RETURN jsonb_build_object('ok', false, 'error', 'attribution_expired');
  END IF;

  BEGIN
    PERFORM public.author_partner_assert_not_self_referral(
      v_attr.referrer_author_id,
      p_invitee_user_id
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END;

  v_owner := public.author_partner_owner_user_id(v_attr.referrer_author_id);
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referrer_owner_missing');
  END IF;

  INSERT INTO public.author_referrals (
    referrer_author_id,
    referrer_owner_user_id,
    invitee_user_id,
    invitee_author_id,
    code_used,
    code_normalized,
    attributed_at,
    attribution_expires_at,
    activated_at,
    expires_at,
    status
  ) VALUES (
    v_attr.referrer_author_id,
    v_owner,
    p_invitee_user_id,
    NULL,
    v_attr.code_used,
    v_attr.code_normalized,
    v_now,
    v_attr.expires_at,
    NULL,
    NULL,
    'attributed'
  )
  ON CONFLICT (invitee_user_id) DO NOTHING
  RETURNING id INTO v_referral_id;

  IF v_referral_id IS NULL THEN
    SELECT * INTO v_referral
    FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_invitee_user_id
    FOR UPDATE;
    v_referral_id := v_referral.id;

    IF v_first_author_id IS NOT NULL
       AND v_referral.status = 'attributed'
       AND v_referral.activated_at IS NULL
       AND v_referral.created_at <= v_first_owned_at THEN
      v_finalize := public.finalize_author_partner_referral(
        p_invitee_user_id, v_first_author_id, v_first_owned_at
      );
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'preserved_first_touch_activated',
        'referral_id', v_referral_id,
        'finalize', v_finalize
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'result', 'preserved_first_touch',
      'referral_id', v_referral_id
    );
  END IF;

  UPDATE public.author_partner_attributions
  SET
    status = 'bound',
    invitee_user_id = p_invitee_user_id,
    bound_at = v_now,
    bound_referral_id = v_referral_id
  WHERE id = v_attr.id;

  IF v_first_author_id IS NOT NULL THEN
    v_finalize := public.finalize_author_partner_referral(
      p_invitee_user_id, v_first_author_id, v_first_owned_at
    );
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'bound_and_activated',
      'referral_id', v_referral_id,
      'referrer_author_id', v_attr.referrer_author_id,
      'code', v_attr.code_used,
      'attribution_expires_at', v_attr.expires_at,
      'finalize', v_finalize
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'bound',
    'referral_id', v_referral_id,
    'referrer_author_id', v_attr.referrer_author_id,
    'code', v_attr.code_used,
    'attribution_expires_at', v_attr.expires_at
  );
END;
$$;


-- Manual bind (race-safe rewrite)
CREATE OR REPLACE FUNCTION public.author_partner_bind_manual_code(
  p_code text,
  p_invitee_user_id uuid,
  p_pending_token_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resolved jsonb;
  v_author_id uuid;
  v_code_display text;
  v_code_norm text;
  v_owner uuid;
  v_referral public.author_referrals%ROWTYPE;
  v_referral_id uuid;
  v_now timestamptz := now();
  v_lock_key bigint;
  v_expires timestamptz;
  v_claim jsonb;
  v_pending public.author_partner_attributions%ROWTYPE;
  v_first_author_id uuid;
  v_first_owned_at timestamptz;
  v_finalize jsonb;
BEGIN
  IF p_invitee_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_required');
  END IF;

  PERFORM public.author_partner_lock_invitee_claim(p_invitee_user_id);

  SELECT * FROM public.author_partner_earliest_owner_membership(p_invitee_user_id)
  INTO v_first_author_id, v_first_owned_at;

  -- Pending cookie attribution wins over manual code (first-touch).
  -- Eligibility is ownership-aware (not wall-clock): late recovery after
  -- ownership inside the 60d window must still reach claim/finalize.
  IF p_pending_token_hash IS NOT NULL AND p_pending_token_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT * INTO v_pending
    FROM public.author_partner_attributions AS a
    WHERE a.token_hash = p_pending_token_hash
    FOR UPDATE;

    IF FOUND THEN
      IF v_pending.status = 'pending' THEN
        -- Always delegate to claim (uses attribution_window_ok vs ownership).
        v_claim := public.author_partner_claim_attribution(
          p_pending_token_hash,
          p_invitee_user_id
        );
        RETURN v_claim;
      END IF;

      IF v_pending.status = 'bound' THEN
        SELECT * INTO v_referral
        FROM public.author_referrals AS r
        WHERE r.id = v_pending.bound_referral_id;

        IF FOUND AND v_referral.activated_at IS NOT NULL THEN
          RETURN jsonb_build_object(
            'ok', true,
            'result', 'referral_already_activated',
            'referral_id', v_referral.id,
            'code', v_referral.code_used
          );
        END IF;

        IF FOUND
           AND v_referral.status = 'attributed'
           AND v_referral.attribution_expires_at IS NOT NULL
           AND public.author_partner_attribution_window_ok(
                 coalesce(v_pending.created_at, v_referral.created_at),
                 v_referral.attribution_expires_at,
                 v_first_owned_at
               ) THEN
          IF v_first_author_id IS NOT NULL
             AND coalesce(v_pending.created_at, v_referral.created_at) <= v_first_owned_at THEN
            v_finalize := public.finalize_author_partner_referral(
              p_invitee_user_id, v_first_author_id, v_first_owned_at
            );
            RETURN jsonb_build_object(
              'ok', true,
              'result', 'preserved_first_touch_activated',
              'referral_id', v_referral.id,
              'code', v_referral.code_used,
              'finalize', v_finalize
            );
          END IF;
          RETURN jsonb_build_object(
            'ok', true,
            'result', 'preserved_first_touch',
            'referral_id', v_referral.id,
            'code', v_referral.code_used,
            'referrer_author_id', v_referral.referrer_author_id,
            'expires_at', v_referral.attribution_expires_at
          );
        END IF;

        -- Stale bound pending cookie: drop only when window fails (cascades).
        IF FOUND AND v_referral.activated_at IS NULL THEN
          DELETE FROM public.author_referrals WHERE id = v_referral.id;
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_referral
  FROM public.author_referrals AS r
  WHERE r.invitee_user_id = p_invitee_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_referral.activated_at IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'referral_already_activated',
        'referral_id', v_referral.id,
        'code', v_referral.code_used
      );
    END IF;

    IF v_referral.status = 'attributed'
       AND v_referral.attribution_expires_at IS NOT NULL
       AND public.author_partner_attribution_window_ok(
             v_referral.created_at,
             v_referral.attribution_expires_at,
             v_first_owned_at
           ) THEN
      IF v_first_author_id IS NOT NULL
         AND v_referral.created_at <= v_first_owned_at THEN
        v_finalize := public.finalize_author_partner_referral(
          p_invitee_user_id, v_first_author_id, v_first_owned_at
        );
        RETURN jsonb_build_object(
          'ok', true,
          'result', 'preserved_first_touch_activated',
          'referral_id', v_referral.id,
          'finalize', v_finalize
        );
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'preserved_first_touch',
        'referral_id', v_referral.id,
        'code', v_referral.code_used,
        'referrer_author_id', v_referral.referrer_author_id,
        'expires_at', v_referral.attribution_expires_at
      );
    END IF;

    IF v_referral.activated_at IS NULL THEN
      DELETE FROM public.author_referrals WHERE id = v_referral.id;
    END IF;
  END IF;

  -- Manual bind must not retroactively attribute an existing author.
  IF v_first_author_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'result', 'already_author');
  END IF;

  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty');
  END IF;

  v_resolved := public.resolve_author_partner_code(p_code);
  IF coalesce(v_resolved->>'ok', 'false') <> 'true' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_author_id := (v_resolved->>'author_id')::uuid;
  v_code_display := coalesce(
    v_resolved->>'code',
    public.author_partner_normalize_code(p_code)
  );
  v_code_norm := public.author_partner_normalize_code(v_code_display);

  BEGIN
    PERFORM public.author_partner_assert_not_self_referral(
      v_author_id,
      p_invitee_user_id
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END;

  v_owner := public.author_partner_owner_user_id(v_author_id);
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referrer_owner_missing');
  END IF;

  v_expires := v_now + public.author_partner_attribution_ttl();

  INSERT INTO public.author_referrals (
    referrer_author_id,
    referrer_owner_user_id,
    invitee_user_id,
    invitee_author_id,
    code_used,
    code_normalized,
    attributed_at,
    attribution_expires_at,
    activated_at,
    expires_at,
    status
  ) VALUES (
    v_author_id,
    v_owner,
    p_invitee_user_id,
    NULL,
    v_code_display,
    v_code_norm,
    v_now,
    v_expires,
    NULL,
    NULL,
    'attributed'
  )
  RETURNING id INTO v_referral_id;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'bound',
    'referral_id', v_referral_id,
    'referrer_author_id', v_author_id,
    'code', v_code_display,
    'attribution_expires_at', v_expires
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.author_partner_bind_manual_code(
  p_code text,
  p_invitee_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.author_partner_bind_manual_code(p_code, p_invitee_user_id, NULL);
$$;


-- ---------------------------------------------------------------------------
-- Pre-PR3 reconciliation: attributed + already owner → same finalizer
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r public.author_referrals%ROWTYPE;
  v_author_id uuid;
  v_owned_at timestamptz;
  v_first_touch timestamptz;
  v_res jsonb;
  n int := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM public.author_referrals AS ar
    WHERE ar.status = 'attributed'
      AND ar.activated_at IS NULL
      AND ar.attribution_expires_at IS NOT NULL
    FOR UPDATE
  LOOP
    SELECT * FROM public.author_partner_earliest_owner_membership(r.invitee_user_id)
    INTO v_author_id, v_owned_at;

    IF v_author_id IS NULL THEN
      CONTINUE;
    END IF;

    v_first_touch := r.created_at;
    SELECT least(v_first_touch, min(a.created_at))
    INTO v_first_touch
    FROM public.author_partner_attributions AS a
    WHERE a.bound_referral_id = r.id;

    IF v_first_touch IS NOT NULL AND v_first_touch > v_owned_at THEN
      CONTINUE;
    END IF;

    IF NOT public.author_partner_attribution_window_ok(
         v_first_touch,
         r.attribution_expires_at,
         v_owned_at
       ) THEN
      CONTINUE;
    END IF;

    v_res := public.finalize_author_partner_referral(
      r.invitee_user_id,
      v_author_id,
      v_owned_at
    );
    n := n + 1;
    RAISE LOG 'audiolad_partner_event %',
      jsonb_build_object(
        'event', 'partner_referral_reconciled',
        'referral_id', r.id,
        'finalize', v_res
      );
  END LOOP;

  RAISE LOG 'audiolad_partner_event %',
    jsonb_build_object('event', 'partner_referral_reconcile_done', 'count', n);
END;
$$;


-- ---------------------------------------------------------------------------
-- Touch invite (PR3): authenticated pending → claim_attribution
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_touch_invite(
  p_code text,
  p_token_hash text,
  p_invitee_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resolved jsonb;
  v_author_id uuid;
  v_code_display text;
  v_code_norm text;
  v_existing public.author_partner_attributions%ROWTYPE;
  v_referral public.author_referrals%ROWTYPE;
  v_bound_referral public.author_referrals%ROWTYPE;
  v_new public.author_partner_attributions%ROWTYPE;
  v_now timestamptz := now();
  v_claim jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_resolved := public.resolve_author_partner_code(p_code);
  IF coalesce(v_resolved->>'ok', 'false') <> 'true' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', coalesce(v_resolved->>'error', 'not_found')
    );
  END IF;

  v_author_id := (v_resolved->>'author_id')::uuid;
  v_code_display := coalesce(
    v_resolved->>'code',
    public.author_partner_normalize_code(p_code)
  );
  v_code_norm := public.author_partner_normalize_code(v_code_display);

  SELECT * INTO v_existing
  FROM public.author_partner_attributions AS a
  WHERE a.token_hash = p_token_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      -- Authenticated revisit first: claim uses ownership-aware 60d window
      -- (do not wall-clock-expire before claim — day-61 recovery after day-59 ownership).
      IF p_invitee_user_id IS NOT NULL THEN
        v_claim := public.author_partner_claim_attribution(
          p_token_hash,
          p_invitee_user_id
        );
        IF coalesce(v_claim->>'ok', 'false') = 'true' THEN
          RETURN v_claim || jsonb_build_object('cookie_should_set', false);
        END IF;
        RETURN v_claim;
      END IF;

      IF v_existing.expires_at <= v_now THEN
        UPDATE public.author_partner_attributions
        SET status = 'expired'
        WHERE id = v_existing.id;
        v_existing.status := 'expired';
      ELSE
        RETURN jsonb_build_object(
          'ok', true,
          'result', 'preserved_first_touch',
          'attribution_id', v_existing.id,
          'referrer_author_id', v_existing.referrer_author_id,
          'code', v_existing.code_used,
          'expires_at', v_existing.expires_at,
          'cookie_should_set', false
        );
      END IF;
    END IF;

    IF v_existing.status = 'bound' THEN
      SELECT * INTO v_bound_referral
      FROM public.author_referrals AS r
      WHERE r.id = v_existing.bound_referral_id
      FOR UPDATE;

      IF FOUND AND v_bound_referral.activated_at IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', true,
          'result', 'referral_already_activated',
          'attribution_id', v_existing.id,
          'referral_id', v_bound_referral.id,
          'referrer_author_id', v_bound_referral.referrer_author_id,
          'cookie_should_set', false
        );
      END IF;

      IF FOUND
         AND v_bound_referral.status = 'attributed'
         AND v_bound_referral.attribution_expires_at IS NOT NULL
         AND v_bound_referral.attribution_expires_at > v_now THEN
        RETURN jsonb_build_object(
          'ok', true,
          'result', 'already_bound',
          'attribution_id', v_existing.id,
          'referral_id', v_bound_referral.id,
          'referrer_author_id', v_bound_referral.referrer_author_id,
          'code', v_bound_referral.code_used,
          'expires_at', v_bound_referral.attribution_expires_at,
          'cookie_should_set', false
        );
      END IF;

      -- Stale bound attribution: unactivated referral expired or missing.
      IF FOUND AND v_bound_referral.activated_at IS NULL THEN
        DELETE FROM public.author_referrals WHERE id = v_bound_referral.id;
        -- attributions cascade-deleted with referral
      ELSE
        DELETE FROM public.author_partner_attributions WHERE id = v_existing.id;
      END IF;
      v_existing := NULL;
    END IF;
  END IF;

  IF p_invitee_user_id IS NOT NULL THEN
    IF public.author_partner_user_owns_author_space(p_invitee_user_id) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'already_author',
        'cookie_should_set', false
      );
    END IF;

    BEGIN
      PERFORM public.author_partner_assert_not_self_referral(
        v_author_id,
        p_invitee_user_id
      );
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
    END;

    SELECT * INTO v_referral
    FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_invitee_user_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_referral.activated_at IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', true,
          'result', 'referral_already_activated',
          'referral_id', v_referral.id,
          'referrer_author_id', v_referral.referrer_author_id,
          'cookie_should_set', false
        );
      END IF;

      IF v_referral.status = 'attributed'
         AND v_referral.attribution_expires_at IS NOT NULL
         AND v_referral.attribution_expires_at > v_now THEN
        RETURN jsonb_build_object(
          'ok', true,
          'result', 'preserved_first_touch',
          'referral_id', v_referral.id,
          'referrer_author_id', v_referral.referrer_author_id,
          'code', v_referral.code_used,
          'expires_at', v_referral.attribution_expires_at,
          'cookie_should_set', false
        );
      END IF;

      IF v_referral.activated_at IS NULL THEN
        DELETE FROM public.author_referrals WHERE id = v_referral.id;
      END IF;
    END IF;
  END IF;

  -- Create or refresh pending attribution for this opaque token.
  IF EXISTS (
    SELECT 1 FROM public.author_partner_attributions AS a WHERE a.token_hash = p_token_hash
  ) THEN
    UPDATE public.author_partner_attributions AS a
    SET
      referrer_author_id = v_author_id,
      code_used = v_code_display,
      code_normalized = v_code_norm,
      source = 'invite_link',
      status = 'pending',
      created_at = v_now,
      expires_at = v_now + public.author_partner_attribution_ttl(),
      invitee_user_id = NULL,
      bound_at = NULL,
      bound_referral_id = NULL
    WHERE a.token_hash = p_token_hash
    RETURNING * INTO v_new;
  ELSE
    INSERT INTO public.author_partner_attributions (
      token_hash,
      referrer_author_id,
      code_used,
      code_normalized,
      source,
      status,
      expires_at
    ) VALUES (
      p_token_hash,
      v_author_id,
      v_code_display,
      v_code_norm,
      'invite_link',
      'pending',
      v_now + public.author_partner_attribution_ttl()
    )
    RETURNING * INTO v_new;
  END IF;

  IF p_invitee_user_id IS NOT NULL THEN
    v_claim := public.author_partner_claim_attribution(p_token_hash, p_invitee_user_id);
    -- claim returns bound / preserved / already_author; never invent cookie for SoT-only preserves
    IF coalesce(v_claim->>'ok', 'false') = 'true' THEN
      -- Authenticated touch→claim: author_referrals is SoT; never set anonymous cookie.
      RETURN v_claim || jsonb_build_object(
        'cookie_should_set',
        false
      );
    END IF;
    RETURN v_claim;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'created',
    'attribution_id', v_new.id,
    'referrer_author_id', v_new.referrer_author_id,
    'code', v_new.code_used,
    'expires_at', v_new.expires_at,
    'cookie_should_set', true
  );
END;
$$;


REVOKE ALL ON FUNCTION public.author_partner_touch_invite(text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_touch_invite(text, text, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_author_project(
  p_name text,
  p_slug text DEFAULT NULL,
  p_short_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug_input text := nullif(btrim(coalesce(p_slug, '')), '');
  v_slug text;
  v_description text := nullif(btrim(coalesce(p_short_description, '')), '');
  v_limit integer;
  v_unlimited boolean;
  v_purchased integer;
  v_partner_bonus integer;
  v_used integer;
  v_author_id uuid;
  v_base integer;
  v_finalize jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'invalid_project_name' USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 280 THEN
    RAISE EXCEPTION 'invalid_project_description' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT
    coalesce(p.author_projects_unlimited, false),
    coalesce(p.author_project_slots_purchased, 0),
    coalesce(p.author_project_slots_partner_bonus, 0),
    CASE
      WHEN p.author_project_limit_override IS NOT NULL
           AND p.author_project_limit_override >= 1
        THEN p.author_project_limit_override
      WHEN coalesce(p.author_premium_enabled, false) THEN 3
      ELSE 1
    END
  INTO v_unlimited, v_purchased, v_partner_bonus, v_base
  FROM public.profiles AS p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF v_unlimited IS NULL THEN
    v_unlimited := false;
  END IF;
  IF v_base IS NULL THEN
    v_base := 1;
  END IF;
  IF v_purchased IS NULL OR v_purchased < 0 THEN
    v_purchased := 0;
  END IF;
  IF v_partner_bonus IS NULL OR v_partner_bonus < 0 THEN
    v_partner_bonus := 0;
  END IF;

  v_limit := v_base + v_purchased + v_partner_bonus;

  SELECT count(*)::integer
  INTO v_used
  FROM public.author_members AS am
  WHERE am.user_id = v_user_id
    AND am.role = 'owner';

  IF NOT v_unlimited AND v_used >= v_limit THEN
    RAISE EXCEPTION 'author_project_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  IF v_slug_input IS NOT NULL THEN
    v_slug := public.slugify_author_display_name(v_slug_input);
    IF v_slug IS NULL OR char_length(v_slug) < 2 THEN
      RAISE EXCEPTION 'invalid_project_slug' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_slug := public.allocate_unique_author_slug(v_name);
  END IF;

  -- Shared transactional namespace lock with change_author_slug.
  PERFORM public.acquire_author_slug_namespace_lock(v_slug);

  IF EXISTS (SELECT 1 FROM public.authors AS a WHERE a.slug = v_slug)
     OR EXISTS (SELECT 1 FROM public.author_slug_redirects AS r WHERE r.old_slug = v_slug) THEN
    RAISE EXCEPTION 'project_slug_taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.authors (
    name, slug, author_type, access_status, short_bio, description
  ) VALUES (
    v_name, v_slug, 'project', 'free', v_description, v_description
  )
  RETURNING id INTO v_author_id;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, v_user_id, 'owner');

  -- Claim lock is taken inside finalizer AFTER this user lock (no deadlock).
  v_finalize := public.finalize_author_partner_referral(v_user_id, v_author_id);

  SELECT
    coalesce(p.author_projects_unlimited, false),
    coalesce(p.author_project_slots_purchased, 0),
    coalesce(p.author_project_slots_partner_bonus, 0),
    CASE
      WHEN p.author_project_limit_override IS NOT NULL
           AND p.author_project_limit_override >= 1
        THEN p.author_project_limit_override
      WHEN coalesce(p.author_premium_enabled, false) THEN 3
      ELSE 1
    END
  INTO v_unlimited, v_purchased, v_partner_bonus, v_base
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  IF v_unlimited IS NULL THEN
    v_unlimited := false;
  END IF;
  IF v_base IS NULL THEN
    v_base := 1;
  END IF;
  IF v_purchased IS NULL OR v_purchased < 0 THEN
    v_purchased := 0;
  END IF;
  IF v_partner_bonus IS NULL OR v_partner_bonus < 0 THEN
    v_partner_bonus := 0;
  END IF;

  v_limit := v_base + v_purchased + v_partner_bonus;

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', v_author_id,
    'slug', v_slug,
    'name', v_name,
    'used', v_used + 1,
    'limit', CASE WHEN v_unlimited THEN NULL ELSE v_limit END,
    'unlimited', v_unlimited,
    'partner_finalize', v_finalize
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.approve_author_application(
  p_application_id uuid,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.author_applications%ROWTYPE;
  v_author_id uuid;
  v_author_slug text;
  v_from_access text;
  v_finalize jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_row
  FROM public.author_applications AS aa
  WHERE aa.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'approved' AND v_row.author_id IS NOT NULL THEN
    SELECT a.slug
    INTO v_author_slug
    FROM public.authors AS a
    WHERE a.id = v_row.author_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'application_id', v_row.id,
      'author_id', v_row.author_id,
      'author_slug', v_author_slug
    );
  END IF;

  IF v_row.status NOT IN ('submitted', 'in_review', 'needs_changes') THEN
    RAISE EXCEPTION 'application_not_approvable'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = v_row.user_id
  ) THEN
    RAISE EXCEPTION 'application_user_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_author_slug := public.allocate_unique_author_slug(v_row.display_name);

  INSERT INTO public.authors (
    name,
    slug,
    author_type,
    access_status
  ) VALUES (
    btrim(v_row.display_name),
    v_author_slug,
    'person',
    'free'
  )
  RETURNING id INTO v_author_id;

  INSERT INTO public.author_members (
    author_id,
    user_id,
    role
  ) VALUES (
    v_author_id,
    v_row.user_id,
    'owner'
  )
  ON CONFLICT (author_id, user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    updated_at = now();

  v_finalize := public.finalize_author_partner_referral(v_row.user_id, v_author_id);

  UPDATE public.author_applications AS aa
  SET
    status = 'approved',
    author_id = v_author_id,
    approved_at = now(),
    approved_by = v_actor,
    reviewed_at = now(),
    reviewed_by = v_actor,
    admin_note = COALESCE(NULLIF(btrim(p_staff_comment), ''), aa.admin_note),
    updated_at = now()
  WHERE aa.id = p_application_id;

  PERFORM public.log_author_application_status_event(
    p_application_id,
    v_row.status,
    'approved',
    v_actor,
    p_staff_comment,
    NULL
  );

  PERFORM public.log_author_access_status_event(
    v_author_id,
    NULL,
    'free',
    v_actor,
    p_staff_comment,
    p_application_id
  );

  UPDATE public.authors AS a
  SET
    access_status_changed_at = now(),
    access_status_changed_by = v_actor
  WHERE a.id = v_author_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'application_id', p_application_id,
    'author_id', v_author_id,
    'author_slug', v_author_slug,
    'partner_finalize', v_finalize
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.provision_studio_author_workspace(
  p_name text,
  p_slug text,
  p_owner_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := btrim(coalesce(p_slug, ''));
  v_owner_email text;
  v_author_id uuid;
  v_constraint_name text;
  v_finalize jsonb;
BEGIN
  IF v_actor_user_id IS NULL
    OR NOT public.has_platform_permission(v_actor_user_id, 'authors.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_studio_name' USING ERRCODE = '22023';
  END IF;

  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length(v_slug) < 2 THEN
    RAISE EXCEPTION 'invalid_studio_slug' USING ERRCODE = '22023';
  END IF;

  SELECT u.email
  INTO v_owner_email
  FROM auth.users AS u
  WHERE u.id = p_owner_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner_user_not_found' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    INSERT INTO public.authors (name, slug, author_type, access_status)
    VALUES (v_name, v_slug, 'studio', 'free')
    RETURNING id INTO v_author_id;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'authors_slug_key' THEN
        RAISE EXCEPTION 'studio_slug_taken' USING ERRCODE = '23505';
      END IF;
      RAISE;
  END;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, p_owner_user_id, 'owner');

  v_finalize := public.finalize_author_partner_referral(p_owner_user_id, v_author_id);

  INSERT INTO public.admin_operation_log (
    operation,
    actor_user_id,
    target_auth_user_id,
    target_email_hash,
    counts,
    status
  ) VALUES (
    'studio_author_workspace_provisioned',
    v_actor_user_id,
    p_owner_user_id,
    CASE
      WHEN nullif(btrim(v_owner_email), '') IS NULL THEN 'studio_author_workspace'
      ELSE encode(digest(lower(btrim(v_owner_email)), 'sha256'), 'hex')
    END,
    jsonb_build_object(
      'author_id', v_author_id,
      'slug', v_slug,
      'author_type', 'studio',
      'owner_user_id', p_owner_user_id,
      'partner_finalize', v_finalize
    ),
    'success'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', v_author_id,
    'slug', v_slug,
    'name', v_name,
    'owner_user_id', p_owner_user_id,
    'partner_finalize', v_finalize
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_author_project(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_author_project(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_author_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_author_application(uuid, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provision_studio_author_workspace(text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_studio_author_workspace(text, text, uuid)
  TO authenticated;

DROP TRIGGER IF EXISTS profiles_protect_author_project_limits_on_update
  ON public.profiles;
CREATE TRIGGER profiles_protect_author_project_limits_on_update
  BEFORE UPDATE OF
    author_project_limit_override,
    author_projects_unlimited,
    author_premium_enabled,
    author_project_slots_purchased,
    author_project_slots_partner_bonus
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_author_project_limit_columns();

COMMIT;
