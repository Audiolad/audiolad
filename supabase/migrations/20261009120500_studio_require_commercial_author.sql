-- Gate NEW Studio music acquisition on source author commercial_active / commercial.
-- Does not UPDATE practices, entitlements, or orders. Existing entitlements stay usable
-- via can_use_music_in_studio (unchanged).

CREATE OR REPLACE FUNCTION public.can_acquire_studio_music(
  p_practice public.practices,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access_status text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_practice.id IS NULL OR p_practice.deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF p_practice.status IS DISTINCT FROM 'published' THEN
    RETURN false;
  END IF;

  IF NOT public.is_studio_music_publication(p_practice) THEN
    RETURN false;
  END IF;

  IF p_practice.music_usage_permission IS DISTINCT FROM 'platform_reuse_allowed' THEN
    RETURN false;
  END IF;

  IF NOT public.viewer_can_commercially_access_practice(p_practice, p_user_id) THEN
    RETURN false;
  END IF;

  -- Source author must be commercial_active (or legacy commercial synonym).
  SELECT a.access_status
  INTO v_access_status
  FROM public.authors AS a
  WHERE a.id = p_practice.author_id;

  IF v_access_status IS DISTINCT FROM 'commercial_active'
     AND v_access_status IS DISTINCT FROM 'commercial' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.can_acquire_studio_music(public.practices, uuid) IS
  'audiolad:studio-music-acquire:v2; new grant gate. Requires published music/release + platform_reuse_allowed + commercial visibility + source author commercial_active/commercial. Does not inspect existing entitlements.';
