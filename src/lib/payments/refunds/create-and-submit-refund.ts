/**
 * Two-phase refund submission (P3.3.1).
 *
 * Phase A reserves the money in our own DB, Phase B talks to the provider.
 * If Phase B leaves the provider state unknown (timeout / 5xx / network), the
 * refund is parked as requires_review and keeps its reserve, so a retry can
 * never refund the same money twice.
 */

import { logCheckoutEvent } from "@/lib/payments/checkout-log";
import {
  applyPaymentRefundProviderStatus,
  createPaymentRefundRequest,
  markPaymentRefundSubmitted,
  type PaymentRefund,
  type RefundRpcResult,
} from "@/lib/payments/refunds/refund-rpc";
import {
  classifyRefundTransportFailure,
  mapProviderRefundStatus,
  type RefundAccessEffect,
} from "@/lib/payments/refunds/types";
import type { RefundSettlement } from "@/lib/payments/refunds/settlement";
import { refundTochkaPaymentOperation } from "@/lib/payments/tochka-client";

export type CreateAndSubmitRefundInput = {
  paymentId: string;
  amountMinor: number;
  reasonCode: string;
  reasonText: string | null;
  idempotencyKey: string;
  actorUserId: string | null;
  correlationId: string;
  allowTest?: boolean;
  accessEffect?: RefundAccessEffect | null;
};

export type CreateAndSubmitRefundResult = {
  ok: boolean;
  outcome:
    | "submitted"
    | "pending"
    | "succeeded"
    | "failed"
    | "requires_review"
    | "already_processed"
    | "rejected";
  error: string | null;
  refund: PaymentRefund | null;
  settlement: RefundSettlement | null;
};

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "tochka_refund_transport_error";
}

function resultFrom(
  outcome: CreateAndSubmitRefundResult["outcome"],
  rpc: RefundRpcResult,
): CreateAndSubmitRefundResult {
  return {
    ok: rpc.ok,
    outcome,
    error: rpc.error,
    refund: rpc.refund,
    settlement: rpc.settlement,
  };
}

export async function createAndSubmitRefund(
  input: CreateAndSubmitRefundInput,
): Promise<CreateAndSubmitRefundResult> {
  // Phase A — reserve the money before anything leaves the building.
  const created = await createPaymentRefundRequest({
    paymentId: input.paymentId,
    amountMinor: input.amountMinor,
    reasonCode: input.reasonCode,
    reasonText: input.reasonText,
    idempotencyKey: input.idempotencyKey,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    allowTest: input.allowTest,
    accessEffect: input.accessEffect ?? null,
  });

  if (!created.ok || !created.refund) {
    return resultFrom("rejected", created);
  }

  const refund = created.refund;

  // Replaying a key for a refund that already left `requested` must not resend.
  if (refund.status !== "requested") {
    logCheckoutEvent("refund_submit_skipped", {
      refundId: refund.id,
      status: refund.status,
      correlationId: input.correlationId,
    });
    return {
      ok: true,
      outcome: "already_processed",
      error: null,
      refund,
      settlement: created.settlement,
    };
  }

  if (!refund.providerPaymentId) {
    const parked = await applyPaymentRefundProviderStatus({
      refundId: refund.id,
      newStatus: "requires_review",
      providerStatus: null,
      providerRefundId: null,
      failureCode: "missing_provider_payment_id",
      failureMessageSafe: "Payment has no provider operation id to refund",
      safeSnapshot: {},
      correlationId: input.correlationId,
      actorUserId: input.actorUserId,
    });
    return resultFrom("requires_review", parked);
  }

  // Phase B — provider call.
  let providerRefundId: string | null = null;
  let providerStatus: string | null = null;

  try {
    const response = await refundTochkaPaymentOperation({
      operationId: refund.providerPaymentId,
      amountMinor: refund.amountMinor,
      idempotencyKey: refund.idempotencyKey,
    });
    providerRefundId = response.providerRefundId;
    providerStatus = response.providerStatus;
  } catch (error) {
    const code = errorCode(error);
    const outcome = classifyRefundTransportFailure(code);

    logCheckoutEvent("refund_provider_call_failed", {
      refundId: refund.id,
      failureCode: code,
      outcome,
      correlationId: input.correlationId,
    });

    const applied = await applyPaymentRefundProviderStatus({
      refundId: refund.id,
      newStatus: outcome,
      providerStatus: null,
      providerRefundId: null,
      failureCode: code,
      failureMessageSafe:
        outcome === "failed"
          ? "Provider rejected the refund request"
          : "Provider outcome unknown — verify in Tochka before retrying",
      safeSnapshot: { provider_call: "failed" },
      correlationId: input.correlationId,
      actorUserId: input.actorUserId,
    });

    return resultFrom(outcome, applied);
  }

  const submitted = await markPaymentRefundSubmitted({
    refundId: refund.id,
    providerRefundId,
    providerStatus,
    providerRequestId: refund.idempotencyKey,
    safeSnapshot: { provider_call: "accepted" },
    correlationId: input.correlationId,
    actorUserId: input.actorUserId,
  });

  if (!submitted.ok) {
    return resultFrom("rejected", submitted);
  }

  const mapped = mapProviderRefundStatus(providerStatus);

  // `submitted` is already recorded; only move further when the provider said so.
  if (mapped === "pending" && providerStatus === null) {
    return resultFrom("submitted", submitted);
  }

  const applied = await applyPaymentRefundProviderStatus({
    refundId: refund.id,
    newStatus: mapped,
    providerStatus,
    providerRefundId,
    failureCode: mapped === "requires_review" ? "unknown_provider_status" : null,
    failureMessageSafe:
      mapped === "requires_review"
        ? "Provider returned an unrecognised refund status"
        : null,
    safeSnapshot: {},
    correlationId: input.correlationId,
    actorUserId: input.actorUserId,
  });

  logCheckoutEvent("refund_submitted", {
    refundId: refund.id,
    status: applied.refund?.status ?? mapped,
    correlationId: input.correlationId,
  });

  return resultFrom(mapped, applied);
}
