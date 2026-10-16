-- audiolad:business-onboarding (8d9cd0af) — provider choice for the primary rights-holder check.
-- ADDITIVE ONLY: one new jsonb column with a default, one relaxed NOT NULL (service link is optional
-- for MusicGPT / «Другой сервис / своя студия»; still required and strictly validated for Suno),
-- new CHECK constraints, and NEW *_v2 RPCs. Existing tables, rows and RPCs are not rewritten.
-- One check still never confirms the catalogue and never sets verified automatically.
BEGIN;

ALTER TABLE public.business_rightsholder_verifications
  ADD COLUMN IF NOT EXISTS provider_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.business_rightsholder_verifications ALTER COLUMN service_track_url DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_rv_provider_details_object'
      AND conrelid = 'public.business_rightsholder_verifications'::regclass) THEN
    ALTER TABLE public.business_rightsholder_verifications ADD CONSTRAINT business_rv_provider_details_object
      CHECK (jsonb_typeof(provider_details) = 'object' AND octet_length(provider_details::text) <= 16384);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_rv_suno_link_required'
      AND conrelid = 'public.business_rightsholder_verifications'::regclass) THEN
    ALTER TABLE public.business_rightsholder_verifications ADD CONSTRAINT business_rv_suno_link_required
      CHECK (ai_service <> 'suno' OR service_track_url IS NOT NULL);
  END IF;
END $$;

-- Returns NULL when valid, otherwise an error code. Pure; shared by draft_v2 and submit_v2.
CREATE OR REPLACE FUNCTION public.business_onboarding_provider_error(
  p_ai_service text, p_ai_service_other text, p_service_track_url text, p_details jsonb
)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE k text; val jsonb; allowed text[];
BEGIN
  IF p_ai_service IS NULL OR p_ai_service NOT IN ('suno','musicgpt','other') THEN RETURN 'business_ai_service_invalid'; END IF;
  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'object' THEN RETURN 'business_provider_details_invalid'; END IF;
  allowed := CASE p_ai_service
    WHEN 'suno' THEN ARRAY['generation_refs','paid_plan','paid_period']
    WHEN 'musicgpt' THEN ARRAY['plan_name','license_refs','license_feature_note']
    ELSE ARRAY['method_description','evidence_note'] END;
  FOR k, val IN SELECT key, value FROM jsonb_each(p_details) LOOP
    IF NOT (k = ANY(allowed)) OR jsonb_typeof(val) <> 'string' OR length(val #>> '{}') > 4000 THEN
      RETURN 'business_provider_details_invalid';
    END IF;
  END LOOP;
  IF p_service_track_url IS NOT NULL AND (p_service_track_url !~ '^https://[^[:space:]@]+$' OR length(p_service_track_url) > 2048) THEN
    RETURN 'business_service_link_invalid';
  END IF;
  IF p_ai_service = 'suno' THEN
    IF p_service_track_url IS NULL OR p_service_track_url !~ '^https://suno[.]com/(s|song)/[A-Za-z0-9_-]+/?$' THEN
      RETURN 'business_service_link_invalid';
    END IF;
    IF coalesce(length(btrim(p_details->>'generation_refs')),0) = 0 THEN RETURN 'business_suno_generation_refs_required'; END IF;
  ELSIF p_ai_service = 'musicgpt' THEN
    IF coalesce(length(btrim(p_details->>'plan_name')),0) = 0 THEN RETURN 'business_musicgpt_plan_required'; END IF;
  ELSE
    IF coalesce(length(btrim(p_ai_service_other)),0) = 0 OR length(p_ai_service_other) > 500 THEN
      RETURN 'business_ai_service_invalid';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.author_business_verification_draft_v2(
  p_product_id uuid, p_audio_item_id uuid, p_ai_service text, p_ai_service_other text,
  p_service_track_title text, p_service_track_url text, p_provider_details jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_status text; v_err text;
  v_url text := nullif(btrim(p_service_track_url),'');
  v_other text := CASE WHEN p_ai_service = 'other' THEN nullif(btrim(p_ai_service_other),'') END;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.business_rightsholder_accounts(owner_user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid() FOR UPDATE;
  PERFORM public.business_onboarding_product(p_product_id);
  IF NOT EXISTS (SELECT 1 FROM public.audio_items WHERE id = p_audio_item_id AND practice_id = p_product_id AND status = 'published') THEN
    RAISE EXCEPTION 'business_track_not_in_product';
  END IF;
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

-- Same contract as author_business_verification_submit, but evidence rules depend on the provider:
-- suno / musicgpt: exactly two files, one 'generation' + one 'paid_period' slot;
-- other: one or two files, each slot at most once. Moderator decides; never auto-verified.
CREATE OR REPLACE FUNCTION public.author_business_verification_submit_v2(
  p_verification_id uuid, p_evidence_ids uuid[], p_accept_terms boolean, p_confirm_rights boolean,
  p_terms_version text, p_rights_version text, p_ip_address inet DEFAULT NULL, p_user_agent text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.business_rightsholder_verifications%ROWTYPE; v_tracks jsonb; v_evidence jsonb; v_consents uuid[];
  v_err text; n int := coalesce(cardinality(p_evidence_ids),0);
BEGIN
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
  v_consents := public.business_onboarding_consents(v.id,v.product_id,'verification',v_tracks,v_evidence,
    p_accept_terms,p_confirm_rights,p_terms_version,p_rights_version,p_ip_address,p_user_agent);
  INSERT INTO public.business_rightsholder_verification_attempts(verification_id,attempt_no,snapshot)
    SELECT v.id,coalesce(max(attempt_no),0) + 1,
      jsonb_build_object('fields',to_jsonb(v) - ARRAY['status','reason','submitted_at','updated_at'],
        'tracks',v_tracks,'evidence',v_evidence,'consent_ids',to_jsonb(v_consents))
    FROM public.business_rightsholder_verification_attempts WHERE verification_id = v.id;
  UPDATE public.business_rightsholder_verifications SET status = 'submitted', submitted_at = clock_timestamp(),
    updated_at = clock_timestamp() WHERE id = v.id;
END;
$$;

REVOKE ALL ON FUNCTION public.business_onboarding_provider_error(text,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.author_business_verification_draft_v2(uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.author_business_verification_submit_v2(uuid,uuid[],boolean,boolean,text,text,inet,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.author_business_verification_draft_v2(uuid,uuid,text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.author_business_verification_submit_v2(uuid,uuid[],boolean,boolean,text,text,inet,text) TO authenticated;
COMMENT ON FUNCTION public.business_onboarding_provider_error(text,text,text,jsonb) IS 'audiolad:business-onboarding';
COMMENT ON FUNCTION public.author_business_verification_draft_v2(uuid,uuid,text,text,text,text,jsonb) IS 'audiolad:business-onboarding';
COMMENT ON FUNCTION public.author_business_verification_submit_v2(uuid,uuid[],boolean,boolean,text,text,inet,text) IS 'audiolad:business-onboarding';
COMMIT;
