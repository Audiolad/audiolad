const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrderRow = {
  id: string;
  user_id: string;
  practice_id: string;
  status: string;
  amount_minor: number;
  currency: string;
  practice_title_snapshot: string;
  practice_slug_snapshot: string;
  price_minor_snapshot: number;
  created_at: string;
  paid_at: string | null;
};

export type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  idempotency_key: string;
  status: string;
  amount_minor: number;
  currency: string;
  provider_metadata: Record<string, unknown>;
  created_at: string;
  confirmed_at: string | null;
};

export type PublicOrderStatusBody = {
  order: {
    id: string;
    practice_id: string;
    practice_slug: string;
    status: string;
    amount_minor: number;
    currency: string;
    created_at: string;
    paid_at: string | null;
  };
};

export type PublicPaymentCreateBody = {
  payment: {
    id: string;
    order_id: string;
    status: string;
    payment_url: string;
  };
};

export type PublicApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "order_not_found"
  | "order_already_paid"
  | "order_not_payable"
  | "payments_not_configured"
  | "internal_error";

export function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  return raw as Record<string, unknown>;
}

export function extractOrderId(
  body: Record<string, unknown>,
): string | null {
  const value = body.order_id;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function extractRouteOrderId(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function toOrderStatusBody(row: OrderRow): PublicOrderStatusBody {
  return {
    order: {
      id: row.id,
      practice_id: row.practice_id,
      practice_slug: row.practice_slug_snapshot,
      status: row.status,
      amount_minor: row.amount_minor,
      currency: row.currency,
      created_at: row.created_at,
      paid_at: row.paid_at,
    },
  };
}

export function toPaymentCreateBody(
  paymentId: string,
  orderId: string,
  paymentUrl: string,
): PublicPaymentCreateBody {
  return {
    payment: {
      id: paymentId,
      order_id: orderId,
      status: "pending",
      payment_url: paymentUrl,
    },
  };
}

export function mapOrderStatusToHttpError(status: string): {
  status: number;
  error: PublicApiErrorCode;
} | null {
  if (status === "paid") {
    return { status: 409, error: "order_already_paid" };
  }

  if (status === "cancelled" || status === "failed" || status === "refunded") {
    return { status: 409, error: "order_not_payable" };
  }

  return null;
}

export function getPaymentUrlFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const paymentUrl = metadata?.payment_url;

  if (typeof paymentUrl === "string" && paymentUrl.trim() !== "") {
    return paymentUrl;
  }

  return null;
}

export function parseTochkaAmountToMinor(amount: unknown): number | null {
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }

  if (typeof amount === "string" && amount.trim() !== "") {
    const parsed = Number(amount.replace(",", "."));

    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }

  return null;
}
