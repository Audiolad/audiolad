/**
 * Author-cabinet projection for listener appreciation.
 *
 * Reads the same intent + ledger facts as admin analytics, then emits
 * author-safe rows. Money still lives only on `sale_accrual` ledger rows —
 * this module never invents a second balance.
 */

import type { AppreciationSurface } from "@/lib/admin/appreciation-analytics";

export const AUTHOR_APPRECIATION_SECTION_TITLE = "Благодарности от слушателей";
export const AUTHOR_APPRECIATION_SECTION_SUBTITLE =
  "Подтверждённые благодарности от слушателей и статус начислений";
export const AUTHOR_APPRECIATION_EMPTY =
  "Подтверждённых благодарностей пока нет. Здесь появятся благодарности после успешной оплаты.";
export const AUTHOR_APPRECIATION_PRIVACY_NOTE =
  "В кабинете видны только ваши благодарности. Данные слушателей и служебные пометки здесь не показываются.";
export const AUTHOR_APPRECIATION_SURFACE_AUTHOR_LABEL = "Страница автора";
export const AUTHOR_APPRECIATION_ROW_LABEL = "Благодарность от слушателя";

export const AUTHOR_APPRECIATION_FINANCE_STATUSES = [
  "processing",
  "held",
  "available",
  "reserved",
  "paid",
] as const;

export type AuthorAppreciationFinanceStatus =
  (typeof AUTHOR_APPRECIATION_FINANCE_STATUSES)[number];

export const AUTHOR_APPRECIATION_FORBIDDEN_FIELDS = [
  "email",
  "phone",
  "provider",
  "provider_deal_id",
  "provider_deal_number",
  "provider_payment_id",
  "getcourse",
  "deal_id",
  "deal_number",
  "listener_email",
  "listener_phone",
  "user_id",
  "buyer_id",
] as const;

export type AuthorAppreciationFinanceRow = {
  id: string;
  createdAt: string;
  paidAt: string | null;
  surface: AppreciationSurface;
  sourceTitle: string;
  grossAmountMinor: number;
  authorAccruedMinor: number | null;
  currency: string;
  financeStatus: AuthorAppreciationFinanceStatus;
  availableAt: string | null;
};

export type AuthorAppreciationFinanceSummary = {
  confirmedCount: number;
  grossAmountMinor: number;
  authorAccruedMinor: number;
  heldMinor: number;
  availableMinor: number;
  reservedMinor: number;
  paidMinor: number;
};

export type AuthorAppreciationCabinetFact = {
  intentId: string;
  authorId: string;
  intentStatus: string;
  surface: AppreciationSurface;
  sourceTitle: string | null;
  practiceId: string | null;
  practiceSlug: string | null;
  amountMinor: number;
  createdAt: string;
  paidAt: string | null;
  currency?: string;
  hasSaleAccrual: boolean;
  authorAccruedMinor: number | null;
  availableAt: string | null;
  payoutAllocationStatus: "reserved" | "paid" | "released" | "requires_review" | null;
};

export function isAuthorVisibleAppreciationIntent(status: string): boolean {
  return status === "paid";
}

export function resolveAppreciationSourceTitle(
  surface: AppreciationSurface,
  sourceTitle: string | null | undefined,
): string {
  if (surface === "author") {
    return AUTHOR_APPRECIATION_SURFACE_AUTHOR_LABEL;
  }
  const trimmed = sourceTitle?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Продукт";
}

export function getAuthorAppreciationFinanceStatusLabel(
  status: AuthorAppreciationFinanceStatus | string,
): string {
  switch (status) {
    case "processing":
      return "Обрабатывается";
    case "held":
      return "Удерживается";
    case "available":
      return "Доступно к выплате";
    case "reserved":
      return "В выплате";
    case "paid":
      return "Выплачено";
    default:
      return "Обрабатывается";
  }
}

export function deriveAppreciationFinanceStatus(
  input: Pick<
    AuthorAppreciationCabinetFact,
    "hasSaleAccrual" | "availableAt" | "payoutAllocationStatus"
  >,
  now: Date = new Date(),
): AuthorAppreciationFinanceStatus {
  if (!input.hasSaleAccrual) {
    return "processing";
  }

  if (input.payoutAllocationStatus === "paid") {
    return "paid";
  }

  if (
    input.payoutAllocationStatus === "reserved" ||
    input.payoutAllocationStatus === "requires_review"
  ) {
    return "reserved";
  }

  if (input.availableAt) {
    const availableAt = new Date(input.availableAt);
    if (!Number.isNaN(availableAt.getTime()) && availableAt.getTime() > now.getTime()) {
      return "held";
    }
  }

  return "available";
}

export function emptyAuthorAppreciationFinanceSummary(): AuthorAppreciationFinanceSummary {
  return {
    confirmedCount: 0,
    grossAmountMinor: 0,
    authorAccruedMinor: 0,
    heldMinor: 0,
    availableMinor: 0,
    reservedMinor: 0,
    paidMinor: 0,
  };
}

export function projectAuthorAppreciationFinanceRow(
  fact: AuthorAppreciationCabinetFact,
  now: Date = new Date(),
): AuthorAppreciationFinanceRow | null {
  if (!isAuthorVisibleAppreciationIntent(fact.intentStatus)) {
    return null;
  }

  const financeStatus = deriveAppreciationFinanceStatus(fact, now);
  const authorAccruedMinor = fact.hasSaleAccrual
    ? fact.authorAccruedMinor ?? 0
    : null;

  return {
    id: fact.intentId,
    createdAt: fact.createdAt,
    paidAt: fact.paidAt,
    surface: fact.surface,
    sourceTitle: resolveAppreciationSourceTitle(fact.surface, fact.sourceTitle),
    grossAmountMinor: fact.amountMinor,
    authorAccruedMinor,
    currency: fact.currency ?? "RUB",
    financeStatus,
    availableAt: fact.availableAt,
  };
}

export function summarizeAuthorAppreciationFinance(
  rows: readonly AuthorAppreciationFinanceRow[],
): AuthorAppreciationFinanceSummary {
  const summary = emptyAuthorAppreciationFinanceSummary();

  for (const row of rows) {
    summary.confirmedCount += 1;
    summary.grossAmountMinor += row.grossAmountMinor;
    const accrued = row.authorAccruedMinor ?? 0;
    summary.authorAccruedMinor += accrued;

    if (row.financeStatus === "held") {
      summary.heldMinor += accrued;
    } else if (row.financeStatus === "available") {
      summary.availableMinor += accrued;
    } else if (row.financeStatus === "reserved") {
      summary.reservedMinor += accrued;
    } else if (row.financeStatus === "paid") {
      summary.paidMinor += accrued;
    }
  }

  return summary;
}

export function projectAuthorAppreciationCabinet(
  facts: readonly AuthorAppreciationCabinetFact[],
  now: Date = new Date(),
): {
  summary: AuthorAppreciationFinanceSummary;
  rows: AuthorAppreciationFinanceRow[];
} {
  const rows = facts
    .map((fact) => projectAuthorAppreciationFinanceRow(fact, now))
    .filter((row): row is AuthorAppreciationFinanceRow => row !== null)
    .sort((left, right) => {
      const leftAt = left.paidAt ?? left.createdAt;
      const rightAt = right.paidAt ?? right.createdAt;
      return rightAt.localeCompare(leftAt);
    });

  return {
    summary: summarizeAuthorAppreciationFinance(rows),
    rows,
  };
}

export function authorAppreciationBelongsToAuthor(
  fact: Pick<AuthorAppreciationCabinetFact, "authorId">,
  authorId: string,
): boolean {
  return fact.authorId === authorId;
}

export function filterAuthorAppreciationFactsForAuthor(
  facts: readonly AuthorAppreciationCabinetFact[],
  authorId: string,
): AuthorAppreciationCabinetFact[] {
  return facts.filter((fact) => authorAppreciationBelongsToAuthor(fact, authorId));
}

export function isPaidAtInRange(
  paidAt: string | null,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (!from && !to) return true;
  if (!paidAt) return false;
  if (from && paidAt < from) return false;
  if (to && paidAt >= to) return false;
  return true;
}
