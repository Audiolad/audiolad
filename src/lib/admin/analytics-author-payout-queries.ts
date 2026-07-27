/**
 * Admin author payout read models (P3.3.3).
 *
 * Balances come from the same ledger the P3.3.2 panel reads, so the two views
 * can never disagree: p332 payable is the author's available balance, and the
 * payout capacity here is that balance minus what open payouts already
 * reserve. No bank details exist in these projections because none are stored.
 */

import {
  resolveAdminAnalyticsPeriodRange,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import {
  isAuthorPayoutAllocationStatus,
  isAuthorPayoutStatus,
  type AuthorPayoutAllocationStatus,
  type AuthorPayoutStatus,
} from "@/lib/payments/author-finance/payout-types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminAuthorPayoutSummary = {
  currency: string;
  includeTest: boolean;
  calculationVersion: string;
  cadence: string;
  timezone: string;
  periodLabel: string;
  minimumMinor: number;
  payoutCount: number;
  payoutsByStatus: Record<string, number>;
  amountByStatus: Record<string, number>;
  reservedMinor: number;
  paidMinor: number;
  reversedMinor: number;
  netPaidMinor: number;
  paidInPeriodMinor: number;
  requiresReviewCount: number;
  availableBalanceMinor: number;
  heldMinor: number;
  capacityMinor: number;
  candidateAuthors: number;
  candidateAuthorsAboveMinimum: number;
  notes: Record<string, string>;
};

export type AdminAuthorPayoutRow = {
  payoutId: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  status: AuthorPayoutStatus;
  currency: string;
  amountMinor: number;
  allocatedMinor: number;
  allocationCount: number;
  periodLabel: string;
  cutoffAt: string | null;
  minimumMinor: number;
  minimumOverride: boolean;
  minimumOverrideReason: string | null;
  externalReference: string | null;
  failureCode: string | null;
  cancelReason: string | null;
  reviewReason: string | null;
  reversalReason: string | null;
  ledgerEntryId: string | null;
  reversalLedgerEntryId: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  processingAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  reversedAt: string | null;
  isTest: boolean;
};

export type AdminAuthorPayoutCandidateRow = {
  authorId: string;
  name: string;
  slug: string;
  accessStatus: string;
  currency: string;
  availableBalanceMinor: number;
  heldMinor: number;
  activeReservedMinor: number;
  negativeOffsetMinor: number;
  allocatablePositiveMinor: number;
  capacityMinor: number;
  minimumMinor: number;
  meetsMinimum: boolean;
  sourceEntryCount: number;
  approvedTermsCount: number;
  openPayoutCount: number;
  lastPaidAt: string | null;
  blocker: string | null;
};

export type AdminAuthorPayoutAllocationRow = {
  allocationId: string;
  ledgerEntryId: string;
  status: AuthorPayoutAllocationStatus;
  amountMinor: number;
  entryType: string;
  entryAmountMinor: number;
  entryEffectiveAt: string | null;
  entryAvailableAt: string | null;
  entryPaymentId: string | null;
  releasedAt: string | null;
  releasedReason: string | null;
  paidAt: string | null;
  createdAt: string | null;
};

export type AdminAuthorPayoutLedgerRow = {
  entryId: string;
  entryType: string;
  amountMinor: number;
  currency: string;
  effectiveAt: string | null;
  availableAt: string | null;
  calculationVersion: string;
};

export type AdminAuthorPayoutAuditRow = {
  auditId: string;
  action: string;
  reason: string | null;
  createdAt: string | null;
  safeSnapshot: Record<string, unknown>;
};

export type AdminAuthorPayoutDetail = {
  found: boolean;
  payout: (AdminAuthorPayoutRow & { calculationSnapshot: unknown }) | null;
  allocations: AdminAuthorPayoutAllocationRow[];
  ledgerEntries: AdminAuthorPayoutLedgerRow[];
  audit: AdminAuthorPayoutAuditRow[];
  currentSnapshot: Record<string, unknown> | null;
};

export type AdminAuthorPayoutListBundle<TRow> = {
  total: number;
  limit: number;
  offset: number;
  rows: TRow[];
  error: string | null;
};

export type AdminAuthorPayoutCandidatesBundle =
  AdminAuthorPayoutListBundle<AdminAuthorPayoutCandidateRow> & {
    cutoffAt: string | null;
    periodLabel: string;
    minimumMinor: number;
    payoutEligibleAuthors: number;
  };

export type AdminAuthorPayoutIntegrity = {
  includeTest: boolean;
  calculationVersion: string;
  payoutsTotal: number;
  allocationsTotal: number;
  payoutEntriesTotal: number;
  payoutsByStatus: Record<string, number>;
  issues: Record<string, number>;
  hasIssues: boolean;
};

export const EMPTY_ADMIN_AUTHOR_PAYOUT_SUMMARY: AdminAuthorPayoutSummary = {
  currency: "RUB",
  includeTest: false,
  calculationVersion: "p333.v1",
  cadence: "monthly",
  timezone: "Europe/Moscow",
  periodLabel: "",
  minimumMinor: 100000,
  payoutCount: 0,
  payoutsByStatus: {},
  amountByStatus: {},
  reservedMinor: 0,
  paidMinor: 0,
  reversedMinor: 0,
  netPaidMinor: 0,
  paidInPeriodMinor: 0,
  requiresReviewCount: 0,
  availableBalanceMinor: 0,
  heldMinor: 0,
  capacityMinor: 0,
  candidateAuthors: 0,
  candidateAuthorsAboveMinimum: 0,
  notes: {},
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asNumberMap(value: unknown): Record<string, number> {
  const source = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [key, asNumber(item)]),
  );
}

function asStringMap(value: unknown): Record<string, string> {
  const source = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [key, String(item ?? "")]),
  );
}

function mapSummary(raw: unknown): AdminAuthorPayoutSummary {
  const row = (raw ?? {}) as Record<string, unknown>;

  return {
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    includeTest: row.include_test === true,
    calculationVersion: String(row.calculation_version ?? "p333.v1"),
    cadence: String(row.cadence ?? "monthly"),
    timezone: String(row.timezone ?? "Europe/Moscow"),
    periodLabel: String(row.period_label ?? ""),
    minimumMinor: asNumber(row.minimum_minor, 100000),
    payoutCount: asNumber(row.payout_count),
    payoutsByStatus: asNumberMap(row.payouts_by_status),
    amountByStatus: asNumberMap(row.amount_by_status),
    reservedMinor: asNumber(row.reserved_minor),
    paidMinor: asNumber(row.paid_minor),
    reversedMinor: asNumber(row.reversed_minor),
    netPaidMinor: asNumber(row.net_paid_minor),
    paidInPeriodMinor: asNumber(row.paid_in_period_minor),
    requiresReviewCount: asNumber(row.requires_review_count),
    availableBalanceMinor: asNumber(row.available_balance_minor),
    heldMinor: asNumber(row.held_minor),
    capacityMinor: asNumber(row.capacity_minor),
    candidateAuthors: asNumber(row.candidate_authors),
    candidateAuthorsAboveMinimum: asNumber(row.candidate_authors_above_minimum),
    notes: asStringMap(row.notes),
  };
}

function mapPayoutRow(raw: unknown): AdminAuthorPayoutRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.payout_id === "string" ? row.payout_id : row.id;
  if (typeof id !== "string" || !isAuthorPayoutStatus(row.status)) return null;

  return {
    payoutId: id,
    authorId: String(row.author_id ?? ""),
    authorName: String(row.author_name ?? "Без имени"),
    authorSlug: String(row.author_slug ?? ""),
    status: row.status,
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    amountMinor: asNumber(row.amount_minor),
    allocatedMinor: asNumber(row.allocated_minor),
    allocationCount: asNumber(row.allocation_count),
    periodLabel: String(row.period_label ?? ""),
    cutoffAt: asText(row.cutoff_at),
    minimumMinor: asNumber(row.minimum_minor, 100000),
    minimumOverride: row.minimum_override === true,
    minimumOverrideReason: asText(row.minimum_override_reason),
    externalReference: asText(row.external_reference),
    failureCode: asText(row.failure_code),
    cancelReason: asText(row.cancel_reason),
    reviewReason: asText(row.review_reason),
    reversalReason: asText(row.reversal_reason),
    ledgerEntryId: asText(row.ledger_entry_id),
    reversalLedgerEntryId: asText(row.reversal_ledger_entry_id),
    createdAt: asText(row.created_at),
    approvedAt: asText(row.approved_at),
    processingAt: asText(row.processing_at),
    paidAt: asText(row.paid_at),
    failedAt: asText(row.failed_at),
    cancelledAt: asText(row.cancelled_at),
    reversedAt: asText(row.reversed_at),
    isTest: row.is_test === true,
  };
}

function mapCandidateRow(raw: unknown): AdminAuthorPayoutCandidateRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.author_id !== "string") return null;

  return {
    authorId: row.author_id,
    name: String(row.name ?? "Без имени"),
    slug: String(row.slug ?? ""),
    accessStatus: String(row.access_status ?? "free"),
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    availableBalanceMinor: asNumber(row.available_balance_minor),
    heldMinor: asNumber(row.held_minor),
    activeReservedMinor: asNumber(row.active_reserved_minor),
    negativeOffsetMinor: asNumber(row.negative_offset_minor),
    allocatablePositiveMinor: asNumber(row.allocatable_positive_minor),
    capacityMinor: asNumber(row.capacity_minor),
    minimumMinor: asNumber(row.minimum_minor, 100000),
    meetsMinimum: row.meets_minimum === true,
    sourceEntryCount: asNumber(row.source_entry_count),
    approvedTermsCount: asNumber(row.approved_terms_count),
    openPayoutCount: asNumber(row.open_payout_count),
    lastPaidAt: asText(row.last_paid_at),
    blocker: asText(row.blocker),
  };
}

export async function getAdminAuthorPayoutSummary(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
}): Promise<AdminAuthorPayoutSummary> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "admin_author_payout_p333_summary",
    {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
    },
  );

  if (error) {
    console.error("admin_author_payout_p333_summary_error", error.message);
    return {
      ...EMPTY_ADMIN_AUTHOR_PAYOUT_SUMMARY,
      includeTest: input.includeTest,
    };
  }

  return mapSummary(data);
}

export async function getAdminAuthorPayoutList(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  status?: string | null;
  authorId?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminAuthorPayoutListBundle<AdminAuthorPayoutRow>> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();
  const limit = input.limit ?? 50;

  const { data, error } = await supabase.rpc("admin_author_payout_p333_list", {
    p_from: range.from,
    p_to: range.to,
    p_include_test: input.includeTest,
    p_status: input.status?.trim() || null,
    p_author_id: input.authorId ?? null,
    p_search: input.search?.trim() || null,
    p_limit: limit,
    p_offset: input.offset ?? 0,
  });

  if (error) {
    console.error("admin_author_payout_p333_list_error", error.message);
    return { total: 0, limit, offset: 0, rows: [], error: "payouts_failed" };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.rows)
    ? raw.rows
        .map(mapPayoutRow)
        .filter((row): row is AdminAuthorPayoutRow => row !== null)
    : [];

  return {
    total: asNumber(raw.total),
    limit: asNumber(raw.limit, limit),
    offset: asNumber(raw.offset),
    rows,
    error: null,
  };
}

export async function getAdminAuthorPayoutCandidates(input: {
  includeTest: boolean;
  cutoff?: string | null;
  includeBelowMinimum?: boolean;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminAuthorPayoutCandidatesBundle> {
  const supabase = createServiceRoleClient();
  const limit = input.limit ?? 50;

  const { data, error } = await supabase.rpc(
    "admin_author_payout_p333_candidates",
    {
      p_cutoff: input.cutoff ?? null,
      p_include_test: input.includeTest,
      p_include_below_minimum: input.includeBelowMinimum ?? true,
      p_search: input.search?.trim() || null,
      p_limit: limit,
      p_offset: input.offset ?? 0,
    },
  );

  if (error) {
    console.error("admin_author_payout_p333_candidates_error", error.message);
    return {
      total: 0,
      limit,
      offset: 0,
      rows: [],
      error: "candidates_failed",
      cutoffAt: null,
      periodLabel: "",
      minimumMinor: 100000,
      payoutEligibleAuthors: 0,
    };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.rows)
    ? raw.rows
        .map(mapCandidateRow)
        .filter((row): row is AdminAuthorPayoutCandidateRow => row !== null)
    : [];

  return {
    total: asNumber(raw.total),
    limit: asNumber(raw.limit, limit),
    offset: asNumber(raw.offset),
    rows,
    error: null,
    cutoffAt: asText(raw.cutoff_at),
    periodLabel: String(raw.period_label ?? ""),
    minimumMinor: asNumber(raw.minimum_minor, 100000),
    payoutEligibleAuthors: asNumber(raw.payout_eligible_authors),
  };
}

export async function getAdminAuthorPayoutDetail(
  payoutId: string,
): Promise<AdminAuthorPayoutDetail> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "admin_author_payout_p333_detail",
    { p_payout_id: payoutId },
  );

  if (error) {
    console.error("admin_author_payout_p333_detail_error", error.message);
    return {
      found: false,
      payout: null,
      allocations: [],
      ledgerEntries: [],
      audit: [],
      currentSnapshot: null,
    };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const payoutRaw = (raw.payout ?? null) as Record<string, unknown> | null;
  const payout = mapPayoutRow(payoutRaw);

  const allocations = Array.isArray(raw.allocations)
    ? raw.allocations.flatMap((entry): AdminAuthorPayoutAllocationRow[] => {
        const row = entry as Record<string, unknown>;
        if (
          typeof row.allocation_id !== "string" ||
          !isAuthorPayoutAllocationStatus(row.status)
        ) {
          return [];
        }
        return [
          {
            allocationId: row.allocation_id,
            ledgerEntryId: String(row.ledger_entry_id ?? ""),
            status: row.status,
            amountMinor: asNumber(row.amount_minor),
            entryType: String(row.entry_type ?? ""),
            entryAmountMinor: asNumber(row.entry_amount_minor),
            entryEffectiveAt: asText(row.entry_effective_at),
            entryAvailableAt: asText(row.entry_available_at),
            entryPaymentId: asText(row.entry_payment_id),
            releasedAt: asText(row.released_at),
            releasedReason: asText(row.released_reason),
            paidAt: asText(row.paid_at),
            createdAt: asText(row.created_at),
          },
        ];
      })
    : [];

  const ledgerEntries = Array.isArray(raw.ledger_entries)
    ? raw.ledger_entries.flatMap((entry): AdminAuthorPayoutLedgerRow[] => {
        const row = entry as Record<string, unknown>;
        if (typeof row.entry_id !== "string") return [];
        return [
          {
            entryId: row.entry_id,
            entryType: String(row.entry_type ?? ""),
            amountMinor: asNumber(row.amount_minor),
            currency: String(row.currency ?? "RUB"),
            effectiveAt: asText(row.effective_at),
            availableAt: asText(row.available_at),
            calculationVersion: String(row.calculation_version ?? "p333.v1"),
          },
        ];
      })
    : [];

  const audit = Array.isArray(raw.audit)
    ? raw.audit.flatMap((entry): AdminAuthorPayoutAuditRow[] => {
        const row = entry as Record<string, unknown>;
        if (typeof row.audit_id !== "string") return [];
        return [
          {
            auditId: row.audit_id,
            action: String(row.action ?? ""),
            reason: asText(row.reason),
            createdAt: asText(row.created_at),
            safeSnapshot: (row.safe_snapshot ?? {}) as Record<string, unknown>,
          },
        ];
      })
    : [];

  return {
    found: raw.found === true && payout !== null,
    payout: payout
      ? { ...payout, calculationSnapshot: payoutRaw?.calculation_snapshot ?? null }
      : null,
    allocations,
    ledgerEntries,
    audit,
    currentSnapshot: (raw.current_snapshot ?? null) as Record<
      string,
      unknown
    > | null,
  };
}

/** Counters that must all be zero; anything else is a bookkeeping bug. */
export async function getAdminAuthorPayoutIntegrity(input: {
  includeTest: boolean;
}): Promise<AdminAuthorPayoutIntegrity | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "admin_author_payout_p333_integrity_snapshot",
    { p_include_test: input.includeTest },
  );

  if (error) {
    console.error("admin_author_payout_p333_integrity_error", error.message);
    return null;
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const descriptive = new Set([
    "include_test",
    "calculation_version",
    "payouts_total",
    "allocations_total",
    "payout_entries_total",
    "payouts_by_status",
    "notes",
  ]);

  const issues = Object.fromEntries(
    Object.entries(raw)
      .filter(([key]) => !descriptive.has(key))
      .map(([key, value]) => [key, asNumber(value)]),
  );

  return {
    includeTest: raw.include_test === true,
    calculationVersion: String(raw.calculation_version ?? "p333.v1"),
    payoutsTotal: asNumber(raw.payouts_total),
    allocationsTotal: asNumber(raw.allocations_total),
    payoutEntriesTotal: asNumber(raw.payout_entries_total),
    payoutsByStatus: asNumberMap(raw.payouts_by_status),
    issues,
    hasIssues: Object.values(issues).some((value) => value > 0),
  };
}
