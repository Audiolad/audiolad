-- Minimal isolated schema for PR4A partner reward ledger tests.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TABLE public.authors (id uuid PRIMARY KEY, name text);
CREATE TABLE public.author_referrals (
  id uuid PRIMARY KEY,
  referrer_author_id uuid NOT NULL REFERENCES public.authors(id),
  invitee_author_id uuid NULL REFERENCES public.authors(id),
  invitee_user_id uuid NULL REFERENCES auth.users(id),
  status text NOT NULL,
  activated_at timestamptz NULL,
  expires_at timestamptz NULL
);
CREATE TABLE public.author_ledger_entries (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors(id),
  entry_type text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  payment_id uuid NULL,
  effective_at timestamptz NOT NULL,
  available_at timestamptz NULL,
  correlation_id text NULL,
  is_test boolean NOT NULL DEFAULT false
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
