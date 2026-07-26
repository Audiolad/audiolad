/**
 * Refund status machine and provider mapping (P3.3.1).
 * Pure module: no DB, no fetch, no env — mirrored by the SQL layer and unit tested.
 */

export const REFUND_STATUSES = [
  "requested",
  "submitted",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "requires_review",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Provider work is still open; money is reserved. */
export const REFUND_IN_FLIGHT_STATUSES: readonly RefundStatus[] = [
  "requested",
  "submitted",
  "pending",
];

/**
 * Statuses that still hold refundable money. requires_review means the provider
 * outcome is unknown, so releasing its reserve would allow a double refund.
 */
export const REFUND_RESERVED_STATUSES: readonly RefundStatus[] = [
  ...REFUND_IN_FLIGHT_STATUSES,
  "requires_review",
];

export const REFUND_TERMINAL_STATUSES: readonly RefundStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
];

const ALLOWED_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  requested: ["submitted", "failed", "cancelled", "requires_review"],
  submitted: ["pending", "succeeded", "failed", "requires_review"],
  pending: ["succeeded", "failed", "cancelled", "requires_review"],
  requires_review: ["pending", "succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function isRefundStatus(value: unknown): value is RefundStatus {
  return (
    typeof value === "string" &&
    (REFUND_STATUSES as readonly string[]).includes(value)
  );
}

export function isRefundInFlight(status: RefundStatus): boolean {
  return REFUND_IN_FLIGHT_STATUSES.includes(status);
}

export function isRefundReserved(status: RefundStatus): boolean {
  return REFUND_RESERVED_STATUSES.includes(status);
}

export function isRefundTerminal(status: RefundStatus): boolean {
  return REFUND_TERMINAL_STATUSES.includes(status);
}

/** Same status is idempotent; terminal statuses never move again. */
export function canTransitionRefund(
  from: RefundStatus,
  to: RefundStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type RefundAccessEffect = "keep" | "revoke" | "manual_review";

export function isRefundAccessEffect(
  value: unknown,
): value is RefundAccessEffect {
  return (
    value === "keep" || value === "revoke" || value === "manual_review"
  );
}

export type RefundKind = "partial" | "full";

export const REFUND_REASON_CODES = [
  "customer_request",
  "duplicate_payment",
  "content_unavailable",
  "quality_complaint",
  "payment_error",
  "chargeback_prevention",
  "other",
] as const;

export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];

export function isRefundReasonCode(value: unknown): value is RefundReasonCode {
  return (
    typeof value === "string" &&
    (REFUND_REASON_CODES as readonly string[]).includes(value)
  );
}

/** Statuses a provider update can drive a refund into. */
export type ProviderDrivenRefundStatus = Extract<
  RefundStatus,
  "pending" | "succeeded" | "failed" | "requires_review"
>;

/**
 * Tochka payment operation status → local refund status.
 * Anything we do not recognise is parked for a human instead of guessed.
 */
export function mapProviderRefundStatus(
  providerStatus: string | null | undefined,
): Extract<ProviderDrivenRefundStatus, "pending" | "succeeded" | "requires_review"> {
  switch ((providerStatus ?? "").toUpperCase()) {
    case "REFUNDED":
      return "succeeded";
    case "ON-REFUND":
    case "CREATED":
    case "APPROVED":
      return "pending";
    default:
      return "requires_review";
  }
}

/**
 * Provider call failure → local outcome.
 * A definitive rejection is `failed` (reserve released); anything that leaves the
 * provider state unknown is `requires_review` (reserve kept).
 */
export function classifyRefundTransportFailure(
  code: string | null | undefined,
): Extract<ProviderDrivenRefundStatus, "failed" | "requires_review"> {
  switch (code) {
    case "tochka_refund_rejected":
    case "tochka_refund_invalid_amount":
    case "tochka_refund_invalid_response":
      return "failed";
    default:
      return "requires_review";
  }
}
