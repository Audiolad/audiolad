BEGIN;

-- ---------------------------------------------------------------------------
-- Topics foundation (Stage A)
--
-- Platform-controlled topic catalog + practice many-to-many assignment.
-- Authors select active topics via RPC; no direct writes to join table.
-- MVP limit: 3 topics per product (business rule, not schema CHECK).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. topics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  key text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  description text NULL,

  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  show_on_home boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT topics_key_unique UNIQUE (key),
  CONSTRAINT topics_slug_unique UNIQUE (slug),
  CONSTRAINT topics_key_format_check
    CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT topics_slug_format_check
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT topics_sort_order_positive_check
    CHECK (sort_order > 0)
);

CREATE INDEX IF NOT EXISTS topics_active_sort_idx
  ON public.topics (sort_order ASC, title ASC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS topics_home_visible_idx
  ON public.topics (sort_order ASC, title ASC)
  WHERE is_active = true AND show_on_home = true;

COMMENT ON TABLE public.topics IS
  'Platform editorial topic catalog. Authors select from active entries; platform staff manage lifecycle.';

COMMENT ON COLUMN public.topics.key IS
  'Stable system identifier for API, analytics, and business logic. Immutable after creation.';

COMMENT ON COLUMN public.topics.slug IS
  'Public URL segment for future /topics/[slug] pages. May change independently of key.';

COMMENT ON COLUMN public.topics.show_on_home IS
  'When true and is_active, topic may appear on home navigation (subject to product counts in app layer).';

-- ---------------------------------------------------------------------------
-- 2. practice_topics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_topics (
  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE CASCADE,
  topic_id uuid NOT NULL
    REFERENCES public.topics (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (practice_id, topic_id)
);

CREATE INDEX IF NOT EXISTS practice_topics_topic_id_idx
  ON public.practice_topics (topic_id);

CREATE INDEX IF NOT EXISTS practice_topics_practice_id_idx
  ON public.practice_topics (practice_id);

COMMENT ON TABLE public.practice_topics IS
  'Many-to-many: audio products (practices) to platform topics. Writes via set_practice_topics RPC only.';

-- ---------------------------------------------------------------------------
-- 3. Seed seven MVP topics (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO public.topics (
  key,
  slug,
  title,
  description,
  sort_order,
  is_active,
  show_on_home
)
VALUES
  (
    'money',
    'money',
    'Деньги',
    NULL,
    10,
    true,
    true
  ),
  (
    'relationships',
    'relationships',
    'Отношения',
    NULL,
    20,
    true,
    true
  ),
  (
    'calm',
    'calm',
    'Спокойствие',
    NULL,
    30,
    true,
    true
  ),
  (
    'self-worth',
    'self-worth',
    'Уверенность и самоценность',
    NULL,
    40,
    true,
    true
  ),
  (
    'body-wellbeing',
    'body-wellbeing',
    'Тело и самочувствие',
    NULL,
    50,
    true,
    true
  ),
  (
    'energy',
    'energy',
    'Энергия и ресурс',
    NULL,
    60,
    true,
    true
  ),
  (
    'purpose',
    'purpose',
    'Предназначение',
    NULL,
    70,
    true,
    true
  )
ON CONFLICT (key) DO UPDATE
SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  show_on_home = EXCLUDED.show_on_home,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. RLS: topics
-- ---------------------------------------------------------------------------

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'topics'
      AND policyname = 'Public can read active topics'
  ) THEN
    CREATE POLICY "Public can read active topics"
      ON public.topics
      FOR SELECT
      TO anon, authenticated
      USING (is_active = true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'topics'
      AND policyname = 'Author members can read assigned inactive topics'
  ) THEN
    CREATE POLICY "Author members can read assigned inactive topics"
      ON public.topics
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.practice_topics AS pt
          INNER JOIN public.practices AS p
            ON p.id = pt.practice_id
          INNER JOIN public.author_members AS am
            ON am.author_id = p.author_id
          WHERE pt.topic_id = topics.id
            AND am.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'topics'
      AND policyname = 'Platform staff can manage topics'
  ) THEN
    CREATE POLICY "Platform staff can manage topics"
      ON public.topics
      FOR ALL
      TO authenticated
      USING (public.is_platform_staff(auth.uid()))
      WITH CHECK (public.is_platform_staff(auth.uid()));
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.topics FROM PUBLIC;
GRANT SELECT ON TABLE public.topics TO anon, authenticated;
GRANT ALL ON TABLE public.topics TO service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS: practice_topics (read-only for clients; writes via RPC)
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_topics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practice_topics'
      AND policyname = 'Public can read topics of published practices'
  ) THEN
    CREATE POLICY "Public can read topics of published practices"
      ON public.practice_topics
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.practices AS p
          WHERE p.id = practice_topics.practice_id
            AND p.status = 'published'
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practice_topics'
      AND policyname = 'Entitled users can read practice topics'
  ) THEN
    CREATE POLICY "Entitled users can read practice topics"
      ON public.practice_topics
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.user_practices AS up
          WHERE up.user_id = auth.uid()
            AND up.practice_id = practice_topics.practice_id
            AND (
              up.expires_at IS NULL
              OR up.expires_at > now()
            )
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practice_topics'
      AND policyname = 'Author members can read own practice topics'
  ) THEN
    CREATE POLICY "Author members can read own practice topics"
      ON public.practice_topics
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.practices AS p
          INNER JOIN public.author_members AS am
            ON am.author_id = p.author_id
          WHERE p.id = practice_topics.practice_id
            AND am.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.practice_topics FROM PUBLIC;
GRANT SELECT ON TABLE public.practice_topics TO anon, authenticated;
GRANT ALL ON TABLE public.practice_topics TO service_role;

-- ---------------------------------------------------------------------------
-- 6. resolve_author_topic_limit (MVP: 3 for all authors)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_author_topic_limit(
  p_author_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- MVP: uniform limit until author plans exist.
  -- Future: map p_author_id → plan → limit (5–7 premium, up to 10 higher tier).
  IF p_author_id IS NULL THEN
    RETURN 3;
  END IF;

  RETURN 3;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_author_topic_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_author_topic_limit(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_author_topic_limit(uuid) IS
  'audiolad:topics:v1; returns max topics per product for an author workspace. MVP constant 3.';

-- ---------------------------------------------------------------------------
-- 7. set_practice_topics
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_practice_topics(
  p_practice_id uuid,
  p_topic_keys text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_limit integer;
  v_keys text[];
  v_key text;
  v_topic_id uuid;
  v_resolved_ids uuid[] := ARRAY[]::uuid[];
  v_resolved_keys text[] := ARRAY[]::text[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_topic_keys IS NULL THEN
    RAISE EXCEPTION 'topic_keys_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = v_practice.author_id
      AND am.user_id = v_user_id
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_topic_keys) AS x(key)
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
  FROM unnest(p_topic_keys) AS x(key)
  WHERE btrim(x.key) <> '';

  v_limit := public.resolve_author_topic_limit(v_practice.author_id);

  IF cardinality(v_keys) > v_limit THEN
    RAISE EXCEPTION 'topic_limit_exceeded'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY v_keys
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

  DELETE FROM public.practice_topics AS pt
  WHERE pt.practice_id = p_practice_id;

  IF cardinality(v_resolved_ids) > 0 THEN
    INSERT INTO public.practice_topics (practice_id, topic_id)
    SELECT p_practice_id, x.topic_id
    FROM unnest(v_resolved_ids) AS x(topic_id);
  END IF;

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'topic_keys', to_jsonb(v_resolved_keys),
    'topic_count', cardinality(v_resolved_keys),
    'topic_limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_practice_topics(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_practice_topics(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_practice_topics(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_practice_topics(uuid, text[]) TO service_role;

COMMENT ON FUNCTION public.set_practice_topics(uuid, text[]) IS
  'audiolad:topics:v1; atomically replaces practice topic assignments. Active keys only; enforces author topic limit.';

-- ---------------------------------------------------------------------------
-- 8. Backfill published catalog-listed products (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO public.practice_topics (practice_id, topic_id)
SELECT p.id, t.id
FROM (
  VALUES
    ('elixir-molodosti', ARRAY['body-wellbeing', 'energy']::text[]),
    ('klyuch-k-izobiliyu', ARRAY['money', 'energy']::text[]),
    ('kod-prityazheniya', ARRAY['relationships', 'self-worth']::text[]),
    ('energiya-deneg', ARRAY['money', 'self-worth']::text[]),
    ('koding-izobiliya', ARRAY['money', 'energy']::text[]),
    ('osoznannaya-stroynost', ARRAY['body-wellbeing', 'self-worth']::text[]),
    ('zhenskie-dengi', ARRAY['money', 'self-worth', 'energy']::text[]),
    ('dengi-prihodyat-segodnya', ARRAY['money', 'calm']::text[]),
    ('prityanut-dengi-legko', ARRAY['money']::text[]),
    ('dengi-menya-obozhayut', ARRAY['money', 'self-worth']::text[]),
    ('energiya-denezhnogo-puti', ARRAY['money', 'purpose']::text[]),
    ('aktivatsiya-kanala-izobiliya', ARRAY['money', 'energy']::text[]),
    ('provodnik-vnutrenniy-nastavnik', ARRAY['purpose', 'self-worth']::text[]),
    ('ishod-denezhnyy-kalibr', ARRAY['money', 'calm']::text[]),
    ('ishod-svezhaya-krov', ARRAY['calm', 'energy']::text[]),
    (
      'posvyaschenie-v-energiyu-bogini-bastet',
      ARRAY['self-worth', 'energy']::text[]
    ),
    ('muzhchina-ryadom', ARRAY['relationships', 'self-worth']::text[]),
    ('sila-zhenstvennosti', ARRAY['self-worth', 'relationships']::text[])
) AS mapping (practice_slug, topic_keys)
CROSS JOIN LATERAL unnest(mapping.topic_keys) AS mapped_key (topic_key)
INNER JOIN public.practices AS p
  ON p.slug = mapping.practice_slug
INNER JOIN public.topics AS t
  ON t.key = mapped_key.topic_key
ON CONFLICT (practice_id, topic_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. publish_audio_product v4: require at least one active topic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_audio_product(
  p_practice_id uuid,
  p_published_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_first_audio_path text;
  v_total_seconds bigint;
  v_duration_minutes integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status = 'archived' THEN
    RAISE EXCEPTION 'practice_archived'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = v_practice.author_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practice_topics AS pt
    INNER JOIN public.topics AS t
      ON t.id = pt.topic_id
    WHERE pt.practice_id = p_practice_id
      AND t.is_active = true
  ) THEN
    RAISE EXCEPTION 'topic_min_required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.audio_items AS ai
  SET
    status = 'published',
    updated_at = now()
  WHERE ai.practice_id = p_practice_id;

  SELECT ai.audio_path
  INTO v_first_audio_path
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND ai.audio_path IS NOT NULL
    AND btrim(ai.audio_path) <> ''
  ORDER BY ai.position ASC
  LIMIT 1;

  SELECT COALESCE(SUM(ai.duration_seconds), 0)
  INTO v_total_seconds
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND ai.audio_path IS NOT NULL
    AND btrim(ai.audio_path) <> '';

  IF v_total_seconds > 0 THEN
    v_duration_minutes := GREATEST(1, CEIL(v_total_seconds::numeric / 60)::integer);
  ELSE
    v_duration_minutes := NULL;
  END IF;

  UPDATE public.practices AS p
  SET
    status = 'published',
    is_catalog_listed = true,
    published_at = COALESCE(p.published_at, p_published_at),
    audio_url = v_first_audio_path,
    duration_minutes = v_duration_minutes,
    updated_at = now()
  WHERE p.id = p_practice_id;
END;
$$;

COMMENT ON FUNCTION public.publish_audio_product(uuid, timestamptz) IS
  'audiolad:publish-audio-product:v4; publishes practice; requires >=1 active topic; lists in catalog';

-- ---------------------------------------------------------------------------
-- Post-checks
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_topic_count integer;
  v_unassigned_published integer;
BEGIN
  SELECT count(*)
  INTO v_topic_count
  FROM public.topics
  WHERE is_active = true;

  IF v_topic_count <> 7 THEN
    RAISE EXCEPTION 'Post-check failed: expected 7 active topics, found %', v_topic_count;
  END IF;

  SELECT count(*)
  INTO v_unassigned_published
  FROM public.practices AS p
  WHERE p.status = 'published'
    AND p.is_catalog_listed = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.practice_topics AS pt
      INNER JOIN public.topics AS t
        ON t.id = pt.topic_id
      WHERE pt.practice_id = p.id
        AND t.is_active = true
    );

  IF v_unassigned_published > 0 THEN
    RAISE EXCEPTION
      'Post-check failed: % published catalog-listed practices lack active topics',
      v_unassigned_published;
  END IF;
END;
$$;

COMMIT;
