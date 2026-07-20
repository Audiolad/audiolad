export type CampaignSelectionItem = {
  id: string;
};

/**
 * Resolve which campaign should be active after load or URL change.
 * Priority: valid URL param → current selection → first campaign → null.
 */
export function resolveSelectedCampaignId(
  campaigns: CampaignSelectionItem[],
  urlCampaignId: string | null,
  currentCampaignId: string | null = null,
): string | null {
  if (campaigns.length === 0) {
    return null;
  }

  if (
    urlCampaignId &&
    campaigns.some((campaign) => campaign.id === urlCampaignId)
  ) {
    return urlCampaignId;
  }

  if (
    currentCampaignId &&
    campaigns.some((campaign) => campaign.id === currentCampaignId)
  ) {
    return currentCampaignId;
  }

  return campaigns[0]?.id ?? null;
}

export function buildPromotionPageQuery(params: {
  author?: string | null;
  campaign?: string | null;
  period?: string | null;
  existing?: URLSearchParams;
}): URLSearchParams {
  const next = new URLSearchParams(params.existing?.toString() ?? "");

  if (params.author) {
    next.set("author", params.author);
  }

  if (params.period) {
    next.set("period", params.period);
  }

  if (params.campaign) {
    next.set("campaign", params.campaign);
  } else if (params.campaign === null) {
    next.delete("campaign");
  }

  return next;
}
