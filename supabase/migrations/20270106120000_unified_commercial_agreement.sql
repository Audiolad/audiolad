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
  PERFORM 1 FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid() FOR UPDATE;
  SELECT * INTO v FROM public.business_rightsholder_verifications WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND OR v.owner_user_id IS DISTINCT FROM auth.uid() OR v.status NOT IN ('draft','needs_info') THEN
    RAISE EXCEPTION 'business_verification_submit_forbidden' USING ERRCODE = '42501';
  END IF;
  v_err := public.business_onboarding_provider_error(v.ai_service, v.ai_service_other, v.service_track_url, v.provider_details);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err; END IF;
  v_tracks := public.business_onboarding_product(v.product_id);
  IF NOT EXISTS (SELECT 1 FROM public.audio_items WHERE id = v.audio_item_id AND practice_id = v.product_id AND status = 'published') THEN
    RAISE EXCEPTION 'business_track_not_in_product';
  END IF;
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

-- 6) Per-product opt-in is replaced by automatic inflow: no client may call it any more.
REVOKE EXECUTE ON FUNCTION public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text) FROM authenticated;

-- 7) Catalogue sync: creates NEW platform_agreement Business grants for suitable tracks only.
--    Default dry run. Existing grants (any source) are never modified; tracks that already have a
--    live grant for the layer are skipped. Territory: RU (agreement 2.0 п. 5.3).
CREATE OR REPLACE FUNCTION public.business_catalog_sync(p_author_id uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_agreement record; v_rightsholder uuid; v_owner uuid; t record; layer text; v_grant uuid;
  v_ready jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_created int := 0; v_reasons text[] := ARRAY[]::text[];
  v_latest text; v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.business_onboarding_is_moderator() THEN
    RAISE EXCEPTION 'business_moderator_required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'business_catalog_sync_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_dry_run IS DISTINCT FROM false AND p_dry_run IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'business_catalog_sync_dry_run_required';
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

  FOR t IN
    SELECT ai.id AS audio_item_id, ai.practice_id AS product_id
    FROM public.audio_items ai JOIN public.practices p ON p.id = ai.practice_id
    WHERE p.author_id = p_author_id AND p.status = 'published' AND p.product_kind = 'music' AND ai.status = 'published'
    ORDER BY p.id, ai.position NULLS LAST, ai.id
  LOOP
    v_latest := public.business_track_latest_review(t.audio_item_id);
    IF v_latest IN ('blocked', 'proof_requested') THEN
      v_skipped := v_skipped || jsonb_build_object('audio_item_id', t.audio_item_id, 'reason', 'review_' || v_latest);
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.business_onboarding_suspensions s
               WHERE s.product_id = t.product_id AND (s.audio_item_id IS NULL OR s.audio_item_id = t.audio_item_id)) THEN
      v_skipped := v_skipped || jsonb_build_object('audio_item_id', t.audio_item_id, 'reason', 'suspended');
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

-- 8) Least privilege -----------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.business_unified_is_author_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_unified_is_author_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.author_business_agreement_acceptance(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.author_has_business_agreement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.author_commercial_agreement_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_track_latest_review(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.moderator_business_track_review(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.author_business_verification_submit_v3(uuid,uuid[],inet,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.business_catalog_sync(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_has_business_agreement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_commercial_agreement_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.moderator_business_track_review(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.author_business_verification_submit_v3(uuid,uuid[],inet,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_catalog_sync(uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.author_business_verification_submit_v3(uuid,uuid[],inet,text) IS 'audiolad:unified-agreement';
COMMENT ON FUNCTION public.business_catalog_sync(uuid,boolean) IS 'audiolad:unified-agreement; dry run by default';
COMMENT ON FUNCTION public.moderator_business_track_review(uuid,text,text,text) IS 'audiolad:unified-agreement';
COMMIT;
