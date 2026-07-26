/**
 * Refund settlement math (P3.3.1).
 * Pure module in integer minor units — mirrors payment_refund_settlement_snapshot.
 */

import type { RefundAccessEffect, RefundKind } from "@/lib/payments/refunds/types";

export type RefundSettlementStatus =
  | "collected"
  | "partially_refunded"
  | "fully_refunded"
  | "requires_review";

export type RefundSettlement = {
  found: boolean;
  paymentId: string;
  orderId: string | null;
  providerPaymentId: string | null;
  paymentStatus: string | null;
  currency: string;
  isTest: boolean;
  grossMinor: number;
  confirmedRefundedMinor: number;
  inFlightMinor: number;
  requiresReviewMinor: number;
  reservedMinor: number;
  refundableMinor: number;
  netCollectedMinor: number;
  refundCount: number;
  confirmedCount: number;
  inFlightCount: number;
  requiresReviewCount: number;
  settlementStatus: RefundSettlementStatus;
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asSettlementStatus(value: unknown): RefundSettlementStatus {
  switch (value) {
    case "collected":
    case "partially_refunded":
    case "fully_refunded":
    case "requires_review":
      return value;
    // Legacy aliases from early drafts — map to approved vocabulary.
    case "not_refunded":
      return "collected";
    case "over_refunded":
    case "unknown":
      return "requires_review";
    default:
      return "requires_review";
  }
}

export function mapRefundSettlement(
  raw: unknown,
  paymentId: string,
): RefundSettlement {
  const row = (raw ?? {}) as Record<string, unknown>;

  return {
    found: row.found === true,
    paymentId:
      typeof row.payment_id === "string" ? row.payment_id : paymentId,
    orderId: typeof row.order_id === "string" ? row.order_id : null,
    providerPaymentId:
      typeof row.provider_payment_id === "string"
        ? row.provider_payment_id
        : null,
    paymentStatus:
      typeof row.payment_status === "string" ? row.payment_status : null,
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    isTest: row.is_test === true,
    grossMinor: asNumber(row.gross_minor),
    confirmedRefundedMinor: asNumber(row.confirmed_refunded_minor),
    inFlightMinor: asNumber(row.in_flight_minor),
    requiresReviewMinor: asNumber(row.requires_review_minor),
    reservedMinor: asNumber(row.reserved_minor),
    refundableMinor: asNumber(row.refundable_minor),
    netCollectedMinor: asNumber(row.net_collected_minor),
    refundCount: asNumber(row.refund_count),
    confirmedCount: asNumber(row.confirmed_count),
    inFlightCount: asNumber(row.in_flight_count),
    requiresReviewCount: asNumber(row.requires_review_count),
    settlementStatus: asSettlementStatus(row.settlement_status),
  };
}

export function computeRefundableMinor(input: {
  grossMinor: number;
  confirmedRefundedMinor: number;
  inFlightMinor: number;
  requiresReviewMinor: number;
}): number {
  return Math.max(
    0,
    input.grossMinor -
      input.confirmedRefundedMinor -
      input.inFlightMinor -
      input.requiresReviewMinor,
  );
}

/** A refund is `full` when it closes the whole remaining refundable balance. */
export function classifyRefundKind(
  amountMinor: number,
  refundableBeforeMinor: number,
): RefundKind {
  return amountMinor >= refundableBeforeMinor ? "full" : "partial";
}

/**
 * Access is never revoked automatically. `manual_review` only marks that
 * the payment would be settled in full and a human should decide about access.
 */
export function predictRefundAccessEffect(input: {
  amountMinor: number;
  grossMinor: number;
  confirmedRefundedMinor: number;
}): RefundAccessEffect {
  return input.confirmedRefundedMinor + input.amountMinor >= input.grossMinor
    ? "manual_review"
    : "keep";
}

export type RefundAmountValidation =
  | { ok: true }
  | {
      ok: false;
      error:
        | "amount_must_be_positive"
        | "amount_must_be_integer"
        | "no_refundable_amount"
        | "refund_amount_exceeds_refundable";
    };

export function validateRefundAmount(
  amountMinor: number,
  refundableMinor: number,
): RefundAmountValidation {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { ok: false, error: "amount_must_be_positive" };
  }
  if (!Number.isInteger(amountMinor)) {
    return { ok: false, error: "amount_must_be_integer" };
  }
  if (refundableMinor <= 0) {
    return { ok: false, error: "no_refundable_amount" };
  }
  if (amountMinor > refundableMinor) {
    return { ok: false, error: "refund_amount_exceeds_refundable" };
  }
  return { ok: true };
}
