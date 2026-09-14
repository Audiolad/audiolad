-- FREE Studio music acquisition must not require current source-author terms.
-- Paid Studio checkout (create_studio_music_order) keeps the author-terms gate.
-- Eligibility (published, platform_reuse_allowed, Studio free pricing, etc.)
-- remains enforced inside acquire_free_studio_music_legal_legacy.

CREATE OR REPLACE FUNCTION public.acquire_free_studio_music(p_practice_id uuid)
RETURNS TABLE (
  entitlement_id uuid, practice_id uuid, grant_source text, order_id uuid,
  inserted boolean, granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.acquire_free_studio_music_legal_legacy(p_practice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_free_studio_music(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_free_studio_music(uuid) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('public', 'public.acquire_free_studio_music_legal_legacy(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.acquire_free_studio_music_legal_legacy(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.acquire_free_studio_music_legal_legacy(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy acquire_free_studio_music must not be executable';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.acquire_free_studio_music(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'acquire_free_studio_music must remain executable for authenticated';
  END IF;
END;
$$;
