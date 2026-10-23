-- Product, track and gallery images are set only by the server.
--
-- Cover and gallery image columns are written by the author routes after the
-- 1:1 image check (service_role). Direct writes to these columns by the
-- `authenticated` / `anon` roles are refused for every product state.
-- SECURITY DEFINER functions and service_role keep working unchanged.
--
-- Also: practice-covers gallery uploads move to the server, so the
-- authenticated gallery INSERT policy is dropped, and the gallery DELETE
-- policy gains the '..' path check.
--
-- Idempotent, forward-only, no data changes.
-- Rollback notes: docs/security/cover-columns-server-only.md

CREATE OR REPLACE FUNCTION public.guard_cover_columns_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cover_url IS NOT NULL OR NEW.cover_image IS NOT NULL THEN
      RAISE EXCEPTION 'cover_requires_server'
        USING ERRCODE = '42501',
          DETAIL = 'Covers are set through the cover upload route.';
    END IF;
  ELSIF NEW.cover_url IS DISTINCT FROM OLD.cover_url
     OR NEW.cover_image IS DISTINCT FROM OLD.cover_image THEN
    RAISE EXCEPTION 'cover_requires_server'
      USING ERRCODE = '42501',
        DETAIL = 'Covers are set through the cover upload route.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_cover_columns_server_only() IS
  'Refuses direct cover_url / cover_image writes by authenticated/anon; covers are set by the server after the 1:1 check.';

CREATE OR REPLACE FUNCTION public.guard_gallery_slide_image_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.image_url IS DISTINCT FROM OLD.image_url
     OR NEW.image_manifest IS DISTINCT FROM OLD.image_manifest
     OR NEW.publication_id IS DISTINCT FROM OLD.publication_id THEN
    RAISE EXCEPTION 'gallery_image_requires_server'
      USING ERRCODE = '42501',
        DETAIL = 'Gallery images are set through the gallery upload route.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_gallery_slide_image_server_only() IS
  'Refuses direct gallery slide inserts and image / publication changes by authenticated/anon; position and alt stay editable.';

REVOKE ALL ON FUNCTION public.guard_cover_columns_server_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_gallery_slide_image_server_only() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_practices_cover_server_only_trigger ON public.practices;
CREATE TRIGGER guard_practices_cover_server_only_trigger
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_cover_columns_server_only();

DROP TRIGGER IF EXISTS guard_audio_items_cover_server_only_trigger ON public.audio_items;
CREATE TRIGGER guard_audio_items_cover_server_only_trigger
  BEFORE INSERT OR UPDATE ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_cover_columns_server_only();

DROP TRIGGER IF EXISTS guard_gallery_slides_image_server_only_trigger ON public.publication_gallery_slides;
CREATE TRIGGER guard_gallery_slides_image_server_only_trigger
  BEFORE INSERT OR UPDATE ON public.publication_gallery_slides
  FOR EACH ROW EXECUTE FUNCTION public.guard_gallery_slide_image_server_only();

-- Storage: gallery objects are uploaded by the server; authenticated keeps a
-- narrow DELETE for its own gallery objects (with the '..' check).
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not found; skipping practice-covers gallery policies';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Author members can upload practice gallery images" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Author members can delete practice gallery images" ON storage.objects';

  EXECUTE $policy$
    CREATE POLICY "Author members can delete practice gallery images"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'practice-covers'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND split_part(name, '/', 3) = 'gallery'
        AND split_part(name, '/', 4) <> ''
        AND position('..' in name) = 0
        AND EXISTS (
          SELECT 1
          FROM public.practices pr
          JOIN public.author_members am ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      )
  $policy$;
END;
$$;
