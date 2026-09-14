BEGIN;

CREATE TABLE public.seo_query_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid NOT NULL REFERENCES public.seo_queries(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  submitted_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_query_proposals_query_author_unique UNIQUE (query_id, author_id)
);

CREATE INDEX seo_query_proposals_author_created_idx
  ON public.seo_query_proposals(author_id, created_at DESC);
CREATE INDEX seo_query_proposals_query_lookup_idx
  ON public.seo_query_proposals(query_id);

ALTER TABLE public.seo_query_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY seo_query_proposals_select_own_or_staff ON public.seo_query_proposals
  FOR SELECT TO authenticated USING (
    public.is_platform_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.author_members
      WHERE author_id = seo_query_proposals.author_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY seo_query_proposals_manage_staff ON public.seo_query_proposals
  FOR ALL TO authenticated
  USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));

REVOKE ALL ON public.seo_query_proposals FROM PUBLIC, anon;
GRANT SELECT ON public.seo_query_proposals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.seo_query_proposals TO authenticated;
GRANT ALL ON public.seo_query_proposals TO service_role;

COMMIT;
