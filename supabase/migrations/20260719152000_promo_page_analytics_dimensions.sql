BEGIN;

-- ---------------------------------------------------------------------------
-- Analytics dimensions for promo pages (additive; no client pipeline changes yet)
-- ---------------------------------------------------------------------------

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS promo_page_id uuid NULL
    REFERENCES public.promo_pages (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_campaign_id uuid NULL
    REFERENCES public.promotion_campaigns (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS analytics_events_promo_page_id_created_idx
  ON public.analytics_events (promo_page_id, created_at DESC)
  WHERE promo_page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_promotion_campaign_id_created_idx
  ON public.analytics_events (promotion_campaign_id, created_at DESC)
  WHERE promotion_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_promo_page_event_created_idx
  ON public.analytics_events (promo_page_id, event_name, created_at DESC)
  WHERE promo_page_id IS NOT NULL;

COMMENT ON COLUMN public.analytics_events.promo_page_id IS
  'Optional promo landing page attribution dimension.';

COMMENT ON COLUMN public.analytics_events.promotion_campaign_id IS
  'Optional author promotion campaign attribution dimension.';

COMMIT;
