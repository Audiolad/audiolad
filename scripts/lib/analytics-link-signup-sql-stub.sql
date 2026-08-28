-- Isolated stub for analytics link/signup idempotency harness.
-- Throwaway Postgres 16 only. Never apply to production supabase-db.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS dblink;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL,
  user_id uuid NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human'
);

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  user_id uuid NULL,
  anonymous_session_id text NULL,
  session_id uuid NULL REFERENCES public.analytics_sessions(id),
  path text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX analytics_events_signup_completed_user_uidx
  ON public.analytics_events (user_id)
  WHERE event_name = 'signup_completed' AND user_id IS NOT NULL;

CREATE TABLE public.analytics_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL,
  user_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz NULL,
  source text NOT NULL DEFAULT 'login',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX analytics_identity_links_active_anon_uidx
  ON public.analytics_identity_links (anonymous_id)
  WHERE unlinked_at IS NULL;

CREATE TABLE public.analytics_write_log (
  id bigserial PRIMARY KEY,
  tbl text NOT NULL,
  op text NOT NULL,
  session_id uuid,
  user_id uuid,
  logged_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.analytics_identity_link_calls (
  id bigserial PRIMARY KEY,
  anonymous_id text,
  source text,
  retro_hours integer,
  user_id uuid,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.log_analytics_session_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.analytics_write_log (tbl, op, session_id, user_id)
  VALUES ('analytics_sessions', TG_OP, NEW.id, NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_analytics_event_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.analytics_write_log (tbl, op, session_id, user_id)
  VALUES ('analytics_events', TG_OP, NEW.session_id, NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER analytics_sessions_write_log
  AFTER UPDATE ON public.analytics_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_analytics_session_write();

CREATE TRIGGER analytics_events_write_log
  AFTER UPDATE ON public.analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION public.log_analytics_event_write();

CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.is_analytics_test_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;

-- Stand-in for the live identity RPC. Logs every entry so the harness can
-- prove already-linked repeats never take the advisory / identity heavy path.
CREATE OR REPLACE FUNCTION public.link_analytics_identity(
  p_anonymous_id text,
  p_source text DEFAULT 'login',
  p_retro_staff_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_link_id uuid;
BEGIN
  INSERT INTO public.analytics_identity_link_calls (
    anonymous_id,
    source,
    retro_hours,
    user_id
  )
  VALUES (
    btrim(p_anonymous_id),
    p_source,
    p_retro_staff_hours,
    v_user_id
  );

  SELECT l.id
  INTO v_link_id
  FROM public.analytics_identity_links AS l
  WHERE l.anonymous_id = btrim(p_anonymous_id)
    AND l.user_id = v_user_id
    AND l.unlinked_at IS NULL
  LIMIT 1;

  IF v_link_id IS NULL THEN
    INSERT INTO public.analytics_identity_links (
      anonymous_id,
      user_id,
      source
    )
    VALUES (
      btrim(p_anonymous_id),
      v_user_id,
      coalesce(nullif(btrim(p_source), ''), 'login')
    )
    RETURNING id INTO v_link_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'link_id', v_link_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_call_link_analytics_session_user(
  p_user_id uuid,
  p_session_id uuid,
  p_anonymous_id text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('test.uid', p_user_id::text, true);
  RETURN public.link_analytics_session_user(p_session_id, p_anonymous_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_call_record_platform_signup_completed(
  p_user_id uuid,
  p_session_id uuid,
  p_anonymous_id text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('test.uid', p_user_id::text, true);
  RETURN public.record_platform_signup_completed(p_session_id, p_anonymous_id);
END;
$$;
