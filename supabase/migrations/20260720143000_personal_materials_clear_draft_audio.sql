-- Clear draft audio metadata for personal materials (author API).
-- Storage object removal is handled server-side before/after this RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.clear_personal_material_draft_audio(
  p_material_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, auth.uid());

  IF v_material.status <> 'draft' THEN
    RAISE EXCEPTION 'material_not_editable'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    audio_path = NULL,
    audio_original_filename = NULL,
    audio_mime_type = NULL,
    audio_size_bytes = NULL,
    duration_seconds = NULL,
    updated_at = now()
  WHERE pm.id = p_material_id;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_personal_material_draft_audio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_personal_material_draft_audio(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_personal_material_draft_audio(uuid) TO authenticated;

COMMENT ON FUNCTION public.clear_personal_material_draft_audio(uuid) IS
  'audiolad:personal-material-clear-draft-audio:v1; draft only; storage cleanup is server-side';

COMMIT;
