CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

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

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_author_promotion(
  p_author_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = p_author_id
        AND am.user_id = p_user_id
        AND am.role IN ('owner', 'editor')
    );
$$;

CREATE TABLE public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE public.author_members (
  author_id uuid NOT NULL REFERENCES public.authors (id),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  role text NOT NULL,
  PRIMARY KEY (author_id, user_id)
);

CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors (id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'published',
  price integer NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NULL
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  practice_id uuid NOT NULL REFERENCES public.practices (id),
  status text NOT NULL DEFAULT 'pending',
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  practice_title_snapshot text NOT NULL,
  practice_slug_snapshot text NOT NULL,
  price_minor_snapshot bigint NOT NULL,
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL,
  analytics_session_id uuid NULL,
  analytics_anonymous_id text NULL,
  attribution_user_id uuid NULL,
  session_utm_source text NULL,
  session_utm_medium text NULL,
  session_utm_campaign text NULL,
  session_utm_content text NULL,
  session_utm_term text NULL,
  session_referrer_domain text NULL,
  session_landing_path text NULL,
  checkout_origin_path text NULL,
  attribution_captured_at timestamptz NULL,
  attribution_confidence text NULL,
  author_id_snapshot uuid NULL,
  buy_click_event_id uuid NULL,
  buy_click_client_event_id uuid NULL,
  buy_click_occurred_at timestamptz NULL,
  purchase_surface text NULL
);

CREATE TABLE public.user_practices (
  user_id uuid NOT NULL REFERENCES auth.users (id),
  practice_id uuid NOT NULL REFERENCES public.practices (id),
  access_source text NOT NULL DEFAULT 'purchase',
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  PRIMARY KEY (user_id, practice_id)
);

CREATE OR REPLACE FUNCTION public.sanitize_checkout_origin_path(p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(btrim(p_path), '');
$$;

CREATE OR REPLACE FUNCTION public.resolve_order_attribution_snapshot(
  p_user_id uuid,
  p_analytics_session_id uuid,
  p_analytics_anonymous_id text,
  p_checkout_origin_path text
)
RETURNS TABLE (
  ok boolean,
  analytics_session_id uuid,
  analytics_anonymous_id text,
  attribution_user_id uuid,
  session_utm_source text,
  session_utm_medium text,
  session_utm_campaign text,
  session_utm_content text,
  session_utm_term text,
  session_referrer_domain text,
  session_landing_path text,
  checkout_origin_path text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    false,
    NULL::uuid,
    NULL::text,
    NULL::uuid,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    public.sanitize_checkout_origin_path(p_checkout_origin_path);
$$;

CREATE OR REPLACE FUNCTION public.resolve_buy_click_for_order(
  p_user_id uuid,
  p_practice_id uuid,
  p_session_id uuid,
  p_client_event_id uuid,
  p_now timestamptz
)
RETURNS TABLE (
  ok boolean,
  reason text,
  event_id uuid,
  client_event_id uuid,
  occurred_at timestamptz,
  purchase_surface text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    false,
    'missing_client_event_id',
    NULL::uuid,
    NULL::uuid,
    NULL::timestamptz,
    NULL::text;
$$;
