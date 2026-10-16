-- audiolad:business-onboarding; expand-only. Account verification is NOT catalog rights.
-- No approved legal document seeds. No changes to grants, eligibility or player manifests.
BEGIN;

CREATE TABLE IF NOT EXISTS public.business_program_document_versions (
  document_key text NOT NULL CHECK (document_key IN ('business_program_terms', 'business_music_rights_declaration')),
  version text NOT NULL CHECK (length(btrim(version)) BETWEEN 1 AND 100),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  content_text text,
  content_url text CHECK (content_url ~ '^https://[^[:space:]]+$'),
  published_at timestamptz NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  PRIMARY KEY (document_key, version),
  UNIQUE (document_key, version, content_hash),
  CHECK (coalesce(length(btrim(content_text)),0) > 0 OR content_url IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS business_program_documents_current_uidx
  ON public.business_program_document_versions(document_key) WHERE is_current;

CREATE TABLE IF NOT EXISTS public.business_rightsholder_accounts (
  owner_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  rightsholder_id uuid REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.business_rightsholder_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.business_rightsholder_accounts(owner_user_id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  audio_item_id uuid NOT NULL,
  ai_service text NOT NULL CHECK (ai_service IN ('suno', 'musicgpt', 'other')),
  ai_service_other text,
  service_track_title text NOT NULL CHECK (length(btrim(service_track_title)) BETWEEN 1 AND 500),
  service_track_url text NOT NULL CHECK (length(service_track_url) <= 2048),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','needs_info','verified','rejected','restricted','revoked')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (ai_service <> 'other' OR coalesce(length(btrim(ai_service_other)),0) > 0),
  CHECK (service_track_url ~ '^https://[^[:space:]@]+$'),
  CHECK (ai_service <> 'suno' OR service_track_url ~ '^https://suno[.]com/(s|song)/[A-Za-z0-9_-]+/?$')
);
-- Revocation/restriction cannot be bypassed by creating another application.
CREATE UNIQUE INDEX IF NOT EXISTS business_rightsholder_verifications_active_uidx
  ON public.business_rightsholder_verifications(owner_user_id) WHERE status <> 'rejected';

CREATE TABLE IF NOT EXISTS public.business_verification_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.business_rightsholder_verifications(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('generation', 'paid_period')),
  object_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS business_verification_evidence_verification_idx
  ON public.business_verification_evidence(verification_id);

CREATE TABLE IF NOT EXISTS public.business_legal_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES public.business_rightsholder_accounts(owner_user_id) ON DELETE RESTRICT,
  rightsholder_id uuid REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  document_key text NOT NULL,
  version text NOT NULL,
  content_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acceptance_text text NOT NULL,
  ip_address inet,
  user_agent text CHECK (length(user_agent) <= 512),
  context text NOT NULL CHECK (context IN ('verification','product_optin')),
  verification_id uuid NOT NULL REFERENCES public.business_rightsholder_verifications(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  evidence_snapshot jsonb NOT NULL CHECK (jsonb_typeof(evidence_snapshot) = 'array'),
  track_snapshot jsonb NOT NULL CHECK (jsonb_typeof(track_snapshot) = 'array'),
  FOREIGN KEY (document_key, version, content_hash)
    REFERENCES public.business_program_document_versions(document_key, version, content_hash) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS business_legal_consents_owner_idx ON public.business_legal_consents(owner_user_id);

CREATE TABLE IF NOT EXISTS public.business_product_optins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.business_rightsholder_accounts(owner_user_id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  verification_id uuid NOT NULL REFERENCES public.business_rightsholder_verifications(id) ON DELETE RESTRICT,
  terms_consent_id uuid NOT NULL REFERENCES public.business_legal_consents(id) ON DELETE RESTRICT,
  rights_consent_id uuid NOT NULL REFERENCES public.business_legal_consents(id) ON DELETE RESTRICT,
  track_snapshot jsonb NOT NULL CHECK (jsonb_typeof(track_snapshot) = 'array'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Suspension is scoped to a product or a track and never mutates account verification.
CREATE TABLE IF NOT EXISTS public.business_onboarding_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  audio_item_id uuid,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.business_rightsholder_moderation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.business_rightsholder_verifications(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  previous_status text NOT NULL,
  next_status text NOT NULL,
  rightsholder_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION public.business_onboarding_is_moderator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.platform_user_roles WHERE user_id = auth.uid() AND role_code IN ('owner','admin'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin'))
  );
$$;

-- Legal history survives deletion of catalog rows: product/track IDs above are historical references.
CREATE OR REPLACE FUNCTION public.business_onboarding_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'business_onboarding_history_immutable' USING ERRCODE = '55000';
END;
$$;
CREATE OR REPLACE FUNCTION public.business_onboarding_document_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- Only is_current can change. Never rewrite bytes/hash/URL/version after publication.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'business_program_document_immutable' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - 'is_current') IS DISTINCT FROM (to_jsonb(OLD) - 'is_current') THEN
    RAISE EXCEPTION 'business_program_document_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

-- Internal helper: locks catalog and actual owner membership, rather than editor/support mutation access.
CREATE OR REPLACE FUNCTION public.business_onboarding_product(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_product public.practices%ROWTYPE; v_tracks jsonb;
BEGIN
  SELECT * INTO v_product FROM public.practices WHERE id = p_product_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business_product_not_owned'; END IF;
  PERFORM 1 FROM public.author_members WHERE author_id = v_product.author_id
    AND user_id = auth.uid() AND role = 'owner' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business_product_not_owned' USING ERRCODE = '42501'; END IF;
  IF v_product.status IS DISTINCT FROM 'published' OR v_product.product_kind IS DISTINCT FROM 'music' THEN
    RAISE EXCEPTION 'business_product_not_published';
  END IF;
  -- Include the complete composition; do not silently omit unpublished tracks.
  PERFORM 1 FROM public.audio_items WHERE practice_id = p_product_id ORDER BY id FOR SHARE;
  IF EXISTS (SELECT 1 FROM public.audio_items WHERE practice_id = p_product_id AND status IS DISTINCT FROM 'published') THEN
    RAISE EXCEPTION 'business_track_not_published';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('audio_item_id', id, 'title', title,
    'position', position, 'music_track_code', music_track_code) ORDER BY position, id)
    INTO v_tracks FROM public.audio_items WHERE practice_id = p_product_id;
  IF v_tracks IS NULL THEN RAISE EXCEPTION 'business_product_has_no_tracks'; END IF;
  RETURN v_tracks;
END;
$$;

CREATE OR REPLACE FUNCTION public.author_business_verification_draft(
  p_product_id uuid, p_audio_item_id uuid, p_ai_service text,
  p_ai_service_other text, p_service_track_title text, p_service_track_url text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
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
  IF EXISTS (SELECT 1 FROM public.business_rightsholder_verifications WHERE owner_user_id = auth.uid() AND status <> 'rejected') THEN
    RAISE EXCEPTION 'business_verification_already_active';
  END IF;
  INSERT INTO public.business_rightsholder_verifications(owner_user_id,product_id,audio_item_id,ai_service,
    ai_service_other,service_track_title,service_track_url)
    VALUES(auth.uid(),p_product_id,p_audio_item_id,p_ai_service,p_ai_service_other,p_service_track_title,p_service_track_url)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Reserve an immutable object name before uploading. No overwrite/delete policy exists.
CREATE OR REPLACE FUNCTION public.author_business_evidence_reserve(
  p_verification_id uuid, p_kind text, p_mime_type text, p_size_bytes bigint, p_sha256 text
)
RETURNS public.business_verification_evidence LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.business_rightsholder_verifications%ROWTYPE; e public.business_verification_evidence%ROWTYPE; v_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v FROM public.business_rightsholder_verifications WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND OR v.owner_user_id IS DISTINCT FROM auth.uid() OR v.status NOT IN ('draft','needs_info') THEN
    RAISE EXCEPTION 'business_evidence_upload_forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.business_verification_evidence(id, verification_id, kind, object_path, mime_type, size_bytes, sha256)
    VALUES(v_id,v.id,p_kind,auth.uid()::text || '/' || v.id::text || '/' || v_id::text,p_mime_type,p_size_bytes,p_sha256)
    RETURNING * INTO e;
  RETURN e;
END;
$$;

-- Internal helper records BOTH independent explicit UI actions against the versions the user saw.
CREATE OR REPLACE FUNCTION public.business_onboarding_consents(
  p_verification_id uuid, p_product_id uuid, p_context text, p_tracks jsonb, p_evidence jsonb,
  p_accept_terms boolean, p_confirm_rights boolean, p_terms_version text, p_rights_version text,
  p_ip_address inet, p_user_agent text
)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d public.business_program_document_versions%ROWTYPE; ids uuid[] := ARRAY[]::uuid[]; v_id uuid; v_rightsholder uuid;
BEGIN
  -- Both mandatory documents must exist and be effective now. No legal seed in this migration.
  PERFORM 1 FROM public.business_program_document_versions WHERE is_current ORDER BY document_key FOR SHARE;
  IF (SELECT count(*) FROM public.business_program_document_versions WHERE is_current AND published_at <= clock_timestamp()) <> 2 THEN
    RAISE EXCEPTION 'business_program_documents_not_published';
  END IF;
  IF p_accept_terms IS DISTINCT FROM true OR p_confirm_rights IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'business_program_consents_required';
  END IF;
  SELECT rightsholder_id INTO v_rightsholder FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid();
  FOR d IN SELECT * FROM public.business_program_document_versions WHERE is_current ORDER BY document_key LOOP
    IF d.version IS DISTINCT FROM (CASE d.document_key WHEN 'business_program_terms' THEN p_terms_version ELSE p_rights_version END) THEN
      RAISE EXCEPTION 'business_program_document_version_changed';
    END IF;
    INSERT INTO public.business_legal_consents(user_id,owner_user_id,rightsholder_id,document_key,version,content_hash,
      acceptance_text,ip_address,user_agent,context,verification_id,product_id,evidence_snapshot,track_snapshot)
    VALUES(auth.uid(),auth.uid(),v_rightsholder,d.document_key,d.version,d.content_hash,
      CASE d.document_key WHEN 'business_program_terms' THEN
        'Я ознакомился и принимаю условия участия в программе „АудиоЛад Бизнес“'
      ELSE 'Подтверждаю, что обладаю достаточными правами и разрешениями на музыку, которую подключаю к программе, и обязуюсь предоставить подтверждающие материалы по запросу' END,
      p_ip_address,p_user_agent,p_context,p_verification_id,p_product_id,p_evidence,p_tracks) RETURNING id INTO v_id;
    ids := array_append(ids,v_id);
  END LOOP;
  RETURN ids; -- alphabetic document_key order: music rights, then terms
END;
$$;

CREATE OR REPLACE FUNCTION public.author_business_verification_submit(
  p_verification_id uuid, p_evidence_ids uuid[], p_accept_terms boolean, p_confirm_rights boolean,
  p_terms_version text, p_rights_version text, p_ip_address inet DEFAULT NULL, p_user_agent text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.business_rightsholder_verifications%ROWTYPE; v_tracks jsonb; v_evidence jsonb;
BEGIN
  -- Account lock serializes submission, moderator actions and opt-in.
  PERFORM 1 FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid() FOR UPDATE;
  SELECT * INTO v FROM public.business_rightsholder_verifications WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND OR v.owner_user_id IS DISTINCT FROM auth.uid() OR v.status NOT IN ('draft','needs_info') THEN
    RAISE EXCEPTION 'business_verification_submit_forbidden' USING ERRCODE = '42501';
  END IF;
  v_tracks := public.business_onboarding_product(v.product_id);
  IF NOT EXISTS (SELECT 1 FROM public.audio_items WHERE id = v.audio_item_id AND practice_id = v.product_id AND status = 'published') THEN
    RAISE EXCEPTION 'business_track_not_in_product';
  END IF;
  IF cardinality(p_evidence_ids) IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'business_two_evidence_files_required'; END IF;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY e.kind) INTO v_evidence
    FROM public.business_verification_evidence e
    JOIN storage.objects o ON o.bucket_id = 'business-rightsholder-evidence' AND o.name = e.object_path
    WHERE e.verification_id = v.id AND e.id = ANY(p_evidence_ids)
      AND o.metadata->>'mimetype' = e.mime_type AND (o.metadata->>'size')::bigint = e.size_bytes;
  IF jsonb_array_length(v_evidence) IS DISTINCT FROM 2 OR
    (SELECT count(DISTINCT e.kind) FROM public.business_verification_evidence e WHERE e.id = ANY(p_evidence_ids) AND e.verification_id = v.id) <> 2 THEN
    RAISE EXCEPTION 'business_two_evidence_files_required';
  END IF;
  PERFORM public.business_onboarding_consents(v.id,v.product_id,'verification',v_tracks,v_evidence,
    p_accept_terms,p_confirm_rights,p_terms_version,p_rights_version,p_ip_address,p_user_agent);
  UPDATE public.business_rightsholder_verifications SET status = 'submitted', submitted_at = clock_timestamp(),
    updated_at = clock_timestamp() WHERE id = v.id;
END;
$$;

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
  INSERT INTO public.business_rightsholder_moderation_audit(verification_id,actor_user_id,action,reason,previous_status,next_status,rightsholder_id)
    VALUES(v.id,auth.uid(),p_action,p_reason,v.status,v_next,v_rightsholder);
END;
$$;

CREATE OR REPLACE FUNCTION public.author_business_product_optin(
  p_product_ids uuid[], p_accept_terms boolean, p_confirm_rights boolean,
  p_terms_version text, p_rights_version text, p_ip_address inet DEFAULT NULL, p_user_agent text DEFAULT NULL
)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.business_rightsholder_verifications%ROWTYPE; pid uuid; tracks jsonb; evidence jsonb; consents uuid[];
  ids uuid[] := ARRAY[]::uuid[]; v_id uuid;
BEGIN
  PERFORM 1 FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid() FOR UPDATE;
  SELECT * INTO v FROM public.business_rightsholder_verifications WHERE owner_user_id = auth.uid() AND status = 'verified' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business_account_not_verified' USING ERRCODE = '42501'; END IF;
  IF coalesce(cardinality(p_product_ids),0) NOT BETWEEN 1 AND 100 OR array_position(p_product_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'business_product_selection_invalid';
  END IF;
  SELECT evidence_snapshot INTO evidence FROM public.business_legal_consents WHERE verification_id = v.id AND context = 'verification'
    ORDER BY accepted_at DESC, id LIMIT 1;
  FOR pid IN SELECT DISTINCT x FROM unnest(p_product_ids) x ORDER BY x LOOP
    tracks := public.business_onboarding_product(pid);
    IF EXISTS (SELECT 1 FROM public.business_onboarding_suspensions s WHERE s.product_id = pid) THEN
      RAISE EXCEPTION 'business_product_or_track_suspended';
    END IF;
    consents := public.business_onboarding_consents(v.id,pid,'product_optin',tracks,evidence,
      p_accept_terms,p_confirm_rights,p_terms_version,p_rights_version,p_ip_address,p_user_agent);
    INSERT INTO public.business_product_optins(owner_user_id,product_id,verification_id,terms_consent_id,rights_consent_id,track_snapshot)
      VALUES(auth.uid(),pid,v.id,consents[2],consents[1],tracks) RETURNING id INTO v_id;
    ids := array_append(ids,v_id);
  END LOOP;
  RETURN ids;
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

-- A reserved path belongs to its applicant, including needs_info re-uploads as NEW objects.
CREATE OR REPLACE FUNCTION public.business_onboarding_storage_access(p_name text, p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid; v_status text;
BEGIN
  SELECT v.owner_user_id,v.status INTO v_owner,v_status FROM public.business_verification_evidence e
    JOIN public.business_rightsholder_verifications v ON v.id = e.verification_id WHERE e.object_path = p_name;
  RETURN coalesce(auth.uid() IS NOT NULL AND (
    (v_owner = auth.uid() AND (NOT p_write OR v_status IN ('draft','needs_info')))
    OR (NOT p_write AND v_owner IS NOT NULL AND public.business_onboarding_is_moderator())
  ), false);
END;
$$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('business-rightsholder-evidence','business-rightsholder-evidence',false,10485760,ARRAY['image/jpeg','image/png','application/pdf'])
  ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'business-rightsholder-evidence' AND NOT public
    AND file_size_limit = 10485760 AND allowed_mime_types = ARRAY['image/jpeg','image/png','application/pdf']) THEN
    RAISE EXCEPTION 'business_evidence_bucket_configuration_mismatch';
  END IF;
END $$;
DROP POLICY IF EXISTS business_onboarding_evidence_read ON storage.objects;
CREATE POLICY business_onboarding_evidence_read ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id = 'business-rightsholder-evidence' AND public.business_onboarding_storage_access(name,false));
DROP POLICY IF EXISTS business_onboarding_evidence_insert ON storage.objects;
CREATE POLICY business_onboarding_evidence_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id = 'business-rightsholder-evidence' AND public.business_onboarding_storage_access(name,true));

-- Restrictive policies also fence this bucket off from older permissive storage policies.
DROP POLICY IF EXISTS business_onboarding_evidence_read_fence ON storage.objects;
CREATE POLICY business_onboarding_evidence_read_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING(bucket_id <> 'business-rightsholder-evidence' OR public.business_onboarding_storage_access(name,false));
DROP POLICY IF EXISTS business_onboarding_evidence_insert_fence ON storage.objects;
CREATE POLICY business_onboarding_evidence_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK(bucket_id <> 'business-rightsholder-evidence' OR public.business_onboarding_storage_access(name,true));
DROP POLICY IF EXISTS business_onboarding_evidence_update_fence ON storage.objects;
CREATE POLICY business_onboarding_evidence_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING(bucket_id <> 'business-rightsholder-evidence') WITH CHECK(bucket_id <> 'business-rightsholder-evidence');
DROP POLICY IF EXISTS business_onboarding_evidence_delete_fence ON storage.objects;
CREATE POLICY business_onboarding_evidence_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING(bucket_id <> 'business-rightsholder-evidence');

-- Least privilege: clients SELECT via RLS, write only via explicitly granted RPCs.
DO $$
DECLARE t text; f record;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_program_document_versions','business_rightsholder_accounts',
    'business_rightsholder_verifications','business_verification_evidence','business_legal_consents',
    'business_product_optins','business_onboarding_suspensions','business_rightsholder_moderation_audit'] LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', t, 'audiolad:business-onboarding; account onboarding, never a rights grant or eligibility decision');
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS business_onboarding_read ON public.%I',t);
    IF t = 'business_program_document_versions' THEN
      EXECUTE format('CREATE POLICY business_onboarding_read ON public.%I FOR SELECT TO authenticated USING (published_at <= now())',t);
    ELSIF t IN ('business_rightsholder_accounts','business_rightsholder_verifications','business_legal_consents','business_product_optins') THEN
      EXECUTE format('CREATE POLICY business_onboarding_read ON public.%I FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR public.business_onboarding_is_moderator())',t);
    ELSIF t IN ('business_verification_evidence','business_rightsholder_moderation_audit') THEN
      EXECUTE format('CREATE POLICY business_onboarding_read ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.business_rightsholder_verifications v WHERE v.id = verification_id AND (v.owner_user_id = auth.uid() OR public.business_onboarding_is_moderator())))',t);
    ELSE
      EXECUTE format('CREATE POLICY business_onboarding_read ON public.%I FOR SELECT TO authenticated USING (public.business_onboarding_is_moderator())',t);
    END IF;
    IF t IN ('business_legal_consents','business_rightsholder_moderation_audit','business_verification_evidence','business_product_optins','business_onboarding_suspensions') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS business_onboarding_immutable ON public.%I',t);
      EXECUTE format('CREATE TRIGGER business_onboarding_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.business_onboarding_append_only()',t);
    END IF;
  END LOOP;
  -- Revoke default PUBLIC EXECUTE for every new helper and RPC, including service_role.
  FOR f IN SELECT oid::regprocedure AS signature, proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    AND (proname LIKE 'business_onboarding_%' OR proname IN ('author_business_verification_draft','author_business_evidence_reserve',
      'author_business_verification_submit','author_business_product_optin','moderator_business_verification_action','moderator_business_suspend_product')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.signature);
    EXECUTE format('COMMENT ON FUNCTION %s IS %L',f.signature,'audiolad:business-onboarding');
    IF f.proname IN ('business_onboarding_is_moderator','business_onboarding_storage_access','author_business_verification_draft',
      'author_business_evidence_reserve','author_business_verification_submit','author_business_product_optin',
      'moderator_business_verification_action','moderator_business_suspend_product') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.signature);
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.business_onboarding_storage_access(text,boolean) TO anon;
GRANT INSERT, UPDATE ON public.business_program_document_versions TO service_role;
DROP TRIGGER IF EXISTS business_onboarding_document_immutable ON public.business_program_document_versions;
CREATE TRIGGER business_onboarding_document_immutable BEFORE UPDATE OR DELETE ON public.business_program_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.business_onboarding_document_immutable();
COMMIT;
