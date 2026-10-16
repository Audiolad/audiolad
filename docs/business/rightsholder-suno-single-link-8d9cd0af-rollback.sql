-- Rollback for 20270103120000_business_rightsholder_suno_single_link (8d9cd0af).
-- Restores the previous helper (Suno requires non-empty provider_details.generation_refs). No data change.
-- NOTE: restoring the rule while the client no longer sends generation_refs would block Suno drafts —
-- roll back the code (redeploy previous release) together with this SQL.
BEGIN;

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

-- Ledger: if your runner records versions, remove 20270103120000 from the ledger manually (separate approval).
COMMIT;
