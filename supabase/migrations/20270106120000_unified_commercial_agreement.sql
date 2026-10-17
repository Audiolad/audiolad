-- audiolad:unified-agreement (tasks 8dcba9d1 / 8d9cd0af). Unified commercial agreement 2.0.
-- ADDITIVE ONLY. Inert until the 2.0 edition row is inserted and made current (rollout SQL in
-- docs/business/unified-agreement-8dcba9d1/, applied only with Sergey's explicit approval).
-- Does NOT insert or switch any author_terms_versions row, does NOT touch existing acceptances,
-- business_legal_consents, business_product_optins, verifications or music_rights_grants rows.
-- Never auto-accepts: Business requires a personal acceptance of an edition that covers Business.
BEGIN;

-- 1) Edition metadata ----------------------------------------------------------------------
ALTER TABLE public.author_terms_versions
  ADD COLUMN IF NOT EXISTS covers_business boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grants_scope jsonb NULL,
  ADD COLUMN IF NOT EXISTS reaccept_grace_until timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'author_terms_versions_grants_scope_array') THEN
    ALTER TABLE public.author_terms_versions
      ADD CONSTRAINT author_terms_versions_grants_scope_array
      CHECK (grants_scope IS NULL OR jsonb_typeof(grants_scope) = 'array');
  END IF;
END;
$$;

COMMENT ON COLUMN public.author_terms_versions.covers_business IS
  'audiolad:unified-agreement; true only for editions that license AudioLad Business + sublicensing to venues (2.0+).';
COMMENT ON COLUMN public.author_terms_versions.grants_scope IS
  'audiolad:unified-agreement; informational list of licensed channels of this edition.';
COMMENT ON COLUMN public.author_terms_versions.reaccept_grace_until IS
  'audiolad:unified-agreement; on the CURRENT edition: acceptances of earlier editions keep commercial gates (not Business) open until this moment.';

-- 2) Grace-aware commercial gate (same signature; old behaviour when reaccept_grace_until IS NULL)
CREATE OR REPLACE FUNCTION public.author_has_accepted_current_terms(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_author_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.author_terms_acceptances a
      JOIN public.author_terms_versions v ON v.id = a.terms_version_id
      WHERE a.author_id = p_author_id AND v.document_key = 'author-terms' AND v.is_current
    )
    OR EXISTS (
      SELECT 1
      FROM public.author_terms_versions c
      JOIN public.author_terms_acceptances a ON a.author_id = p_author_id
      JOIN public.author_terms_versions v ON v.id = a.terms_version_id AND v.document_key = 'author-terms'
      WHERE c.document_key = 'author-terms' AND c.is_current
        AND c.reaccept_grace_until IS NOT NULL AND clock_timestamp() < c.reaccept_grace_until
    )
  );
$$;

-- 3) Business agreement: personal acceptance of a covers_business edition that is current
--    (or an earlier covers_business edition during the grace of a later one). Never 1.x.
CREATE OR REPLACE FUNCTION public.author_business_agreement_acceptance(p_author_id uuid)
RETURNS TABLE(acceptance_id uuid, terms_version_id uuid, version text, content_hash text, accepted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, v.id, v.version, v.content_hash, a.accepted_at
  FROM public.author_terms_versions c
  JOIN public.author_terms_acceptances a ON a.author_id = p_author_id
  JOIN public.author_terms_versions v ON v.id = a.terms_version_id
  WHERE p_author_id IS NOT NULL
    AND c.document_key = 'author-terms' AND c.is_current
    AND v.document_key = 'author-terms' AND v.covers_business
    AND (v.id = c.id OR (c.reaccept_grace_until IS NOT NULL AND clock_timestamp() < c.reaccept_grace_until))
  ORDER BY (v.id = c.id) DESC, a.accepted_at DESC, a.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.author_has_business_agreement(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.author_business_agreement_acceptance(p_author_id));
$$;

-- Status for the author cabinet (read-only). Callers: service_role, or an owner/editor of the author.
CREATE OR REPLACE FUNCTION public.author_commercial_agreement_state(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE c public.author_terms_versions%ROWTYPE; v_accepted_current boolean; v_any boolean; v_biz record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.author_members m WHERE m.author_id = p_author_id AND m.user_id = auth.uid()
  ) AND NOT public.business_onboarding_is_moderator() THEN
    RAISE EXCEPTION 'author_membership_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.author_terms_versions WHERE document_key = 'author-terms' AND is_current;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('current_version', NULL, 'accepted_current', false, 'in_grace', false,
      'reaccept_required', false, 'business_agreement', false);
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.author_terms_acceptances WHERE author_id = p_author_id AND terms_version_id = c.id)
    INTO v_accepted_current;
  SELECT EXISTS (SELECT 1 FROM public.author_terms_acceptances a JOIN public.author_terms_versions v ON v.id = a.terms_version_id
    WHERE a.author_id = p_author_id AND v.document_key = 'author-terms' AND v.id <> c.id) INTO v_any;
  SELECT * INTO v_biz FROM public.author_business_agreement_acceptance(p_author_id);
  RETURN jsonb_build_object(
    'current_version', c.version,
    'current_covers_business', c.covers_business,
    'accepted_current', v_accepted_current,
    'in_grace', NOT v_accepted_current AND v_any AND c.reaccept_grace_until IS NOT NULL AND clock_timestamp() < c.reaccept_grace_until,
    'grace_until', c.reaccept_grace_until,
    'reaccept_required', NOT v_accepted_current AND v_any,
    'business_agreement', v_biz.acceptance_id IS NOT NULL,
    'business_agreement_version', v_biz.version
  );
END;
$$;

-- 4) Per-track admission reviews (append-only; one verified track never verifies the rest) ----
CREATE TABLE IF NOT EXISTS public.business_track_eligibility_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_item_id uuid NOT NULL,
  product_id uuid NOT NULL,
  author_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('admitted', 'proof_requested', 'blocked')),
  reason_code text NOT NULL CHECK (reason_code IN (
    'ok', 'rights_undefined_or_limited', 'other_rightsholder', 'rights_revoked_or_disputed',
    'use_type_missing', 'proof_requested', 'suspended')),
  comment text CHECK (comment IS NULL OR length(comment) <= 2000),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((decision = 'admitted') = (reason_code = 'ok'))
);
CREATE INDEX IF NOT EXISTS business_track_eligibility_reviews_track_idx
  ON public.business_track_eligibility_reviews(audio_item_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS business_track_eligibility_reviews_author_idx
  ON public.business_track_eligibility_reviews(author_id);
COMMENT ON TABLE public.business_track_eligibility_reviews IS
  'audiolad:unified-agreement; append-only per-track Business admission decisions (latest row wins). Historical ids, no destructive FK.';

-- Membership check for RLS (definer: clients need no direct access to author_members).
CREATE OR REPLACE FUNCTION public.business_unified_is_author_member(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.author_members m WHERE m.author_id = p_author_id AND m.user_id = auth.uid()
  );
$$;

ALTER TABLE public.business_track_eligibility_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_track_eligibility_reviews FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.business_track_eligibility_reviews TO authenticated, service_role;
DROP POLICY IF EXISTS business_track_eligibility_reviews_read ON public.business_track_eligibility_reviews;
CREATE POLICY business_track_eligibility_reviews_read ON public.business_track_eligibility_reviews
  FOR SELECT TO authenticated
  USING (
    public.business_onboarding_is_moderator()
    OR public.business_unified_is_author_member(author_id)
  );
DROP TRIGGER IF EXISTS business_track_eligibility_reviews_immutable ON public.business_track_eligibility_reviews;
CREATE TRIGGER business_track_eligibility_reviews_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.business_track_eligibility_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION public.business_onboarding_append_only();

-- Latest decision per track (NULL = no review: suitable tracks flow in automatically).
CREATE OR REPLACE FUNCTION public.business_track_latest_review(p_audio_item_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT decision FROM public.business_track_eligibility_reviews
  WHERE audio_item_id = p_audio_item_id ORDER BY created_at DESC, id DESC LIMIT 1;
$$;

-- DB activation gate: the unified model is ACTIVE only once an edition that covers Business is the
-- current author-terms edition (rollout step 02-switch-current, done only with the app flag on).
-- Until then every new write path below refuses and the legacy Business flow is unchanged.
CREATE OR REPLACE FUNCTION public.business_unified_agreement_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.author_terms_versions
    WHERE document_key = 'author-terms' AND is_current AND covers_business
  );
$$;

-- Lock order (everywhere): author lock FIRST, then track locks in ascending track id.
-- Sync and moderation for one author therefore never interleave and never invert lock order.
CREATE OR REPLACE FUNCTION public.business_author_lock(p_author_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('audiolad:business_author:' || p_author_id::text, 0));
$$;

-- Serializes catalogue sync and per-track moderation decisions for one track (taken after the author lock).
CREATE OR REPLACE FUNCTION public.business_track_lock(p_audio_item_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('audiolad:business_track:' || p_audio_item_id::text, 0));
$$;

-- At most one open-ended agreement grant per track/layer/use (idempotency under concurrency).
-- The sync only ever creates open-ended rows (valid_until IS NULL); rows with an end date (expired
-- history or a later end set by the rights team) are outside the key, so an explicitly re-admitted
-- track can get a replacement. Only platform_agreement rows are constrained; other sources unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS music_rights_grants_platform_agreement_open_uidx
  ON public.music_rights_grants (audio_item_id, rights_layer, use_type)
  WHERE source_type = 'platform_agreement' AND status IN ('draft', 'verified') AND valid_until IS NULL;

-- Failed automatic inflow is recorded (append-only) so it is visible and retried; never silent.
CREATE TABLE IF NOT EXISTS public.business_catalog_sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  sqlstate text NOT NULL,
  error text NOT NULL CHECK (length(error) <= 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS business_catalog_sync_failures_author_idx
  ON public.business_catalog_sync_failures(author_id, created_at DESC);
ALTER TABLE public.business_catalog_sync_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_catalog_sync_failures FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.business_catalog_sync_failures TO service_role;
DROP TRIGGER IF EXISTS business_catalog_sync_failures_immutable ON public.business_catalog_sync_failures;
CREATE TRIGGER business_catalog_sync_failures_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.business_catalog_sync_failures
  FOR EACH STATEMENT EXECUTE FUNCTION public.business_onboarding_append_only();

-- Evidence track for the rights check: ONE published track of a published music product owned by
-- the caller. Unlike business_onboarding_product it does not require every track of the album to be
-- published (unified model: proof on >= 1 published track).
CREATE OR REPLACE FUNCTION public.business_unified_evidence_track(p_product_id uuid, p_audio_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_product public.practices%ROWTYPE; v_track jsonb;
BEGIN
  SELECT * INTO v_product FROM public.practices WHERE id = p_product_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business_product_not_owned'; END IF;
  PERFORM 1 FROM public.author_members WHERE author_id = v_product.author_id
    AND user_id = auth.uid() AND role = 'owner' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business_product_not_owned' USING ERRCODE = '42501'; END IF;
  IF v_product.status IS DISTINCT FROM 'published' OR v_product.product_kind IS DISTINCT FROM 'music' THEN
    RAISE EXCEPTION 'business_product_not_published';
  END IF;
  SELECT jsonb_build_array(jsonb_build_object('audio_item_id', id, 'title', title,
      'position', position, 'music_track_code', music_track_code))
    INTO v_track FROM public.audio_items
    WHERE id = p_audio_item_id AND practice_id = p_product_id AND status = 'published' FOR SHARE;
  IF v_track IS NULL THEN RAISE EXCEPTION 'business_track_not_in_product'; END IF;
  RETURN v_track;
END;
$$;

-- Moderator per-track decision. blocked / proof_requested revoke this agreement's own
-- platform_agreement Business grants for the track (verified → revoked keeps history).
CREATE OR REPLACE FUNCTION public.moderator_business_track_review(
  p_audio_item_id uuid, p_decision text, p_reason_code text, p_comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_product uuid; v_author uuid; v_id uuid;
BEGIN
  IF NOT public.business_onboarding_is_moderator() THEN
    RAISE EXCEPTION 'business_moderator_required' USING ERRCODE = '42501';
  END IF;
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.business_unified_agreement_active() THEN
    RAISE EXCEPTION 'business_unified_agreement_inactive' USING ERRCODE = '55000';
  END IF;
  SELECT ai.practice_id, p.author_id INTO v_product, v_author
  FROM public.audio_items ai JOIN public.practices p ON p.id = ai.practice_id
  WHERE ai.id = p_audio_item_id AND p.product_kind = 'music';
  IF NOT FOUND THEN RAISE EXCEPTION 'business_track_not_found'; END IF;
  -- Nobody admits their own track (blocking own music is allowed).
  IF p_decision = 'admitted' AND EXISTS (
    SELECT 1 FROM public.author_members WHERE author_id = v_author AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'business_self_moderation_forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.business_author_lock(v_author);
  PERFORM public.business_track_lock(p_audio_item_id);
  INSERT INTO public.business_track_eligibility_reviews(audio_item_id, product_id, author_id, decision, reason_code, comment, actor_user_id)
    VALUES (p_audio_item_id, v_product, v_author, p_decision, p_reason_code, nullif(btrim(p_comment), ''), auth.uid())
    RETURNING id INTO v_id;
  IF p_decision IN ('blocked', 'proof_requested') THEN
    UPDATE public.music_rights_grants
      SET status = 'revoked', updated_at = clock_timestamp()
      WHERE audio_item_id = p_audio_item_id
        AND use_type = 'business_background_playback'
        AND source_type = 'platform_agreement'
        AND source_reference LIKE 'author-terms:%'
        AND status = 'verified';
  ELSE
    -- Explicit admission lets the track flow in at once (same exception-safe inflow as the triggers).
    PERFORM public.business_unified_auto_sync_authors(ARRAY[v_author]);
  END IF;
  RETURN v_id;
END;
$$;

-- 5) submit_v3: rights check only. Requires the personal unified agreement; writes NO business_legal_consents.
CREATE OR REPLACE FUNCTION public.author_business_verification_submit_v3(
  p_verification_id uuid, p_evidence_ids uuid[], p_ip_address inet DEFAULT NULL, p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.business_rightsholder_verifications%ROWTYPE; v_tracks jsonb; v_evidence jsonb; v_author uuid;
  v_err text; n int := coalesce(cardinality(p_evidence_ids), 0); v_agreement record;
BEGIN
  -- Rights check is the rightsholder's personal act (PR 1 guard): never in support mode.
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.business_unified_agreement_active() THEN
    RAISE EXCEPTION 'business_unified_agreement_inactive' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid() FOR UPDATE;
  SELECT * INTO v FROM public.business_rightsholder_verifications WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND OR v.owner_user_id IS DISTINCT FROM auth.uid() OR v.status NOT IN ('draft','needs_info') THEN
    RAISE EXCEPTION 'business_verification_submit_forbidden' USING ERRCODE = '42501';
  END IF;
  v_err := public.business_onboarding_provider_error(v.ai_service, v.ai_service_other, v.service_track_url, v.provider_details);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err; END IF;
  v_tracks := public.business_unified_evidence_track(v.product_id, v.audio_item_id);
  SELECT author_id INTO v_author FROM public.practices WHERE id = v.product_id;
  SELECT * INTO v_agreement FROM public.author_business_agreement_acceptance(v_author);
  IF v_agreement.acceptance_id IS NULL THEN
    RAISE EXCEPTION 'business_unified_agreement_required' USING ERRCODE = '42501';
  END IF;
  IF (v.ai_service IN ('suno','musicgpt') AND n <> 2) OR (v.ai_service = 'other' AND n NOT BETWEEN 1 AND 2) THEN
    RAISE EXCEPTION 'business_evidence_files_required';
  END IF;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY e.kind) INTO v_evidence
    FROM public.business_verification_evidence e
    JOIN storage.objects o ON o.bucket_id = 'business-rightsholder-evidence' AND o.name = e.object_path
    WHERE e.verification_id = v.id AND e.id = ANY(p_evidence_ids)
      AND o.metadata->>'mimetype' = e.mime_type AND (o.metadata->>'size')::bigint = e.size_bytes;
  IF coalesce(jsonb_array_length(v_evidence),0) <> n OR
    (SELECT count(DISTINCT e.kind) FROM public.business_verification_evidence e WHERE e.id = ANY(p_evidence_ids) AND e.verification_id = v.id) <> n THEN
    RAISE EXCEPTION 'business_evidence_files_required';
  END IF;
  INSERT INTO public.business_rightsholder_verification_attempts(verification_id,attempt_no,snapshot)
    SELECT v.id, coalesce(max(attempt_no),0) + 1,
      jsonb_build_object('fields', to_jsonb(v) - ARRAY['status','reason','submitted_at','updated_at'],
        'tracks', v_tracks, 'evidence', v_evidence, 'consent_ids', '[]'::jsonb,
        'agreement', jsonb_build_object('acceptance_id', v_agreement.acceptance_id,
          'terms_version_id', v_agreement.terms_version_id, 'version', v_agreement.version,
          'content_hash', v_agreement.content_hash, 'accepted_at', v_agreement.accepted_at),
        'client', jsonb_build_object('ip_address', p_ip_address, 'user_agent', left(p_user_agent, 512)))
    FROM public.business_rightsholder_verification_attempts WHERE verification_id = v.id;
  UPDATE public.business_rightsholder_verifications SET status = 'submitted', submitted_at = clock_timestamp(),
    updated_at = clock_timestamp() WHERE id = v.id;
END;
$$;

-- 5b) draft_v3 = draft_v2 for the unified model: same fields, but the evidence track is checked
--     alone (business_unified_evidence_track), never the whole album. Activation-gated, no support mode.
CREATE OR REPLACE FUNCTION public.author_business_verification_draft_v3(
  p_product_id uuid, p_audio_item_id uuid, p_ai_service text, p_ai_service_other text,
  p_service_track_title text, p_service_track_url text, p_provider_details jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid; v_status text; v_err text;
  v_url text := nullif(btrim(p_service_track_url),'');
  v_other text := CASE WHEN p_ai_service = 'other' THEN nullif(btrim(p_ai_service_other),'') END;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.business_unified_agreement_active() THEN
    RAISE EXCEPTION 'business_unified_agreement_inactive' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.business_rightsholder_accounts(owner_user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid() FOR UPDATE;
  PERFORM public.business_unified_evidence_track(p_product_id, p_audio_item_id);
  v_err := public.business_onboarding_provider_error(p_ai_service, v_other, v_url, p_provider_details);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err; END IF;
  IF p_service_track_title IS NULL OR length(btrim(p_service_track_title)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'business_service_track_title_invalid';
  END IF;
  SELECT id, status INTO v_id, v_status FROM public.business_rightsholder_verifications
    WHERE owner_user_id = auth.uid() FOR UPDATE;
  IF FOUND THEN
    IF v_status NOT IN ('rejected','needs_info') THEN RAISE EXCEPTION 'business_verification_already_active'; END IF;
    UPDATE public.business_rightsholder_verifications SET product_id = p_product_id,
      audio_item_id = p_audio_item_id, ai_service = p_ai_service, ai_service_other = v_other,
      service_track_title = btrim(p_service_track_title), service_track_url = v_url,
      provider_details = p_provider_details, status = 'draft', updated_at = clock_timestamp() WHERE id = v_id;
    RETURN v_id;
  END IF;
  INSERT INTO public.business_rightsholder_verifications(owner_user_id,product_id,audio_item_id,ai_service,
    ai_service_other,service_track_title,service_track_url,provider_details)
    VALUES(auth.uid(),p_product_id,p_audio_item_id,p_ai_service,v_other,btrim(p_service_track_title),v_url,p_provider_details)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 6) Per-product opt-in: NOT revoked here (flag-off behaviour must stay identical). It is revoked
--    at activation by docs/business/unified-agreement-8dcba9d1/sql/02-switch-current.sql and
--    re-granted by 03-rollback-switch.sql.

-- 7) Catalogue sync: creates NEW platform_agreement Business grants for suitable tracks only.
--    Existing grants (any source) are never modified. A track is skipped when it has a live grant
--    of another rightsholder, a historical restriction (revoked / expired Business grant) not
--    followed by an explicit 'admitted' review, a blocking review, or a suspension. Territory: RU
--    (agreement 2.0 п. 5.3). Internal runner (no client grant) + authorised wrapper.
CREATE OR REPLACE FUNCTION public.business_catalog_sync_run(p_author_id uuid, p_dry_run boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_agreement record; v_rightsholder uuid; v_owner uuid; t record; layer text; v_grant uuid;
  v_ready jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_created int := 0; v_reasons text[] := ARRAY[]::text[];
  v_latest text; v_admitted_at timestamptz; v_now timestamptz := clock_timestamp();
BEGIN
  IF p_dry_run IS NULL THEN
    RAISE EXCEPTION 'business_catalog_sync_dry_run_required';
  END IF;
  IF NOT public.business_unified_agreement_active() THEN
    v_reasons := array_append(v_reasons, 'unified_agreement_inactive');
  END IF;
  SELECT * INTO v_agreement FROM public.author_business_agreement_acceptance(p_author_id);
  IF v_agreement.acceptance_id IS NULL THEN
    v_reasons := array_append(v_reasons, 'unified_agreement_not_accepted');
  END IF;
  SELECT acc.owner_user_id, acc.rightsholder_id INTO v_owner, v_rightsholder
  FROM public.author_members m
  JOIN public.business_rightsholder_accounts acc ON acc.owner_user_id = m.user_id
  JOIN public.business_rightsholder_verifications ver ON ver.owner_user_id = acc.owner_user_id AND ver.status = 'verified'
  JOIN public.music_rightsholders rh ON rh.id = acc.rightsholder_id AND rh.status = 'active'
  WHERE m.author_id = p_author_id AND m.role = 'owner'
  ORDER BY acc.created_at, acc.owner_user_id
  LIMIT 1;
  IF v_rightsholder IS NULL THEN
    v_reasons := array_append(v_reasons, 'rights_check_not_verified');
  END IF;
  IF cardinality(v_reasons) > 0 THEN
    RETURN jsonb_build_object('author_id', p_author_id, 'dry_run', p_dry_run, 'status', 'not_ready',
      'reasons', to_jsonb(v_reasons), 'created_grants', 0, 'ready', '[]'::jsonb, 'skipped', '[]'::jsonb);
  END IF;

  IF NOT p_dry_run THEN
    PERFORM public.business_author_lock(p_author_id);
  END IF;
  FOR t IN
    SELECT ai.id AS audio_item_id, ai.practice_id AS product_id
    FROM public.audio_items ai JOIN public.practices p ON p.id = ai.practice_id
    WHERE p.author_id = p_author_id AND p.status = 'published' AND p.product_kind = 'music' AND ai.status = 'published'
    ORDER BY ai.id
  LOOP
    IF NOT p_dry_run THEN
      -- Same lock as moderator_business_track_review: decisions and inflow never interleave.
      PERFORM public.business_track_lock(t.audio_item_id);
    END IF;
    SELECT decision INTO v_latest FROM public.business_track_eligibility_reviews
      WHERE audio_item_id = t.audio_item_id ORDER BY created_at DESC, id DESC LIMIT 1;
    IF v_latest IN ('blocked', 'proof_requested') THEN
      v_skipped := v_skipped || jsonb_build_object('audio_item_id', t.audio_item_id, 'reason', 'review_' || v_latest);
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.business_onboarding_suspensions s
               WHERE s.product_id = t.product_id AND (s.audio_item_id IS NULL OR s.audio_item_id = t.audio_item_id)) THEN
      v_skipped := v_skipped || jsonb_build_object('audio_item_id', t.audio_item_id, 'reason', 'suspended');
      CONTINUE;
    END IF;
    SELECT max(created_at) INTO v_admitted_at FROM public.business_track_eligibility_reviews
      WHERE audio_item_id = t.audio_item_id AND decision = 'admitted';
    IF EXISTS (SELECT 1 FROM public.music_rights_grants g
               WHERE g.audio_item_id = t.audio_item_id AND g.use_type = 'business_background_playback'
                 AND (g.status = 'revoked' OR (g.status = 'verified' AND g.valid_until IS NOT NULL AND g.valid_until <= v_now))
                 AND coalesce(g.ceased_at, g.valid_until, g.updated_at) > coalesce(v_admitted_at, '-infinity'::timestamptz)) THEN
      v_skipped := v_skipped || jsonb_build_object('audio_item_id', t.audio_item_id, 'reason', 'historical_rights_restriction');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.music_rights_grants g
               WHERE g.audio_item_id = t.audio_item_id AND g.use_type = 'business_background_playback'
                 AND g.status IN ('draft', 'verified') AND g.ceased_at IS NULL
                 AND (g.valid_until IS NULL OR g.valid_until > v_now)
                 AND g.rightsholder_id IS DISTINCT FROM v_rightsholder) THEN
      v_skipped := v_skipped || jsonb_build_object('audio_item_id', t.audio_item_id, 'reason', 'other_rightsholder_grant');
      CONTINUE;
    END IF;
    IF (SELECT count(DISTINCT g.rights_layer) FROM public.music_rights_grants g
        WHERE g.audio_item_id = t.audio_item_id AND g.use_type = 'business_background_playback'
          AND g.status IN ('draft', 'verified') AND g.ceased_at IS NULL
          AND (g.valid_until IS NULL OR g.valid_until > v_now)) = 2 THEN
      v_skipped := v_skipped || jsonb_build_object('audio_item_id', t.audio_item_id, 'reason', 'already_granted');
      CONTINUE;
    END IF;
    v_ready := v_ready || jsonb_build_object('audio_item_id', t.audio_item_id, 'product_id', t.product_id);
    IF NOT p_dry_run THEN
      FOREACH layer IN ARRAY ARRAY['recording', 'composition'] LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.music_rights_grants g
          WHERE g.audio_item_id = t.audio_item_id AND g.use_type = 'business_background_playback' AND g.rights_layer = layer
            AND g.status IN ('draft', 'verified') AND g.ceased_at IS NULL AND (g.valid_until IS NULL OR g.valid_until > v_now));
        INSERT INTO public.music_rights_grants(audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
          valid_from, source_type, source_reference, status)
        VALUES (t.audio_item_id, v_rightsholder, layer, 'business_background_playback', 'countries', v_now,
          'platform_agreement', 'author-terms:' || v_agreement.version || ':acceptance:' || v_agreement.acceptance_id, 'draft')
        RETURNING id INTO v_grant;
        INSERT INTO public.music_rights_grant_countries(grant_id, country_code, effect) VALUES (v_grant, 'RU', 'include');
        UPDATE public.music_rights_grants SET status = 'verified', verified_at = v_now WHERE id = v_grant;
        v_created := v_created + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('author_id', p_author_id, 'dry_run', p_dry_run, 'status', 'ok',
    'agreement', jsonb_build_object('version', v_agreement.version, 'acceptance_id', v_agreement.acceptance_id),
    'rightsholder_id', v_rightsholder, 'created_grants', v_created, 'ready', v_ready, 'skipped', v_skipped);
END;
$$;

-- Authorised entry point: moderator (JWT) or service_role / DB owner. Dry run by default.
CREATE OR REPLACE FUNCTION public.business_catalog_sync(p_author_id uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.business_onboarding_is_moderator() THEN
    RAISE EXCEPTION 'business_moderator_required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'business_catalog_sync_forbidden' USING ERRCODE = '42501';
  END IF;
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.business_catalog_sync_run(p_author_id, p_dry_run);
END;
$$;

-- 7b) Automatic inflow (no manual step): after a personal acceptance of a Business-covering edition,
--     after the rights check is verified, and after a music product/track is published.
--     Inert unless the unified model is active. Never breaks the triggering write: failures are
--     reported as WARNING and the sync is retried by the next event or a manual/dry-run call.
CREATE OR REPLACE FUNCTION public.business_unified_auto_sync_authors(p_author_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE a uuid;
BEGIN
  IF p_author_ids IS NULL OR NOT public.business_unified_agreement_active() THEN RETURN; END IF;
  FOR a IN SELECT DISTINCT x FROM unnest(p_author_ids) x WHERE x IS NOT NULL ORDER BY x LOOP
    BEGIN
      PERFORM public.business_catalog_sync_run(a, false);
    EXCEPTION WHEN OTHERS THEN
      -- The failed sync is rolled back as a unit; the record below survives and the next event for
      -- this author (or a manual business_catalog_sync) retries. See ROLLOUT-PLAN-RU.md monitoring.
      INSERT INTO public.business_catalog_sync_failures(author_id, sqlstate, error)
        VALUES (a, SQLSTATE, left(SQLERRM, 2000));
      RAISE WARNING 'business_unified_auto_sync_failed author=% err=%', a, SQLERRM;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.business_unified_auto_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_authors uuid[];
BEGIN
  IF NOT public.business_unified_agreement_active() THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'author_terms_acceptances' THEN
    SELECT array_agg(DISTINCT n.author_id) INTO v_authors
      FROM new_rows n JOIN public.author_terms_versions v ON v.id = n.terms_version_id AND v.covers_business;
  ELSIF TG_TABLE_NAME = 'business_rightsholder_verifications' THEN
    SELECT array_agg(DISTINCT m.author_id) INTO v_authors
      FROM new_rows n JOIN public.author_members m ON m.user_id = n.owner_user_id AND m.role = 'owner'
      WHERE n.status = 'verified';
  ELSIF TG_TABLE_NAME = 'practices' THEN
    SELECT array_agg(DISTINCT n.author_id) INTO v_authors
      FROM new_rows n WHERE n.status = 'published' AND n.product_kind = 'music';
  ELSIF TG_TABLE_NAME = 'audio_items' THEN
    SELECT array_agg(DISTINCT p.author_id) INTO v_authors
      FROM new_rows n JOIN public.practices p ON p.id = n.practice_id
      WHERE n.status = 'published' AND p.status = 'published' AND p.product_kind = 'music';
  END IF;
  PERFORM public.business_unified_auto_sync_authors(v_authors);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_ins ON public.author_terms_acceptances;
CREATE TRIGGER zz_business_unified_auto_sync_ins AFTER INSERT ON public.author_terms_acceptances
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.business_unified_auto_sync_trigger();
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_upd ON public.business_rightsholder_verifications;
CREATE TRIGGER zz_business_unified_auto_sync_upd AFTER UPDATE ON public.business_rightsholder_verifications
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.business_unified_auto_sync_trigger();
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_ins ON public.practices;
CREATE TRIGGER zz_business_unified_auto_sync_ins AFTER INSERT ON public.practices
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.business_unified_auto_sync_trigger();
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_upd ON public.practices;
CREATE TRIGGER zz_business_unified_auto_sync_upd AFTER UPDATE ON public.practices
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.business_unified_auto_sync_trigger();
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_ins ON public.audio_items;
CREATE TRIGGER zz_business_unified_auto_sync_ins AFTER INSERT ON public.audio_items
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.business_unified_auto_sync_trigger();
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_upd ON public.audio_items;
CREATE TRIGGER zz_business_unified_auto_sync_upd AFTER UPDATE ON public.audio_items
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.business_unified_auto_sync_trigger();

-- 7c) Per-track admission is enforced at PLAYBACK: the eligibility resolver (used by programmes,
--     manifest and live player state) returns INELIGIBLE for a track whose latest admission
--     decision as of p_as_of is 'blocked' or 'proof_requested', whatever grants exist (historical
--     grants of any source are kept untouched). The original resolver is kept verbatim as
--     resolve_business_track_eligibility_v1 (no client grant); the public name is a thin overlay.
--     Without reviews (the case before activation) the result is byte-identical to v1.
DO $$
BEGIN
  IF to_regprocedure('public.resolve_business_track_eligibility_v1(uuid,uuid,uuid,text,timestamptz)') IS NULL THEN
    ALTER FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz)
      RENAME TO resolve_business_track_eligibility_v1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid,
  p_location_id uuid,
  p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback',
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v jsonb; r record;
BEGIN
  v := public.resolve_business_track_eligibility_v1(p_audio_item_id, p_location_id, p_zone_id, p_use_type, p_as_of);
  SELECT id, decision INTO r FROM public.business_track_eligibility_reviews
    -- Current queries (as_of >= transaction time) see every decision, even one made later in this
    -- transaction; historical queries see the decisions made up to as_of.
    WHERE audio_item_id = p_audio_item_id
      AND (coalesce(p_as_of, now()) >= now() OR created_at <= p_as_of)
    ORDER BY created_at DESC, id DESC LIMIT 1;
  IF FOUND AND r.decision IN ('blocked', 'proof_requested') THEN
    v := v || jsonb_build_object('decision', 'INELIGIBLE',
      'reason_codes', coalesce(v->'reason_codes', '[]'::jsonb) || to_jsonb('BUSINESS_TRACK_ADMISSION_' || upper(r.decision)),
      'business_track_review_id', r.id);
  END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_business_track_eligibility_v1(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) TO service_role;
COMMENT ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) IS
  'audiolad:unified-agreement; rights_eligibility_v1 + per-track admission overlay (blocked/proof_requested => INELIGIBLE)';

-- 8) Least privilege -----------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.business_unified_is_author_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_unified_is_author_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.author_business_agreement_acceptance(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.author_has_business_agreement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.author_commercial_agreement_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_track_latest_review(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_unified_agreement_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_track_lock(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_author_lock(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_unified_evidence_track(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.author_business_verification_draft_v3(uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.author_business_verification_draft_v3(uuid,uuid,text,text,text,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.business_catalog_sync_run(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_unified_auto_sync_authors(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_unified_auto_sync_trigger() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.moderator_business_track_review(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.author_business_verification_submit_v3(uuid,uuid[],inet,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.business_catalog_sync(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_unified_agreement_active() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.author_has_business_agreement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_commercial_agreement_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.moderator_business_track_review(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.author_business_verification_submit_v3(uuid,uuid[],inet,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_catalog_sync(uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.author_business_verification_submit_v3(uuid,uuid[],inet,text) IS 'audiolad:unified-agreement';
COMMENT ON FUNCTION public.business_catalog_sync(uuid,boolean) IS 'audiolad:unified-agreement; dry run by default';
COMMENT ON FUNCTION public.moderator_business_track_review(uuid,text,text,text) IS 'audiolad:unified-agreement';
COMMIT;
