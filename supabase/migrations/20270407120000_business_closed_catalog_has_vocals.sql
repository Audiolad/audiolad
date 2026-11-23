-- t1660u: manual «С вокалом» label on closed-catalog albums.
-- Approved by the operator 23.11.2026, with a production backup before deploy.
-- DEFAULT false is the backfill for existing albums and tracks. No UPDATE of row data.
-- Independent of the music analyzer and of music_passport vocal_role.
--
-- Rollback (only with a separate operator OK, after a backup):
--   supabase/rollbacks/20270407120000_business_closed_catalog_has_vocals.rollback.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.practices
  ADD COLUMN business_has_vocals boolean NOT NULL DEFAULT false;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_business_has_vocals_closed_check
  CHECK (business_has_vocals = false OR business_only = true);

COMMENT ON COLUMN public.practices.business_has_vocals IS
  'Ручная метка закрытого каталога «С вокалом». Не зависит от анализатора. Имеет смысл только при business_only.';

ALTER TABLE public.audio_items
  ADD COLUMN business_has_vocals boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.audio_items.business_has_vocals IS
  'Копия метки альбома «С вокалом». Синхронизируется триггером, клиентом не задаётся.';

CREATE FUNCTION public.sync_audio_item_business_has_vocals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_flag boolean;
BEGIN
  IF NEW.practice_id IS NULL THEN
    NEW.business_has_vocals := false;
    RETURN NEW;
  END IF;
  -- Serialize with a concurrent album-flag toggle so a new track cannot commit a stale copy.
  SELECT CASE WHEN business_only THEN business_has_vocals ELSE false END
    INTO v_flag
    FROM public.practices
   WHERE id = NEW.practice_id
   FOR SHARE;
  NEW.business_has_vocals := coalesce(v_flag, false);
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_audio_item_business_has_vocals_trigger
  BEFORE INSERT OR UPDATE OF practice_id, business_has_vocals
  ON public.audio_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_audio_item_business_has_vocals();

CREATE FUNCTION public.propagate_practice_business_has_vocals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_flag boolean;
BEGIN
  v_flag := CASE WHEN NEW.business_only THEN NEW.business_has_vocals ELSE false END;
  IF TG_OP = 'UPDATE'
     AND OLD.business_has_vocals IS NOT DISTINCT FROM NEW.business_has_vocals
     AND OLD.business_only IS NOT DISTINCT FROM NEW.business_only THEN
    RETURN NEW;
  END IF;
  UPDATE public.audio_items
     SET business_has_vocals = v_flag
   WHERE practice_id = NEW.id
     AND business_has_vocals IS DISTINCT FROM v_flag;
  RETURN NEW;
END;
$$;

CREATE TRIGGER propagate_practice_business_has_vocals_trigger
  AFTER INSERT OR UPDATE OF business_has_vocals, business_only
  ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_practice_business_has_vocals();

CREATE FUNCTION public.guard_practice_business_has_vocals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller text := coalesce(nullif(current_setting('role', true), 'none'), session_user);
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.business_has_vocals IS DISTINCT FROM NEW.business_has_vocals THEN
    IF v_caller NOT IN ('service_role', 'postgres')
       AND NOT coalesce(public.has_platform_permission(auth.uid(), 'admin_panel.access'), false) THEN
      RAISE EXCEPTION 'business_has_vocals_requires_admin' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_practice_business_has_vocals_trigger
  BEFORE UPDATE OF business_has_vocals
  ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_practice_business_has_vocals();

DROP FUNCTION IF EXISTS public.admin_create_business_album(uuid, text);

CREATE FUNCTION public.admin_create_business_album(
  p_author_id uuid,
  p_title text,
  p_has_vocals boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE album uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'admin_panel.access') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.author_members
    WHERE author_id = p_author_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'author_not_manageable' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL OR char_length(p_title) > 300 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.practices (
    id, author_id, title, slug, status, price, is_free, currency, product_kind,
    publication_class, music_usage_permission, format, business_only,
    catalog_visibility, is_catalog_listed, business_has_vocals
  ) VALUES (
    album, p_author_id, btrim(p_title), 'business-' || album::text, 'draft', 0, true, 'RUB', 'music',
    'release', 'listen_only', 'Музыка', true,
    'selected_users', false, coalesce(p_has_vocals, false)
  );
  RETURN album;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_business_album(uuid, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_business_album(uuid, text, boolean) TO authenticated;

CREATE FUNCTION public.admin_set_business_album_has_vocals(
  p_practice_id uuid,
  p_has_vocals boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'admin_panel.access') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_practice_id IS NULL OR p_has_vocals IS NULL THEN
    RAISE EXCEPTION 'invalid_album' USING ERRCODE = '22023';
  END IF;
  UPDATE public.practices
     SET business_has_vocals = p_has_vocals
   WHERE id = p_practice_id
     AND business_only
     AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'album_not_found' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_business_album_has_vocals(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_business_album_has_vocals(uuid, boolean) TO authenticated;

COMMIT;
