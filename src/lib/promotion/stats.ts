import type { PromotionStatsRow } from "./types";

export const PROMOTION_FUNNEL_EVENTS = {
  views: "promo_practice_viewed",
  playStarts: "promo_practice_play_started",
  progress25: "promo_practice_progress_25",
  progress50: "promo_practice_progress_50",
  progress75: "promo_practice_progress_75",
  completed: "promo_practice_completed",
  signupPromptShown: "promo_signup_prompt_shown",
  signupClicked: "promo_signup_clicked",
  signupCompleted: "promo_signup_completed",
  practiceSaved: "promo_practice_saved",
  giftsOpened: "promo_gifts_opened",
} as const;

export const PROMO_PAGE_FUNNEL_EVENTS = {
  views: "promo_page_viewed",
  playStarts: "promo_page_play_started",
  completed: "promo_page_completed",
  ctaClicked: "promo_page_cta_clicked",
} as const;

export type PromotionStatsKind = "practice" | "promo_page" | "mixed";

export type PromotionFunnelMetrics = {
  uniqueViews: number;
  uniquePlayStarts: number;
  uniqueProgress25: number;
  uniqueProgress50: number;
  uniqueProgress75: number;
  uniqueCompleted: number;
  uniqueSignupPromptShown: number;
  uniqueSignupClicked: number;
  uniqueRegistrations: number;
  uniqueSaves: number;
  uniqueGiftsOpened: number;
  uniqueCtaClicks: number;
};

export type PromotionConversionRates = {
  viewToPlay: number;
  playTo25: number;
  playToComplete: number;
  viewToSignupClick: number;
  viewToRegistration: number;
  registrationToSave: number;
  viewToCta: number;
  playToCta: number;
};

export type PromotionChannelBreakdownRow = {
  utm_source: string;
  utm_medium: string;
  utm_content: string;
  uniqueViews: number;
  uniquePlayStarts: number;
  uniqueProgress25: number;
  uniqueCompleted: number;
  uniqueSignupClicked: number;
  uniqueRegistrations: number;
  uniqueCtaClicks: number;
};

function sumUniqueVisitors(
  rows: PromotionStatsRow[],
  eventName: string,
): number {
  return rows
    .filter((row) => row.event_name === eventName)
    .reduce((total, row) => total + row.unique_visitors, 0);
}

export function detectPromotionStatsKind(
  rows: PromotionStatsRow[],
): PromotionStatsKind {
  let hasPracticeEvents = false;
  let hasPromoPageEvents = false;

  for (const row of rows) {
    if (row.event_name.startsWith("promo_page_")) {
      hasPromoPageEvents = true;
    } else if (row.event_name.startsWith("promo_")) {
      hasPracticeEvents = true;
    }
  }

  if (hasPracticeEvents && hasPromoPageEvents) {
    return "mixed";
  }

  if (hasPromoPageEvents) {
    return "promo_page";
  }

  return "practice";
}

export function aggregatePromotionFunnelMetrics(
  rows: PromotionStatsRow[],
): PromotionFunnelMetrics {
  return {
    uniqueViews:
      sumUniqueVisitors(rows, PROMOTION_FUNNEL_EVENTS.views) +
      sumUniqueVisitors(rows, PROMO_PAGE_FUNNEL_EVENTS.views),
    uniquePlayStarts:
      sumUniqueVisitors(rows, PROMOTION_FUNNEL_EVENTS.playStarts) +
      sumUniqueVisitors(rows, PROMO_PAGE_FUNNEL_EVENTS.playStarts),
    uniqueProgress25: sumUniqueVisitors(rows, PROMOTION_FUNNEL_EVENTS.progress25),
    uniqueProgress50: sumUniqueVisitors(rows, PROMOTION_FUNNEL_EVENTS.progress50),
    uniqueProgress75: sumUniqueVisitors(rows, PROMOTION_FUNNEL_EVENTS.progress75),
    uniqueCompleted:
      sumUniqueVisitors(rows, PROMOTION_FUNNEL_EVENTS.completed) +
      sumUniqueVisitors(rows, PROMO_PAGE_FUNNEL_EVENTS.completed),
    uniqueSignupPromptShown: sumUniqueVisitors(
      rows,
      PROMOTION_FUNNEL_EVENTS.signupPromptShown,
    ),
    uniqueSignupClicked: sumUniqueVisitors(
      rows,
      PROMOTION_FUNNEL_EVENTS.signupClicked,
    ),
    uniqueRegistrations: sumUniqueVisitors(
      rows,
      PROMOTION_FUNNEL_EVENTS.signupCompleted,
    ),
    uniqueSaves: sumUniqueVisitors(rows, PROMOTION_FUNNEL_EVENTS.practiceSaved),
    uniqueGiftsOpened: sumUniqueVisitors(rows, PROMOTION_FUNNEL_EVENTS.giftsOpened),
    uniqueCtaClicks: sumUniqueVisitors(
      rows,
      PROMO_PAGE_FUNNEL_EVENTS.ctaClicked,
    ),
  };
}

export function safeConversionRate(
  numerator: number,
  denominator: number,
): number {
  if (denominator <= 0 || numerator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

export function calculatePromotionConversions(
  metrics: PromotionFunnelMetrics,
): PromotionConversionRates {
  return {
    viewToPlay: safeConversionRate(
      metrics.uniquePlayStarts,
      metrics.uniqueViews,
    ),
    playTo25: safeConversionRate(
      metrics.uniqueProgress25,
      metrics.uniquePlayStarts,
    ),
    playToComplete: safeConversionRate(
      metrics.uniqueCompleted,
      metrics.uniquePlayStarts,
    ),
    viewToSignupClick: safeConversionRate(
      metrics.uniqueSignupClicked,
      metrics.uniqueViews,
    ),
    viewToRegistration: safeConversionRate(
      metrics.uniqueRegistrations,
      metrics.uniqueViews,
    ),
    registrationToSave: safeConversionRate(
      metrics.uniqueSaves,
      metrics.uniqueRegistrations,
    ),
    viewToCta: safeConversionRate(
      metrics.uniqueCtaClicks,
      metrics.uniqueViews,
    ),
    playToCta: safeConversionRate(
      metrics.uniqueCtaClicks,
      metrics.uniquePlayStarts,
    ),
  };
}

function channelKey(row: Pick<PromotionStatsRow, "utm_source" | "utm_medium" | "utm_content">) {
  return `${row.utm_source}::${row.utm_medium}::${row.utm_content}`;
}

export function buildPromotionChannelBreakdown(
  rows: PromotionStatsRow[],
): PromotionChannelBreakdownRow[] {
  const grouped = new Map<string, PromotionChannelBreakdownRow>();

  for (const row of rows) {
    const key = channelKey(row);
    const existing = grouped.get(key) ?? {
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_content: row.utm_content,
      uniqueViews: 0,
      uniquePlayStarts: 0,
      uniqueProgress25: 0,
      uniqueCompleted: 0,
      uniqueSignupClicked: 0,
      uniqueRegistrations: 0,
      uniqueCtaClicks: 0,
    };

    switch (row.event_name) {
      case PROMOTION_FUNNEL_EVENTS.views:
        existing.uniqueViews += row.unique_visitors;
        break;
      case PROMOTION_FUNNEL_EVENTS.playStarts:
        existing.uniquePlayStarts += row.unique_visitors;
        break;
      case PROMOTION_FUNNEL_EVENTS.progress25:
        existing.uniqueProgress25 += row.unique_visitors;
        break;
      case PROMOTION_FUNNEL_EVENTS.completed:
      case PROMO_PAGE_FUNNEL_EVENTS.completed:
        existing.uniqueCompleted += row.unique_visitors;
        break;
      case PROMO_PAGE_FUNNEL_EVENTS.views:
        existing.uniqueViews += row.unique_visitors;
        break;
      case PROMO_PAGE_FUNNEL_EVENTS.playStarts:
        existing.uniquePlayStarts += row.unique_visitors;
        break;
      case PROMO_PAGE_FUNNEL_EVENTS.ctaClicked:
        existing.uniqueCtaClicks += row.unique_visitors;
        break;
      case PROMOTION_FUNNEL_EVENTS.signupClicked:
        existing.uniqueSignupClicked += row.unique_visitors;
        break;
      case PROMOTION_FUNNEL_EVENTS.signupCompleted:
        existing.uniqueRegistrations += row.unique_visitors;
        break;
      default:
        break;
    }

    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).sort((left, right) => {
    if (right.uniqueViews !== left.uniqueViews) {
      return right.uniqueViews - left.uniqueViews;
    }

    return left.utm_source.localeCompare(right.utm_source, "ru");
  });
}

export function aggregateAuthorSummaryTotals(
  campaigns: Array<{
    unique_views: number;
    unique_play_starts: number;
    unique_registrations: number;
    unique_saves: number;
  }>,
): {
  campaignCount: number;
  uniqueViews: number;
  uniquePlayStarts: number;
  uniqueRegistrations: number;
  uniqueSaves: number;
  averageViewToRegistration: number;
} {
  const uniqueViews = campaigns.reduce(
    (total, campaign) => total + campaign.unique_views,
    0,
  );
  const uniquePlayStarts = campaigns.reduce(
    (total, campaign) => total + campaign.unique_play_starts,
    0,
  );
  const uniqueRegistrations = campaigns.reduce(
    (total, campaign) => total + campaign.unique_registrations,
    0,
  );
  const uniqueSaves = campaigns.reduce(
    (total, campaign) => total + campaign.unique_saves,
    0,
  );

  return {
    campaignCount: campaigns.length,
    uniqueViews,
    uniquePlayStarts,
    uniqueRegistrations,
    uniqueSaves,
    averageViewToRegistration: safeConversionRate(
      uniqueRegistrations,
      uniqueViews,
    ),
  };
}
