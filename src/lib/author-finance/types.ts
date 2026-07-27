/**
 * P3.3.4 author finance cabinet — vocabulary and pure logic.
 *
 * Every function here mirrors a SQL function of the same intent in
 * supabase/migrations/20260727140000_payments_p334_author_finance.sql. SQL is
 * the source of truth; this module exists so the choice of empty state, the
 * masking rule and the forbidden-field set can be unit-tested without a
 * database, and so the UI can reason about a payload without re-deriving money.
 *
 * Nothing here computes money. Amounts arrive from the RPCs as integer kopeks
 * and are only ever formatted.
 */

export const P334_CALCULATION_VERSION = "p334.v1";

/** Mirrors public.author_payout_minimum_minor(): 1000 ₽. */
export const AUTHOR_FINANCE_MINIMUM_PAYOUT_MINOR = 100000;

export const AUTHOR_FINANCE_TYPE_KEYS = [
  "sale",
  "refund",
  "adjustment_credit",
  "adjustment_debit",
  "correction",
  "chargeback",
  "payout",
  "payout_reversal",
] as const;

export type AuthorFinanceTypeKey = (typeof AUTHOR_FINANCE_TYPE_KEYS)[number];

export const AUTHOR_FINANCE_AMOUNT_STATES = [
  "held",
  "available",
  "reserved",
  "paid",
  "adjustment",
] as const;

export type AuthorFinanceAmountState =
  (typeof AUTHOR_FINANCE_AMOUNT_STATES)[number];

export const AUTHOR_FINANCE_PAYOUT_STATUS_KEYS = [
  "preparing",
  "processing",
  "paid",
  "delayed",
  "cancelled",
  "on_review",
  "reversed",
] as const;

export type AuthorFinancePayoutStatusKey =
  (typeof AUTHOR_FINANCE_PAYOUT_STATUS_KEYS)[number];

export const AUTHOR_FINANCE_EMPTY_STATE_CODES = [
  "not_payout_eligible_free",
  "not_payout_eligible_pending",
  "not_payout_eligible_commercial",
  "terms_missing",
  "no_sales",
  "held_only",
  "below_threshold",
  "reserved_in_progress",
  "has_paid_history",
  "active_ok",
] as const;

export type AuthorFinanceEmptyStateCode =
  (typeof AUTHOR_FINANCE_EMPTY_STATE_CODES)[number];

export const AUTHOR_FINANCE_TERMS_STATUSES = [
  "missing",
  "active",
  "ended",
] as const;

export type AuthorFinanceTermsStatus =
  (typeof AUTHOR_FINANCE_TERMS_STATUSES)[number];

export const AUTHOR_FINANCE_INTEGRITY_STATUSES = [
  "ok",
  "processing",
  "review_required",
  "unavailable",
] as const;

export type AuthorFinanceIntegrityStatus =
  (typeof AUTHOR_FINANCE_INTEGRITY_STATUSES)[number];

/**
 * Field names that must never reach an author, in any list, detail view or
 * export. The CSV builders assert against this set, and the SQL integrity
 * snapshot asserts the same names never appear as JSON keys, so a field added
 * upstream cannot quietly become author-visible.
 */
export const AUTHOR_FINANCE_FORBIDDEN_FIELDS = [
  "payment_id",
  "refund_id",
  "order_id",
  "terms_id",
  "payout_id",
  "ledger_entry_id",
  "reversal_ledger_entry_id",
  "calculation_snapshot",
  "reason_code",
  "reason_text",
  "notes",
  "internal_notes",
  "admin_notes",
  "created_by",
  "approved_by",
  "paid_by",
  "reversed_by",
  "failure_code",
  "failure_reason",
  "review_reason",
  "cancel_reason",
  "reversal_reason",
  "minimum_override_reason",
  "external_reference",
  "idempotency_key",
  "correlation_id",
  "buyer_id",
  "user_id",
  "email",
  "provider",
  "provider_payment_id",
  "bank",
  "account",
  "card",
  "iban",
  "inn",
] as const;

export function isAuthorFinanceTypeKey(
  value: unknown,
): value is AuthorFinanceTypeKey {
  return (
    typeof value === "string" &&
    (AUTHOR_FINANCE_TYPE_KEYS as readonly string[]).includes(value)
  );
}

export function isAuthorFinanceAmountState(
  value: unknown,
): value is AuthorFinanceAmountState {
  return (
    typeof value === "string" &&
    (AUTHOR_FINANCE_AMOUNT_STATES as readonly string[]).includes(value)
  );
}

export function isAuthorFinancePayoutStatusKey(
  value: unknown,
): value is AuthorFinancePayoutStatusKey {
  return (
    typeof value === "string" &&
    (AUTHOR_FINANCE_PAYOUT_STATUS_KEYS as readonly string[]).includes(value)
  );
}

export function isAuthorFinanceEmptyStateCode(
  value: unknown,
): value is AuthorFinanceEmptyStateCode {
  return (
    typeof value === "string" &&
    (AUTHOR_FINANCE_EMPTY_STATE_CODES as readonly string[]).includes(value)
  );
}

export function isAuthorFinanceIntegrityStatus(
  value: unknown,
): value is AuthorFinanceIntegrityStatus {
  return (
    typeof value === "string" &&
    (AUTHOR_FINANCE_INTEGRITY_STATUSES as readonly string[]).includes(value)
  );
}

/** Mirrors public.author_finance_p334_type_key. */
export function authorFinanceTypeKey(entryType: string): AuthorFinanceTypeKey | "other" {
  switch (entryType) {
    case "sale_accrual":
      return "sale";
    case "refund_reversal":
      return "refund";
    case "manual_credit":
      return "adjustment_credit";
    case "manual_debit":
      return "adjustment_debit";
    case "correction":
      return "correction";
    case "chargeback_reversal":
      return "chargeback";
    case "payout":
      return "payout";
    case "payout_reversal":
      return "payout_reversal";
    default:
      return "other";
  }
}

/** Mirrors public.author_finance_p334_payout_status_key. */
export function authorFinancePayoutStatusKey(
  status: string,
): AuthorFinancePayoutStatusKey | "unknown" {
  switch (status) {
    case "draft":
    case "approved":
      return "preparing";
    case "processing":
      return "processing";
    case "paid":
      return "paid";
    case "failed":
      return "delayed";
    case "cancelled":
      return "cancelled";
    case "requires_review":
      return "on_review";
    case "reversed":
      return "reversed";
    default:
      return "unknown";
  }
}

/** Mirrors public.author_finance_p334_mask_reference. */
export function maskPayoutReference(
  reference: string | null | undefined,
): string | null {
  if (reference === null || reference === undefined) return null;
  const trimmed = reference.trim();
  if (trimmed === "") return null;
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return `•••${trimmed.slice(-4)}`;
}

/**
 * Mirrors the CASE in public.author_finance_p334_summary.
 *
 * The order is the order an author asks the questions in: am I a payee at all,
 * are there agreed terms, did anything sell, can I be paid — and if not, what
 * exactly is standing in the way. Exactly one code is returned.
 */
export function selectAuthorFinanceEmptyState(input: {
  payoutEligible: boolean;
  accessStatus: string;
  approvedTermsCount: number;
  entryCount: number;
  payableMinor: number;
  reservedMinor: number;
  heldMinor: number;
  paidPayoutCount: number;
  thresholdMinor?: number;
}): AuthorFinanceEmptyStateCode {
  const threshold = input.thresholdMinor ?? AUTHOR_FINANCE_MINIMUM_PAYOUT_MINOR;

  if (!input.payoutEligible) {
    if (
      input.accessStatus === "commercial" ||
      input.accessStatus === "commercial_active" ||
      input.accessStatus === "commercial_onboarding" ||
      input.accessStatus === "commercial_suspended"
    ) {
      return "not_payout_eligible_commercial";
    }
    if (input.accessStatus === "commercial_pending") {
      return "not_payout_eligible_pending";
    }
    return "not_payout_eligible_free";
  }

  if (input.approvedTermsCount === 0) return "terms_missing";
  if (input.entryCount === 0) return "no_sales";
  if (input.payableMinor >= threshold) return "active_ok";
  if (input.payableMinor > 0) return "below_threshold";
  if (input.reservedMinor > 0) return "reserved_in_progress";
  if (input.heldMinor > 0) return "held_only";
  if (input.paidPayoutCount > 0) return "has_paid_history";
  return "no_sales";
}

export function meetsAuthorPayoutThreshold(
  payableMinor: number,
  thresholdMinor: number = AUTHOR_FINANCE_MINIMUM_PAYOUT_MINOR,
): boolean {
  return payableMinor >= thresholdMinor;
}

// ---------------------------------------------------------------------------
// Activity period
//
// A period filters *activity*. It never filters a balance: an author's money
// does not become less real because they are looking at last year.
// ---------------------------------------------------------------------------

export const AUTHOR_FINANCE_PERIODS = [
  "all",
  "year",
  "prev_year",
  "custom",
] as const;

export type AuthorFinancePeriod = (typeof AUTHOR_FINANCE_PERIODS)[number];

export function isAuthorFinancePeriod(
  value: unknown,
): value is AuthorFinancePeriod {
  return (
    typeof value === "string" &&
    (AUTHOR_FINANCE_PERIODS as readonly string[]).includes(value)
  );
}

export type AuthorFinancePeriodRange = {
  period: AuthorFinancePeriod;
  from: string | null;
  to: string | null;
};

/**
 * Resolves an activity range. Bounds are half-open [from, to) in UTC, matching
 * the SQL filter on effective_at, so a row can never be counted in two periods.
 */
export function resolveAuthorFinancePeriodRange(
  period: AuthorFinancePeriod,
  options: { from?: string | null; to?: string | null; now?: Date } = {},
): AuthorFinancePeriodRange {
  const now = options.now ?? new Date();
  const year = now.getUTCFullYear();

  if (period === "year") {
    return {
      period,
      from: new Date(Date.UTC(year, 0, 1)).toISOString(),
      to: new Date(Date.UTC(year + 1, 0, 1)).toISOString(),
    };
  }

  if (period === "prev_year") {
    return {
      period,
      from: new Date(Date.UTC(year - 1, 0, 1)).toISOString(),
      to: new Date(Date.UTC(year, 0, 1)).toISOString(),
    };
  }

  if (period === "custom") {
    const from = normalizeBoundary(options.from);
    const to = normalizeBoundary(options.to, { endOfDay: true });

    // An inverted range is a typo, not an intent. Fall back to all time rather
    // than silently showing nothing.
    if (from && to && from >= to) {
      return { period: "all", from: null, to: null };
    }

    if (!from && !to) {
      return { period: "all", from: null, to: null };
    }

    return { period, from, to };
  }

  return { period: "all", from: null, to: null };
}

function normalizeBoundary(
  value: string | null | undefined,
  options: { endOfDay?: boolean } = {},
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  // A bare date from <input type="date"> means the whole day in UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const base = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(base.getTime())) return null;
    if (options.endOfDay) {
      return new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
    return base.toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

export type AuthorFinanceTermsSummary = {
  authorShareBps: number;
  platformShareBps: number;
  holdDays: number;
  currency: string;
  validFrom: string | null;
  validTo: string | null;
};

export type AuthorFinanceTermsRow = AuthorFinanceTermsSummary & {
  status: "approved" | "superseded";
  isActiveNow: boolean;
};

export type AuthorFinanceSummary = {
  currency: string;
  calculationVersion: string;
  asOf: string | null;

  accruedMinor: number;
  refundsReversedMinor: number;
  adjustmentsMinor: number;
  heldMinor: number;
  availableMinor: number;
  reservedMinor: number;
  payableMinor: number;
  paidMinor: number;
  paidPayoutCount: number;
  entryCount: number;

  negative: boolean;
  negativeMinor: number;

  thresholdMinor: number;
  thresholdReached: boolean;

  payoutEligible: boolean;
  accessStatus: string;
  termsStatus: AuthorFinanceTermsStatus;
  approvedTermsCount: number;
  activeTermsSummary: AuthorFinanceTermsSummary | null;

  oldestPayableAt: string | null;
  nextHoldReleaseAt: string | null;
  unresolvedReviewCount: number;

  emptyStateCode: AuthorFinanceEmptyStateCode;
  eligibilityMessage: string;
};

export type AuthorFinanceLedgerRow = {
  entryId: string;
  typeKey: AuthorFinanceTypeKey | "other";
  amountMinor: number;
  currency: string;
  effectiveAt: string | null;
  availableAt: string | null;
  isHeld: boolean;
  amountState: AuthorFinanceAmountState;
  productTitle: string | null;
  payoutSafeRef: string | null;
  publicComment: string | null;
};

export type AuthorFinanceLedgerDetail = {
  entry: AuthorFinanceLedgerRow;
  formula: {
    grossBasisMinor: number | null;
    netBasisMinor: number | null;
    authorShareBps: number | null;
    platformShareBps: number | null;
    holdDays: number | null;
    rounding: string;
    refundPolicy: string;
  };
};

export type AuthorFinancePayoutRow = {
  payoutId: string;
  statusKey: AuthorFinancePayoutStatusKey | "unknown";
  amountMinor: number;
  currency: string;
  periodLabel: string;
  createdAt: string | null;
  paidAt: string | null;
  referenceMasked: string | null;
  isSettled: boolean;
};

export type AuthorFinancePayoutDetail = {
  payout: AuthorFinancePayoutRow & {
    periodStart: string | null;
    periodEnd: string | null;
    cutoffAt: string | null;
    minimumMinor: number;
    processingAt: string | null;
    delayedAt: string | null;
    cancelledAt: string | null;
    reversedAt: string | null;
  };
  entries: Array<{
    entryId: string;
    typeKey: AuthorFinanceTypeKey | "other";
    allocatedMinor: number;
    effectiveAt: string | null;
    productTitle: string | null;
  }>;
};

export type AuthorFinanceList<TRow> = {
  total: number;
  limit: number;
  offset: number;
  rows: TRow[];
};
