-- Add public.practices to the Supabase Realtime publication.
--
-- Signal-only: clients may learn that a row changed, then reload public
-- data through existing loaders. This migration does not change RLS,
-- policies, grants, or row contents. postgres_changes still require the
-- existing SELECT policies, so non-public rows stay invisible to viewers
-- who cannot already read them.
--
-- REPLICA IDENTITY FULL gives Realtime the previous row image so those
-- SELECT policies can be evaluated when a row changes or goes away.
-- The primary key alone is not enough.

ALTER TABLE public.practices REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'practices'
  )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.practices;
  END IF;
END
$$;
