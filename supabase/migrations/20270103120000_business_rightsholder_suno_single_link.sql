-- audiolad:business-onboarding (8d9cd0af) — Suno: one track link is enough (Sergey 2026-10-16 16:23 MSK).
-- FUNCTION-ONLY: CREATE OR REPLACE business_onboarding_provider_error without the
-- 'business_suno_generation_refs_required' rule. draft_v2/submit_v2 call this helper, so they pick it up
-- unchanged. 'generation_refs' stays an ALLOWED (optional) key so existing rows/snapshots remain valid.
-- No table, constraint (business_rv_suno_link_required unchanged) or data changes.
-- Rollback: docs/business/rightsholder-suno-single-link-8d9cd0af-rollback.sql
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

COMMIT;
