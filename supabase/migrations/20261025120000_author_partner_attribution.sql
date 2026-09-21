-- Author partner attribution (PR2).
-- First-touch invite link + bind to invitee_user_id.
-- Does NOT activate 3-year commission, bonus slots, ledger, or partner UI.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. attribution_expires_at (60d) — distinct from expires_at (future 3y)
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_referrals
  ADD COLUMN IF NOT EXISTS attribution_expires_at timestamptz;

COMMENT ON COLUMN public.author_referrals.attribution_expires_at IS
  'audiolad:author-partner:v2; 60-day first-touch window before author activation. Distinct from expires_at (future 3-year commission end after activation).';

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
      AND invitee_author_id IS NOT NULL
      AND expires_at > activated_at
      AND status IN ('activated', 'expired', 'void')
    )
  );

ALTER TABLE public.author_referrals
  DROP CONSTRAINT IF EXISTS author_referrals_attribution_ttl_check;

ALTER TABLE public.author_referrals
  ADD CONSTRAINT author_referrals_attribution_ttl_check
  CHECK (
    activated_at IS NOT NULL
    OR status IN ('void', 'expired')
    OR attribution_expires_at IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS author_referrals_attribution_expires_at_idx
  ON public.author_referrals (attribution_expires_at)
  WHERE activated_at IS NULL AND status = 'attributed';

-- ---------------------------------------------------------------------------
-- 2. Anonymous attributions (pre-user)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_partner_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  referrer_author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE RESTRICT,
  code_used text NOT NULL,
  code_normalized text NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  invitee_user_id uuid NULL
    REFERENCES auth.users (id) ON DELETE SET NULL,
  bound_at timestamptz NULL,
  bound_referral_id uuid NULL
    REFERENCES public.author_referrals (id) ON DELETE SET NULL,
  CONSTRAINT author_partner_attributions_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT author_partner_attributions_source_check
    CHECK (source IN ('invite_link', 'manual_code')),
  CONSTRAINT author_partner_attributions_status_check
    CHECK (status IN ('pending', 'bound', 'expired', 'void')),
  CONSTRAINT author_partner_attributions_code_norm_check
    CHECK (code_normalized = public.author_partner_normalize_code(code_used)),
  CONSTRAINT author_partner_attributions_token_hash_check
    CHECK (char_length(token_hash) = 64 AND token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT author_partner_attributions_bound_shape_check
    CHECK (
      (status <> 'bound' AND bound_at IS NULL AND bound_referral_id IS NULL)
      OR (
        status = 'bound'
        AND bound_at IS NOT NULL
        AND invitee_user_id IS NOT NULL
        AND bound_referral_id IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS author_partner_attributions_referrer_author_id_idx
  ON public.author_partner_attributions (referrer_author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS author_partner_attributions_expires_at_idx
  ON public.author_partner_attributions (expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS author_partner_attributions_invitee_user_id_idx
  ON public.author_partner_attributions (invitee_user_id)
  WHERE invitee_user_id IS NOT NULL;

COMMENT ON TABLE public.author_partner_attributions IS
  'audiolad:author-partner:v2; anonymous first-touch invite attribution before invitee_user_id is known. Cookie stores opaque token; DB stores sha256 hex.';

ALTER TABLE public.author_partner_attributions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_partner_attributions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.author_partner_attributions TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_attribution_ttl()
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT interval '60 days';
$$;

CREATE OR REPLACE FUNCTION public.author_partner_user_owns_author_space(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.user_id = p_user_id
      AND m.role = 'owner'
  );
$$;

COMMENT ON FUNCTION public.author_partner_user_owns_author_space(uuid) IS
  'audiolad:author-partner:v2; true when user owns at least one author workspace.';

REVOKE ALL ON FUNCTION public.author_partner_user_owns_author_space(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_user_owns_author_space(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Claim pending attribution onto authenticated user
-- ---------------------------------------------------------------------------

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
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF p_invitee_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_required');
  END IF;

  v_lock_key := hashtextextended('author_partner_claim:' || p_invitee_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF public.author_partner_user_owns_author_space(p_invitee_user_id) THEN
    RETURN jsonb_build_object('ok', true, 'result', 'already_author');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_invitee_user_id
      AND r.activated_at IS NULL
      AND r.status = 'attributed'
      AND r.attribution_expires_at IS NOT NULL
      AND r.attribution_expires_at > v_now
  ) THEN
    SELECT r.id INTO v_referral_id
    FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_invitee_user_id
      AND r.status = 'attributed'
    LIMIT 1;

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
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'already_bound',
        'referral_id', v_attr.bound_referral_id
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'attribution_bound_elsewhere');
  END IF;

  IF v_attr.status <> 'pending' OR v_attr.expires_at <= v_now THEN
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
    SELECT r.id INTO v_referral_id
    FROM public.author_referrals AS r
    WHERE r.invitee_user_id = p_invitee_user_id;

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

COMMENT ON FUNCTION public.author_partner_claim_attribution(text, uuid) IS
  'audiolad:author-partner:v2; bind pending cookie attribution to invitee_user_id; first-touch + advisory lock.';

REVOKE ALL ON FUNCTION public.author_partner_claim_attribution(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_claim_attribution(text, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Touch invite (anonymous or authenticated): first-touch wins
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
  v_new public.author_partner_attributions%ROWTYPE;
  v_now timestamptz := now();
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
    IF v_existing.status = 'pending' AND v_existing.expires_at <= v_now THEN
      UPDATE public.author_partner_attributions
      SET status = 'expired'
      WHERE id = v_existing.id;
      v_existing.status := 'expired';
    END IF;

    IF v_existing.status = 'pending' AND v_existing.expires_at > v_now THEN
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'preserved_first_touch',
        'attribution_id', v_existing.id,
        'referrer_author_id', v_existing.referrer_author_id,
        'code', v_existing.code_used,
        'expires_at', v_existing.expires_at
      );
    END IF;

    IF v_existing.status = 'bound' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'result', 'already_bound',
        'attribution_id', v_existing.id,
        'referrer_author_id', v_existing.referrer_author_id
      );
    END IF;
  END IF;

  IF p_invitee_user_id IS NOT NULL THEN
    IF public.author_partner_user_owns_author_space(p_invitee_user_id) THEN
      RETURN jsonb_build_object('ok', true, 'result', 'already_author');
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
          'referral_id', v_referral.id
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
          'expires_at', v_referral.attribution_expires_at
        );
      END IF;

      IF v_referral.activated_at IS NULL THEN
        DELETE FROM public.author_referrals WHERE id = v_referral.id;
      END IF;
    END IF;
  END IF;

  IF v_existing.id IS NOT NULL THEN
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
    WHERE a.id = v_existing.id
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
    RETURN public.author_partner_claim_attribution(p_token_hash, p_invitee_user_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'created',
    'attribution_id', v_new.id,
    'referrer_author_id', v_new.referrer_author_id,
    'code', v_new.code_used,
    'expires_at', v_new.expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.author_partner_touch_invite(text, text, uuid) IS
  'audiolad:author-partner:v2; resolve invite code + first-touch anonymous attribution.';

REVOKE ALL ON FUNCTION public.author_partner_touch_invite(text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_touch_invite(text, text, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Manual code bind (become-author form)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_bind_manual_code(
  p_code text,
  p_invitee_user_id uuid
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
BEGIN
  IF p_invitee_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_required');
  END IF;

  v_lock_key := hashtextextended('author_partner_claim:' || p_invitee_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF public.author_partner_user_owns_author_space(p_invitee_user_id) THEN
    RETURN jsonb_build_object('ok', true, 'result', 'already_author');
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
       AND v_referral.attribution_expires_at > v_now THEN
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

COMMENT ON FUNCTION public.author_partner_bind_manual_code(text, uuid) IS
  'audiolad:author-partner:v2; manual invite code on become-author form; respects first-touch.';

REVOKE ALL ON FUNCTION public.author_partner_bind_manual_code(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_bind_manual_code(text, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Read-only invitee attribution status (server)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_get_invitee_attribution(
  p_invitee_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referral public.author_referrals%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_invitee_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'exists', false);
  END IF;

  SELECT * INTO v_referral
  FROM public.author_referrals AS r
  WHERE r.invitee_user_id = p_invitee_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'exists', false);
  END IF;

  IF v_referral.activated_at IS NULL
     AND v_referral.status = 'attributed'
     AND v_referral.attribution_expires_at IS NOT NULL
     AND v_referral.attribution_expires_at <= v_now THEN
    RETURN jsonb_build_object('ok', true, 'exists', false, 'expired', true);
  END IF;

  IF v_referral.status NOT IN ('attributed', 'activated') THEN
    RETURN jsonb_build_object('ok', true, 'exists', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'exists', true,
    'code', v_referral.code_used,
    'status', v_referral.status,
    'referrer_author_id', v_referral.referrer_author_id,
    'attribution_expires_at', v_referral.attribution_expires_at,
    'activated_at', v_referral.activated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_partner_get_invitee_attribution(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_get_invitee_attribution(uuid)
  TO service_role;

COMMIT;
