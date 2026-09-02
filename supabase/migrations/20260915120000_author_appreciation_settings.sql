-- Author Appreciation Phase 2: eligibility settings only.
-- No payment, order, ledger, payout, GetCourse, or callback objects.
-- DO NOT apply to production without explicit approval.

BEGIN;

CREATE TABLE IF NOT EXISTS public.author_appreciation_settings (
  author_id uuid PRIMARY KEY REFERENCES public.authors (id) ON DELETE CASCADE,
  listener_appreciation_enabled boolean NOT NULL DEFAULT true,
  listener_appreciation_profile_enabled boolean NOT NULL DEFAULT true,
  listener_appreciation_free_products_default boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.author_appreciation_settings IS
  'Optional author-level visibility settings for the future listener appreciation flow. No row means eligible commercial authors use all true defaults.';

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS listener_appreciation_override boolean NULL;

COMMENT ON COLUMN public.practices.listener_appreciation_override IS
  'Nullable product-level visibility override for listener appreciation: NULL inherits the author free-products default; true/false explicitly override it.';

ALTER TABLE public.author_appreciation_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_appreciation_settings FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.author_appreciation_settings TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.author_appreciation_settings TO authenticated;
GRANT SELECT ON TABLE public.author_appreciation_settings TO anon;
GRANT ALL ON TABLE public.author_appreciation_settings TO service_role;

DROP POLICY IF EXISTS "Public can read appreciation settings"
  ON public.author_appreciation_settings;
CREATE POLICY "Public can read appreciation settings"
  ON public.author_appreciation_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Author members can insert appreciation settings"
  ON public.author_appreciation_settings;
CREATE POLICY "Author members can insert appreciation settings"
  ON public.author_appreciation_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.author_members_can_mutate(author_id));

DROP POLICY IF EXISTS "Author members can update appreciation settings"
  ON public.author_appreciation_settings;
CREATE POLICY "Author members can update appreciation settings"
  ON public.author_appreciation_settings
  FOR UPDATE TO authenticated
  USING (public.author_members_can_mutate(author_id))
  WITH CHECK (public.author_members_can_mutate(author_id));

COMMIT;
