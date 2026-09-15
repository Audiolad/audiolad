-- One FREE Studio music product per public author workspace (practices.author_id).
-- Configuration invariant only: no pricing rewrites, no entitlement changes,
-- no automatic FREE→PAID conversion, no duplicate cleanup.
--
-- Slot occupancy (must match src/lib/studio-music/free-slot.ts):
--   deleted_at IS NULL
--   AND music_usage_permission = 'platform_reuse_allowed'
--   AND (
--     studio_music_pricing_mode = 'free'
--     OR (
--       studio_music_pricing_mode IS NULL
--       AND (is_free IS TRUE OR price IS NULL OR price <= 0)
--     )
--   )
-- Soft-delete (deleted_at) releases the slot. Status 'archived' is retired.
-- audio_items / album track count intentionally NOT part of the predicate.
--
-- DEPLOY BLOCKER: CREATE UNIQUE INDEX fails if any author_id still has 2+
-- occupying rows. Clean inventory manually before production apply.

CREATE UNIQUE INDEX practices_one_free_studio_music_per_author_uidx
  ON public.practices (author_id)
  WHERE deleted_at IS NULL
    AND music_usage_permission = 'platform_reuse_allowed'
    AND (
      studio_music_pricing_mode = 'free'
      OR (
        studio_music_pricing_mode IS NULL
        AND (
          is_free IS TRUE
          OR price IS NULL
          OR price <= 0
        )
      )
    );

COMMENT ON INDEX public.practices_one_free_studio_music_per_author_uidx IS
  'audiolad:studio-one-free-per-author:v1; at most one FREE Studio music product (explicit free or legacy NULL+listener-free) per practices.author_id while not soft-deleted';
