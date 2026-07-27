/**
 * Service-role wrappers around the P3.3.3 author payout RPCs.
 *
 * The amount is never sent from the client: the server computes the payable
 * capacity and the caller may only ask for less. This file marshals arguments
 * and normalizes errors; every money decision stays in SQL.
 */

import {
  isAuthorPayoutStatus,
  type AuthorPayoutStatus,
} from "@/lib/payments/author-finance/payout-types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AuthorPayout = {
  id: string;
  authorId: string;
  currency: string;
  amountMinor: number;
  status: AuthorPayoutStatus;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  cutoffAt: string | null;
  minimumMinor: number;
  minimumOverride: boolean;
  minimumOverrideReason: string | null;
  calculationVersion: string;
  idempotencyKey: string;
  externalReference: string | null;
  failureCode: string | null;
  failureReason: string | null;
  reviewReason: string | null;
  cancelReason: string | null;
  reversalReason: string | null;
  notes: string | null;
  ledgerEntryId: string | null;
  reversalLedgerEntryId: string | null;
  approvedAt: string | null;
  processingAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  reviewAt: string | null;
  reversedAt: string | null;
  isTest: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AuthorPayoutRpcResult = {
  ok: boolean;
  outcome: string;
  payout: AuthorPayout | null;
  allocationCount: number | null;
  allocatedMinor: number | null;
  capacityMinor: number | null;
  releasedAllocations: number | null;
  reservationKept: boolean;
  ledgerEntryId: string | null;
  reversalLedgerEntryId: string | null;
  error: string | null;
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

export function mapAuthorPayout(raw: unknown): AuthorPayout | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !isAuthorPayoutStatus(row.status)) {
    return null;
  }

  return {
    id: row.id,
    authorId: String(row.author_id ?? ""),
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    amountMinor: asNumber(row.amount_minor),
    status: row.status,
    periodLabel: String(row.period_label ?? ""),
    periodStart: asText(row.period_start),
    periodEnd: asText(row.period_end),
    cutoffAt: asText(row.cutoff_at),
    minimumMinor: asNumber(row.minimum_minor),
    minimumOverride: row.minimum_override === true,
    minimumOverrideReason: asText(row.minimum_override_reason),
    calculationVersion: String(row.calculation_version ?? "p333.v1"),
    idempotencyKey: String(row.idempotency_key ?? ""),
    externalReference: asText(row.external_reference),
    failureCode: asText(row.failure_code),
    failureReason: asText(row.failure_reason),
    reviewReason: asText(row.review_reason),
    cancelReason: asText(row.cancel_reason),
    reversalReason: asText(row.reversal_reason),
    notes: asText(row.notes),
    ledgerEntryId: asText(row.ledger_entry_id),
    reversalLedgerEntryId: asText(row.reversal_ledger_entry_id),
    approvedAt: asText(row.approved_at),
    processingAt: asText(row.processing_at),
    paidAt: asText(row.paid_at),
    failedAt: asText(row.failed_at),
    cancelledAt: asText(row.cancelled_at),
    reviewAt: asText(row.review_at),
    reversedAt: asText(row.reversed_at),
    isTest: row.is_test === true,
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  };
}

function mapRpcResult(raw: unknown): AuthorPayoutRpcResult {
  const row = (raw ?? {}) as Record<string, unknown>;

  return {
    ok: row.ok === true,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    payout: mapAuthorPayout(row.payout),
    allocationCount: asNullableNumber(row.allocation_count),
    allocatedMinor: asNullableNumber(row.allocated_minor),
    capacityMinor: asNullableNumber(row.capacity_minor),
    releasedAllocations: asNullableNumber(row.released_allocations),
    reservationKept: row.reservation_kept === true,
    ledgerEntryId: asText(row.ledger_entry_id),
    reversalLedgerEntryId: asText(row.reversal_ledger_entry_id),
    error: asText(row.error),
  };
}

function rpcFailure(code: string): AuthorPayoutRpcResult {
  return {
    ok: false,
    outcome: "rejected",
    payout: null,
    allocationCount: null,
    allocatedMinor: null,
    capacityMinor: null,
    releasedAllocations: null,
    reservationKept: false,
    ledgerEntryId: null,
    reversalLedgerEntryId: null,
    error: code,
  };
}

/**
 * Postgres RAISE EXCEPTION messages here are our own snake_case validation
 * codes, so they are safe to hand back to admin callers. Anything unknown is
 * collapsed so an internal message can never leak into a response.
 */
export const AUTHOR_PAYOUT_VALIDATION_CODES = [
  "author_id_required",
  "author_not_found",
  "author_not_payout_eligible",
  "payout_id_required",
  "payout_not_found",
  "idempotency_key_required",
  "invalid_payout_amount",
  "desired_amount_exceeds_capacity",
  "no_payable_balance",
  "below_minimum_payout",
  "override_reason_required",
  "payout_allocation_underfunded",
  "payout_allocation_mismatch",
  "payout_underfunded",
  "invalid_payout_transition",
  "external_reference_required",
  "failure_code_required",
  "invalid_failure_mode",
  "reason_required",
  "payout_not_paid",
  "payout_already_reversed",
  "payout_reversal_partial_unsupported",
  "author_payouts_paid_immutable",
  "author_payouts_rpc_required",
  "author_payout_allocations_paid_immutable",
] as const;

function toValidationCode(message: string | undefined): string {
  const match = AUTHOR_PAYOUT_VALIDATION_CODES.find((code) =>
    message?.includes(code),
  );
  return match ?? "author_payout_rpc_error";
}

async function callPayoutRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<AuthorPayoutRpcResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc(name, args);

  if (error) {
    const code = toValidationCode(error.message);
    if (code === "author_payout_rpc_error") {
      console.error(`${name}_error`, error.message);
    }
    return rpcFailure(code);
  }

  return mapRpcResult(data);
}

export async function createAuthorPayoutDraft(input: {
  authorId: string;
  idempotencyKey: string;
  cutoff?: string | null;
  desiredAmountMinor?: number | null;
  allowBelowMinimum?: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  includeTest?: boolean;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutRpcResult> {
  return callPayoutRpc("create_author_payout_draft", {
    p_author_id: input.authorId,
    p_idempotency_key: input.idempotencyKey,
    p_cutoff: input.cutoff ?? null,
    p_desired_amount_minor: input.desiredAmountMinor ?? null,
    p_allow_below_minimum: input.allowBelowMinimum ?? false,
    p_override_reason: input.overrideReason ?? null,
    p_notes: input.notes ?? null,
    p_include_test: input.includeTest ?? false,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
  });
}

export async function approveAuthorPayout(input: {
  payoutId: string;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutRpcResult> {
  return callPayoutRpc("approve_author_payout", {
    p_payout_id: input.payoutId,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
  });
}

export async function markAuthorPayoutProcessing(input: {
  payoutId: string;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutRpcResult> {
  return callPayoutRpc("mark_author_payout_processing", {
    p_payout_id: input.payoutId,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
  });
}

/**
 * The only place that writes money out of the ledger, and only after a human
 * confirms the transfer actually happened at the bank.
 */
export async function markAuthorPayoutPaid(input: {
  payoutId: string;
  externalReference: string;
  paidAt?: string | null;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutRpcResult> {
  return callPayoutRpc("mark_author_payout_paid", {
    p_payout_id: input.payoutId,
    p_external_reference: input.externalReference,
    p_paid_at: input.paidAt ?? null,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
  });
}

export type AuthorPayoutFailureMode = "release" | "review";

export async function markAuthorPayoutFailed(input: {
  payoutId: string;
  failureCode: string;
  failureReason?: string | null;
  mode: AuthorPayoutFailureMode;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutRpcResult> {
  return callPayoutRpc("mark_author_payout_failed", {
    p_payout_id: input.payoutId,
    p_failure_code: input.failureCode,
    p_failure_reason: input.failureReason ?? null,
    p_mode: input.mode,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
  });
}

export async function cancelAuthorPayout(input: {
  payoutId: string;
  reason?: string | null;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutRpcResult> {
  return callPayoutRpc("cancel_author_payout", {
    p_payout_id: input.payoutId,
    p_reason: input.reason ?? null,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
  });
}

export async function markAuthorPayoutRequiresReview(input: {
  payoutId: string;
  reason: string;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutRpcResult> {
  return callPayoutRpc("mark_author_payout_requires_review", {
    p_payout_id: input.payoutId,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
  });
}

/** Full reversal only — a partial return of a transfer is out of scope in MVP. */
export async function reverseAuthorPayout(input: {
  payoutId: string;
  reason: string;
  effectiveAt?: string | null;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutRpcResult> {
  return callPayoutRpc("reverse_author_payout", {
    p_payout_id: input.payoutId,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId ?? null,
    p_effective_at: input.effectiveAt ?? null,
  });
}

export type AuthorPayoutReconcileResult = {
  ok: boolean;
  applied: boolean;
  found: number;
  flaggedForReview: number;
  rows: Array<{
    payoutId: string;
    authorId: string;
    status: string;
    amountMinor: number;
    capacityMinor: number;
    issue: string;
  }>;
  error: string | null;
};

/**
 * Read-only by default: it reports payouts whose reservation no longer fits
 * the balance (a refund landed after the draft) and only moves them to review
 * when explicitly applied. It never touches the ledger or an amount.
 */
export async function reconcileAuthorPayouts(input: {
  includeTest?: boolean;
  apply?: boolean;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorPayoutReconcileResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "admin_author_payout_p333_reconcile",
    {
      p_include_test: input.includeTest ?? false,
      p_apply: input.apply ?? false,
      p_actor_user_id: input.actorUserId,
      p_correlation_id: input.correlationId ?? null,
    },
  );

  if (error) {
    console.error("admin_author_payout_p333_reconcile_error", error.message);
    return {
      ok: false,
      applied: false,
      found: 0,
      flaggedForReview: 0,
      rows: [],
      error: "reconcile_failed",
    };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.rows)
    ? raw.rows.flatMap((entry) => {
        const row = entry as Record<string, unknown>;
        if (typeof row.payout_id !== "string") return [];
        return [
          {
            payoutId: row.payout_id,
            authorId: String(row.author_id ?? ""),
            status: String(row.status ?? ""),
            amountMinor: asNumber(row.amount_minor),
            capacityMinor: asNumber(row.capacity_minor),
            issue: String(row.issue ?? "underfunded"),
          },
        ];
      })
    : [];

  return {
    ok: raw.ok === true,
    applied: raw.applied === true,
    found: asNumber(raw.found),
    flaggedForReview: asNumber(raw.flagged_for_review),
    rows,
    error: null,
  };
}
