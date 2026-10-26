-- Additive queue for audiolad.ru search recrawl (Yandex Webmaster and
-- failed IndexNow retries). Does not update or copy existing rows.
-- Does not resend historical URLs. service_role only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.search_recrawl_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  engine text NOT NULL,
  entity_type text,
  entity_id uuid,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_http_status integer,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  lease_token uuid,
  leased_until timestamptz,
  CONSTRAINT search_recrawl_queue_engine_check
    CHECK (engine IN ('yandex', 'indexnow')),
  CONSTRAINT search_recrawl_queue_status_check
    CHECK (status IN ('pending', 'leased', 'delivered', 'dead', 'rejected')),
  CONSTRAINT search_recrawl_queue_attempts_check
    CHECK (attempts >= 0),
  CONSTRAINT search_recrawl_queue_url_origin_check
    CHECK (url ~ '^https://audiolad\.ru(/|$)' AND char_length(url) <= 2000),
  CONSTRAINT search_recrawl_queue_reason_check
    CHECK (char_length(reason) BETWEEN 1 AND 80),
  CONSTRAINT search_recrawl_queue_entity_type_check
    CHECK (entity_type IS NULL OR char_length(entity_type) <= 40),
  CONSTRAINT search_recrawl_queue_last_error_check
    CHECK (last_error IS NULL OR char_length(last_error) <= 200)
);

COMMENT ON TABLE public.search_recrawl_queue IS
  'Durable audiolad.ru recrawl queue. One pending or leased row per (engine, url). service_role only. No historical backfill.';

CREATE UNIQUE INDEX IF NOT EXISTS search_recrawl_queue_pending_url_engine_uidx
  ON public.search_recrawl_queue (engine, url)
  WHERE status IN ('pending', 'leased');

CREATE INDEX IF NOT EXISTS search_recrawl_queue_due_idx
  ON public.search_recrawl_queue (next_attempt_at, created_at)
  WHERE status IN ('pending', 'leased');

ALTER TABLE public.search_recrawl_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.search_recrawl_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.search_recrawl_queue FROM anon;
REVOKE ALL ON TABLE public.search_recrawl_queue FROM authenticated;

CREATE FUNCTION public.enqueue_search_recrawl(
  p_url text,
  p_engine text,
  p_reason text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_id uuid;
  inserted_id uuid;
  clean_reason text;
BEGIN
  clean_reason := btrim(COALESCE(p_reason, ''));

  IF p_engine IS NULL OR p_engine NOT IN ('yandex', 'indexnow')
     OR clean_reason = ''
     OR char_length(clean_reason) > 80
     OR p_url IS NULL
     OR p_url !~ '^https://audiolad\.ru(/|$)'
     OR char_length(p_url) > 2000
     OR (p_entity_type IS NOT NULL AND char_length(p_entity_type) > 40) THEN
    RETURN QUERY SELECT NULL::uuid, 'rejected'::text;
    RETURN;
  END IF;

  UPDATE public.search_recrawl_queue AS q
  SET
    reason = clean_reason,
    entity_type = p_entity_type,
    entity_id = p_entity_id,
    updated_at = now()
  WHERE q.engine = p_engine
    AND q.url = p_url
    AND q.status IN ('pending', 'leased')
  RETURNING q.id INTO existing_id;

  IF existing_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_id, 'deduped'::text;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.search_recrawl_queue (
      url,
      engine,
      entity_type,
      entity_id,
      reason
    )
    VALUES (
      p_url,
      p_engine,
      p_entity_type,
      p_entity_id,
      clean_reason
    )
    RETURNING search_recrawl_queue.id INTO inserted_id;

    RETURN QUERY SELECT inserted_id, 'inserted'::text;
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.search_recrawl_queue AS q
      SET
        reason = clean_reason,
        entity_type = p_entity_type,
        entity_id = p_entity_id,
        updated_at = now()
      WHERE q.engine = p_engine
        AND q.url = p_url
        AND q.status IN ('pending', 'leased')
      RETURNING q.id INTO existing_id;

      IF existing_id IS NOT NULL THEN
        RETURN QUERY SELECT existing_id, 'deduped'::text;
      ELSE
        RETURN QUERY SELECT NULL::uuid, 'rejected'::text;
      END IF;
  END;
END;
$$;

COMMENT ON FUNCTION public.enqueue_search_recrawl(text, text, text, text, uuid) IS
  'Service-only. Inserts one pending audiolad.ru URL or refreshes the existing pending row. Does not reset attempts. Rejects any other origin.';

REVOKE ALL ON FUNCTION public.enqueue_search_recrawl(text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_search_recrawl(text, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_search_recrawl(text, text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_search_recrawl(text, text, text, text, uuid) TO service_role;

CREATE FUNCTION public.take_due_search_recrawl(p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  url text,
  engine text,
  entity_type text,
  entity_id uuid,
  reason text,
  attempts integer,
  lease_token uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  take_limit integer;
BEGIN
  take_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.search_recrawl_queue AS q
    WHERE (
        q.status = 'pending'
        AND q.next_attempt_at <= now()
      )
      OR (
        q.status = 'leased'
        AND q.leased_until IS NOT NULL
        AND q.leased_until <= now()
      )
    ORDER BY q.next_attempt_at, q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT take_limit
  )
  UPDATE public.search_recrawl_queue AS o
  SET
    status = 'leased',
    lease_token = gen_random_uuid(),
    leased_until = now() + interval '10 minutes',
    updated_at = now()
  FROM picked
  WHERE o.id = picked.id
  RETURNING
    o.id,
    o.url,
    o.engine,
    o.entity_type,
    o.entity_id,
    o.reason,
    o.attempts,
    o.lease_token,
    o.created_at;
END;
$$;

COMMENT ON FUNCTION public.take_due_search_recrawl(integer) IS
  'Service-only lease of due audiolad.ru recrawl rows. An in-flight lease cannot be taken again until it expires.';

REVOKE ALL ON FUNCTION public.take_due_search_recrawl(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_due_search_recrawl(integer) FROM anon;
REVOKE ALL ON FUNCTION public.take_due_search_recrawl(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.take_due_search_recrawl(integer) TO service_role;

CREATE FUNCTION public.complete_search_recrawl(
  p_id uuid,
  p_token uuid,
  p_attempts integer,
  p_http_status integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.search_recrawl_queue AS q
  SET
    status = 'delivered',
    attempts = GREATEST(COALESCE(p_attempts, q.attempts), 0),
    last_http_status = p_http_status,
    last_error = NULL,
    delivered_at = now(),
    lease_token = NULL,
    leased_until = NULL,
    updated_at = now()
  WHERE q.id = p_id
    AND q.lease_token = p_token
    AND q.status = 'leased';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_search_recrawl(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_search_recrawl(uuid, uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.complete_search_recrawl(uuid, uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_search_recrawl(uuid, uuid, integer, integer) TO service_role;

CREATE FUNCTION public.retry_search_recrawl(
  p_id uuid,
  p_token uuid,
  p_attempts integer,
  p_last_error text,
  p_last_http_status integer,
  p_next_attempt_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count integer;
  clean_error text;
BEGIN
  clean_error := left(btrim(COALESCE(p_last_error, 'retry')), 200);

  UPDATE public.search_recrawl_queue AS q
  SET
    status = 'pending',
    attempts = GREATEST(COALESCE(p_attempts, q.attempts), 0),
    last_error = clean_error,
    last_http_status = p_last_http_status,
    next_attempt_at = COALESCE(p_next_attempt_at, now()),
    lease_token = NULL,
    leased_until = NULL,
    updated_at = now()
  WHERE q.id = p_id
    AND q.lease_token = p_token
    AND q.status = 'leased';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_search_recrawl(uuid, uuid, integer, text, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_search_recrawl(uuid, uuid, integer, text, integer, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.retry_search_recrawl(uuid, uuid, integer, text, integer, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.retry_search_recrawl(uuid, uuid, integer, text, integer, timestamptz) TO service_role;

CREATE FUNCTION public.dead_letter_search_recrawl(
  p_id uuid,
  p_token uuid,
  p_attempts integer,
  p_last_error text,
  p_last_http_status integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.search_recrawl_queue AS q
  SET
    status = 'dead',
    attempts = GREATEST(COALESCE(p_attempts, q.attempts), 0),
    last_error = left(btrim(COALESCE(p_last_error, 'dead')), 200),
    last_http_status = p_last_http_status,
    lease_token = NULL,
    leased_until = NULL,
    updated_at = now()
  WHERE q.id = p_id
    AND q.lease_token = p_token
    AND q.status = 'leased';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE FUNCTION public.reject_search_recrawl(
  p_id uuid,
  p_token uuid,
  p_last_error text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.search_recrawl_queue AS q
  SET
    status = 'rejected',
    last_error = left(btrim(COALESCE(p_last_error, 'rejected')), 200),
    lease_token = NULL,
    leased_until = NULL,
    updated_at = now()
  WHERE q.id = p_id
    AND q.lease_token = p_token
    AND q.status = 'leased';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION public.reject_search_recrawl(uuid, uuid, text) IS
  'Service-only. Drops a URL that is not https://audiolad.ru. Not sent and not retried.';

REVOKE ALL ON FUNCTION public.reject_search_recrawl(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_search_recrawl(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reject_search_recrawl(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_search_recrawl(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.dead_letter_search_recrawl(uuid, uuid, integer, text, integer) IS
  'Service-only permanent failure. Not a successful delivery and not retried.';

REVOKE ALL ON FUNCTION public.dead_letter_search_recrawl(uuid, uuid, integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dead_letter_search_recrawl(uuid, uuid, integer, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.dead_letter_search_recrawl(uuid, uuid, integer, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dead_letter_search_recrawl(uuid, uuid, integer, text, integer) TO service_role;

CREATE FUNCTION public.search_recrawl_yandex_health()
RETURNS TABLE (
  pending_count integer,
  oldest_pending_at timestamptz,
  last_delivered_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE q.status IN ('pending', 'leased'))::integer,
    min(q.created_at) FILTER (WHERE q.status IN ('pending', 'leased')),
    max(q.delivered_at) FILTER (WHERE q.status = 'delivered')
  FROM public.search_recrawl_queue AS q
  WHERE q.engine = 'yandex';
END;
$$;

COMMENT ON FUNCTION public.search_recrawl_yandex_health() IS
  'Service-only counts for the audiolad.ru Yandex recrawl queue. No URLs, tokens, or errors.';

REVOKE ALL ON FUNCTION public.search_recrawl_yandex_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_recrawl_yandex_health() FROM anon;
REVOKE ALL ON FUNCTION public.search_recrawl_yandex_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_recrawl_yandex_health() TO service_role;

COMMIT;
