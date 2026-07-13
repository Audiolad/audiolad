-- BASELINE FOR EMPTY DATABASES ONLY.
-- DO NOT APPLY TO THE EXISTING PRODUCTION DATABASE.
--
-- Core public tables for АудиоЛад.
-- Prerequisites: auth.users must exist (Supabase Auth schema).
-- Exported from production schema (read-only), 2026-07-12.

BEGIN;

-- ---------------------------------------------------------------------------
-- authors
-- ---------------------------------------------------------------------------

CREATE TABLE public.authors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.authors
  ADD CONSTRAINT authors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.authors
  ADD CONSTRAINT authors_slug_key UNIQUE (slug);

-- ---------------------------------------------------------------------------
-- practices
-- ---------------------------------------------------------------------------

CREATE TABLE public.practices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  author_id uuid,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  format text,
  duration_minutes integer,
  price integer DEFAULT 0,
  is_free boolean DEFAULT false,
  cover_url text,
  audio_url text,
  status text DEFAULT 'published'::text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.practices
  ADD CONSTRAINT practices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.practices
  ADD CONSTRAINT practices_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.practices
  ADD CONSTRAINT practices_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.authors(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  role text DEFAULT 'listener'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- purchases
-- NOTE: production has NO foreign key on user_id → auth.users (documented risk).
-- ---------------------------------------------------------------------------

CREATE TABLE public.purchases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  practice_id uuid,
  amount integer NOT NULL,
  status text DEFAULT 'paid'::text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.purchases
  ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchases
  ADD CONSTRAINT purchases_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- user_practices (entitlement / library)
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_practices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  practice_id uuid NOT NULL,
  access_source text NOT NULL,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_practices_access_source_check CHECK (
    access_source = ANY (
      ARRAY[
        'starter'::text,
        'free_claim'::text,
        'purchase'::text,
        'gift'::text,
        'subscription'::text,
        'program'::text,
        'admin'::text
      ]
    )
  ),
  CONSTRAINT user_practices_expires_after_granted_check CHECK (
    expires_at IS NULL OR expires_at > granted_at
  )
);

ALTER TABLE ONLY public.user_practices
  ADD CONSTRAINT user_practices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_practices
  ADD CONSTRAINT user_practices_user_practice_unique UNIQUE (user_id, practice_id);

ALTER TABLE ONLY public.user_practices
  ADD CONSTRAINT user_practices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_practices
  ADD CONSTRAINT user_practices_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE CASCADE;

CREATE INDEX user_practices_user_id_granted_at_idx
  ON public.user_practices USING btree (user_id, granted_at DESC);

CREATE INDEX user_practices_practice_id_idx
  ON public.user_practices USING btree (practice_id);

COMMENT ON TABLE public.user_practices IS
  'Per-user access rights to practices. Separate from financial purchases.';

COMMENT ON COLUMN public.user_practices.access_source IS
  'How access was granted: starter, free_claim, purchase, gift, subscription, program, or admin.';

COMMENT ON COLUMN public.user_practices.expires_at IS
  'Optional access expiry. NULL means permanent access for the current entitlement model.';

-- ---------------------------------------------------------------------------
-- starter_practices
-- ---------------------------------------------------------------------------

CREATE TABLE public.starter_practices (
  practice_id uuid NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT starter_practices_sort_order_positive_check CHECK (sort_order > 0)
);

ALTER TABLE ONLY public.starter_practices
  ADD CONSTRAINT starter_practices_pkey PRIMARY KEY (practice_id);

ALTER TABLE ONLY public.starter_practices
  ADD CONSTRAINT starter_practices_sort_order_unique UNIQUE (sort_order);

ALTER TABLE ONLY public.starter_practices
  ADD CONSTRAINT starter_practices_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE CASCADE;

CREATE INDEX starter_practices_active_sort_idx
  ON public.starter_practices USING btree (sort_order)
  WHERE is_active = true;

COMMENT ON TABLE public.starter_practices IS
  'Platform-curated starter bundle. New users receive active entries at registration time.';

COMMIT;
