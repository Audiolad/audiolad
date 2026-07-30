/**
 * Canonical author sales — shared vocabulary for finance Sales UI, CSV and
 * stats metrics that count the same confirmed purchases.
 */

export const AUTHOR_SALE_ACCRUAL_STATUSES = [
  "accrued",
  "pending",
  "requires_review",
  "failed",
  "not_applicable",
  "refunded",
] as const;

export type AuthorSaleAccrualStatus =
  (typeof AUTHOR_SALE_ACCRUAL_STATUSES)[number];

export const AUTHOR_SALE_PAYOUT_STATUSES = [
  "held",
  "available",
  "reserved",
  "paid",
  "refunded",
] as const;

export type AuthorSalePayoutStatus = (typeof AUTHOR_SALE_PAYOUT_STATUSES)[number];

export const AUTHOR_SALE_ATTRIBUTION_SOURCES = [
  "snapshot",
  "historical_fallback",
  "unresolved",
] as const;

export type AuthorSaleAttributionSource =
  (typeof AUTHOR_SALE_ATTRIBUTION_SOURCES)[number];

/** Fields that must never appear in author-facing sales payloads or CSV. */
export const AUTHOR_SALES_FORBIDDEN_FIELDS = [
  "payment_id",
  "refund_id",
  "order_id",
  "terms_id",
  "payout_id",
  "ledger_entry_id",
  "buyer_id",
  "user_id",
  "practice_id",
  "email",
  "contact_email",
  "phone",
  "telephone",
  "provider",
  "provider_payment_id",
  "obligation_id",
  "obligation_result_code",
  "last_error",
  "reason_code",
  "correlation_id",
  "idempotency_key",
  "bank",
  "account",
  "card",
  "iban",
  "inn",
] as const;

export type AuthorSaleRow = {
  saleId: string;
  paidAt: string | null;
  productTitle: string;
  buyerFirstName: string | null;
  buyerLastName: string | null;
  amountMinor: number;
  refundedAmountMinor: number;
  netAmountMinor: number;
  refundStatus: "none" | "partial" | "full";
  currency: string;
  authorAmountMinor: number | null;
  accrualStatus: AuthorSaleAccrualStatus | string;
  payoutStatus: AuthorSalePayoutStatus | string | null;
};

export type AuthorSaleDetail = AuthorSaleRow;

export type AuthorSaleList = {
  total: number;
  limit: number;
  offset: number;
  rows: AuthorSaleRow[];
};

export type AuthorSaleCounts = {
  grossPurchases: number;
  refundSales: number;
  partialRefunds: number;
  fullRefunds: number;
  netSales: number;
  grossRevenueMinor: number;
  refundedAmountMinor: number;
  netRevenueMinor: number;
  accrued: number;
  pendingAccrual: number;
};

export type AuthorSaleProductOption = {
  productSlug: string;
  productTitle: string;
};

export function isAuthorSaleAccrualStatus(
  value: unknown,
): value is AuthorSaleAccrualStatus {
  return (
    typeof value === "string" &&
    (AUTHOR_SALE_ACCRUAL_STATUSES as readonly string[]).includes(value)
  );
}

export function isAuthorSalePayoutStatus(
  value: unknown,
): value is AuthorSalePayoutStatus {
  return (
    typeof value === "string" &&
    (AUTHOR_SALE_PAYOUT_STATUSES as readonly string[]).includes(value)
  );
}

export function formatBuyerDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const parts = [firstName?.trim(), lastName?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : "Покупатель";
}
