/**
 * Canonical owner/admin projection for listener appreciation.
 * Reads intents + ledger accruals. Never invents orders or payments.
 */

export const ADMIN_APPRECIATION_OPERATION_LABEL = "Благодарность автору";

export type AppreciationIntentStatus = "pending" | "paid" | "needs_review" | "failed";

export type AppreciationSurface = "author" | "product";

export type AppreciationIntentFact = {
  intentId: string;
  authorId: string;
  authorName: string;
  surface: AppreciationSurface;
  productTitle: string | null;
  amountMinor: number;
  status: AppreciationIntentStatus;
  paidAt: string | null;
  createdAt: string;
  authorAccruedMinor: number | null;
  availableAt: string | null;
  providerDealIdPresent: boolean;
  providerDealNumberPresent: boolean;
  financeProjectionStatus: "pending" | "projected" | "needs_review" | null;
  financeProjectionResultCode: string | null;
  hasSaleAccrual: boolean;
};

export type AppreciationAnalyticsSummary = {
  count: number;
  paidCount: number;
  pendingCount: number;
  needsReviewCount: number;
  failedCount: number;
  grossMinor: number;
  authorAccruedMinor: number;
  platformShareMinor: number;
};

export type AppreciationAnalyticsProjection = {
  source: "author_appreciation_payment_intents+author_ledger_entries";
  operationLabel: typeof ADMIN_APPRECIATION_OPERATION_LABEL;
  summary: AppreciationAnalyticsSummary;
  rows: AppreciationIntentFact[];
};

export function isAppreciationIntentStatus(
  value: unknown,
): value is AppreciationIntentStatus {
  return (
    value === "pending" ||
    value === "paid" ||
    value === "needs_review" ||
    value === "failed"
  );
}

export function isAppreciationSurface(value: unknown): value is AppreciationSurface {
  return value === "author" || value === "product";
}

export function projectAppreciationAnalytics(
  rows: AppreciationIntentFact[],
): AppreciationAnalyticsProjection {
  const summary: AppreciationAnalyticsSummary = {
    count: rows.length,
    paidCount: 0,
    pendingCount: 0,
    needsReviewCount: 0,
    failedCount: 0,
    grossMinor: 0,
    authorAccruedMinor: 0,
    platformShareMinor: 0,
  };

  for (const row of rows) {
    if (row.status === "paid") summary.paidCount += 1;
    else if (row.status === "pending") summary.pendingCount += 1;
    else if (row.status === "needs_review") summary.needsReviewCount += 1;
    else if (row.status === "failed") summary.failedCount += 1;

    if (row.status === "paid") {
      summary.grossMinor += row.amountMinor;
      const accrued = row.authorAccruedMinor ?? 0;
      summary.authorAccruedMinor += accrued;
      summary.platformShareMinor += Math.max(0, row.amountMinor - accrued);
    }
  }

  return {
    source: "author_appreciation_payment_intents+author_ledger_entries",
    operationLabel: ADMIN_APPRECIATION_OPERATION_LABEL,
    summary,
    rows,
  };
}

export function appreciationStatusLabel(status: AppreciationIntentStatus): string {
  switch (status) {
    case "paid":
      return "Оплачено";
    case "pending":
      return "Ожидает";
    case "needs_review":
      return "Нужна проверка";
    case "failed":
      return "Ошибка";
    default:
      return "—";
  }
}

export function appreciationSurfaceLabel(surface: AppreciationSurface): string {
  return surface === "product" ? "Продукт" : "Страница автора";
}
