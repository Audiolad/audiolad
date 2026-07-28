/**
 * P3.3.2 author entitlement vocabulary and money math.
 *
 * Every function here mirrors the SQL of the same name exactly. SQL stays the
 * source of truth for anything that is written; this module exists so the UI
 * can preview a number and so the arithmetic can be unit-tested without a
 * database. Money is always integer kopeks — no float ever touches it.
 */

/** Legacy calculation version before author-favour rounding. */
export const P332_CALCULATION_VERSION = "p332.v1";
/** Current accrual math: ceil author share, platform gets remainder. */
export const P332_AUTHOR_ROUNDING_UP_VERSION = "p332.author_rounding_up_v1";

export const AUTHOR_LEDGER_ENTRY_TYPES = [
  "sale_accrual",
  "refund_reversal",
  "manual_credit",
  "manual_debit",
  "correction",
] as const;

/** Reserved for P3.3.3+ — present in DB CHECK, not used in P3.3.2 writers. */
export const AUTHOR_LEDGER_RESERVED_ENTRY_TYPES = [
  "chargeback_reversal",
  "payout",
  "payout_reversal",
] as const;

export type AuthorLedgerEntryType = (typeof AUTHOR_LEDGER_ENTRY_TYPES)[number];

export const AUTHOR_TERMS_STATUSES = [
  "draft",
  "approved",
  "superseded",
  "cancelled",
] as const;

export type AuthorTermsStatus = (typeof AUTHOR_TERMS_STATUSES)[number];

export const FINANCE_OBLIGATION_TYPES = [
  "payment_succeeded_accrual",
  "refund_succeeded_reversal",
] as const;

export type FinanceObligationType = (typeof FINANCE_OBLIGATION_TYPES)[number];

export const FINANCE_OBLIGATION_STATUSES = [
  "pending",
  "processed",
  "skipped",
  "requires_review",
  "failed",
] as const;

export type FinanceObligationStatus =
  (typeof FINANCE_OBLIGATION_STATUSES)[number];

/**
 * How an author relates to payouts. Only `payout_eligible` can ever accrue:
 * the current commercial catalog is platform-owned, so a commercial access
 * status on its own is deliberately not enough.
 */
export const AUTHOR_PAYOUT_CLASSES = [
  "payout_eligible",
  "platform_owned_heuristic",
  "commercial_pending",
  "suspended",
  "terminated",
  "free",
  "unresolved_author",
] as const;

export type AuthorPayoutClass = (typeof AUTHOR_PAYOUT_CLASSES)[number];

export const AUTHOR_ATTRIBUTION_SOURCES = [
  "snapshot",
  "historical_fallback",
  "unresolved",
  "missing",
] as const;

export type AuthorAttributionSource =
  (typeof AUTHOR_ATTRIBUTION_SOURCES)[number];

export function isAuthorLedgerEntryType(
  value: unknown,
): value is AuthorLedgerEntryType {
  return (
    typeof value === "string" &&
    (AUTHOR_LEDGER_ENTRY_TYPES as readonly string[]).includes(value)
  );
}

export function isAuthorTermsStatus(value: unknown): value is AuthorTermsStatus {
  return (
    typeof value === "string" &&
    (AUTHOR_TERMS_STATUSES as readonly string[]).includes(value)
  );
}

export function isFinanceObligationStatus(
  value: unknown,
): value is FinanceObligationStatus {
  return (
    typeof value === "string" &&
    (FINANCE_OBLIGATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isAuthorPayoutClass(value: unknown): value is AuthorPayoutClass {
  return (
    typeof value === "string" &&
    (AUTHOR_PAYOUT_CLASSES as readonly string[]).includes(value)
  );
}

/**
 * Mirrors public.author_share_minor (author_rounding_up_v1):
 * ceil(basis * bps / 10000) in integer kopeks. Platform remainder =
 * basis - author share. Never rounds both sides independently.
 */
export function authorShareMinor(
  basisMinor: number,
  shareBps: number,
): number {
  if (!Number.isFinite(basisMinor) || !Number.isFinite(shareBps)) return 0;
  if (basisMinor <= 0 || shareBps <= 0) return 0;
  const basis = Math.trunc(basisMinor);
  const bps = Math.trunc(shareBps);
  return Math.floor((basis * bps + 9999) / 10000);
}

/** Platform share as the remainder so author + platform always equals paid. */
export function platformShareMinor(
  basisMinor: number,
  authorShareBps: number,
): number {
  if (!Number.isFinite(basisMinor) || basisMinor <= 0) return 0;
  const basis = Math.trunc(basisMinor);
  const author = authorShareMinor(basis, authorShareBps);
  return basis - author;
}

export function isValidShareBps(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 10000;
}

export function isValidHoldDays(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 365;
}

/**
 * Mirrors public.ensure_author_refund_reversal.
 *
 * The author position is recomputed from what the buyer actually kept paying
 * rather than reversing each refund in isolation, so repeated or out-of-order
 * partial refunds still converge on the same total. The returned delta is
 * always <= 0; zero means the ledger already matches the target and no row
 * should be written.
 */
export function computeRefundReversalMinor(input: {
  saleAccrualMinor: number;
  grossBasisMinor: number;
  cumulativeRefundedMinor: number;
  existingReversalsMinor: number;
  shareBps: number;
}): { targetMinor: number; netBasisMinor: number; reversalMinor: number } {
  const netBasisMinor = Math.max(
    0,
    input.grossBasisMinor - input.cumulativeRefundedMinor,
  );
  const targetMinor = authorShareMinor(netBasisMinor, input.shareBps);
  const existing = Math.abs(input.existingReversalsMinor);
  const reversalMinor = -(input.saleAccrualMinor - targetMinor - existing);

  return {
    targetMinor,
    netBasisMinor,
    reversalMinor: reversalMinor >= 0 ? 0 : reversalMinor,
  };
}

export type AuthorLedgerHold = "held" | "payable";

/** Mirrors the per-payment hold rule: available_at in the future means held. */
export function classifyHold(
  availableAt: string | null | undefined,
  now: Date = new Date(),
): AuthorLedgerHold {
  if (!availableAt) return "payable";
  const at = new Date(availableAt);
  if (Number.isNaN(at.getTime())) return "payable";
  return at.getTime() > now.getTime() ? "held" : "payable";
}

export function holdAvailableAt(
  confirmedAt: string,
  holdDays: number,
): string | null {
  const at = new Date(confirmedAt);
  if (Number.isNaN(at.getTime())) return null;
  return new Date(at.getTime() + holdDays * 24 * 60 * 60 * 1000).toISOString();
}

export type AuthorPaymentPosition = {
  paymentId: string;
  netMinor: number;
  availableAt: string | null;
};

/**
 * Mirrors public.author_finance_balance. Holds are evaluated per payment, so a
 * refund reversal always lands in the same bucket as the sale it reverses.
 */
export function computeAuthorBalance(
  positions: readonly AuthorPaymentPosition[],
  adjustmentsMinor: number,
  now: Date = new Date(),
): { netEntitlementMinor: number; heldMinor: number; payableMinor: number } {
  let heldMinor = 0;
  let payableMinor = adjustmentsMinor;

  for (const position of positions) {
    if (classifyHold(position.availableAt, now) === "held") {
      heldMinor += position.netMinor;
    } else {
      payableMinor += position.netMinor;
    }
  }

  return {
    netEntitlementMinor: heldMinor + payableMinor,
    heldMinor,
    payableMinor,
  };
}

/**
 * Mirrors the eligibility gate in ensure_author_sale_accrual. Returns the
 * blocking reason, or null when an accrual may be written.
 */
export function accrualBlocker(input: {
  paymentSucceeded: boolean;
  hasAuthorSnapshot: boolean;
  payoutEligible: boolean;
  termsMatchCount: number;
}): string | null {
  if (!input.paymentSucceeded) return "payment_not_succeeded";
  if (!input.hasAuthorSnapshot) return "author_snapshot_missing";
  if (!input.payoutEligible) return "author_not_payout_eligible";
  if (input.termsMatchCount === 0) return "no_active_terms";
  if (input.termsMatchCount > 1) return "ambiguous_terms";
  return null;
}
