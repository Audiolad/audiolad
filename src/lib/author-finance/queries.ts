/**
 * P3.3.4 author finance read models.
 *
 * Server-only. Every function here takes an author id that the API route has
 * *already* proved the caller owns via requireAuthorMembership(); the service
 * role client is used only because the P3.3.x RPCs are service_role-only by
 * design. Nothing in this file decides access, and nothing in it writes.
 *
 * Test money is never included: the cabinet shows real money only.
 */

import { hasAcceptedCurrentAuthorTerms } from "@/lib/author-terms/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  isAuthorFinanceAmountState,
  isAuthorFinanceIntegrityStatus,
  selectAuthorFinanceEmptyState,
  type AuthorFinanceIntegrityStatus,
  type AuthorFinanceLedgerDetail,
  type AuthorFinanceLedgerRow,
  type AuthorFinanceList,
  type AuthorFinancePayoutDetail,
  type AuthorFinancePayoutRow,
  type AuthorFinanceSummary,
  type AuthorFinanceTermsRow,
  type AuthorFinanceTermsStatus,
  type AuthorFinanceTermsSummary,
  type AuthorFinanceTypeKey,
} from "./types";

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function mapTermsSummary(raw: unknown): AuthorFinanceTermsSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  return {
    authorShareBps: asNumber(row.author_share_bps),
    platformShareBps: asNumber(row.platform_share_bps),
    holdDays: asNumber(row.hold_days),
    currency: String(row.currency ?? "RUB"),
    validFrom: asText(row.valid_from),
    validTo: asText(row.valid_to),
  };
}

function mapLedgerRow(raw: unknown): AuthorFinanceLedgerRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.entry_id !== "string") return null;

  return {
    entryId: row.entry_id,
    typeKey: String(row.type_key ?? "other") as AuthorFinanceTypeKey | "other",
    amountMinor: asNumber(row.amount_minor),
    currency: String(row.currency ?? "RUB"),
    effectiveAt: asText(row.effective_at),
    availableAt: asText(row.available_at),
    isHeld: row.is_held === true,
    amountState: isAuthorFinanceAmountState(row.amount_state)
      ? row.amount_state
      : "available",
    productTitle: asText(row.product_title),
    payoutSafeRef: asText(row.payout_safe_ref),
    publicComment: asText(row.public_comment),
  };
}

function mapPayoutRow(raw: unknown): AuthorFinancePayoutRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.payout_id !== "string") return null;

  return {
    payoutId: row.payout_id,
    statusKey: String(
      row.status_key ?? "unknown",
    ) as AuthorFinancePayoutRow["statusKey"],
    amountMinor: asNumber(row.amount_minor),
    currency: String(row.currency ?? "RUB"),
    periodLabel: String(row.period_label ?? ""),
    createdAt: asText(row.created_at),
    paidAt: asText(row.paid_at),
    referenceMasked: asText(row.reference_masked),
    isSettled: row.is_settled === true,
  };
}

export async function getAuthorFinanceSummary(input: {
  authorId: string;
}): Promise<AuthorFinanceSummary | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("author_finance_p334_summary", {
    p_author_id: input.authorId,
    p_include_test: false,
  });

  if (error) {
    console.error("author_finance_p334_summary_error", error.message);
    return null;
  }

  const row = asRecord(data);
  const termsStatus = String(row.terms_status ?? "missing");
  const payoutEligible = row.payout_eligible === true;
  const accessStatus = String(row.access_status ?? "free");
  const approvedTermsCount = asNumber(row.approved_terms_count);
  const entryCount = asNumber(row.entry_count);
  const payableMinor = asNumber(row.payable_minor);
  const reservedMinor = asNumber(row.reserved_minor);
  const heldMinor = asNumber(row.held_minor);
  const paidPayoutCount = asNumber(row.paid_payout_count);
  const thresholdMinor = asNumber(row.threshold_minor, 100000);

  const authorTerms = await hasAcceptedCurrentAuthorTerms(input.authorId);
  const authorTermsAccepted = authorTerms.accepted;
  const authorTermsVersion = authorTerms.currentVersion?.version ?? null;

  // Recompute from access/Author Terms/balance fields so a stale SQL CASE
  // cannot mislabel a commercial author in the UI.
  const emptyStateCode = selectAuthorFinanceEmptyState({
    payoutEligible,
    accessStatus,
    approvedTermsCount,
    entryCount,
    payableMinor,
    reservedMinor,
    heldMinor,
    paidPayoutCount,
    thresholdMinor,
    authorTermsAccepted,
  });
  const eligibilityMessage =
    row.negative === true || row.eligibility_message === "negative_balance"
      ? "negative_balance"
      : emptyStateCode;

  return {
    currency: String(row.currency ?? "RUB"),
    calculationVersion: String(row.calculation_version ?? "p334.v1"),
    asOf: asText(row.as_of),

    accruedMinor: asNumber(row.accrued_minor),
    refundsReversedMinor: asNumber(row.refunds_reversed_minor),
    adjustmentsMinor: asNumber(row.adjustments_minor),
    heldMinor,
    availableMinor: asNumber(row.available_minor),
    reservedMinor,
    payableMinor,
    paidMinor: asNumber(row.paid_minor),
    paidPayoutCount,
    entryCount,

    negative: row.negative === true,
    negativeMinor: asNumber(row.negative_minor),

    thresholdMinor,
    thresholdReached: row.threshold_reached === true,

    payoutEligible,
    accessStatus,
    termsStatus: (["missing", "active", "ended"].includes(termsStatus)
      ? termsStatus
      : "missing") as AuthorFinanceTermsStatus,
    approvedTermsCount,
    activeTermsSummary: mapTermsSummary(row.active_terms_summary),
    authorTermsAccepted,
    authorTermsVersion,

    oldestPayableAt: asText(row.oldest_payable_at),
    nextHoldReleaseAt: asText(row.next_hold_release_at),
    unresolvedReviewCount: asNumber(row.unresolved_review_count),

    emptyStateCode,
    eligibilityMessage,
  };
}

export async function getAuthorFinanceTerms(input: {
  authorId: string;
}): Promise<{ active: AuthorFinanceTermsRow | null; history: AuthorFinanceTermsRow[] }> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("author_finance_p334_terms", {
    p_author_id: input.authorId,
  });

  if (error) {
    console.error("author_finance_p334_terms_error", error.message);
    return { active: null, history: [] };
  }

  const row = asRecord(data);

  const mapRow = (raw: unknown): AuthorFinanceTermsRow | null => {
    const summary = mapTermsSummary(raw);
    if (!summary) return null;
    const source = asRecord(raw);
    const status = source.status === "superseded" ? "superseded" : "approved";

    return {
      ...summary,
      status,
      isActiveNow: source.is_active_now === true,
    };
  };

  const history = Array.isArray(row.history)
    ? row.history
        .map(mapRow)
        .filter((item): item is AuthorFinanceTermsRow => item !== null)
    : [];

  return { active: mapRow(row.active), history };
}

export async function getAuthorFinanceLedger(input: {
  authorId: string;
  from?: string | null;
  to?: string | null;
  type?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AuthorFinanceList<AuthorFinanceLedgerRow>> {
  const supabase = createServiceRoleClient();
  const limit = input.limit ?? 50;

  const { data, error } = await supabase.rpc("author_finance_p334_ledger", {
    p_author_id: input.authorId,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_type: input.type ?? null,
    p_search: input.search?.trim() || null,
    p_limit: limit,
    p_offset: input.offset ?? 0,
    p_include_test: false,
  });

  if (error) {
    console.error("author_finance_p334_ledger_error", error.message);
    return { total: 0, limit, offset: 0, rows: [] };
  }

  const row = asRecord(data);
  const rows = Array.isArray(row.rows)
    ? row.rows
        .map(mapLedgerRow)
        .filter((item): item is AuthorFinanceLedgerRow => item !== null)
    : [];

  return {
    total: asNumber(row.total),
    limit: asNumber(row.limit, limit),
    offset: asNumber(row.offset),
    rows,
  };
}

export async function getAuthorFinanceLedgerDetail(input: {
  authorId: string;
  entryId: string;
}): Promise<AuthorFinanceLedgerDetail | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "author_finance_p334_ledger_detail",
    {
      p_author_id: input.authorId,
      p_entry_id: input.entryId,
    },
  );

  if (error) {
    console.error("author_finance_p334_ledger_detail_error", error.message);
    return null;
  }

  const row = asRecord(data);
  if (row.found !== true) return null;

  const entry = mapLedgerRow(row.entry);
  if (!entry) return null;

  const formula = asRecord(row.formula);

  return {
    entry,
    formula: {
      grossBasisMinor: asNullableNumber(formula.gross_basis_minor),
      netBasisMinor: asNullableNumber(formula.net_basis_minor),
      authorShareBps: asNullableNumber(formula.author_share_bps),
      platformShareBps: asNullableNumber(formula.platform_share_bps),
      holdDays: asNullableNumber(formula.hold_days),
      rounding: String(formula.rounding ?? "ceil_author_remainder_platform"),
      refundPolicy: String(formula.refund_policy ?? "proportional_reversal"),
    },
  };
}

export async function getAuthorFinancePayouts(input: {
  authorId: string;
  from?: string | null;
  to?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AuthorFinanceList<AuthorFinancePayoutRow>> {
  const supabase = createServiceRoleClient();
  const limit = input.limit ?? 50;

  const { data, error } = await supabase.rpc("author_finance_p334_payouts", {
    p_author_id: input.authorId,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_status: input.status ?? null,
    p_limit: limit,
    p_offset: input.offset ?? 0,
    p_include_test: false,
  });

  if (error) {
    console.error("author_finance_p334_payouts_error", error.message);
    return { total: 0, limit, offset: 0, rows: [] };
  }

  const row = asRecord(data);
  const rows = Array.isArray(row.rows)
    ? row.rows
        .map(mapPayoutRow)
        .filter((item): item is AuthorFinancePayoutRow => item !== null)
    : [];

  return {
    total: asNumber(row.total),
    limit: asNumber(row.limit, limit),
    offset: asNumber(row.offset),
    rows,
  };
}

export async function getAuthorFinancePayoutDetail(input: {
  authorId: string;
  payoutId: string;
}): Promise<AuthorFinancePayoutDetail | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "author_finance_p334_payout_detail",
    {
      p_author_id: input.authorId,
      p_payout_id: input.payoutId,
    },
  );

  if (error) {
    console.error("author_finance_p334_payout_detail_error", error.message);
    return null;
  }

  const row = asRecord(data);
  if (row.found !== true) return null;

  const payout = mapPayoutRow(row.payout);
  if (!payout) return null;

  const source = asRecord(row.payout);

  const entries = Array.isArray(row.entries)
    ? row.entries.flatMap((raw): AuthorFinancePayoutDetail["entries"] => {
        const item = asRecord(raw);
        if (typeof item.entry_id !== "string") return [];
        return [
          {
            entryId: item.entry_id,
            typeKey: String(
              item.type_key ?? "other",
            ) as AuthorFinanceTypeKey | "other",
            allocatedMinor: asNumber(item.allocated_minor),
            effectiveAt: asText(item.effective_at),
            productTitle: asText(item.product_title),
          },
        ];
      })
    : [];

  return {
    payout: {
      ...payout,
      periodStart: asText(source.period_start),
      periodEnd: asText(source.period_end),
      cutoffAt: asText(source.cutoff_at),
      minimumMinor: asNumber(source.minimum_minor, 100000),
      processingAt: asText(source.processing_at),
      delayedAt: asText(source.delayed_at),
      cancelledAt: asText(source.cancelled_at),
      reversedAt: asText(source.reversed_at),
    },
    entries,
  };
}

export async function getAuthorFinanceIntegrityStatus(input: {
  authorId: string;
}): Promise<AuthorFinanceIntegrityStatus> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "author_finance_p334_integrity_status",
    { p_author_id: input.authorId },
  );

  if (error) {
    console.error("author_finance_p334_integrity_status_error", error.message);
    return "unavailable";
  }

  return isAuthorFinanceIntegrityStatus(data) ? data : "unavailable";
}
