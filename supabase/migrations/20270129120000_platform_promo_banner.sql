-- Additive only. Apply only after separate owner approval.
-- One managed placement; no changes to existing tables or data.
CREATE TABLE public.platform_promo_banners (
  id text PRIMARY KEY CHECK (id = 'catalog'),
  enabled boolean NOT NULL DEFAULT false,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 240),
  image text NOT NULL CHECK (length(image) BETWEEN 1 AND 2048),
  href text NOT NULL CHECK (length(href) BETWEEN 1 AND 2048)
);
ALTER TABLE public.platform_promo_banners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_promo_banners FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_promo_banners TO anon, authenticated;
GRANT INSERT, UPDATE ON public.platform_promo_banners TO authenticated;
GRANT ALL ON public.platform_promo_banners TO service_role;

-- Disabled settings contain no private information; the admin must read them too.
CREATE POLICY platform_promo_read ON public.platform_promo_banners
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY platform_promo_insert ON public.platform_promo_banners
  FOR INSERT TO authenticated WITH CHECK (
    public.has_platform_permission(auth.uid(), 'admin_panel.access')
    AND public.has_platform_permission(auth.uid(), 'settings.manage')
  );
CREATE POLICY platform_promo_update ON public.platform_promo_banners
  FOR UPDATE TO authenticated USING (
    public.has_platform_permission(auth.uid(), 'admin_panel.access')
    AND public.has_platform_permission(auth.uid(), 'settings.manage')
  ) WITH CHECK (
    public.has_platform_permission(auth.uid(), 'admin_panel.access')
    AND public.has_platform_permission(auth.uid(), 'settings.manage')
  );

INSERT INTO public.platform_promo_banners (id, enabled, title, caption, image, href)
VALUES ('catalog', true, 'Школа аудиопрактик',
  'Научитесь создавать авторские аудиопрактики',
  '/images/catalog-promo/school.svg', 'https://school.audiolad.ru/');
