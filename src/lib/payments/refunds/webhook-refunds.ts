/**
 * Provider-driven refund updates (P3.3.1): webhook bridge + manual reconcile.
 * Both paths are replay-safe and never create refunds this system did not request.
 */

import { logCheckoutEvent } from "@/lib/payments/checkout-log";
import {
  applyPaymentRefundProviderStatus,
  findPaymentRefundById,
  type RefundRpcResult,
} from "@/lib/payments/refunds/refund-rpc";
import { mapProviderRefundStatus } from "@/lib/payments/refunds/types";
import { getTochkaPaymentOperationInfo } from "@/lib/payments/tochka-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const TOCHKA_REFUND_WEBHOOK_STATUSES = ["ON-REFUND", "REFUNDED"] as const;

export type TochkaRefundWebhookStatus =
  (typeof TOCHKA_REFUND_WEBHOOK_STATUSES)[number];

export function isTochkaRefundWebhookStatus(
  value: string | null | undefined,
): value is TochkaRefundWebhookStatus {
  return (
    value === "ON-REFUND" || value === "REFUNDED"
  );
}

export type RefundWebhookResult = {
  ok: boolean;
  outcome: string;
  updatedCount: number;
  paymentId: string | null;
};

export async function applyTochkaRefundWebhookStatus(input: {
  providerPaymentId: string;
  providerStatus: TochkaRefundWebhookStatus;
  amountMinor: number | null;
  safeSnapshot: Record<string, unknown>;
  correlationId: string | null;
}): Promise<RefundWebhookResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "apply_tochka_refund_webhook_status",
    {
      p_provider_payment_id: input.providerPaymentId,
      p_provider_status: input.providerStatus,
      p_amount_minor: input.amountMinor,
      p_safe_snapshot: input.safeSnapshot,
      p_correlation_id: input.correlationId,
    },
  );

  if (error) {
    console.error("apply_tochka_refund_webhook_error", error.message);
    return { ok: false, outcome: "rpc_error", updatedCount: 0, paymentId: null };
  }

  const row = (data ?? {}) as Record<string, unknown>;

  return {
    ok: row.ok === true,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    updatedCount:
      typeof row.updated_count === "number" ? row.updated_count : 0,
    paymentId: typeof row.payment_id === "string" ? row.payment_id : null,
  };
}

function readOperationStatus(
  data: Record<string, unknown> | null,
): string | null {
  if (!data) return null;

  if (typeof data.status === "string") {
    return data.status;
  }

  // Get Payment Operation nests the operation list under Data.Operation.
  const operations = data.Operation;
  if (Array.isArray(operations) && operations.length > 0) {
    const first = operations[0] as Record<string, unknown>;
    if (typeof first?.status === "string") {
      return first.status;
    }
  }

  return null;
}

export type ReconcileRefundResult = {
  ok: boolean;
  outcome: string;
  error: string | null;
  providerStatus: string | null;
  rpc: RefundRpcResult | null;
};

/**
 * Polls the payment operation and applies the resulting refund status.
 * Used to resolve refunds parked as requires_review after an unknown outcome.
 */
export async function reconcileRefundWithProvider(input: {
  refundId: string;
  correlationId: string;
  actorUserId: string | null;
}): Promise<ReconcileRefundResult> {
  const refund = await findPaymentRefundById(input.refundId);

  if (!refund) {
    return {
      ok: false,
      outcome: "not_found",
      error: "refund_not_found",
      providerStatus: null,
      rpc: null,
    };
  }

  if (!refund.providerPaymentId) {
    return {
      ok: false,
      outcome: "rejected",
      error: "missing_provider_payment_id",
      providerStatus: null,
      rpc: null,
    };
  }

  if (
    refund.status === "succeeded" ||
    refund.status === "failed" ||
    refund.status === "cancelled"
  ) {
    return {
      ok: true,
      outcome: "already_terminal",
      error: null,
      providerStatus: refund.providerStatus,
      rpc: null,
    };
  }

  const info = await getTochkaPaymentOperationInfo(refund.providerPaymentId);
  const providerStatus = readOperationStatus(info);

  if (!providerStatus) {
    logCheckoutEvent("refund_reconcile_no_status", {
      refundId: refund.id,
      correlationId: input.correlationId,
    });
    return {
      ok: false,
      outcome: "provider_unavailable",
      error: "provider_status_unavailable",
      providerStatus: null,
      rpc: null,
    };
  }

  const mapped = mapProviderRefundStatus(providerStatus);

  const rpc = await applyPaymentRefundProviderStatus({
    refundId: refund.id,
    newStatus: mapped,
    providerStatus,
    providerRefundId: null,
    failureCode:
      mapped === "requires_review" ? "unknown_provider_status" : null,
    failureMessageSafe:
      mapped === "requires_review"
        ? "Provider status could not be mapped to a refund outcome"
        : null,
    safeSnapshot: { reconciled: true },
    correlationId: input.correlationId,
    actorUserId: input.actorUserId,
  });

  logCheckoutEvent("refund_reconciled", {
    refundId: refund.id,
    providerStatus,
    outcome: rpc.outcome,
    correlationId: input.correlationId,
  });

  return {
    ok: rpc.ok,
    outcome: rpc.outcome,
    error: rpc.error,
    providerStatus,
    rpc,
  };
}
