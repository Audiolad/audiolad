-- Manual admission of human-selected, human-mastered Business music. No generation or publication.
BEGIN;
CREATE TABLE public.business_track_passports (
 audio_item_id uuid PRIMARY KEY REFERENCES public.audio_items(id) ON DELETE CASCADE,
 practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
 al_code text CHECK (al_code IS NULL OR al_code ~ '^AL-T-[A-Za-z0-9-]+$'),
 generator_tool text, generator_plan text, generated_at timestamptz, generation_ref text,
 terms_snapshot_ref text, human_contribution text CHECK (human_contribution IN ('none','human')),
 human_contribution_details text, source_sha256 text CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
 master_sha256 text CHECK (master_sha256 ~ '^[0-9a-f]{64}$'),
 stored_master_sha256 text CHECK (stored_master_sha256 ~ '^[0-9a-f]{64}$'),
 stored_master_asset_id uuid REFERENCES public.music_audio_assets(id) ON DELETE RESTRICT,
 stored_master_sha256_verified_at timestamptz,
 fingerprint_sha256 text CHECK (fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
 shazam_checked_at timestamptz, shazam_result text CHECK (shazam_result IN ('not_found','match')),
 acoustid_checked_at timestamptz, acoustid_result text CHECK (acoustid_result IN ('not_found','match')),
 never_published_checked_at timestamptz,
 evidence_inventory_sha256 text CHECK (evidence_inventory_sha256 ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','revoked')),
 approved_by uuid REFERENCES auth.users(id), approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), notes text,
 CONSTRAINT business_passport_approved_complete CHECK (status <> 'approved' OR (
   al_code IS NOT NULL AND nullif(btrim(generator_tool),'') IS NOT NULL
   AND nullif(btrim(generator_plan),'') IS NOT NULL AND generated_at IS NOT NULL
   AND nullif(btrim(generation_ref),'') IS NOT NULL AND nullif(btrim(terms_snapshot_ref),'') IS NOT NULL
   AND human_contribution IS NOT NULL AND (human_contribution <> 'human' OR nullif(btrim(human_contribution_details),'') IS NOT NULL)
   AND source_sha256 IS NOT NULL AND master_sha256 IS NOT NULL AND stored_master_sha256 IS NOT NULL
   AND master_sha256 = stored_master_sha256 AND stored_master_asset_id IS NOT NULL
   AND stored_master_sha256_verified_at IS NOT NULL AND fingerprint_sha256 IS NOT NULL
   AND shazam_checked_at IS NOT NULL AND shazam_result IS NOT NULL AND shazam_result = 'not_found'
   AND acoustid_checked_at IS NOT NULL AND acoustid_result IS NOT NULL AND acoustid_result = 'not_found'
   AND never_published_checked_at IS NOT NULL AND evidence_inventory_sha256 IS NOT NULL
   AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX business_passports_album_idx ON public.business_track_passports(practice_id);
ALTER TABLE public.business_track_passports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_track_passports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.business_track_passports TO service_role;

-- Verified hashes are never accepted by the draft RPC. Only the admin server's
-- streaming hash operation can call the service-only recording RPC below.
CREATE FUNCTION public.business_passport_missing(p public.business_track_passports)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(array_agg(key ORDER BY key), '{}'::text[]) FROM jsonb_each_text(to_jsonb(p))
 WHERE key = ANY(ARRAY['al_code','generator_tool','generator_plan','generated_at','generation_ref',
 'terms_snapshot_ref','human_contribution','source_sha256','master_sha256','stored_master_sha256',
 'stored_master_asset_id','stored_master_sha256_verified_at','fingerprint_sha256','shazam_checked_at',
 'shazam_result','acoustid_checked_at','acoustid_result','never_published_checked_at','evidence_inventory_sha256'])
 AND nullif(btrim(value),'') IS NULL
$$;
CREATE FUNCTION public.guard_business_track_passport()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.audio_items a JOIN public.practices p ON p.id=a.practice_id
   WHERE a.id=NEW.audio_item_id AND p.id=NEW.practice_id AND p.business_only AND p.product_kind='music') THEN
   RAISE EXCEPTION 'business_passport_album_required' USING ERRCODE='23514';
 END IF;
 IF NEW.status='approved' THEN
   IF cardinality(public.business_passport_missing(NEW)) > 0 THEN
     RAISE EXCEPTION 'passport_missing_fields: %', array_to_string(public.business_passport_missing(NEW), ',') USING ERRCODE='23514';
   END IF;
   IF NOT EXISTS (SELECT 1 FROM public.audio_items a JOIN public.music_audio_assets m
     ON m.id=a.desired_music_master_asset_id WHERE a.id=NEW.audio_item_id
     AND m.id=NEW.stored_master_asset_id AND m.audio_item_id=a.id AND m.asset_role='master'
     AND m.lifecycle_state='verified') THEN
     RAISE EXCEPTION 'passport_master_replaced' USING ERRCODE='23514';
   END IF;
 END IF;
 NEW.updated_at := clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER guard_business_track_passport BEFORE INSERT OR UPDATE ON public.business_track_passports
 FOR EACH ROW EXECUTE FUNCTION public.guard_business_track_passport();

CREATE FUNCTION public.business_track_passport_approved(p_audio_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.business_track_passports b JOIN public.audio_items a ON a.id=b.audio_item_id
 JOIN public.music_audio_assets m ON m.id=b.stored_master_asset_id
 WHERE b.audio_item_id=p_audio_item_id AND b.practice_id=a.practice_id AND b.status='approved'
 AND a.desired_music_master_asset_id=m.id AND m.audio_item_id=a.id AND m.asset_role='master'
 AND m.lifecycle_state='verified' AND b.master_sha256=b.stored_master_sha256)
$$;
CREATE FUNCTION public.admin_upsert_business_track_passport(p_audio_item_id uuid, p_fields jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.business_track_passports; fields jsonb; parent uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(),'admin_panel.access') THEN
   RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 SELECT practice_id INTO parent FROM public.audio_items WHERE id=p_audio_item_id FOR UPDATE;
 SELECT * INTO b FROM public.business_track_passports WHERE audio_item_id=p_audio_item_id FOR UPDATE;
 IF FOUND AND b.status <> 'draft' THEN RAISE EXCEPTION 'passport_draft_required' USING ERRCODE='55000'; END IF;
 SELECT coalesce(jsonb_object_agg(key, nullif(btrim(value),'')), '{}'::jsonb) INTO fields
 FROM jsonb_each_text(p_fields) WHERE key = ANY(ARRAY['al_code','generator_tool','generator_plan','generated_at',
 'generation_ref','terms_snapshot_ref','human_contribution','human_contribution_details','source_sha256',
 'master_sha256','fingerprint_sha256','shazam_checked_at','shazam_result','acoustid_checked_at','acoustid_result',
 'never_published_checked_at','evidence_inventory_sha256','notes']);
 b := jsonb_populate_record(b, fields || jsonb_build_object('audio_item_id',p_audio_item_id,'practice_id',parent,
   'status','draft','created_at',coalesce(b.created_at,now()),'updated_at',now()));
 INSERT INTO public.business_track_passports SELECT b.* ON CONFLICT(audio_item_id) DO UPDATE SET
 al_code=EXCLUDED.al_code,
 generator_tool=EXCLUDED.generator_tool,
 generator_plan=EXCLUDED.generator_plan,
 generated_at=EXCLUDED.generated_at,
 generation_ref=EXCLUDED.generation_ref,
 terms_snapshot_ref=EXCLUDED.terms_snapshot_ref,
 human_contribution=EXCLUDED.human_contribution,
 human_contribution_details=EXCLUDED.human_contribution_details,
 source_sha256=EXCLUDED.source_sha256,
 master_sha256=EXCLUDED.master_sha256,
 fingerprint_sha256=EXCLUDED.fingerprint_sha256,
 shazam_checked_at=EXCLUDED.shazam_checked_at,
 shazam_result=EXCLUDED.shazam_result,
 acoustid_checked_at=EXCLUDED.acoustid_checked_at,
 acoustid_result=EXCLUDED.acoustid_result,
 never_published_checked_at=EXCLUDED.never_published_checked_at,
 evidence_inventory_sha256=EXCLUDED.evidence_inventory_sha256,
 notes=EXCLUDED.notes;
END $$;
CREATE FUNCTION public.record_business_master_hash(p_audio_item_id uuid, p_asset_id uuid, p_sha256 text, p_admin_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_admin_id IS NULL OR NOT public.has_platform_permission(p_admin_id,'admin_panel.access') THEN
   RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.audio_items a JOIN public.music_audio_assets m ON m.id=a.desired_music_master_asset_id
   WHERE a.id=p_audio_item_id AND m.id=p_asset_id AND m.audio_item_id=a.id
   AND m.asset_role='master' AND m.lifecycle_state='verified' FOR UPDATE OF a;
 IF NOT FOUND THEN RAISE EXCEPTION 'passport_master_replaced' USING ERRCODE='40001'; END IF;
 UPDATE public.business_track_passports SET stored_master_asset_id=p_asset_id, stored_master_sha256=p_sha256,
   stored_master_sha256_verified_at=clock_timestamp() WHERE audio_item_id=p_audio_item_id AND status='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'passport_draft_required' USING ERRCODE='55000'; END IF;
END $$;
CREATE FUNCTION public.admin_approve_business_track_passport(p_audio_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.business_track_passports; missing text[];
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(),'admin_panel.access') THEN
   RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.audio_items WHERE id=p_audio_item_id FOR UPDATE;
 SELECT * INTO b FROM public.business_track_passports WHERE audio_item_id=p_audio_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'passport_missing_fields: passport' USING ERRCODE='23514'; END IF;
 IF b.status <> 'draft' THEN RAISE EXCEPTION 'passport_draft_required' USING ERRCODE='55000'; END IF;
 missing := public.business_passport_missing(b);
 IF b.human_contribution='human' AND nullif(btrim(b.human_contribution_details),'') IS NULL THEN
   missing := array_append(missing,'human_contribution_details'); END IF;
 IF cardinality(missing)>0 THEN
   RAISE EXCEPTION 'passport_missing_fields: %',array_to_string(missing,',') USING ERRCODE='23514'; END IF;
 IF b.master_sha256 IS DISTINCT FROM b.stored_master_sha256 THEN
   RAISE EXCEPTION 'passport_hash_mismatch' USING ERRCODE='23514'; END IF;
 IF b.shazam_result <> 'not_found' OR b.acoustid_result <> 'not_found' THEN
   RAISE EXCEPTION 'passport_fingerprint_match' USING ERRCODE='23514'; END IF;
 UPDATE public.business_track_passports SET status='approved',approved_by=auth.uid(),approved_at=clock_timestamp()
 WHERE audio_item_id=p_audio_item_id;
END $$;
CREATE FUNCTION public.admin_revoke_business_track_passport(p_audio_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(),'admin_panel.access') THEN
   RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.audio_items WHERE id=p_audio_item_id FOR UPDATE;
 UPDATE public.business_track_passports SET status='revoked' WHERE audio_item_id=p_audio_item_id;
END $$;
-- Replacement invalidates admission and server verification. Evidence is retained
-- for review, never copied to a new asset as verified evidence.
CREATE FUNCTION public.reset_business_passport_on_audio_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF ROW(NEW.practice_id,NEW.audio_path,NEW.desired_music_master_asset_id,NEW.active_music_delivery_asset_id)
   IS DISTINCT FROM ROW(OLD.practice_id,OLD.audio_path,OLD.desired_music_master_asset_id,OLD.active_music_delivery_asset_id) THEN
   UPDATE public.business_track_passports SET status='draft',stored_master_asset_id=NULL,stored_master_sha256=NULL,
     stored_master_sha256_verified_at=NULL,approved_by=NULL,approved_at=NULL WHERE audio_item_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reset_business_passport_on_audio_change AFTER UPDATE OF practice_id,audio_path,
 desired_music_master_asset_id,active_music_delivery_asset_id ON public.audio_items
 FOR EACH ROW EXECUTE FUNCTION public.reset_business_passport_on_audio_change();
REVOKE ALL ON FUNCTION public.business_passport_missing(public.business_track_passports),
 public.guard_business_track_passport(),public.reset_business_passport_on_audio_change(),
 public.business_track_passport_approved(uuid),public.admin_upsert_business_track_passport(uuid,jsonb),
 public.admin_approve_business_track_passport(uuid),public.admin_revoke_business_track_passport(uuid),
 public.record_business_master_hash(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_track_passport_approved(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_business_track_passport(uuid,jsonb),
 public.admin_approve_business_track_passport(uuid),public.admin_revoke_business_track_passport(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_business_master_hash(uuid,uuid,text,uuid) TO service_role;

-- Source: 20270131120000_business_manual_admissions.sql; visibility predicate only.
CREATE OR REPLACE FUNCTION public.business_content_candidate_albums(p_location_id uuid)
RETURNS TABLE(id uuid, title text, author_id uuid, author_name text, status text,
 product_kind text, catalog_visibility text, deleted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT p.id, p.title::text, p.author_id, a.name::text, p.status::text,
   p.product_kind::text, p.catalog_visibility::text, p.deleted_at
 FROM public.business_locations l
 JOIN public.business_content_categories c ON c.category = lower(btrim(l.business_category))
 CROSS JOIN public.practices p
 JOIN public.authors a ON a.id = p.author_id
 WHERE l.id = p_location_id AND p.product_kind = 'music' AND p.status = 'published'
   AND (p.catalog_visibility = 'listed' OR (p.business_only AND EXISTS (SELECT 1 FROM public.audio_items bi WHERE bi.practice_id=p.id AND public.business_track_passport_approved(bi.id)))) AND p.deleted_at IS NULL
   AND coalesce((public.resolve_business_content_admission(p.id, c.direction_key)->>'allowed')::boolean, false)
 ORDER BY p.id;
$$;

-- Source: 20270202120000_business_artist_sound_auto.sql; visibility predicate only.
CREATE OR REPLACE FUNCTION public.business_sound_track_allowed(p_audio_item_id uuid, p_direction text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audio_items a
    JOIN public.practices p ON p.id = a.practice_id
    LEFT JOIN public.business_track_sound_reviews r ON r.audio_item_id = a.id
      AND r.audio_identity = public.business_sound_audio_identity(a)
    WHERE a.id = p_audio_item_id
      AND (
        r.status = 'approved'
        OR (public.business_artist_sound_auto_enabled(p.author_id) AND r.status IS DISTINCT FROM 'rejected')
      )
      AND coalesce((public.resolve_business_content_admission(p.id, p_direction)->>'allowed')::boolean, false)
      AND p.product_kind = 'music' AND p.status = 'published' AND p.deleted_at IS NULL
      AND (p.catalog_visibility = 'listed' OR (p.business_only AND public.business_track_passport_approved(a.id))) AND a.status = 'published'
  )
$$;

-- Source: 20270202120000_business_artist_sound_auto.sql; visibility predicate only.
CREATE OR REPLACE FUNCTION public.admin_business_sound_queue(
  p_status text DEFAULT NULL, p_artist uuid DEFAULT NULL, p_album uuid DEFAULT NULL,
  p_space text DEFAULT NULL, p_page integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  WITH candidates AS MATERIALIZED (
    SELECT a.id, a.title, a.duration_seconds, p.id AS album_id, p.title AS album,
      au.id AS artist_id, au.name AS artist, public.business_sound_audio_identity(a) AS audio_identity,
      admitted.spaces,
      CASE WHEN r.audio_identity = public.business_sound_audio_identity(a) THEN r.status ELSE 'unchecked' END AS status,
      (
        coalesce(auto_sound.enabled, false)
        AND NOT coalesce(
          r.audio_identity = public.business_sound_audio_identity(a) AND r.status = 'rejected',
          false
        )
      ) AS sound_auto,
      r.reason, r.reviewed_at, r.reviewed_by
    FROM public.audio_items a JOIN public.practices p ON p.id = a.practice_id
    JOIN public.business_sound_admitted_albums admitted ON admitted.practice_id = p.id
    JOIN public.authors au ON au.id = p.author_id
    LEFT JOIN public.business_track_sound_reviews r ON r.audio_item_id = a.id
    LEFT JOIN public.business_artist_sound_auto auto_sound ON auto_sound.author_id = au.id
    WHERE p.product_kind = 'music' AND p.deleted_at IS NULL AND p.status = 'published'
      AND (p.catalog_visibility = 'listed' OR (p.business_only AND public.business_track_passport_approved(a.id))) AND a.status = 'published'
  ), filtered AS MATERIALIZED (
    SELECT * FROM candidates WHERE (p_artist IS NULL OR artist_id = p_artist)
      AND (p_album IS NULL OR album_id = p_album) AND (p_space IS NULL OR p_space = ANY(spaces))
  ), page AS (
    SELECT * FROM filtered WHERE p_status IS NULL OR status = p_status
    ORDER BY artist, album, title, id LIMIT 100 OFFSET greatest(0, least(p_page, 100000)) * 100
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY artist, album, title, id) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered WHERE p_status IS NULL OR status = p_status),
    'counts', (SELECT jsonb_build_object('unchecked', count(*) FILTER (WHERE status = 'unchecked'),
      'approved', count(*) FILTER (WHERE status = 'approved'), 'rejected', count(*) FILTER (WHERE status = 'rejected')) FROM filtered),
    'artists', coalesce((SELECT jsonb_agg(x ORDER BY name, id) FROM
      (SELECT DISTINCT artist_id AS id, artist AS name FROM candidates) x), '[]'::jsonb),
    'albums', coalesce((SELECT jsonb_agg(x ORDER BY name, id) FROM
      (SELECT DISTINCT album_id AS id, album AS name FROM candidates WHERE p_artist IS NULL OR artist_id = p_artist) x), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- Source: 20270201120000_business_track_sound_reviews.sql; visibility predicate only.
CREATE OR REPLACE FUNCTION public.admin_review_business_track_sound(
  p_audio_item_id uuid, p_status text, p_reason text, p_audio_identity text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.audio_items; previous public.business_track_sound_reviews; identity text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('unchecked', 'approved', 'rejected')
    OR char_length(p_reason) > 2000 THEN RAISE EXCEPTION 'invalid_review' USING ERRCODE = '22023'; END IF;
  -- Same lock order as replacement: audio item, then review. Serializes first insert too.
  SELECT * INTO a FROM public.audio_items WHERE id = p_audio_item_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.practices p WHERE p.id = a.practice_id
    AND p.product_kind = 'music' AND p.deleted_at IS NULL AND p.status = 'published'
    AND (p.catalog_visibility = 'listed' OR (p.business_only AND public.business_track_passport_approved(p_audio_item_id)))) OR a.status <> 'published'
    OR cardinality(public.business_sound_album_spaces(a.practice_id)) = 0 THEN
    RAISE EXCEPTION 'track_not_in_queue' USING ERRCODE = '22023';
  END IF;
  identity := public.business_sound_audio_identity(a);
  IF p_audio_identity IS DISTINCT FROM identity THEN
    RAISE EXCEPTION 'audio_replaced_reload' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO previous FROM public.business_track_sound_reviews WHERE audio_item_id = a.id;
  INSERT INTO public.business_track_sound_reviews(audio_item_id, status, audio_identity, reason, reviewed_by)
    VALUES (a.id, p_status, identity, nullif(btrim(p_reason), ''), auth.uid())
    ON CONFLICT (audio_item_id) DO UPDATE SET status = EXCLUDED.status, audio_identity = EXCLUDED.audio_identity,
      reason = EXCLUDED.reason, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = clock_timestamp();
  INSERT INTO public.business_track_sound_review_history
    (audio_item_id, old_status, new_status, old_audio_identity, audio_identity, reason, changed_by, event)
    VALUES (a.id, coalesce(previous.status, 'unchecked'), p_status, previous.audio_identity,
      identity, nullif(btrim(p_reason), ''), auth.uid(), 'manual');
END;
$$;

-- Source: 20261027120000_product_published_email_context_canonical.sql; keep audit, skip closed publication email.
CREATE OR REPLACE FUNCTION public.log_practice_moderation_event(
  p_practice_id uuid,
  p_author_id uuid,
  p_action text,
  p_from_status text,
  p_to_status text,
  p_from_moderation_status text,
  p_to_moderation_status text,
  p_comment text,
  p_actor_user_id uuid,
  p_actor_type text,
  p_attempt integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_comment text;
  v_practice_title text;
  v_practice_slug text;
  v_product_kind text;
  v_is_free boolean;
  v_submitted_at timestamptz;
  v_author_slug text;
  v_author_name text;
  v_owner_user_id uuid;
  v_recipient_email text;
  v_audio_track_count integer;
  v_product_kind_label text;
  v_price_label text;
  v_submission_kind_label text;
  v_context jsonb;
  v_public_product_path text;
BEGIN
  v_comment := NULLIF(btrim(COALESCE(p_comment, '')), '');

  INSERT INTO public.practice_moderation_events (
    practice_id, author_id, action, from_status, to_status,
    from_moderation_status, to_moderation_status, comment, actor_user_id,
    actor_type, attempt, metadata, created_at
  ) VALUES (
    p_practice_id, p_author_id, p_action, p_from_status, p_to_status,
    p_from_moderation_status, p_to_moderation_status, v_comment, p_actor_user_id,
    p_actor_type, p_attempt, COALESCE(p_metadata, '{}'::jsonb), clock_timestamp()
  ) RETURNING id INTO v_id;

  IF p_action IN ('changes_requested', 'approved_and_published')
    AND NOT (p_action = 'approved_and_published' AND public.practice_is_business_only(p_practice_id)) THEN
    SELECT p.title, p.slug
    INTO v_practice_title, v_practice_slug
    FROM public.practices AS p
    WHERE p.id = p_practice_id;

    SELECT a.slug, a.name
    INTO v_author_slug, v_author_name
    FROM public.authors AS a
    WHERE a.id = p_author_id;

    SELECT
      am.user_id,
      lower(coalesce(nullif(btrim(pr.contact_email), ''), nullif(btrim(pr.email), '')))
    INTO v_owner_user_id, v_recipient_email
    FROM public.author_members AS am
    INNER JOIN public.profiles AS pr ON pr.id = am.user_id
    WHERE am.author_id = p_author_id
      AND am.role = 'owner'
    LIMIT 1;

    IF v_recipient_email IS NOT NULL
       AND v_recipient_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      v_recipient_email := NULL;
    END IF;

    -- Keep a path snapshot for older workers; TypeScript rebuilds via
    -- buildPracticePublicPath(author_slug, product_slug) when those fields exist.
    IF v_author_slug IS NOT NULL AND v_practice_slug IS NOT NULL THEN
      v_public_product_path := '/practice/' || v_author_slug || '/' || v_practice_slug;
    ELSE
      v_public_product_path := NULL;
    END IF;

    v_context := jsonb_build_object(
      'product_title', v_practice_title,
      'author_name', v_author_name,
      'author_slug', v_author_slug,
      'product_slug', v_practice_slug,
      'author_dashboard_path',
        '/author-dashboard/products/' || p_practice_id::text
          || '?author=' || coalesce(v_author_slug, ''),
      'public_product_path', v_public_product_path,
      'moderator_comment',
        CASE WHEN p_action = 'changes_requested' THEN v_comment ELSE NULL END
    );

    INSERT INTO public.practice_moderation_email_outbox (
      event_id, practice_id, author_id, action, recipient_role, recipient_user_id,
      recipient_email, context, status, error_code, error_message
    ) VALUES (
      v_id, p_practice_id, p_author_id, p_action, 'author_owner', v_owner_user_id,
      v_recipient_email, v_context,
      CASE WHEN v_recipient_email IS NULL THEN 'failed_permanent' ELSE 'pending' END,
      CASE WHEN v_recipient_email IS NULL THEN 'recipient_missing' ELSE NULL END,
      CASE
        WHEN v_recipient_email IS NULL
          THEN 'No usable owner contact email at enqueue time.'
        ELSE NULL
      END
    );
  END IF;

  IF p_action IN ('submitted', 'resubmitted') THEN
    SELECT p.title, p.product_kind, COALESCE(p.is_free, false), p.moderation_submitted_at
    INTO v_practice_title, v_product_kind, v_is_free, v_submitted_at
    FROM public.practices AS p
    WHERE p.id = p_practice_id;

    SELECT a.name
    INTO v_author_name
    FROM public.authors AS a
    WHERE a.id = p_author_id;

    SELECT COUNT(*)::integer
    INTO v_audio_track_count
    FROM public.audio_items AS ai
    WHERE ai.practice_id = p_practice_id;

    v_product_kind_label := CASE
      WHEN v_product_kind = 'audio_post' THEN 'аудиопост'
      WHEN v_product_kind = 'music' AND v_audio_track_count >= 2 THEN 'альбом'
      WHEN v_product_kind = 'music' THEN 'музыка'
      ELSE 'аудиопрактика'
    END;
    v_price_label := CASE WHEN v_is_free THEN 'бесплатный' ELSE 'платный' END;
    v_submission_kind_label := CASE
      WHEN p_action = 'resubmitted' THEN 'повторная отправка'
      ELSE 'первая отправка'
    END;
    v_recipient_email := 'authors@audiolad.ru';
    v_context := jsonb_build_object(
      'product_id', p_practice_id::text,
      'product_title', v_practice_title,
      'author_name', v_author_name,
      'author_project_name', v_author_name,
      'product_kind_label', v_product_kind_label,
      'price_label', v_price_label,
      'audio_track_count', v_audio_track_count,
      'submission_kind_label', v_submission_kind_label,
      'submitted_at', v_submitted_at,
      'admin_review_path', '/admin/product-moderation/' || p_practice_id::text
    );

    INSERT INTO public.practice_moderation_email_outbox (
      event_id, practice_id, author_id, action, recipient_role, recipient_user_id,
      recipient_email, context, status, error_code, error_message
    ) VALUES (
      v_id, p_practice_id, p_author_id, p_action, 'platform_admin', NULL,
      v_recipient_email, v_context, 'pending', NULL, NULL
    );
  END IF;

  RETURN v_id;
END;
$$;

-- Source: 20261212120000_scheduled_publish_notification_outbox.sql; no closed release outbox rows or public-count contribution.
CREATE OR REPLACE FUNCTION public.claim_due_scheduled_practice_publications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed_count integer;
BEGIN
  WITH due AS (
    SELECT
      p.id,
      p.author_id,
      p.slug AS practice_slug,
      a.slug AS author_slug,
      p.catalog_visibility,
      p.is_catalog_listed,
      p.scheduled_publish_at,
      (
        SELECT count(*)::integer
        FROM public.practices AS other
        WHERE other.author_id = p.author_id AND NOT other.business_only
          AND other.id <> p.id
          AND other.deleted_at IS NULL
          AND other.published_at IS NOT NULL
          AND other.published_at <= now()
      ) AS prior_public_count
    FROM public.practices AS p
    INNER JOIN public.authors AS a ON a.id = p.author_id
    WHERE p.status = 'published' AND NOT p.business_only
      AND p.deleted_at IS NULL
      AND p.published_at IS NULL
      AND p.scheduled_publish_at IS NOT NULL
      AND p.scheduled_publish_at <= now()
      AND p.slug IS NOT NULL
      AND a.slug IS NOT NULL
  ),
  claimed AS (
    UPDATE public.practices AS p
    SET published_at = p.scheduled_publish_at
    FROM due
    WHERE p.id = due.id
      AND p.published_at IS NULL
    RETURNING p.id, p.published_at
  ),
  inserted AS (
    INSERT INTO public.scheduled_publish_notification_outbox (
      practice_id,
      author_id,
      practice_slug,
      author_slug,
      catalog_visibility,
      is_catalog_listed,
      published_at,
      prior_public_count
    )
    SELECT
      due.id,
      due.author_id,
      due.practice_slug,
      due.author_slug,
      due.catalog_visibility,
      due.is_catalog_listed,
      claimed.published_at,
      due.prior_public_count
    FROM claimed
    INNER JOIN due ON due.id = claimed.id
    ON CONFLICT (practice_id) DO NOTHING
    RETURNING practice_id
  )
  SELECT count(*)::integer INTO claimed_count FROM inserted;

  RETURN claimed_count;
END;
$$;

-- Source: 20261007180000_music_publish_playable_audio.sql; explicitly preserve the closed catalog visibility.
CREATE OR REPLACE FUNCTION public.publish_audio_product(
  p_practice_id uuid,
  p_published_at timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_access text;
  v_bypass boolean;
  v_first_path text;
  v_seconds bigint;
  v_minutes integer;
  v_from_status text;
  v_from_moderation text;
  v_starter boolean;
  v_catalog_listed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_practice
  FROM public.practices
  WHERE id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF v_practice.status NOT IN ('draft', 'unpublished', 'published') THEN
    RAISE EXCEPTION 'invalid_status_for_publish' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT access_status
  INTO v_access
  FROM public.authors
  WHERE id = v_practice.author_id;

  v_bypass := public.actor_can_bypass_product_moderation(v_practice.author_id);

  IF NOT public.author_access_allows_content_mutations(v_access) THEN
    RAISE EXCEPTION 'author_content_mutations_blocked' USING ERRCODE = '42501';
  END IF;
  IF NOT public.author_access_allows_paid_products(v_access)
     AND (NOT COALESCE(v_practice.is_free, false) OR COALESCE(v_practice.price, 0) > 0) THEN
    RAISE EXCEPTION 'paid_products_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF v_practice.moderation_status IS DISTINCT FROM 'approved' AND NOT v_bypass THEN
    RAISE EXCEPTION 'moderation_required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_practice_moderation_ready(p_practice_id);

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  SELECT audio_path INTO v_first_path
  FROM public.audio_items
  WHERE practice_id = p_practice_id
    AND NULLIF(btrim(audio_path), '') IS NOT NULL
  ORDER BY position
  LIMIT 1;

  -- Canonical effective duration: positive audio_items.duration_seconds,
  -- else positive duration of the current validated music-streams asset.
  SELECT COALESCE(
    sum(public.music_item_effective_publish_duration_seconds(ai.id)),
    0
  ) INTO v_seconds
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND (
      NULLIF(btrim(ai.audio_path), '') IS NOT NULL
      OR (
        v_practice.product_kind = 'music'
        AND public.music_item_has_validated_active_delivery(ai.id)
      )
    );

  v_minutes := CASE
    WHEN v_seconds > 0 THEN GREATEST(1, ceil(v_seconds::numeric / 60)::integer)
    ELSE NULL
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.starter_practices
    WHERE practice_id = p_practice_id
      AND is_active
  ) INTO v_starter;

  v_catalog_listed := CASE
    WHEN v_practice.business_only OR v_starter THEN false
    ELSE COALESCE(v_practice.is_catalog_listed, true)
  END;

  PERFORM set_config('audiolad.allow_practice_publish', 'on', true);
  PERFORM set_config('audiolad.allow_moderated_content_update', 'on', true);

  UPDATE public.audio_items
  SET status = 'published', updated_at = now()
  WHERE practice_id = p_practice_id;

  UPDATE public.practices
  SET
    status = 'published',
    catalog_visibility = CASE WHEN business_only THEN 'selected_users' ELSE catalog_visibility END,
    is_catalog_listed = v_catalog_listed,
    published_at = COALESCE(published_at, p_published_at),
    audio_url = v_first_path,
    duration_minutes = v_minutes,
    updated_at = now()
  WHERE id = p_practice_id
  RETURNING * INTO v_practice;

  IF v_from_status = 'unpublished' AND v_from_moderation = 'approved' THEN
    PERFORM public.log_practice_moderation_event(
      v_practice.id,
      v_practice.author_id,
      'republished',
      'unpublished',
      'published',
      'approved',
      'approved',
      NULL,
      auth.uid(),
      'author',
      v_practice.moderation_attempt,
      jsonb_build_object('source', 'publish_audio_product')
    );
  END IF;

  PERFORM public.record_author_support_mutation_audit(
    v_practice.author_id,
    'product_published',
    'practice',
    v_practice.id::text,
    jsonb_build_object('source', 'publish_audio_product')
  );
END;
$$;

-- Same music release shape as createDraftProduct; creation is one transaction.
-- The picker and this RPC require author write membership, matching the reused uploader.
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

-- Source: 20270202120000_business_artist_sound_auto.sql (latest definition); only the initial passport gate is added.
CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb; r record; v_direction text; v_admission jsonb; v_sound text; v_auto boolean;
BEGIN
  -- Business-only (39a7ef48): a closed track is never eligible without an approved passport,
  -- independent of the manual content gate. Ordinary tracks: unchanged.
  IF EXISTS (SELECT 1 FROM public.audio_items a JOIN public.practices p ON p.id=a.practice_id
    WHERE a.id=p_audio_item_id AND p.business_only)
    AND NOT public.business_track_passport_approved(p_audio_item_id) THEN
    RETURN jsonb_build_object('audio_item_id', p_audio_item_id, 'decision', 'INELIGIBLE',
      'reason_codes', jsonb_build_array('BUSINESS_TRACK_PASSPORT_REQUIRED'));
  END IF;
  v := public.resolve_business_track_eligibility_v1(p_audio_item_id, p_location_id, p_zone_id, p_use_type, p_as_of);
  SELECT id, decision INTO r FROM public.business_track_eligibility_reviews
    WHERE audio_item_id = p_audio_item_id
      AND (coalesce(p_as_of, now()) >= now() OR created_at <= p_as_of)
    ORDER BY created_at DESC, id DESC LIMIT 1;
  IF FOUND AND r.decision IN ('blocked', 'proof_requested') THEN
    v := v || jsonb_build_object('decision', 'INELIGIBLE',
      'reason_codes', coalesce(v->'reason_codes', '[]'::jsonb) || to_jsonb('BUSINESS_TRACK_ADMISSION_' || upper(r.decision)),
      'business_track_review_id', r.id);
  END IF;
  IF NOT public.business_manual_content_gate_enabled() THEN
    RETURN v;
  END IF;
  SELECT c.direction_key INTO v_direction FROM public.business_locations l
    JOIN public.business_content_categories c ON c.category = lower(btrim(l.business_category))
    WHERE l.id = p_location_id;
  SELECT public.resolve_business_content_admission(ai.practice_id, v_direction) INTO v_admission
    FROM public.audio_items ai WHERE ai.id = p_audio_item_id;
  IF NOT coalesce((v_admission->>'allowed')::boolean, false) THEN
    v := v || jsonb_build_object('decision', 'INELIGIBLE',
      'reason_codes', coalesce(v->'reason_codes', '[]'::jsonb) || '["MANUAL_DIRECTION_ADMISSION_REQUIRED"]'::jsonb);
  END IF;
  SELECT s.status INTO v_sound FROM public.business_track_sound_reviews s
    JOIN public.audio_items a ON a.id = s.audio_item_id
    WHERE s.audio_item_id = p_audio_item_id
      AND s.audio_identity = public.business_sound_audio_identity(a);
  SELECT public.business_artist_sound_auto_enabled(p.author_id) INTO v_auto
    FROM public.audio_items a JOIN public.practices p ON p.id = a.practice_id
    WHERE a.id = p_audio_item_id;
  IF v_sound IS DISTINCT FROM 'approved' AND NOT (coalesce(v_auto, false) AND v_sound IS DISTINCT FROM 'rejected') THEN
    v := v || jsonb_build_object('decision', 'INELIGIBLE',
      'reason_codes', coalesce(v->'reason_codes', '[]'::jsonb) || '["BUSINESS_SOUND_REVIEW_REQUIRED"]'::jsonb);
  END IF;
  RETURN v || jsonb_build_object('content_direction', v_direction, 'content_admission', v_admission);
END;
$$;


-- Covers/gallery images live in the PUBLIC practice-covers bucket. Until a private
-- covers storage exists, business-only albums may not attach any image (album cover,
-- track cover, gallery slide) – for every role, including service_role. Clearing an
-- image (to NULL) and deleting slides stay allowed. App routes check the same first,
-- so no file is uploaded to the public bucket.
CREATE FUNCTION public.guard_business_only_public_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'practices' THEN
    IF NEW.business_only AND (
      (NEW.cover_url IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_url IS DISTINCT FROM OLD.cover_url))
      OR (NEW.cover_image IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_image IS DISTINCT FROM OLD.cover_image))
    ) THEN
      RAISE EXCEPTION 'business_only_cover_upload_blocked' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'audio_items' THEN
    IF (NEW.cover_url IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_url IS DISTINCT FROM OLD.cover_url))
       OR (NEW.cover_image IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_image IS DISTINCT FROM OLD.cover_image)) THEN
      v_practice_id := NEW.practice_id;
    END IF;
  ELSE -- publication_gallery_slides
    IF TG_OP = 'INSERT' OR NEW.image_url IS DISTINCT FROM OLD.image_url
       OR NEW.image_manifest IS DISTINCT FROM OLD.image_manifest
       OR NEW.publication_id IS DISTINCT FROM OLD.publication_id THEN
      v_practice_id := NEW.publication_id;
    END IF;
  END IF;
  IF v_practice_id IS NOT NULL AND public.practice_is_business_only(v_practice_id) THEN
    RAISE EXCEPTION 'business_only_cover_upload_blocked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_business_only_public_images() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_business_only_practice_cover
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_only_public_images();
CREATE TRIGGER guard_business_only_track_cover
  BEFORE INSERT OR UPDATE ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_only_public_images();
CREATE TRIGGER guard_business_only_gallery_image
  BEFORE INSERT OR UPDATE ON public.publication_gallery_slides
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_only_public_images();

COMMIT;
