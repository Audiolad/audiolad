-- Disposable CI cleanup for the temporary historical COMMENT identity fixture.

DO $$
BEGIN
  IF to_regprocedure('public.update_personal_material_draft(uuid,text,text,date,text,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'real ten-argument update_personal_material_draft is absent';
  END IF;
  IF to_regprocedure('public.update_personal_material_draft(uuid,text,text,date,text,text,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'temporary eleven-argument update_personal_material_draft is absent';
  END IF;
END
$$;

DROP FUNCTION public.update_personal_material_draft(
  uuid, text, text, date, text, text, text, text, text, text, text
);

DO $$
BEGIN
  IF to_regprocedure('public.update_personal_material_draft(uuid,text,text,date,text,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'real ten-argument update_personal_material_draft was removed';
  END IF;
  IF to_regprocedure('public.update_personal_material_draft(uuid,text,text,date,text,text,text,text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'temporary eleven-argument update_personal_material_draft remains';
  END IF;
END
$$;
