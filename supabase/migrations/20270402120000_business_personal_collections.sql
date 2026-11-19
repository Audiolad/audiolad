-- 73b4869d: references only; no audio/storage copies and no commercial access grants.
BEGIN;
CREATE TABLE public.business_personal_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE public.business_personal_collection_items (
  collection_id uuid NOT NULL REFERENCES public.business_personal_collections(id),
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (collection_id, audio_item_id),
  UNIQUE (collection_id, position)
);
CREATE TABLE public.business_personal_collection_accounts (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  collection_id uuid NOT NULL REFERENCES public.business_personal_collections(id),
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, collection_id)
);
ALTER TABLE public.business_personal_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_personal_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_personal_collection_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_personal_collections, public.business_personal_collection_items,
  public.business_personal_collection_accounts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.business_personal_collections,
  public.business_personal_collection_items, public.business_personal_collection_accounts TO service_role;

-- Private preview has no venue. Reuse catalog passport, direction and current-source
-- sound gates; venue-specific commercial eligibility stays in the normal cabinet.
CREATE FUNCTION public.business_personal_collection_tracks(p_collection_id uuid DEFAULT NULL)
RETURNS TABLE(audio_item_id uuid, album_id uuid, title text, album_title text,
  duration_seconds numeric, cover_ref text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, p.id, a.title::text, p.title::text, a.duration_seconds::numeric, p.cover_url::text
  FROM public.audio_items a JOIN public.practices p ON p.id = a.practice_id
  WHERE p.business_only AND p.product_kind = 'music' AND p.status = 'published'
    AND p.deleted_at IS NULL AND a.status = 'published'
    AND public.business_track_passport_approved(a.id)
    AND public.business_sound_track_allowed(a.id, 'cafe')
    AND coalesce((SELECT r.decision NOT IN ('blocked', 'proof_requested')
      FROM public.business_track_eligibility_reviews r WHERE r.audio_item_id = a.id
      ORDER BY r.created_at DESC, r.id DESC LIMIT 1), true)
    AND (p_collection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.business_personal_collection_items i
      JOIN public.business_personal_collections c ON c.id = i.collection_id
      WHERE i.audio_item_id = a.id AND c.id = p_collection_id AND c.revoked_at IS NULL))
  ORDER BY p.title, p.id, a.position, a.id;
$$;
CREATE FUNCTION public.create_business_personal_collection(
  p_title text, p_token_hash text, p_created_by uuid, p_tracks uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE collection uuid;
BEGIN
  IF cardinality(p_tracks) IS NULL OR cardinality(p_tracks) NOT BETWEEN 1 AND 500
    OR cardinality(p_tracks) <> (SELECT count(DISTINCT t) FROM unnest(p_tracks) t)
    OR EXISTS (SELECT 1 FROM unnest(p_tracks) t WHERE t IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.business_personal_collection_tracks(NULL) a WHERE a.audio_item_id = t)) THEN
    RAISE EXCEPTION 'invalid_collection_tracks' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.business_personal_collections(title, token_hash, created_by)
    VALUES (btrim(p_title), p_token_hash, p_created_by) RETURNING id INTO collection;
  INSERT INTO public.business_personal_collection_items(collection_id, audio_item_id, position)
    SELECT collection, t, n - 1 FROM unnest(p_tracks) WITH ORDINALITY AS x(t, n);
  RETURN collection;
END;
$$;
REVOKE ALL ON FUNCTION public.business_personal_collection_tracks(uuid),
  public.create_business_personal_collection(text,text,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_personal_collection_tracks(uuid),
  public.create_business_personal_collection(text,text,uuid,uuid[]) TO service_role;
-- Venue assignments are references, not access grants. Never overwrite a different choice.
CREATE TABLE public.business_personal_collection_locations (
  location_id uuid PRIMARY KEY REFERENCES public.business_locations(id),
  collection_id uuid NOT NULL REFERENCES public.business_personal_collections(id)
);
ALTER TABLE public.business_personal_collection_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_personal_collection_locations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.business_personal_collection_locations TO service_role;

CREATE FUNCTION public.business_personal_collection_attach_locations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.business_personal_collection_locations(location_id, collection_id)
    SELECT l.id, NEW.collection_id FROM public.business_locations l
    JOIN public.business_content_categories d ON d.category = lower(btrim(l.business_category)) AND d.direction_key = 'cafe'
    JOIN public.business_organization_members m ON m.organization_id = l.organization_id
      AND m.user_id = NEW.user_id AND m.role = 'owner'
    JOIN public.business_personal_collections c ON c.id = NEW.collection_id AND c.revoked_at IS NULL
    ON CONFLICT (location_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER business_personal_collection_account_attach
AFTER INSERT OR UPDATE ON public.business_personal_collection_accounts
FOR EACH ROW EXECUTE FUNCTION public.business_personal_collection_attach_locations();

CREATE FUNCTION public.business_personal_collection_inherit_location() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.business_content_categories d
    WHERE d.category = lower(btrim(NEW.business_category)) AND d.direction_key = 'cafe') THEN
    INSERT INTO public.business_personal_collection_locations(location_id, collection_id)
      SELECT NEW.id, a.collection_id FROM public.business_personal_collection_accounts a
      JOIN public.business_organization_members m ON m.user_id = a.user_id
        AND m.organization_id = NEW.organization_id AND m.role = 'owner'
      JOIN public.business_personal_collections c ON c.id = a.collection_id AND c.revoked_at IS NULL
      ORDER BY a.selected_at DESC, a.collection_id LIMIT 1
      ON CONFLICT (location_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER business_personal_collection_location_inherit
AFTER INSERT ON public.business_locations
FOR EACH ROW EXECUTE FUNCTION public.business_personal_collection_inherit_location();

-- No cookie or current-browser identity: paired hall devices use the same venue pool.
-- Current organization ownership and live preview gates are rechecked on every read.
CREATE FUNCTION public.business_personal_collection_location_tracks(p_location_id uuid)
RETURNS TABLE(audio_item_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.audio_item_id FROM public.business_personal_collection_locations v
  JOIN public.business_locations l ON l.id = v.location_id
  JOIN public.business_content_categories d ON d.category = lower(btrim(l.business_category)) AND d.direction_key = 'cafe'
  CROSS JOIN LATERAL public.business_personal_collection_tracks(v.collection_id) t
  WHERE v.location_id = p_location_id AND EXISTS (
    SELECT 1 FROM public.business_organization_members m
    JOIN public.business_personal_collection_accounts a ON a.user_id = m.user_id AND a.collection_id = v.collection_id
    WHERE m.organization_id = l.organization_id AND m.role = 'owner');
$$;
REVOKE ALL ON FUNCTION public.business_personal_collection_attach_locations(),
  public.business_personal_collection_inherit_location(),
  public.business_personal_collection_location_tracks(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_personal_collection_location_tracks(uuid) TO service_role;
COMMIT;
