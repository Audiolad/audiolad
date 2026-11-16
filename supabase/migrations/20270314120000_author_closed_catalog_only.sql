-- Additive per-author flag: publish closed Business catalog albums from the author cabinet.
-- Default false leaves every existing author unchanged. Operators toggle it in admin.
-- This migration adds a nullable-safe boolean column and a column-change guard. It does not
-- write author rows except to backfill the new column to false.

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS closed_catalog_only boolean;

UPDATE public.authors
SET closed_catalog_only = false
WHERE closed_catalog_only IS NULL;

ALTER TABLE public.authors
  ALTER COLUMN closed_catalog_only SET DEFAULT false,
  ALTER COLUMN closed_catalog_only SET NOT NULL;

COMMENT ON COLUMN public.authors.closed_catalog_only IS
  'When true, this author publishes only to the closed AudioLad Business catalog from the author cabinet. Open-catalog fields (description, SEO, promotion step) stay hidden. Toggled by an operator in admin; never inferred from name or slug.';

-- Owner/editor members can UPDATE authors via "Author members can update own author profile".
-- The existing guard_authors_profile_mutations trigger does not restrict columns, so a member
-- could PATCH closed_catalog_only and bypass the admin toggle. Only service_role (auth.uid()
-- is null) and platform staff may change this column. Other profile fields stay writable.

CREATE OR REPLACE FUNCTION public.guard_authors_closed_catalog_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.closed_catalog_only IS NOT DISTINCT FROM OLD.closed_catalog_only THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR public.is_platform_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'closed_catalog_only_staff_only'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_authors_closed_catalog_only_trigger ON public.authors;
CREATE TRIGGER guard_authors_closed_catalog_only_trigger
  BEFORE UPDATE ON public.authors
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_authors_closed_catalog_only();

REVOKE ALL ON FUNCTION public.guard_authors_closed_catalog_only() FROM PUBLIC;
