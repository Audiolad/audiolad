BEGIN;

-- ---------------------------------------------------------------------------
-- Saved custom promotion links per campaign (system Telegram/MAX/VK stay dynamic)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.promotion_campaign_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_id uuid NOT NULL
    REFERENCES public.promotion_campaigns (id) ON DELETE CASCADE,

  label text NOT NULL,
  utm_source text NOT NULL,
  utm_medium text NOT NULL,
  position integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT promotion_campaign_channels_label_check
    CHECK (
      char_length(btrim(label)) > 0
      AND char_length(label) <= 120
    ),

  CONSTRAINT promotion_campaign_channels_utm_source_check
    CHECK (utm_source ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

  CONSTRAINT promotion_campaign_channels_utm_medium_check
    CHECK (
      utm_medium ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      OR utm_medium IN (
        'social',
        'messenger',
        'messaging_bot',
        'email',
        'paid',
        'partner',
        'website',
        'owned'
      )
    ),

  CONSTRAINT promotion_campaign_channels_utm_pair_unique
    UNIQUE (campaign_id, utm_source, utm_medium)
);

CREATE INDEX IF NOT EXISTS promotion_campaign_channels_campaign_id_idx
  ON public.promotion_campaign_channels (campaign_id, position, created_at);

COMMENT ON TABLE public.promotion_campaign_channels IS
  'Author-defined custom promo channel links saved inside a campaign.';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_promotion_campaign_channels_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promotion_campaign_channels_set_updated_at
  ON public.promotion_campaign_channels;
CREATE TRIGGER promotion_campaign_channels_set_updated_at
  BEFORE UPDATE ON public.promotion_campaign_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_promotion_campaign_channels_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.promotion_campaign_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_campaign_channels_select ON public.promotion_campaign_channels;
CREATE POLICY promotion_campaign_channels_select
  ON public.promotion_campaign_channels
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaign_channels.campaign_id
        AND public.user_can_read_author_promotion(pc.author_id)
    )
  );

DROP POLICY IF EXISTS promotion_campaign_channels_insert ON public.promotion_campaign_channels;
CREATE POLICY promotion_campaign_channels_insert
  ON public.promotion_campaign_channels
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaign_channels.campaign_id
        AND public.user_can_read_author_promotion(pc.author_id)
    )
  );

DROP POLICY IF EXISTS promotion_campaign_channels_update ON public.promotion_campaign_channels;
CREATE POLICY promotion_campaign_channels_update
  ON public.promotion_campaign_channels
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaign_channels.campaign_id
        AND public.user_can_read_author_promotion(pc.author_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaign_channels.campaign_id
        AND public.user_can_read_author_promotion(pc.author_id)
    )
  );

DROP POLICY IF EXISTS promotion_campaign_channels_delete ON public.promotion_campaign_channels;
CREATE POLICY promotion_campaign_channels_delete
  ON public.promotion_campaign_channels
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.promotion_campaigns AS pc
      WHERE pc.id = promotion_campaign_channels.campaign_id
        AND public.user_can_read_author_promotion(pc.author_id)
    )
  );

REVOKE ALL ON public.promotion_campaign_channels FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_campaign_channels TO authenticated;
GRANT ALL ON public.promotion_campaign_channels TO service_role;

COMMIT;
