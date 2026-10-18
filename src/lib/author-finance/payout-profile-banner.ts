import type { AuthorPayoutProfileStatus } from "@/lib/author-payout-profiles/types";
import { isPayoutProfileReadyForWithdrawal } from "@/lib/author-payout-profiles/onboarding-complete";
import {
  PAYOUT_PROFILE_DISPLAY_TITLE,
  PAYOUT_PROFILE_MISSING_DESCRIPTION,
  resolvePayoutProfileDisplayState,
  type PayoutProfileDisplayState,
  type PayoutProfileStatusSource,
} from "@/lib/author-payout-profiles/display-status";

/** Copy for the "no payout profile at all" state only. */
export const AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY = {
  title: PAYOUT_PROFILE_DISPLAY_TITLE,
  description: PAYOUT_PROFILE_MISSING_DESCRIPTION,
  ctaLabel: "Заполнить реквизиты",
} as const;

export const AUTHOR_PAYOUT_ACTION_REQUIRES_PROFILE_COPY = {
  description: "Для получения выплаты сначала заполните реквизиты.",
  ctaLabel: "Заполнить реквизиты",
} as const;

/**
 * Informational finance banner only – never blocks KPI / ledger.
 * Visible until the profile is verified; the copy comes from
 * resolveFinancePayoutProfileBanner, not from this boolean.
 */
export function shouldShowFinancePayoutProfileBanner(input: {
  featureEnabled: boolean;
  payoutProfileStatus: AuthorPayoutProfileStatus | null | undefined;
}): boolean {
  if (!input.featureEnabled) return false;
  return !isPayoutProfileReadyForWithdrawal(input.payoutProfileStatus);
}

/**
 * Finance cabinet card state from the real payout profile status source.
 * «не заполнены» only when the profile truly does not exist; draft,
 * submitted, in_review, needs_changes and load errors get their own copy.
 */
export function resolveFinancePayoutProfileBanner(
  source: PayoutProfileStatusSource,
): PayoutProfileDisplayState {
  return resolvePayoutProfileDisplayState(source);
}

export function buildPayoutDetailsHref(authorSlug: string): string {
  return `/author-dashboard/commercial/payout-details?author=${encodeURIComponent(authorSlug)}`;
}
