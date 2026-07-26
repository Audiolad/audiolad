/**
 * Service-role wrappers around the P3.3.1 refund RPCs.
 * Every money decision lives in SQL; this file only marshals arguments.
 */

import {
  mapRefundSettlement,
  type RefundSettlement,
} from "@/lib/payments/refunds/settlement";
import {
  isRefundAccessEffect,
  isRefundStatus,
  type ProviderDrivenRefundStatus,
  type RefundAccessEffect,
  type RefundKind,
  type RefundStatus,
} from "@/lib/payments/refunds/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type PaymentRefund = {
  id: string;
  paymentId: string;
  orderId: string;
  provider: string;
  providerPaymentId: string | null;
  providerRefundId: string | null;
  amountMinor: number;
  currency: string;
  kind: RefundKind | null;
  status: RefundStatus;
  reasonCode: string;
  reasonText: string | null;
  accessEffect: RefundAccessEffect;
  requestedBy: string | null;
  requestedAt: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  requiresReviewAt: string | null;
  providerStatus: string | null;
  failureCode: string | null;
  failureMessageSafe: string | null;
  idempotencyKey: string;
  isTest: boolean;
};

export type RefundRpcResult = {
  ok: boolean;
  outcome: string;
  error: string | null;
  idempotentReplay: boolean;
  fromStatus: RefundStatus | null;
  refund: PaymentRefund | null;
  settlement: RefundSettlement | null;
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

export function mapPaymentRefund(raw: unknown): PaymentRefund | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  if (typeof row.id !== "string" || !isRefundStatus(row.status)) {
    return null;
  }

  const kind = row.kind === "partial" || row.kind === "full" ? row.kind : null;

  return {
    id: row.id,
    paymentId: String(row.payment_id ?? ""),
    orderId: String(row.order_id ?? ""),
    provider: String(row.provider ?? "tochka"),
    providerPaymentId: asText(row.provider_payment_id),
    providerRefundId: asText(row.provider_refund_id),
    amountMinor: asNumber(row.amount_minor),
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    kind,
    status: row.status,
    reasonCode: String(row.reason_code ?? ""),
    reasonText: asText(row.reason_text),
    accessEffect: isRefundAccessEffect(row.access_effect)
      ? row.access_effect
      : "keep",
    requestedBy: asText(row.requested_by),
    requestedAt: asText(row.requested_at),
    submittedAt: asText(row.submitted_at),
    confirmedAt: asText(row.confirmed_at),
    failedAt: asText(row.failed_at),
    cancelledAt: asText(row.cancelled_at),
    requiresReviewAt: asText(row.requires_review_at),
    providerStatus: asText(row.provider_status),
    failureCode: asText(row.failure_code),
    failureMessageSafe: asText(row.failure_message_safe),
    idempotencyKey: String(row.idempotency_key ?? ""),
    isTest: row.is_test === true,
  };
}

function mapRpcResult(raw: unknown, paymentId: string): RefundRpcResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  const refund = mapPaymentRefund(row.refund);

  return {
    ok: row.ok === true,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    error: asText(row.error),
    idempotentReplay: row.idempotent_replay === true,
    fromStatus: isRefundStatus(row.from_status) ? row.from_status : null,
    refund,
    settlement: row.settlement
      ? mapRefundSettlement(row.settlement, refund?.paymentId ?? paymentId)
      : null,
  };
}

function rpcFailure(outcome: string, error: string): RefundRpcResult {
  return {
    ok: false,
    outcome,
    error,
    idempotentReplay: false,
    fromStatus: null,
    refund: null,
    settlement: null,
  };
}

/**
 * Postgres RAISE EXCEPTION messages are our own snake_case validation codes,
 * so they are safe to return to admin callers.
 */
function toValidationCode(message: string | undefined): string {
  const known = [
    "payment_not_found",
    "payment_not_succeeded",
    "payment_not_confirmed",
    "test_payment_refund_not_allowed",
    "refund_amount_exceeds_refundable",
    "no_refundable_amount",
    "amount_must_be_positive",
    "reason_code_required",
    "idempotency_key_required",
    "idempotency_key_conflict",
    "invalid_access_effect",
    "refund_not_found",
    "unsupported_target_status",
  ];
  const match = known.find((code) => message?.includes(code));
  return match ?? "refund_rpc_error";
}

export async function getPaymentRefundSettlement(
  paymentId: string,
): Promise<RefundSettlement | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "payment_refund_settlement_snapshot",
    { p_payment_id: paymentId },
  );

  if (error) {
    console.error("payment_refund_settlement_error", error.message);
    return null;
  }

  return mapRefundSettlement(data, paymentId);
}

export async function createPaymentRefundRequest(input: {
  paymentId: string;
  amountMinor: number;
  reasonCode: string;
  reasonText: string | null;
  idempotencyKey: string;
  actorUserId: string | null;
  correlationId: string | null;
  allowTest?: boolean;
  accessEffect?: RefundAccessEffect | null;
}): Promise<RefundRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("create_payment_refund_request", {
    p_payment_id: input.paymentId,
    p_amount_minor: input.amountMinor,
    p_reason_code: input.reasonCode,
    p_reason_text: input.reasonText,
    p_idempotency_key: input.idempotencyKey,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId,
    p_allow_test: input.allowTest === true,
    p_access_effect: input.accessEffect ?? null,
  });

  if (error) {
    const code = toValidationCode(error.message);
    if (code === "refund_rpc_error") {
      console.error("create_payment_refund_request_error", error.message);
    }
    return rpcFailure("rejected", code);
  }

  return mapRpcResult(data, input.paymentId);
}

export async function markPaymentRefundSubmitted(input: {
  refundId: string;
  providerRefundId: string | null;
  providerStatus: string | null;
  providerRequestId: string | null;
  safeSnapshot: Record<string, unknown>;
  correlationId: string | null;
  actorUserId: string | null;
}): Promise<RefundRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("mark_payment_refund_submitted", {
    p_refund_id: input.refundId,
    p_provider_refund_id: input.providerRefundId,
    p_provider_status: input.providerStatus,
    p_provider_request_id: input.providerRequestId,
    p_safe_snapshot: input.safeSnapshot,
    p_correlation_id: input.correlationId,
    p_actor_user_id: input.actorUserId,
  });

  if (error) {
    console.error("mark_payment_refund_submitted_error", error.message);
    return rpcFailure("rejected", toValidationCode(error.message));
  }

  return mapRpcResult(data, "");
}

export async function applyPaymentRefundProviderStatus(input: {
  refundId: string;
  newStatus: ProviderDrivenRefundStatus;
  providerStatus: string | null;
  providerRefundId: string | null;
  failureCode: string | null;
  failureMessageSafe: string | null;
  safeSnapshot: Record<string, unknown>;
  correlationId: string | null;
  actorUserId: string | null;
}): Promise<RefundRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "apply_payment_refund_provider_status",
    {
      p_refund_id: input.refundId,
      p_new_status: input.newStatus,
      p_provider_status: input.providerStatus,
      p_provider_refund_id: input.providerRefundId,
      p_failure_code: input.failureCode,
      p_failure_message_safe: input.failureMessageSafe,
      p_safe_snapshot: input.safeSnapshot,
      p_correlation_id: input.correlationId,
      p_actor_user_id: input.actorUserId,
    },
  );

  if (error) {
    console.error("apply_payment_refund_provider_status_error", error.message);
    return rpcFailure("rejected", toValidationCode(error.message));
  }

  return mapRpcResult(data, "");
}

export async function cancelPaymentRefundRequest(input: {
  refundId: string;
  reasonText: string | null;
  actorUserId: string | null;
  correlationId: string | null;
}): Promise<RefundRpcResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("cancel_payment_refund_request", {
    p_refund_id: input.refundId,
    p_reason_text: input.reasonText,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId,
  });

  if (error) {
    console.error("cancel_payment_refund_request_error", error.message);
    return rpcFailure("rejected", toValidationCode(error.message));
  }

  return mapRpcResult(data, "");
}

export async function findPaymentRefundById(
  refundId: string,
): Promise<PaymentRefund | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("payment_refunds")
    .select(
      "id, payment_id, order_id, provider, provider_payment_id, provider_refund_id, amount_minor, currency, kind, status, reason_code, reason_text, access_effect, requested_by, requested_at, submitted_at, confirmed_at, failed_at, cancelled_at, requires_review_at, provider_status, failure_code, failure_message_safe, idempotency_key, is_test",
    )
    .eq("id", refundId)
    .maybeSingle();

  if (error) {
    console.error("find_payment_refund_error", error.message);
    return null;
  }

  return mapPaymentRefund(data);
}
