/**
 * Service-role wrappers around the P3.3.2 author ledger RPCs.
 * Every money decision lives in SQL; this file only marshals arguments.
 */

import {
  isAuthorLedgerEntryType,
  isFinanceObligationStatus,
  type AuthorLedgerEntryType,
  type FinanceObligationStatus,
  type FinanceObligationType,
} from "@/lib/payments/author-finance/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AuthorLedgerEntry = {
  id: string;
  authorId: string;
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
  calculationVersion: string;
  idempotencyKey: string;
  reasonCode: string | null;
  isTest: boolean;
  createdAt: string | null;
};

export type AuthorFinanceRpcResult = {
  ok: boolean;
  outcome: string;
  resultCode: string | null;
  authorId: string | null;
  entry: AuthorLedgerEntry | null;
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

export function mapAuthorLedgerEntry(raw: unknown): AuthorLedgerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  if (typeof row.id !== "string" || !isAuthorLedgerEntryType(row.entry_type)) {
    return null;
  }

  return {
    id: row.id,
    authorId: String(row.author_id ?? ""),
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
    calculationVersion: String(row.calculation_version ?? "p332.v1"),
    idempotencyKey: String(row.idempotency_key ?? ""),
    reasonCode: asText(row.reason_code),
    isTest: row.is_test === true,
    createdAt: asText(row.created_at),
  };
}

function mapRpcResult(raw: unknown): AuthorFinanceRpcResult {
  const row = (raw ?? {}) as Record<string, unknown>;

  return {
    ok: row.ok === true,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    resultCode: asText(row.result_code),
    authorId: asText(row.author_id),
    entry: mapAuthorLedgerEntry(row.entry),
    error: asText(row.error),
  };
}

function rpcFailure(code: string): AuthorFinanceRpcResult {
  return {
    ok: false,
    outcome: "rejected",
    resultCode: code,
    authorId: null,
    entry: null,
    error: code,
  };
}

/**
 * Postgres RAISE EXCEPTION messages here are our own snake_case validation
 * codes, so they are safe to hand back to admin callers.
 */
function toValidationCode(message: string | undefined): string {
  const known = [
    "author_id_required",
    "author_not_found",
    "terms_id_required",
    "terms_not_found",
    "invalid_author_share_bps",
    "invalid_hold_days",
    "invalid_validity_window",
    "invalid_close_status",
    "author_commercial_terms_overlap",
    "author_commercial_terms_approved_immutable",
    "author_commercial_terms_rpc_required",
    "amount_must_be_nonzero",
    "reason_code_required",
    "idempotency_key_required",
    "payment_id_required",
    "refund_id_required",
    "obligation_id_required",
  ];
  const match = known.find((code) => message?.includes(code));
  return match ?? "author_finance_rpc_error";
}

export async function ensureAuthorSaleAccrual(input: {
  paymentId: string;
  correlationId?: string | null;
  actorUserId?: string | null;
}): Promise<AuthorFinanceRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("ensure_author_sale_accrual", {
    p_payment_id: input.paymentId,
    p_correlation_id: input.correlationId ?? null,
    p_actor_user_id: input.actorUserId ?? null,
  });

  if (error) {
    console.error("ensure_author_sale_accrual_error", error.message);
    return rpcFailure(toValidationCode(error.message));
  }

  return mapRpcResult(data);
}

export async function ensureAuthorRefundReversal(input: {
  refundId: string;
  correlationId?: string | null;
  actorUserId?: string | null;
}): Promise<AuthorFinanceRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("ensure_author_refund_reversal", {
    p_refund_id: input.refundId,
    p_correlation_id: input.correlationId ?? null,
    p_actor_user_id: input.actorUserId ?? null,
  });

  if (error) {
    console.error("ensure_author_refund_reversal_error", error.message);
    return rpcFailure(toValidationCode(error.message));
  }

  return mapRpcResult(data);
}

/**
 * The only way to correct the ledger: it is append-only, so a mistake is fixed
 * by adding a compensating entry rather than by editing history.
 */
export async function createAuthorLedgerManualAdjustment(input: {
  authorId: string;
  amountMinor: number;
  reasonCode: string;
  idempotencyKey: string;
  notes?: string | null;
  currency?: string;
  effectiveAt?: string | null;
  actorUserId: string | null;
  correlationId?: string | null;
}): Promise<AuthorFinanceRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "create_author_ledger_manual_adjustment",
    {
      p_author_id: input.authorId,
      p_amount_minor: input.amountMinor,
      p_reason_code: input.reasonCode,
      p_idempotency_key: input.idempotencyKey,
      p_notes: input.notes ?? null,
      p_currency: input.currency ?? "RUB",
      p_effective_at: input.effectiveAt ?? null,
      p_actor_user_id: input.actorUserId,
      p_correlation_id: input.correlationId ?? null,
    },
  );

  if (error) {
    const code = toValidationCode(error.message);
    if (code === "author_finance_rpc_error") {
      console.error(
        "create_author_ledger_manual_adjustment_error",
        error.message,
      );
    }
    return rpcFailure(code);
  }

  return mapRpcResult(data);
}

export type FinanceObligationResult = {
  ok: boolean;
  outcome: string;
  status: FinanceObligationStatus | null;
  resultCode: string | null;
  obligationId: string | null;
  ledgerEntryId: string | null;
};

export async function processFinanceObligation(
  obligationId: string,
): Promise<FinanceObligationResult | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("process_finance_obligation", {
    p_obligation_id: obligationId,
  });

  if (error) {
    console.error("process_finance_obligation_error", error.message);
    return null;
  }

  const row = (data ?? {}) as Record<string, unknown>;

  return {
    ok: row.ok === true,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    status: isFinanceObligationStatus(row.status) ? row.status : null,
    resultCode: asText(row.result_code),
    obligationId: asText(row.obligation_id),
    ledgerEntryId: asText(row.ledger_entry_id),
  };
}

export type FinanceObligationBatchResult = {
  attempted: number;
  processed: number;
  skipped: number;
  requiresReview: number;
  failed: number;
};

export async function processDueFinanceObligations(
  limit = 50,
): Promise<FinanceObligationBatchResult | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("process_due_finance_obligations", {
    p_limit: limit,
  });

  if (error) {
    console.error("process_due_finance_obligations_error", error.message);
    return null;
  }

  const row = (data ?? {}) as Record<string, unknown>;

  return {
    attempted: asNumber(row.attempted),
    processed: asNumber(row.processed),
    skipped: asNumber(row.skipped),
    requiresReview: asNumber(row.requires_review),
    failed: asNumber(row.failed),
  };
}

async function findObligationId(
  obligationType: FinanceObligationType,
  subjectId: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("finance_obligations")
    .select("id, status")
    .eq("obligation_type", obligationType)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (error) {
    console.error("find_finance_obligation_error", error.message);
    return null;
  }

  const row = (data ?? null) as { id?: string } | null;
  return typeof row?.id === "string" ? row.id : null;
}

/**
 * Post-commit repair hook.
 *
 * The obligation itself is enqueued inside the commerce transaction, so this
 * only drains it. It is deliberately best-effort: an author's bookkeeping must
 * never decide whether a buyer keeps their payment or their access, so every
 * failure is logged and swallowed. Anything left behind is picked up by
 * process_due_finance_obligations.
 */
export async function ensureFinanceObligationProcessed(input: {
  obligationType: FinanceObligationType;
  subjectId: string;
  fallbackCorrelationId?: string | null;
}): Promise<FinanceObligationResult | null> {
  try {
    const obligationId = await findObligationId(
      input.obligationType,
      input.subjectId,
    );

    if (obligationId) {
      return await processFinanceObligation(obligationId);
    }

    // The outbox insert did not survive (it is allowed to fail silently), so
    // settle the ledger directly and let the next enqueue reconcile the queue.
    const direct =
      input.obligationType === "payment_succeeded_accrual"
        ? await ensureAuthorSaleAccrual({
            paymentId: input.subjectId,
            correlationId: input.fallbackCorrelationId ?? null,
          })
        : await ensureAuthorRefundReversal({
            refundId: input.subjectId,
            correlationId: input.fallbackCorrelationId ?? null,
          });

    return {
      ok: direct.ok,
      outcome: direct.outcome,
      status: null,
      resultCode: direct.resultCode,
      obligationId: null,
      ledgerEntryId: direct.entry?.id ?? null,
    };
  } catch (error) {
    console.error(
      "ensure_finance_obligation_processed_error",
      error instanceof Error ? error.message : "unknown",
    );
    return null;
  }
}
