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
  authorSlug: string | null;
  authenticated: boolean;
  orderKind?: string | null;
  targetAccessLevel?: number | null;
  /** Order snapshot amount in minor units when present. */
  amountMinor?: number | null;
  currency?: string | null;
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
  authorSlug?: string | null;
  authenticated: boolean;
  orderKind?: string | null;
  targetAccessLevel?: number | null;
  amountMinor?: number | null;
  currency?: string | null;
}): CheckoutStatusResponseBody {
  const normalizedStatus = normalizeCheckoutOrderStatus(input.status);

  if (!normalizedStatus) {
    throw new Error("invalid_order_status");
  }

  return {
    status: normalizedStatus,
    practiceSlug: input.practiceSlug,
    practiceTitle: input.practiceTitle,
    authorSlug: input.authorSlug?.trim() || null,
    authenticated: input.authenticated,
    orderKind: input.orderKind?.trim() || null,
    targetAccessLevel:
      typeof input.targetAccessLevel === "number" &&
      Number.isInteger(input.targetAccessLevel)
        ? input.targetAccessLevel
        : null,
    amountMinor:
      typeof input.amountMinor === "number" &&
      Number.isFinite(input.amountMinor)
        ? Math.trunc(input.amountMinor)
        : null,
    currency:
      typeof input.currency === "string" && input.currency.trim()
        ? input.currency.trim().toUpperCase()
        : null,
  };
}

export function readNestedAuthorSlug(authors: unknown): string | null {
  const row = Array.isArray(authors) ? authors[0] : authors;

  if (!row || typeof row !== "object") {
    return null;
  }

  const slug = (row as { slug?: unknown }).slug;

  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

export function isTerminalCheckoutStatus(
  status: CheckoutOrderStatus,
): boolean {
  return status === "failed" || status === "cancelled" || status === "refunded";
}
