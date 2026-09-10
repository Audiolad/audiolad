import {
  getPaymentUrlFromMetadata,
  type PaymentRow,
} from "@/lib/payments/payment-api";
import { isStoredCheckoutTokenValidForOrder } from "@/lib/payments/checkout-token";

export type PendingTochkaPaymentDecision =
  | { kind: "reuse_url"; paymentUrl: string }
  | { kind: "recreate" }
  | { kind: "mark_failed_amount_changed" };

/**
 * Same pending-payment decision as production main:
 * reuse a valid URL+token, or allow one recreate with orderId.
 * Recreate failure must not invent a new payment lifecycle.
 */
export function decidePendingTochkaPayment(input: {
  pendingPayment: PaymentRow;
  orderId: string;
  orderAmountMinor: number;
}): PendingTochkaPaymentDecision {
  if (input.pendingPayment.amount_minor !== input.orderAmountMinor) {
    return { kind: "mark_failed_amount_changed" };
  }

  const paymentUrl = getPaymentUrlFromMetadata(
    input.pendingPayment.provider_metadata,
  );
  const hasValidCheckoutToken = isStoredCheckoutTokenValidForOrder(
    input.pendingPayment.provider_metadata,
    input.orderId,
  );

  if (paymentUrl && hasValidCheckoutToken) {
    return { kind: "reuse_url", paymentUrl };
  }

  return { kind: "recreate" };
}
