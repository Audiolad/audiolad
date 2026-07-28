import type { AuthorPayoutProfileStatus } from "@/lib/author-payout-profiles/types";
import { isPayoutProfileReadyForWithdrawal } from "@/lib/author-payout-profiles/onboarding-complete";

export const AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY = {
  title: "Реквизиты для выплат",
  description:
    "Реквизиты для выплат пока не заполнены. Они понадобятся, когда вы захотите получить вознаграждение.",
  ctaLabel: "Заполнить реквизиты",
} as const;

export const AUTHOR_PAYOUT_ACTION_REQUIRES_PROFILE_COPY = {
  description: "Для получения выплаты сначала заполните реквизиты.",
  ctaLabel: "Заполнить реквизиты",
} as const;

/** Informational finance banner only — never blocks KPI / ledger. */
export function shouldShowFinancePayoutProfileBanner(input: {
  featureEnabled: boolean;
  payoutProfileStatus: AuthorPayoutProfileStatus | null | undefined;
}): boolean {
  if (!input.featureEnabled) return false;
  return !isPayoutProfileReadyForWithdrawal(input.payoutProfileStatus);
}

export function buildPayoutDetailsHref(authorSlug: string): string {
  return `/author-dashboard/commercial/payout-details?author=${encodeURIComponent(authorSlug)}`;
}
