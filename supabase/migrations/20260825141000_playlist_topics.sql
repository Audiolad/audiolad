BEGIN;

-- ---------------------------------------------------------------------------
-- Playlist topics foundation (Stage 4B.1)
--
-- Playlists use the existing public.topics dictionary via playlist_topics.
-- This is not a product kind and not free-form tags.
-- Writes go through set_playlist_topics RPC only. Topics are optional.
-- User-owned playlist topic editors are later-stage.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. playlist_topics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.playlist_topics (
  playlist_id uuid NOT NULL
    REFERENCES public.playlists (id) ON DELETE CASCADE,
  topic_id uuid NOT NULL
    REFERENCES public.topics (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (playlist_id, topic_id)
);

CREATE INDEX IF NOT EXISTS playlist_topics_topic_id_idx
  ON public.playlist_topics (topic_id);

COMMENT ON TABLE public.playlist_topics IS
  'Many-to-many: playlists to platform topics. Writes via set_playlist_topics RPC only. Topics are optional; a playlist may stay listed with zero topics.';

COMMENT ON COLUMN public.playlist_topics.playlist_id IS
  'Playlist that selected the topic. Cascade-deletes when the playlist is removed.';

COMMENT ON COLUMN public.playlist_topics.topic_id IS
  'Existing topics.id. Not a free-form tag.';

-- ---------------------------------------------------------------------------
-- 2. RLS: read listed public playlists; no direct client writes
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlist_topics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.playlist_topics FROM PUBLIC;
REVOKE ALL ON TABLE public.playlist_topics FROM anon;
REVOKE ALL ON TABLE public.playlist_topics FROM authenticated;

GRANT SELECT ON TABLE public.playlist_topics TO anon, authenticated;
GRANT ALL ON TABLE public.playlist_topics TO service_role;

DROP POLICY IF EXISTS "Public can read topics of listed playlists"
  ON public.playlist_topics;

CREATE POLICY "Public can read topics of listed playlists"
  ON public.playlist_topics
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.playlists AS p
      WHERE p.id = playlist_topics.playlist_id
        AND p.visibility = 'public'
        AND p.published_at IS NOT NULL
        AND p.listed_at IS NOT NULL
        AND p.slug IS NOT NULL
        AND btrim(p.slug) <> ''
    )
  );

-- ---------------------------------------------------------------------------
-- 3. set_playlist_topics
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_playlist_topics(
  p_playlist_id uuid,
  p_topic_keys text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_playlist_id uuid;
  v_limit integer := 3;
  v_keys text[];
  v_key text;
  v_topic_id uuid;
  v_resolved_ids uuid[] := ARRAY[]::uuid[];
  v_resolved_keys text[] := ARRAY[]::text[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL
    AND NOT public.is_platform_staff(v_user_id)
  THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_playlist_id IS NULL THEN
    RAISE EXCEPTION 'playlist_id_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.id
  INTO v_playlist_id
  FROM public.playlists AS p
  WHERE p.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_topic_keys, ARRAY[]::text[])) AS x(key)
    WHERE btrim(x.key) <> ''
    GROUP BY lower(btrim(x.key))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_topic_keys'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT lower(btrim(x.key)) ORDER BY lower(btrim(x.key))),
    ARRAY[]::text[]
  )
  INTO v_keys
  FROM unnest(COALESCE(p_topic_keys, ARRAY[]::text[])) AS x(key)
  WHERE btrim(x.key) <> '';

  IF cardinality(v_keys) > v_limit THEN
    RAISE EXCEPTION 'topic_limit_exceeded'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY COALESCE(v_keys, ARRAY[]::text[])
  LOOP
    SELECT t.id
    INTO v_topic_id
    FROM public.topics AS t
    WHERE t.key = v_key
      AND t.is_active = true;

    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_not_found'
        USING ERRCODE = 'P0002';
    END IF;

    v_resolved_ids := array_append(v_resolved_ids, v_topic_id);
    v_resolved_keys := array_append(v_resolved_keys, v_key);
  END LOOP;

  DELETE FROM public.playlist_topics AS pt
  WHERE pt.playlist_id = p_playlist_id;

  IF cardinality(v_resolved_ids) > 0 THEN
    INSERT INTO public.playlist_topics (playlist_id, topic_id)
    SELECT p_playlist_id, x.topic_id
    FROM unnest(v_resolved_ids) AS x(topic_id);
  END IF;

  RETURN jsonb_build_object(
    'playlist_id', p_playlist_id,
    'topic_keys', to_jsonb(v_resolved_keys),
    'topic_count', cardinality(v_resolved_keys),
    'topic_limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_playlist_topics(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_playlist_topics(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_playlist_topics(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_playlist_topics(uuid, text[]) TO service_role;

COMMENT ON FUNCTION public.set_playlist_topics(uuid, text[]) IS
  'audiolad:playlist-topics:v1; atomically replaces playlist topic assignments from the existing topics dictionary. Active keys only; max 3; empty set allowed. User-owned writes are not implemented; authenticated callers must be platform staff.';

COMMIT;
