-- Additive extras for isolated Phase 4 upgrade-order tests.
-- Applied after the course-access-levels foundation stub + migration.
-- Never apply to production.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS author_id_snapshot uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique_idx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_pending_per_user_practice_idx
  ON public.orders (user_id, practice_id)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON TABLE public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO service_role;
GRANT SELECT ON TABLE public.practices TO authenticated;
GRANT SELECT ON TABLE public.practice_access_levels TO authenticated;

CREATE OR REPLACE FUNCTION public.viewer_can_commercially_access_practice(
  p_practice public.practices,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_practice.status = 'published'
     AND p_practice.deleted_at IS NULL;
$$;
