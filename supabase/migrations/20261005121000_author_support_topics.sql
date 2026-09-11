BEGIN;

-- Author-support sessions retain the authenticated platform owner as auth.uid().
-- Let the existing topic transaction accept the same request-bound proof as
-- product lifecycle RPCs; normal author membership remains unchanged.
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
  v_practice public.practices%ROWTYPE;
  v_limit integer;
  v_keys text[];
  v_key text;
  v_topic_id uuid;
  v_resolved_ids uuid[] := ARRAY[]::uuid[];
  v_resolved_keys text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_topic_keys IS NULL THEN
    RAISE EXCEPTION 'topic_keys_required' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_topic_keys) AS x(key)
    GROUP BY lower(btrim(x.key)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_topic_keys' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'topic_limit_exceeded' USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY v_keys LOOP
    SELECT t.id INTO v_topic_id
    FROM public.topics AS t
    WHERE t.key = v_key AND t.is_active = true;
    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_not_found' USING ERRCODE = 'P0002';
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

CREATE OR REPLACE FUNCTION public.set_practice_topics_with_support_proof(
  p_token_hash text,
  p_practice_id uuid,
  p_topic_keys text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  RETURN public.set_practice_topics(p_practice_id, p_topic_keys);
END;
$$;

REVOKE ALL ON FUNCTION public.set_practice_topics(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_practice_topics(uuid, text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_practice_topics_with_support_proof(text, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_practice_topics_with_support_proof(text, uuid, text[]) TO authenticated;

COMMIT;
