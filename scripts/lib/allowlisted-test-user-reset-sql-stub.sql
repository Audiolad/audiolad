-- Isolated schema for allowlisted test-user reset smoke.
-- Not applied to production. Tables are the minimum the RPC and trigger touch.

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

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text,
  author_project_slots_partner_bonus integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY,
  slug text UNIQUE,
  name text
);

CREATE TABLE IF NOT EXISTS public.author_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  UNIQUE (author_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.author_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT,
  referrer_owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  invitee_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  invitee_author_id uuid NULL REFERENCES public.authors (id) ON DELETE SET NULL,
  code_used text NOT NULL,
  code_normalized text NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  expires_at timestamptz NULL,
  activation_author_id_snapshot uuid NULL,
  bonus_slot_granted_at timestamptz NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.author_partner_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE CASCADE,
  invitee_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  bound_referral_id uuid NULL REFERENCES public.author_referrals (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS public.author_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_id uuid NULL REFERENCES public.authors (id) ON DELETE SET NULL,
  reviewed_by uuid NULL REFERENCES auth.users (id),
  status text NOT NULL DEFAULT 'approved'
);

CREATE TABLE IF NOT EXISTS public.author_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT,
  accepted_by_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  status text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.author_project_capacity_grants (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.author_ledger_entries (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.author_partner_reward_ledger_entries (
  id uuid PRIMARY KEY,
  referral_id uuid NOT NULL REFERENCES public.author_referrals (id) ON DELETE RESTRICT,
  partner_author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT,
  invitee_author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.author_payouts (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.author_payout_profiles (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  author_id uuid NULL REFERENCES public.authors (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.personal_materials (
  id uuid PRIMARY KEY,
  author_id uuid NULL REFERENCES public.authors (id) ON DELETE RESTRICT,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  claimed_by_user_id uuid NULL REFERENCES auth.users (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.promotion_campaigns (
  id uuid PRIMARY KEY,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.personal_material_templates (
  id uuid PRIMARY KEY,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.hidden_author_blocker (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.author_space_delete_blockers(p_author_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_blockers text[] := ARRAY[]::text[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.practices AS p WHERE p.author_id = p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_practices');
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_ledger_entries AS e WHERE e.author_id = p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_finance');
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_payouts AS p WHERE p.author_id = p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_finance');
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_payout_profiles AS p WHERE p.author_id = p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_payout_profile');
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_terms_acceptances AS t WHERE t.author_id = p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_terms_acceptance');
  END IF;
  IF EXISTS (SELECT 1 FROM public.personal_materials AS m WHERE m.author_id = p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_personal_materials');
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_referrals AS r WHERE r.referrer_author_id = p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_partner_referrals_as_referrer');
  END IF;
  RETURN v_blockers;
END;
$$;
