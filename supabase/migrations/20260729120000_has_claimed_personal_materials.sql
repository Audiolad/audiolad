-- Lightweight existence check for listener nav («Личные материалы»).
-- Same owner visibility as list_claimed_personal_materials / canOwnerAccessMaterial:
-- claimed_by_user_id = auth.uid() AND status <> 'deleted'.

CREATE OR REPLACE FUNCTION public.has_claimed_personal_materials()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.personal_materials AS pm
    WHERE pm.claimed_by_user_id = v_user_id
      AND pm.status <> 'deleted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_claimed_personal_materials() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_claimed_personal_materials() FROM anon;
GRANT EXECUTE ON FUNCTION public.has_claimed_personal_materials() TO authenticated;

COMMENT ON FUNCTION public.has_claimed_personal_materials() IS
  'audiolad:personal-material-owner-exists:v1; boolean EXISTS for listener nav; mirrors list_claimed filter';
