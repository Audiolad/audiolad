-- BASELINE FOR EMPTY DATABASES ONLY.
-- DO NOT APPLY TO THE EXISTING PRODUCTION DATABASE.
--
-- Row Level Security, policies, and table privileges.
-- Prerequisites: 0001_core_schema.sql applied.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.starter_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_practices ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies (match production)
-- ---------------------------------------------------------------------------

CREATE POLICY "Public can read authors"
  ON public.authors
  FOR SELECT
  USING (true);

CREATE POLICY "Public can read published practices"
  ON public.practices
  FOR SELECT
  USING (status = 'published'::text);

CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view own library"
  ON public.user_practices
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own purchases"
  ON public.purchases
  FOR SELECT
  USING (auth.uid() = user_id);

-- starter_practices: RLS enabled, no client policies (deny anon/authenticated)

-- ---------------------------------------------------------------------------
-- Table privileges (match production grants)
-- ---------------------------------------------------------------------------

GRANT ALL ON TABLE public.authors TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.practices TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.purchases TO anon, authenticated, service_role;

GRANT ALL ON TABLE public.starter_practices TO service_role;

REVOKE ALL ON TABLE public.user_practices FROM PUBLIC;
REVOKE ALL ON TABLE public.user_practices FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_practices TO authenticated;
GRANT ALL ON TABLE public.user_practices TO service_role;

COMMIT;
