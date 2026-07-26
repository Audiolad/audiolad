/**
 * Admin author economy read models (P3.3.2).
 *
 * Gross always comes from the P3.1 methodology through the SQL layer; this
 * file only adds the author entitlement view on top and never recomputes money
 * in TypeScript.
 */

import {
  resolveAdminAnalyticsPeriodRange,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import {
  isAuthorLedgerEntryType,
  isAuthorPayoutClass,
  isAuthorTermsStatus,
  type AuthorLedgerEntryType,
  type AuthorPayoutClass,
  type AuthorTermsStatus,
} from "@/lib/payments/author-finance/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminAuthorFinanceSummary = {
  currency: string;
  includeTest: boolean;
  calculationVersion: string;
  paymentCount: number;
  grossMinor: number;
  accruedMinor: number;
  reversedMinor: number;
  adjustmentsMinor: number;
  netEntitlementMinor: number;
  platformShareMinor: number;
  accrualCount: number;
  reversalCount: number;
  adjustmentCount: number;
  heldMinor: number;
  payableMinor: number;
  authorsWithLedger: number;
  payoutEligibleAuthors: number;
  authorsWithApprovedTerms: number;
  obligationsPending: number;
  obligationsRequiresReview: number;
  obligationsFailed: number;
  obligationsSkippedPlatformOwned: number;
  notes: {
    methodology: string;
    gross: string;
    balances: string;
    platformShare: string;
    providerFees: string;
    taxes: string;
    payouts: string;
    productOverrides: string;
  };
};

export type AdminAuthorFinanceAuthorRow = {
  authorId: string;
  name: string;
  slug: string;
  accessStatus: string;
  payoutEligible: boolean;
  payoutClass: AuthorPayoutClass;
  approvedTermsCount: number;
  currentShareBps: number | null;
  accruedMinor: number;
  reversedMinor: number;
  adjustmentsMinor: number;
  entryCount: number;
  netEntitlementMinor: number;
  heldMinor: number;
  payableMinor: number;
};

export type AdminAuthorFinanceLedgerRow = {
  entryId: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  entryType: AuthorLedgerEntryType;
  amountMinor: number;
  currency: string;
  paymentId: string | null;
  refundId: string | null;
  orderId: string | null;
  termsId: string | null;
  authorShareBps: number | null;
  holdDays: number | null;
  grossBasisMinor: number | null;
  netBasisMinor: number | null;
  effectiveAt: string | null;
  availableAt: string | null;
  isHeld: boolean;
  calculationVersion: string;
  reasonCode: string | null;
  isTest: boolean;
  createdAt: string | null;
  practiceTitle: string | null;
  practiceSlug: string | null;
};

export type AdminAuthorTermsRow = {
  termsId: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  currency: string;
  authorShareBps: number;
  holdDays: number;
  status: AuthorTermsStatus;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
  approvedAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
  isActiveNow: boolean;
};

export type AdminAuthorFinanceListBundle<TRow> = {
  total: number;
  limit: number;
  offset: number;
  rows: TRow[];
  error: string | null;
};

export type AdminAuthorFinanceDryRunRow = {
  paymentId: string;
  orderId: string;
  amountMinor: number;
  confirmedAt: string | null;
  practiceTitle: string | null;
  practiceSlug: string | null;
  resolvedAuthorId: string | null;
  resolvedAuthorName: string | null;
  attributionSource: string;
  payoutClass: string;
  blocker: string | null;
  proposedAccrualMinor: number;
  proposedShareBps: number | null;
  isTest: boolean;
};

export type AdminAuthorFinanceDryRun = {
  readOnly: boolean;
  writesPerformed: number;
  totals: {
    paymentCount: number;
    grossMinor: number;
    platformOwnedCount: number;
    platformOwnedMinor: number;
    unresolvedCount: number;
    historicalFallbackCount: number;
    eligibleCount: number;
    proposedAccrualMinor: number;
  };
  rows: AdminAuthorFinanceDryRunRow[];
  heuristics: Record<string, string>;
  notes: Record<string, string>;
};

export const EMPTY_ADMIN_AUTHOR_FINANCE_SUMMARY: AdminAuthorFinanceSummary = {
  currency: "RUB",
  includeTest: false,
  calculationVersion: "p332.v1",
  paymentCount: 0,
  grossMinor: 0,
  accruedMinor: 0,
  reversedMinor: 0,
  adjustmentsMinor: 0,
  netEntitlementMinor: 0,
  platformShareMinor: 0,
  accrualCount: 0,
  reversalCount: 0,
  adjustmentCount: 0,
  heldMinor: 0,
  payableMinor: 0,
  authorsWithLedger: 0,
  payoutEligibleAuthors: 0,
  authorsWithApprovedTerms: 0,
  obligationsPending: 0,
  obligationsRequiresReview: 0,
  obligationsFailed: 0,
  obligationsSkippedPlatformOwned: 0,
  notes: {
    methodology: "ledger_effective_at_in_period",
    gross: "p31_succeeded_confirmed_at_in_period",
    balances: "as_of_now_not_period_bound",
    platformShare: "gross_minus_author_entitlement_before_fees",
    providerFees: "not_connected",
    taxes: "not_connected",
    payouts: "not_connected",
    productOverrides: "not_implemented",
  },
};

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

function mapSummary(raw: unknown): AdminAuthorFinanceSummary {
  const row = (raw ?? {}) as Record<string, unknown>;
  const notes = (row.notes ?? {}) as Record<string, unknown>;
  const fallback = EMPTY_ADMIN_AUTHOR_FINANCE_SUMMARY.notes;

  return {
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    includeTest: row.include_test === true,
    calculationVersion: String(row.calculation_version ?? "p332.v1"),
    paymentCount: asNumber(row.payment_count),
    grossMinor: asNumber(row.gross_minor),
    accruedMinor: asNumber(row.accrued_minor),
    reversedMinor: asNumber(row.reversed_minor),
    adjustmentsMinor: asNumber(row.adjustments_minor),
    netEntitlementMinor: asNumber(row.net_entitlement_minor),
    platformShareMinor: asNumber(row.platform_share_minor),
    accrualCount: asNumber(row.accrual_count),
    reversalCount: asNumber(row.reversal_count),
    adjustmentCount: asNumber(row.adjustment_count),
    heldMinor: asNumber(row.held_minor),
    payableMinor: asNumber(row.payable_minor),
    authorsWithLedger: asNumber(row.authors_with_ledger),
    payoutEligibleAuthors: asNumber(row.payout_eligible_authors),
    authorsWithApprovedTerms: asNumber(row.authors_with_approved_terms),
    obligationsPending: asNumber(row.obligations_pending),
    obligationsRequiresReview: asNumber(row.obligations_requires_review),
    obligationsFailed: asNumber(row.obligations_failed),
    obligationsSkippedPlatformOwned: asNumber(
      row.obligations_skipped_platform_owned,
    ),
    notes: {
      methodology: String(notes.methodology ?? fallback.methodology),
      gross: String(notes.gross ?? fallback.gross),
      balances: String(notes.balances ?? fallback.balances),
      platformShare: String(notes.platform_share ?? fallback.platformShare),
      providerFees: String(notes.provider_fees ?? fallback.providerFees),
      taxes: String(notes.taxes ?? fallback.taxes),
      payouts: String(notes.payouts ?? fallback.payouts),
      productOverrides: String(
        notes.product_overrides ?? fallback.productOverrides,
      ),
    },
  };
}

function mapAuthorRow(raw: unknown): AdminAuthorFinanceAuthorRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.author_id !== "string") return null;

  return {
    authorId: row.author_id,
    name: String(row.name ?? "Без имени"),
    slug: String(row.slug ?? ""),
    accessStatus: String(row.access_status ?? "free"),
    payoutEligible: row.payout_eligible === true,
    payoutClass: isAuthorPayoutClass(row.payout_class)
      ? row.payout_class
      : "unresolved_author",
    approvedTermsCount: asNumber(row.approved_terms_count),
    currentShareBps: asNullableNumber(row.current_share_bps),
    accruedMinor: asNumber(row.accrued_minor),
    reversedMinor: asNumber(row.reversed_minor),
    adjustmentsMinor: asNumber(row.adjustments_minor),
    entryCount: asNumber(row.entry_count),
    netEntitlementMinor: asNumber(row.net_entitlement_minor),
    heldMinor: asNumber(row.held_minor),
    payableMinor: asNumber(row.payable_minor),
  };
}

function mapLedgerRow(raw: unknown): AdminAuthorFinanceLedgerRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.entry_id !== "string" || !isAuthorLedgerEntryType(row.entry_type)) {
    return null;
  }

  return {
    entryId: row.entry_id,
    authorId: String(row.author_id ?? ""),
    authorName: String(row.author_name ?? "Без имени"),
    authorSlug: String(row.author_slug ?? ""),
    entryType: row.entry_type,
    amountMinor: asNumber(row.amount_minor),
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    paymentId: asText(row.payment_id),
    refundId: asText(row.refund_id),
    orderId: asText(row.order_id),
    termsId: asText(row.terms_id),
    authorShareBps: asNullableNumber(row.author_share_bps),
    holdDays: asNullableNumber(row.hold_days),
    grossBasisMinor: asNullableNumber(row.gross_basis_minor),
    netBasisMinor: asNullableNumber(row.net_basis_minor),
    effectiveAt: asText(row.effective_at),
    availableAt: asText(row.available_at),
    isHeld: row.is_held === true,
    calculationVersion: String(row.calculation_version ?? "p332.v1"),
    reasonCode: asText(row.reason_code),
    isTest: row.is_test === true,
    createdAt: asText(row.created_at),
    practiceTitle: asText(row.practice_title),
    practiceSlug: asText(row.practice_slug),
  };
}

export async function getAdminAuthorFinanceSummary(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
}): Promise<AdminAuthorFinanceSummary> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "admin_author_finance_p332_summary",
    {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
    },
  );

  if (error) {
    console.error("admin_author_finance_p332_summary_error", error.message);
    return {
      ...EMPTY_ADMIN_AUTHOR_FINANCE_SUMMARY,
      includeTest: input.includeTest,
    };
  }

  return mapSummary(data);
}

export async function getAdminAuthorFinanceAuthors(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminAuthorFinanceListBundle<AdminAuthorFinanceAuthorRow>> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();
  const limit = input.limit ?? 50;

  const { data, error } = await supabase.rpc(
    "admin_author_finance_p332_authors",
    {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
      p_search: input.search?.trim() || null,
      p_limit: limit,
      p_offset: input.offset ?? 0,
    },
  );

  if (error) {
    console.error("admin_author_finance_p332_authors_error", error.message);
    return { total: 0, limit, offset: 0, rows: [], error: "authors_failed" };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.rows)
    ? raw.rows
        .map(mapAuthorRow)
        .filter((row): row is AdminAuthorFinanceAuthorRow => row !== null)
    : [];

  return {
    total: asNumber(raw.total),
    limit: asNumber(raw.limit, limit),
    offset: asNumber(raw.offset),
    rows,
    error: null,
  };
}

export async function getAdminAuthorFinanceLedger(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  authorId?: string | null;
  entryType?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminAuthorFinanceListBundle<AdminAuthorFinanceLedgerRow>> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();
  const limit = input.limit ?? 50;

  const { data, error } = await supabase.rpc(
    "admin_author_finance_p332_ledger",
    {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
      p_author_id: input.authorId ?? null,
      p_entry_type: input.entryType ?? null,
      p_search: input.search?.trim() || null,
      p_limit: limit,
      p_offset: input.offset ?? 0,
    },
  );

  if (error) {
    console.error("admin_author_finance_p332_ledger_error", error.message);
    return { total: 0, limit, offset: 0, rows: [], error: "ledger_failed" };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.rows)
    ? raw.rows
        .map(mapLedgerRow)
        .filter((row): row is AdminAuthorFinanceLedgerRow => row !== null)
    : [];

  return {
    total: asNumber(raw.total),
    limit: asNumber(raw.limit, limit),
    offset: asNumber(raw.offset),
    rows,
    error: null,
  };
}

/**
 * Terms are read straight from the table: there is no money in this projection
 * and the admin UI needs drafts, which no reporting RPC exposes.
 */
export async function getAdminAuthorTerms(input: {
  authorId?: string | null;
  limit?: number;
}): Promise<AdminAuthorFinanceListBundle<AdminAuthorTermsRow>> {
  const supabase = createServiceRoleClient();
  const limit = input.limit ?? 100;

  let query = supabase
    .from("author_commercial_terms")
    .select(
      "id, author_id, currency, author_share_bps, hold_days, status, valid_from, valid_to, notes, approved_at, closed_at, created_at, authors!inner(name, slug)",
      { count: "exact" },
    )
    .order("valid_from", { ascending: false })
    .limit(limit);

  if (input.authorId) {
    query = query.eq("author_id", input.authorId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("admin_author_terms_error", error.message);
    return { total: 0, limit, offset: 0, rows: [], error: "terms_failed" };
  }

  const now = Date.now();
  const rows = (data ?? []).flatMap((raw): AdminAuthorTermsRow[] => {
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || !isAuthorTermsStatus(row.status)) return [];

    const author = (
      Array.isArray(row.authors) ? row.authors[0] : row.authors
    ) as Record<string, unknown> | undefined;

    const validFrom = String(row.valid_from ?? "");
    const validTo = asText(row.valid_to);
    const isActiveNow =
      row.status === "approved" &&
      new Date(validFrom).getTime() <= now &&
      (validTo === null || new Date(validTo).getTime() > now);

    return [
      {
        termsId: row.id,
        authorId: String(row.author_id ?? ""),
        authorName: String(author?.name ?? "Без имени"),
        authorSlug: String(author?.slug ?? ""),
        currency: String(row.currency ?? "RUB"),
        authorShareBps: asNumber(row.author_share_bps),
        holdDays: asNumber(row.hold_days),
        status: row.status,
        validFrom,
        validTo,
        notes: asText(row.notes),
        approvedAt: asText(row.approved_at),
        closedAt: asText(row.closed_at),
        createdAt: asText(row.created_at),
        isActiveNow,
      },
    ];
  });

  return {
    total: count ?? rows.length,
    limit,
    offset: 0,
    rows,
    error: null,
  };
}

export async function getAdminAuthorFinanceDryRun(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  limit?: number;
}): Promise<AdminAuthorFinanceDryRun | null> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "admin_author_finance_p332_historical_dry_run",
    {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
      p_limit: input.limit ?? 200,
    },
  );

  if (error) {
    console.error("admin_author_finance_p332_dry_run_error", error.message);
    return null;
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const totals = (raw.totals ?? {}) as Record<string, unknown>;

  const rows = Array.isArray(raw.rows)
    ? raw.rows.flatMap((entry): AdminAuthorFinanceDryRunRow[] => {
        const row = entry as Record<string, unknown>;
        if (typeof row.payment_id !== "string") return [];
        return [
          {
            paymentId: row.payment_id,
            orderId: String(row.order_id ?? ""),
            amountMinor: asNumber(row.amount_minor),
            confirmedAt: asText(row.confirmed_at),
            practiceTitle: asText(row.practice_title),
            practiceSlug: asText(row.practice_slug),
            resolvedAuthorId: asText(row.resolved_author_id),
            resolvedAuthorName: asText(row.resolved_author_name),
            attributionSource: String(row.attribution_source ?? "unresolved"),
            payoutClass: String(row.payout_class ?? "unresolved_author"),
            blocker: asText(row.blocker),
            proposedAccrualMinor: asNumber(row.proposed_accrual_minor),
            proposedShareBps: asNullableNumber(row.proposed_share_bps),
            isTest: row.is_test === true,
          },
        ];
      })
    : [];

  const asStringMap = (value: unknown): Record<string, string> => {
    const source = (value ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(source).map(([key, item]) => [key, String(item ?? "")]),
    );
  };

  return {
    readOnly: raw.read_only === true,
    writesPerformed: asNumber(raw.writes_performed),
    totals: {
      paymentCount: asNumber(totals.payment_count),
      grossMinor: asNumber(totals.gross_minor),
      platformOwnedCount: asNumber(totals.platform_owned_count),
      platformOwnedMinor: asNumber(totals.platform_owned_minor),
      unresolvedCount: asNumber(totals.unresolved_count),
      historicalFallbackCount: asNumber(totals.historical_fallback_count),
      eligibleCount: asNumber(totals.eligible_count),
      proposedAccrualMinor: asNumber(totals.proposed_accrual_minor),
    },
    rows,
    heuristics: asStringMap(raw.heuristics),
    notes: asStringMap(raw.notes),
  };
}
