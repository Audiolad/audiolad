-- Rollback for 20270107120000_business_owner_self_moderation.sql (8d9cd0af P0).
-- Effect: the platform owner can again NOT moderate his own author spaces (strict self-moderation ban).
-- Function-only: restores both moderation RPCs from 20270101120000 verbatim and drops the helper.
-- No data is touched (the forward migration creates no rows; audit/suspension rows written meanwhile stay).
BEGIN;

CREATE OR REPLACE FUNCTION public.moderator_business_verification_action(
  p_verification_id uuid, p_action text, p_reason text, p_rightsholder_id uuid DEFAULT NULL,
  p_new_display_name text DEFAULT NULL, p_new_entity_type text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.business_rightsholder_verifications%ROWTYPE; v_owner uuid; v_next text; v_rightsholder uuid;
BEGIN
  IF NOT public.business_onboarding_is_moderator() THEN RAISE EXCEPTION 'business_moderator_required' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)),0) = 0 THEN RAISE EXCEPTION 'business_moderation_reason_required'; END IF;
  SELECT owner_user_id INTO v_owner FROM public.business_rightsholder_verifications WHERE id = p_verification_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'business_verification_not_found'; END IF;
  IF v_owner = auth.uid() THEN RAISE EXCEPTION 'business_self_moderation_forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.business_rightsholder_accounts WHERE owner_user_id = v_owner FOR UPDATE;
  SELECT * INTO v FROM public.business_rightsholder_verifications WHERE id = p_verification_id FOR UPDATE;
  v_next := CASE
    WHEN p_action = 'approve' AND v.status = 'submitted' THEN 'verified'
    WHEN p_action = 'request_info' AND v.status = 'submitted' THEN 'needs_info'
    WHEN p_action = 'reject' AND v.status IN ('submitted','needs_info') THEN 'rejected'
    WHEN p_action = 'reopen' AND v.status = 'rejected' THEN 'needs_info'
    WHEN p_action = 'restrict' AND v.status = 'verified' THEN 'restricted'
    WHEN p_action = 'revoke' AND v.status IN ('verified','restricted') THEN 'revoked'
    ELSE NULL END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'business_verification_transition_forbidden'; END IF;
  SELECT rightsholder_id INTO v_rightsholder FROM public.business_rightsholder_accounts WHERE owner_user_id = v_owner;
  IF p_action = 'approve' THEN
    IF p_rightsholder_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.music_rightsholders WHERE id = p_rightsholder_id AND status = 'active') THEN
        RAISE EXCEPTION 'business_rightsholder_invalid';
      END IF;
      v_rightsholder := p_rightsholder_id;
    ELSE
      INSERT INTO public.music_rightsholders(display_name,entity_type) VALUES(p_new_display_name,p_new_entity_type) RETURNING id INTO v_rightsholder;
    END IF;
    UPDATE public.business_rightsholder_accounts SET rightsholder_id = v_rightsholder WHERE owner_user_id = v_owner;
  ELSIF p_rightsholder_id IS NOT NULL OR p_new_display_name IS NOT NULL OR p_new_entity_type IS NOT NULL THEN
    RAISE EXCEPTION 'business_rightsholder_binding_approve_only';
  END IF;
  UPDATE public.business_rightsholder_verifications SET status = v_next, reason = p_reason,
    updated_at = clock_timestamp() WHERE id = v.id;
  INSERT INTO public.business_rightsholder_moderation_audit(verification_id,attempt_id,actor_user_id,action,reason,previous_status,next_status,rightsholder_id)
    VALUES(v.id,(SELECT id FROM public.business_rightsholder_verification_attempts
      WHERE verification_id = v.id ORDER BY attempt_no DESC LIMIT 1),
      auth.uid(),p_action,p_reason,v.status,v_next,v_rightsholder);
END;
$$;

CREATE OR REPLACE FUNCTION public.moderator_business_suspend_product(p_product_id uuid, p_audio_item_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_author uuid; v_id uuid;
BEGIN
  IF NOT public.business_onboarding_is_moderator() THEN RAISE EXCEPTION 'business_moderator_required' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)),0) = 0 THEN RAISE EXCEPTION 'business_moderation_reason_required'; END IF;
  SELECT author_id INTO v_author FROM public.practices WHERE id = p_product_id FOR UPDATE;
  IF v_author IS NULL THEN RAISE EXCEPTION 'business_product_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.author_members WHERE author_id = v_author AND user_id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'business_self_moderation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_audio_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.audio_items WHERE id = p_audio_item_id AND practice_id = p_product_id) THEN
    RAISE EXCEPTION 'business_track_not_in_product';
  END IF;
  INSERT INTO public.business_onboarding_suspensions(product_id,audio_item_id,actor_user_id,reason)
    VALUES(p_product_id,p_audio_item_id,auth.uid(),p_reason) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.business_moderation_owner_self_allowed();

COMMIT;
