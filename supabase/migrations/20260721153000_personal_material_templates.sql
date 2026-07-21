-- Personal material templates (author-only reusable field sets).

CREATE TABLE IF NOT EXISTS public.personal_material_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  internal_name text NOT NULL,
  title text NULL,
  description text NULL,
  personal_recommendation text NULL,
  return_url text NULL,
  return_button_label text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_material_templates_internal_name_not_blank_check
    CHECK (btrim(internal_name) <> ''),
  CONSTRAINT personal_material_templates_internal_name_length_check
    CHECK (char_length(internal_name) <= 120),
  CONSTRAINT personal_material_templates_title_length_check
    CHECK (title IS NULL OR char_length(title) <= 120),
  CONSTRAINT personal_material_templates_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT personal_material_templates_recommendation_length_check
    CHECK (personal_recommendation IS NULL OR char_length(personal_recommendation) <= 2000),
  CONSTRAINT personal_material_templates_return_url_length_check
    CHECK (return_url IS NULL OR char_length(return_url) <= 2000),
  CONSTRAINT personal_material_templates_return_button_label_length_check
    CHECK (return_button_label IS NULL OR char_length(return_button_label) <= 120)
);

CREATE INDEX IF NOT EXISTS personal_material_templates_author_updated_idx
  ON public.personal_material_templates (author_id, updated_at DESC);

ALTER TABLE public.personal_material_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_material_templates_select_member ON public.personal_material_templates;
CREATE POLICY personal_material_templates_select_member
  ON public.personal_material_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = personal_material_templates.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS personal_material_templates_insert_member ON public.personal_material_templates;
CREATE POLICY personal_material_templates_insert_member
  ON public.personal_material_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = personal_material_templates.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS personal_material_templates_update_member ON public.personal_material_templates;
CREATE POLICY personal_material_templates_update_member
  ON public.personal_material_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = personal_material_templates.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = personal_material_templates.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS personal_material_templates_delete_member ON public.personal_material_templates;
CREATE POLICY personal_material_templates_delete_member
  ON public.personal_material_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = personal_material_templates.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_material_templates TO authenticated;

COMMENT ON TABLE public.personal_material_templates IS
  'audiolad:personal-material-templates:v1; author-only reusable field sets; no guest tokens';
