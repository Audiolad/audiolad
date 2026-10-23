-- Extra stubs for the cover columns smoke test (migration 20270118120000).
-- Applied after scripts/lib/practice-covers-storage-policy-sql-stub.sql.
-- RLS mirrors the real author policies: owner/editor of the author may
-- write, deleted products are not writable, viewers and other accounts are
-- filtered out.
ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS cover_image jsonb,
  ADD COLUMN IF NOT EXISTS use_shared_cover boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id),
  title text,
  cover_url text,
  cover_image jsonb,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.publication_gallery_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.practices (id),
  image_url text NOT NULL,
  image_manifest jsonb,
  position integer NOT NULL DEFAULT 0,
  alt text,
  updated_at timestamptz
);

CREATE OR REPLACE FUNCTION public.t_cc_can_mutate(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.author_members
    WHERE author_id = p_author_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  )
$$;

CREATE OR REPLACE FUNCTION public.t_cc_can_mutate_practice(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.practices p
    WHERE p.id = p_practice_id
      AND p.deleted_at IS NULL
      AND public.t_cc_can_mutate(p.author_id)
  )
$$;

ALTER TABLE public.practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_gallery_slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS t_cc_practices_read ON public.practices;
CREATE POLICY t_cc_practices_read ON public.practices FOR SELECT USING (true);
DROP POLICY IF EXISTS t_cc_practices_insert ON public.practices;
CREATE POLICY t_cc_practices_insert ON public.practices FOR INSERT TO authenticated
  WITH CHECK (public.t_cc_can_mutate(author_id));
DROP POLICY IF EXISTS t_cc_practices_update ON public.practices;
CREATE POLICY t_cc_practices_update ON public.practices FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.t_cc_can_mutate(author_id))
  WITH CHECK (deleted_at IS NULL AND public.t_cc_can_mutate(author_id));

DROP POLICY IF EXISTS t_cc_audio_read ON public.audio_items;
CREATE POLICY t_cc_audio_read ON public.audio_items FOR SELECT USING (true);
DROP POLICY IF EXISTS t_cc_audio_insert ON public.audio_items;
CREATE POLICY t_cc_audio_insert ON public.audio_items FOR INSERT TO authenticated
  WITH CHECK (public.t_cc_can_mutate_practice(practice_id));
DROP POLICY IF EXISTS t_cc_audio_update ON public.audio_items;
CREATE POLICY t_cc_audio_update ON public.audio_items FOR UPDATE TO authenticated
  USING (public.t_cc_can_mutate_practice(practice_id))
  WITH CHECK (public.t_cc_can_mutate_practice(practice_id));

DROP POLICY IF EXISTS t_cc_slides_read ON public.publication_gallery_slides;
CREATE POLICY t_cc_slides_read ON public.publication_gallery_slides FOR SELECT USING (true);
DROP POLICY IF EXISTS t_cc_slides_insert ON public.publication_gallery_slides;
CREATE POLICY t_cc_slides_insert ON public.publication_gallery_slides FOR INSERT TO authenticated
  WITH CHECK (public.t_cc_can_mutate_practice(publication_id));
DROP POLICY IF EXISTS t_cc_slides_update ON public.publication_gallery_slides;
CREATE POLICY t_cc_slides_update ON public.publication_gallery_slides FOR UPDATE TO authenticated
  USING (public.t_cc_can_mutate_practice(publication_id))
  WITH CHECK (public.t_cc_can_mutate_practice(publication_id));
DROP POLICY IF EXISTS t_cc_slides_delete ON public.publication_gallery_slides;
CREATE POLICY t_cc_slides_delete ON public.publication_gallery_slides FOR DELETE TO authenticated
  USING (public.t_cc_can_mutate_practice(publication_id));

GRANT EXECUTE ON FUNCTION public.t_cc_can_mutate(uuid), public.t_cc_can_mutate_practice(uuid)
  TO authenticated, service_role;
GRANT SELECT ON public.practices, public.audio_items, public.publication_gallery_slides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.practices, public.audio_items, public.publication_gallery_slides
  TO authenticated, service_role;

-- Fixtures. P1 draft (author A1), P3 submitted (A1), P2 draft (A2).
-- U1 editor of A1, U3 viewer of A1, U2 owner of A2.
UPDATE public.practices
SET title = 'P1', cover_url = 'https://example.test/p1.webp', cover_image = '{"v":1}'::jsonb
WHERE id = '11111111-1111-4111-8111-111111111111';
UPDATE public.practices
SET title = 'P2', cover_url = 'https://example.test/p2.webp'
WHERE id = '22222222-2222-4222-8222-222222222222';
INSERT INTO public.practices (id, author_id, title, status, moderation_status, cover_url)
VALUES ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'P3', 'draft', 'submitted', 'https://example.test/p3.webp')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audio_items (id, practice_id, title, cover_url) VALUES
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', '11111111-1111-4111-8111-111111111111', 'T1', 'https://example.test/t1.webp'),
  ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', '33333333-3333-4333-8333-333333333333', 'T3', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.publication_gallery_slides (id, publication_id, image_url, position) VALUES
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', '11111111-1111-4111-8111-111111111111', 'https://example.test/s1.webp', 0),
  ('d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', '11111111-1111-4111-8111-111111111111', 'https://example.test/s2.webp', 1),
  ('d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3', '33333333-3333-4333-8333-333333333333', 'https://example.test/s3.webp', 0)
ON CONFLICT (id) DO NOTHING;
