-- Task c353a4b5: статистика авторов, пространств, продуктов и треков АудиоЛада в ИИ-компании.
-- ADDITIVE ONLY: one new table + three new functions. No existing table, column, policy or
-- publication logic is changed. Rollback: docs/ai-company/ecompany-catalog-stats-c353a4b5-rollback.sql.
--
-- Real model (verified read-only on production 2026-10-16):
--   person author      = DISTINCT public.author_members.user_id (a user who owns/joins an author space)
--   author space       = public.authors row (one person may own several spaces)
--   published product  = public.practices with practice_affects_public_surface(...) = true
--                        (status published, go-live reached, not deleted, listed/unlisted);
--                        drafts, unpublished, rejected (never published) and deleted rows excluded
--   published track    = public.audio_items row with status 'published' inside a published product,
--                        counted once per audio_items.id (course lessons only reference audio_items,
--                        so a track linked several times is still one row).

CREATE TABLE IF NOT EXISTS public.ecompany_catalog_stats_snapshots (
  snapshot_date date PRIMARY KEY,                 -- calendar day in Europe/Moscow
  captured_at timestamptz NOT NULL DEFAULT now(), -- last refresh within that day
  first_captured_at timestamptz NOT NULL DEFAULT now(),
  authors_total integer NOT NULL CHECK (authors_total >= 0),
  authors_with_published integer NOT NULL CHECK (authors_with_published >= 0),
  spaces_with_published integer NOT NULL CHECK (spaces_with_published >= 0),
  published_products integer NOT NULL CHECK (published_products >= 0),
  published_tracks integer NOT NULL CHECK (published_tracks >= 0),
  definition_version integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.ecompany_catalog_stats_snapshots IS
  'c353a4b5: daily (Europe/Moscow) snapshots of AudioLad catalog totals; history starts at the first row, nothing back-filled.';

ALTER TABLE public.ecompany_catalog_stats_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ecompany_catalog_stats_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.ecompany_catalog_stats_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ecompany_catalog_stats_snapshots TO service_role;

-- Totals "as of" each point (half-open: an object counts at point T if it qualified strictly
-- before T, so a period [from, to) gets exactly the objects that qualified inside it), reconstructed
-- from the CURRENT composition and real timestamps:
--   person author            : first author_members.created_at
--   product                  : published_at (first go-live; kept by the platform across withdrawals)
--   space / author with pub. : first go-live of ANY product of that space that was ever published
--                              (withdrawing the earliest product does not make the space "new" again);
--                              counted only while it still has a currently published product
--   track                    : later of track upload and the product's latest go-live (published_at or
--                              the latest moderation publish event), so tracks of a re-published
--                              product are attributed to the re-publication
-- Objects withdrawn from publication are not counted at any point; their withdrawal is visible
-- only in the dated snapshots as a decrease.
CREATE OR REPLACE FUNCTION public.ecompany_catalog_stats_counts(p_points timestamptz[])
RETURNS TABLE (
  point timestamptz,
  authors_total integer,
  authors_with_published integer,
  spaces_with_published integer,
  published_products integer,
  published_tracks integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH pp AS (
    SELECT p.id, p.author_id, coalesce(p.published_at, p.scheduled_publish_at, p.created_at) AS live_at
    FROM public.practices p
    WHERE public.practice_affects_public_surface(
      p.status, p.scheduled_publish_at, p.published_at, p.deleted_at, p.catalog_visibility, now())
  ),
  pp_latest AS (
    SELECT pp.id, greatest(pp.live_at, coalesce(max(e.created_at), pp.live_at)) AS latest_live_at
    FROM pp
    LEFT JOIN public.practice_moderation_events e
      ON e.practice_id = pp.id AND e.to_status = 'published'
    GROUP BY pp.id, pp.live_at
  ),
  people AS (
    SELECT m.user_id, min(m.created_at) AS since
    FROM public.author_members m
    WHERE m.user_id IS NOT NULL
    GROUP BY m.user_id
  ),
  spaces AS (
    SELECT p.author_id, min(coalesce(p.published_at, p.scheduled_publish_at, p.created_at)) AS since
    FROM public.practices p
    WHERE p.author_id IN (SELECT pp.author_id FROM pp)
      AND (p.published_at IS NOT NULL OR p.id IN (SELECT pp.id FROM pp))
    GROUP BY p.author_id
  ),
  people_pub AS (
    SELECT m.user_id, min(greatest(s.since, m.created_at)) AS since
    FROM public.author_members m
    JOIN spaces s ON s.author_id = m.author_id
    WHERE m.user_id IS NOT NULL
    GROUP BY m.user_id
  ),
  tracks AS (
    SELECT ai.id, min(greatest(l.latest_live_at, ai.created_at)) AS since
    FROM public.audio_items ai
    JOIN pp_latest l ON l.id = ai.practice_id
    WHERE ai.status = 'published'
    GROUP BY ai.id
  )
  SELECT pt,
    (SELECT count(*) FROM people WHERE since < pt)::integer,
    (SELECT count(*) FROM people_pub WHERE since < pt)::integer,
    (SELECT count(*) FROM spaces WHERE since < pt)::integer,
    (SELECT count(*) FROM pp WHERE live_at < pt)::integer,
    (SELECT count(*) FROM tracks WHERE since < pt)::integer
  FROM unnest(p_points) AS pt;
$$;

-- Upsert today's (Moscow) snapshot with the exact current totals. Idempotent; one row per day;
-- refreshed at most once per hour, so frequent board refreshes do not re-aggregate or contend.
CREATE OR REPLACE FUNCTION public.ecompany_catalog_stats_capture()
RETURNS public.ecompany_catalog_stats_snapshots
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c record;
  r public.ecompany_catalog_stats_snapshots;
BEGIN
  SELECT * INTO r FROM public.ecompany_catalog_stats_snapshots
  WHERE snapshot_date = (now() AT TIME ZONE 'Europe/Moscow')::date;
  IF FOUND AND r.captured_at > now() - interval '1 hour' THEN
    RETURN r;
  END IF;
  SELECT * INTO c FROM public.ecompany_catalog_stats_counts(ARRAY['infinity'::timestamptz]);
  INSERT INTO public.ecompany_catalog_stats_snapshots AS s (
    snapshot_date, captured_at, first_captured_at, authors_total, authors_with_published,
    spaces_with_published, published_products, published_tracks)
  VALUES ((now() AT TIME ZONE 'Europe/Moscow')::date, now(), now(), c.authors_total,
    c.authors_with_published, c.spaces_with_published, c.published_products, c.published_tracks)
  ON CONFLICT (snapshot_date) DO UPDATE SET
    captured_at = excluded.captured_at,
    authors_total = excluded.authors_total,
    authors_with_published = excluded.authors_with_published,
    spaces_with_published = excluded.spaces_with_published,
    published_products = excluded.published_products,
    published_tracks = excluded.published_tracks
  RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.ecompany_catalog_stats_history(p_limit integer DEFAULT 400)
RETURNS SETOF public.ecompany_catalog_stats_snapshots
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.ecompany_catalog_stats_snapshots
  ORDER BY snapshot_date DESC
  LIMIT greatest(1, least(coalesce(p_limit, 400), 2000));
$$;

CREATE OR REPLACE FUNCTION public.ecompany_catalog_stats_history_started()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT min(first_captured_at) FROM public.ecompany_catalog_stats_snapshots;
$$;

REVOKE ALL ON FUNCTION public.ecompany_catalog_stats_history_started() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ecompany_catalog_stats_history_started() TO service_role;
REVOKE ALL ON FUNCTION public.ecompany_catalog_stats_counts(timestamptz[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ecompany_catalog_stats_capture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ecompany_catalog_stats_history(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ecompany_catalog_stats_counts(timestamptz[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.ecompany_catalog_stats_capture() TO service_role;
GRANT EXECUTE ON FUNCTION public.ecompany_catalog_stats_history(integer) TO service_role;
