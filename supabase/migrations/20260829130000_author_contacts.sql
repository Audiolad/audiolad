BEGIN;

-- ---------------------------------------------------------------------------
-- Author public contacts (Telegram, MAX, custom links)
-- Extensible platform list: add values to the CHECK later without a rewrite.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  platform text NOT NULL,
  title text NOT NULL,
  description text NULL,
  url text NOT NULL,
  icon_url text NULL,
  icon_path text NULL,
  icon_image jsonb NULL,
  sort_order integer NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_contacts_platform_check
    CHECK (platform IN ('telegram', 'max', 'custom')),
  CONSTRAINT author_contacts_title_check
    CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 120),
  CONSTRAINT author_contacts_description_check
    CHECK (description IS NULL OR char_length(description) <= 120),
  CONSTRAINT author_contacts_url_check
    CHECK (
      char_length(url) > 0
      AND char_length(url) <= 512
      AND (
        url ~* '^https://[^\s]+$'
        OR url ~* '^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$'
      )
    ),
  CONSTRAINT author_contacts_sort_order_check
    CHECK (sort_order >= 0 AND sort_order < 6)
);

CREATE INDEX IF NOT EXISTS author_contacts_author_id_sort_idx
  ON public.author_contacts (author_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS author_contacts_author_sort_order_key
  ON public.author_contacts (author_id, sort_order);

CREATE INDEX IF NOT EXISTS author_contacts_author_visible_sort_idx
  ON public.author_contacts (author_id, is_visible, sort_order)
  WHERE is_visible = true;

COMMENT ON TABLE public.author_contacts IS
  'Public author contacts/links. Platform is a catalog value (telegram, max, custom) and can grow later.';

COMMENT ON COLUMN public.author_contacts.platform IS
  'Contact platform key. Current values: telegram, max, custom. Not hard-wired in product logic beyond labels/icons.';

COMMENT ON COLUMN public.author_contacts.title IS
  'Author-entered display title. Never auto-generated as a required value.';

COMMENT ON COLUMN public.author_contacts.description IS
  'Optional short text, max 120 chars. Empty/null must not reserve space on the public page.';

COMMENT ON COLUMN public.author_contacts.url IS
  'Clickable https:// or mailto: link.';

COMMENT ON COLUMN public.author_contacts.icon_url IS
  'Optional uploaded icon public URL. NULL means use the built-in platform icon.';

COMMENT ON COLUMN public.author_contacts.icon_path IS
  'Storage object path in author-assets: authors/{author_id}/contacts/{contact_id}/...';

COMMENT ON COLUMN public.author_contacts.sort_order IS
  'Display order 0..5 (max 6 contacts per author).';

COMMENT ON COLUMN public.author_contacts.is_visible IS
  'When false, the contact stays in the author cabinet and is hidden from the public page.';

ALTER TABLE public.author_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read visible author contacts" ON public.author_contacts;
CREATE POLICY "Public can read visible author contacts"
  ON public.author_contacts
  FOR SELECT
  TO anon, authenticated
  USING (is_visible = true);

DROP POLICY IF EXISTS "Author members can manage author contacts" ON public.author_contacts;
CREATE POLICY "Author members can manage author contacts"
  ON public.author_contacts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_contacts.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_contacts.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

GRANT SELECT ON TABLE public.author_contacts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.author_contacts TO authenticated, service_role;

COMMIT;
