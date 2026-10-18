-- Rollback of 20270111120000_business_verification_draft_reuse.sql (task 8d9cd0af).
-- Restores the previous definitions: only 'rejected'/'needs_info' cases can be edited again.
-- Functions only, no data change. Apply manually in one transaction, then delete the ledger row
-- supabase_migrations.schema_migrations version '20270111120000' only if the code is rolled back too.
BEGIN;

CREATE OR REPLACE FUNCTION public.author_business_verification_draft(
  p_product_id uuid, p_audio_item_id uuid, p_ai_service text,
  p_ai_service_other text, p_service_track_title text, p_service_track_url text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.business_rightsholder_accounts(owner_user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid() FOR UPDATE;
  PERFORM public.business_onboarding_product(p_product_id);
  IF NOT EXISTS (SELECT 1 FROM public.audio_items WHERE id = p_audio_item_id AND practice_id = p_product_id AND status = 'published') THEN
    RAISE EXCEPTION 'business_track_not_in_product';
  END IF;
  IF p_ai_service IS NULL OR p_ai_service NOT IN ('suno','musicgpt','other')
    OR (p_ai_service = 'other' AND coalesce(length(btrim(p_ai_service_other)),0) = 0) THEN
    RAISE EXCEPTION 'business_ai_service_invalid';
  END IF;
  IF p_service_track_url IS NULL OR p_service_track_url !~ '^https://[^[:space:]@]+$'
    OR (p_ai_service = 'suno' AND p_service_track_url !~ '^https://suno[.]com/(s|song)/[A-Za-z0-9_-]+/?$') THEN
    RAISE EXCEPTION 'business_service_link_invalid';
  END IF;
  SELECT id, status INTO v_id, v_status FROM public.business_rightsholder_verifications
    WHERE owner_user_id = auth.uid() FOR UPDATE;
  IF FOUND THEN
    IF v_status NOT IN ('rejected','needs_info') THEN
      RAISE EXCEPTION 'business_verification_already_active';
    END IF;
    UPDATE public.business_rightsholder_verifications SET product_id = p_product_id,
      audio_item_id = p_audio_item_id, ai_service = p_ai_service, ai_service_other = p_ai_service_other,
      service_track_title = p_service_track_title, service_track_url = p_service_track_url,
      status = 'draft', updated_at = clock_timestamp() WHERE id = v_id;
    -- Keep the latest moderator reason readable; previous submissions remain untouched.
    RETURN v_id;
  END IF;
  INSERT INTO public.business_rightsholder_verifications(owner_user_id,product_id,audio_item_id,ai_service,
    ai_service_other,service_track_title,service_track_url)
    VALUES(auth.uid(),p_product_id,p_audio_item_id,p_ai_service,p_ai_service_other,p_service_track_title,p_service_track_url)
    RETURNING id INTO v_id;
  RETURN v_id;
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

COMMIT;
