-- Disposable cluster only. Proves RLS, one vote, rewind, and claim
-- without a second registered row.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  title text,
  product_kind text
);

CREATE TABLE IF NOT EXISTS public.practice_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  practice_id uuid NOT NULL REFERENCES public.practices (id),
  stars smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  excluded_at timestamptz,
  UNIQUE (user_id, practice_id)
);

CREATE OR REPLACE FUNCTION public.set_practice_rating(
  p_user_id uuid,
  p_practice_id uuid,
  p_stars integer,
  p_ip_hmac text,
  p_device_id_hmac text,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.practice_ratings (
    user_id, practice_id, stars, created_at, updated_at
  ) VALUES (
    p_user_id, p_practice_id, p_stars, COALESCE(p_now, now()), COALESCE(p_now, now())
  );
END;
$$;
