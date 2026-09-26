-- Author project / workspace names must be written in Russian Cyrillic.
-- Existing rows are left unchanged. Stored Latin names are not rewritten.
-- New inserts and updates that set authors.name go through one function.

CREATE OR REPLACE FUNCTION public.assert_author_project_name_cyrillic(p_name text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Literal letters. A locale-dependent character range would also match Cyrillic.
  IF coalesce(p_name, '') ~ '[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz]' THEN
    RAISE EXCEPTION 'invalid_project_name_latin: Используйте только русские буквы. Название проекта должно быть написано кириллицей.'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_author_project_name_cyrillic(text) IS
  'Rejects an author project or workspace name that contains Latin A-Z/a-z. Does not rename existing rows.';

REVOKE ALL ON FUNCTION public.assert_author_project_name_cyrillic(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.authors_enforce_cyrillic_project_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_author_project_name_cyrillic(NEW.name);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.authors_enforce_cyrillic_project_name() IS
  'Shared name gate for create_author_project, approve_author_application, provision_studio_author_workspace, and profile renames. Fires only when authors.name is inserted or assigned.';

REVOKE ALL ON FUNCTION public.authors_enforce_cyrillic_project_name() FROM PUBLIC;

DROP TRIGGER IF EXISTS authors_enforce_cyrillic_project_name ON public.authors;

CREATE TRIGGER authors_enforce_cyrillic_project_name
  BEFORE INSERT OR UPDATE OF name ON public.authors
  FOR EACH ROW
  EXECUTE FUNCTION public.authors_enforce_cyrillic_project_name();
