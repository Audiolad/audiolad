-- Rollback for 20270407120000_business_closed_catalog_has_vocals.sql
-- Only with a separate operator OK, after a backup.

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.admin_set_business_album_has_vocals(uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_create_business_album(uuid, text, boolean);

CREATE FUNCTION public.admin_create_business_album(p_author_id uuid, p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE album uuid := gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(),'admin_panel.access') THEN
   RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.author_members WHERE author_id=p_author_id
   AND user_id=auth.uid() AND role IN ('owner','editor')) THEN
   RAISE EXCEPTION 'author_not_manageable' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_title),'') IS NULL OR char_length(p_title)>300 THEN
   RAISE EXCEPTION 'invalid_title' USING ERRCODE='22023'; END IF;
 INSERT INTO public.practices(id,author_id,title,slug,status,price,is_free,currency,product_kind,
   publication_class,music_usage_permission,format,business_only,catalog_visibility,is_catalog_listed)
 VALUES(album,p_author_id,btrim(p_title),'business-'||album::text,'draft',0,true,'RUB','music',
   'release','listen_only','Музыка',true,'selected_users',false);
 RETURN album;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_business_album(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_business_album(uuid,text) TO authenticated;

DROP TRIGGER IF EXISTS guard_practice_business_has_vocals_trigger ON public.practices;
DROP TRIGGER IF EXISTS propagate_practice_business_has_vocals_trigger ON public.practices;
DROP TRIGGER IF EXISTS sync_audio_item_business_has_vocals_trigger ON public.audio_items;
DROP FUNCTION IF EXISTS public.guard_practice_business_has_vocals();
DROP FUNCTION IF EXISTS public.propagate_practice_business_has_vocals();
DROP FUNCTION IF EXISTS public.sync_audio_item_business_has_vocals();

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_business_has_vocals_closed_check;
ALTER TABLE public.practices
  DROP COLUMN IF EXISTS business_has_vocals;
ALTER TABLE public.audio_items
  DROP COLUMN IF EXISTS business_has_vocals;

COMMIT;
