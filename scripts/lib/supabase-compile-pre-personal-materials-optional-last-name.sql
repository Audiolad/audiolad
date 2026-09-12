-- Disposable CI fixture for 20260721103000_personal_materials_optional_last_name.
-- This models that migration's mistaken COMMENT identity, not production seed
-- data: the migration defines the real ten-argument update function but comments
-- an eleven-argument overload that did not exist in migration history.

DO $$
BEGIN
  IF to_regprocedure('public.update_personal_material_draft(uuid,text,text,date,text,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'expected ten-argument update_personal_material_draft is absent';
  END IF;
  IF to_regprocedure('public.update_personal_material_draft(uuid,text,text,date,text,text,text,text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'mistaken eleven-argument update_personal_material_draft already exists';
  END IF;
END
$$;

CREATE FUNCTION public.update_personal_material_draft(
  uuid, text, text, date, text, text, text, text, text, text, text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;
