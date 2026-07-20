export type CheckoutOrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";

export type CheckoutStatusResponseBody = {
  status: CheckoutOrderStatus;
  practiceSlug: string | null;
  practiceTitle: string | null;
  authenticated: boolean;
};

export type CheckoutStatusErrorCode = "invalid_request" | "invalid_token";

const CHECKOUT_ORDER_STATUSES = new Set<CheckoutOrderStatus>([
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);

export function normalizeCheckoutOrderStatus(
  status: string | null | undefined,
): CheckoutOrderStatus | null {
  if (!status) {
    return null;
  }

  const normalized = status.trim().toLowerCase();

  if (!CHECKOUT_ORDER_STATUSES.has(normalized as CheckoutOrderStatus)) {
    return null;
  }

  return normalized as CheckoutOrderStatus;
}

export function toCheckoutStatusBody(input: {
  status: string;
  practiceSlug: string | null;
  practiceTitle: string | null;
  authenticated: boolean;
}): CheckoutStatusResponseBody {
  const normalizedStatus = normalizeCheckoutOrderStatus(input.status);

  if (!normalizedStatus) {
    throw new Error("invalid_order_status");
  }

  return {
    status: normalizedStatus,
    practiceSlug: input.practiceSlug,
    practiceTitle: input.practiceTitle,
    authenticated: input.authenticated,
  };
}

export function isTerminalCheckoutStatus(
  status: CheckoutOrderStatus,
): boolean {
  return status === "failed" || status === "cancelled" || status === "refunded";
}
