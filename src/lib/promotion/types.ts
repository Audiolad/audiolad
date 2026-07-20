export type PromotionCampaignStatus = "active" | "archived";

export type PromotionCampaign = {
  id: string;
  author_id: string;
  practice_id: string;
  name: string;
  campaign_key: string;
  status: PromotionCampaignStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PromotionCampaignWithProduct = PromotionCampaign & {
  practice_title: string;
  practice_slug: string;
  practice_status: string;
  author_slug: string;
};

export type PromotionStatsRow = {
  utm_source: string;
  utm_medium: string;
  utm_content: string;
  event_name: string;
  unique_visitors: number;
  event_count: number;
};

export type PromotionPeriodKey = "7d" | "30d" | "90d" | "all";

export type PromotionCampaignChannel = {
  id: string;
  campaign_id: string;
  label: string;
  utm_source: string;
  utm_medium: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type PromotionCampaignSummaryRow = {
  campaign_id: string;
  campaign_name: string;
  campaign_key: string;
  campaign_status: PromotionCampaignStatus;
  practice_id: string;
  practice_title: string;
  practice_slug: string;
  author_slug: string;
  unique_views: number;
  unique_play_starts: number;
  unique_registrations: number;
  unique_saves: number;
  total_events: number;
};
