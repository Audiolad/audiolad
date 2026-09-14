import {
  AUTHOR_PROJECT_CAPACITY_ORDER_KIND,
  isAuthorProjectCapacitySku,
  resolveAuthorProjectCapacityPackage,
  type AuthorProjectCapacityOrderKind,
  type AuthorProjectCapacitySku,
} from "@/lib/author-projects/capacity-catalog";
import type { OrderRow } from "@/lib/payments/payment-api";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES = {
  AUTH: "auth",
  PARSE: "parse",
  PAYMENTS: "payments_config",
  CREATE_ORDER: "create_order",
  START_TOCHKA: "start_tochka",
} as const;

export type AuthorProjectCapacityCheckoutRequest = {
  sku: AuthorProjectCapacitySku;
};

export type AuthorProjectCapacityOrderRow = {
  order_id: string;
  status: string;
  amount_minor: number;
  currency: string;
  order_kind: string;
  sku: string;
  slots: number;
  created_at: string;
};

export type AuthorProjectCapacitySuccessBody = {
  order: {
    id: string;
    status: string;
    amount_minor: number;
    currency: string;
    order_kind: AuthorProjectCapacityOrderKind;
    sku: AuthorProjectCapacitySku;
    slots: number;
    created_at: string;
  };
  payment: {
    id: string;
    order_id: string;
    status: string;
    payment_url: string;
  };
};

export type AuthorProjectCapacityErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "invalid_sku"
  | "unlimited_account"
  | "payments_not_configured"
  | "pending_order_exists"
  | "order_already_paid"
  | "order_not_payable"
  | "provider_checkout_failed"
  | "internal_error";

export function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

export function parseAuthorProjectCapacityCheckoutRequest(
  body: Record<string, unknown>,
):
  | { ok: true; value: AuthorProjectCapacityCheckoutRequest }
  | { ok: false; error: AuthorProjectCapacityErrorCode } {
  // Reject client-controlled money / identity fields.
  if (
    "userId" in body ||
    "user_id" in body ||
    "author_id" in body ||
    "authorId" in body ||
    "amount" in body ||
    "amount_minor" in body ||
    "slots" in body ||
    "price" in body ||
    "email" in body
  ) {
    return { ok: false, error: "invalid_request" };
  }

  const skuRaw = body.sku ?? body.package ?? body.package_sku;
  if (typeof skuRaw !== "string") {
    return { ok: false, error: "invalid_request" };
  }
  const sku = skuRaw.trim();
  if (!isAuthorProjectCapacitySku(sku)) {
    return { ok: false, error: "invalid_sku" };
  }

  return { ok: true, value: { sku } };
}

export function coerceAuthorProjectCapacityOrderRow(
  raw: unknown,
): AuthorProjectCapacityOrderRow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const orderId = typeof row.order_id === "string" ? row.order_id : null;
  const status = typeof row.status === "string" ? row.status : null;
  const amountMinor =
    typeof row.amount_minor === "number"
      ? row.amount_minor
      : typeof row.amount_minor === "string" && /^-?\d+$/.test(row.amount_minor)
        ? Number(row.amount_minor)
        : null;
  const currency = typeof row.currency === "string" ? row.currency : null;
  const orderKind = typeof row.order_kind === "string" ? row.order_kind : null;
  const sku = typeof row.sku === "string" ? row.sku : null;
  const slots =
    typeof row.slots === "number"
      ? row.slots
      : typeof row.slots === "string" && /^-?\d+$/.test(row.slots)
        ? Number(row.slots)
        : null;
  const createdAt = typeof row.created_at === "string" ? row.created_at : null;

  if (
    !orderId ||
    !UUID_PATTERN.test(orderId) ||
    !status ||
    amountMinor == null ||
    !Number.isInteger(amountMinor) ||
    amountMinor <= 0 ||
    currency !== "RUB" ||
    orderKind !== AUTHOR_PROJECT_CAPACITY_ORDER_KIND ||
    !sku ||
    !isAuthorProjectCapacitySku(sku) ||
    slots == null ||
    !Number.isInteger(slots) ||
    slots < 1 ||
    !createdAt
  ) {
    return null;
  }

  const catalog = resolveAuthorProjectCapacityPackage(sku);
  if (!catalog || catalog.slots !== slots || catalog.amountMinor !== amountMinor) {
    return null;
  }

  return {
    order_id: orderId,
    status,
    amount_minor: amountMinor,
    currency,
    order_kind: orderKind,
    sku,
    slots,
    created_at: createdAt,
  };
}

export function toCapacityOrderRowForCheckout(
  row: AuthorProjectCapacityOrderRow,
): OrderRow {
  const catalog = resolveAuthorProjectCapacityPackage(row.sku);
  return {
    id: row.order_id,
    user_id: "", // filled by caller if needed; start-tochka uses order id + amount
    practice_id: "",
    status: row.status,
    amount_minor: row.amount_minor,
    currency: row.currency,
    practice_title_snapshot: catalog?.title ?? "Дополнительные проекты",
    practice_slug_snapshot: row.sku,
    price_minor_snapshot: row.amount_minor,
    created_at: row.created_at,
    paid_at: null,
    order_kind: AUTHOR_PROJECT_CAPACITY_ORDER_KIND,
  };
}

export function mapAuthorProjectCapacityRpcError(
  message: string,
): { error: AuthorProjectCapacityErrorCode; status: number } {
  const normalized = message.toLowerCase();
  if (normalized.includes("not_authenticated") || normalized.includes("unauthorized")) {
    return { error: "unauthorized", status: 401 };
  }
  if (normalized.includes("invalid_sku")) {
    return { error: "invalid_sku", status: 400 };
  }
  if (normalized.includes("unlimited_account")) {
    return { error: "unlimited_account", status: 409 };
  }
  if (normalized.includes("pending_order_exists")) {
    return { error: "pending_order_exists", status: 409 };
  }
  if (normalized.includes("idempotency_key")) {
    return { error: "invalid_request", status: 409 };
  }
  return { error: "internal_error", status: 500 };
}

export function toAuthorProjectCapacitySuccessBody(input: {
  order: AuthorProjectCapacityOrderRow;
  paymentId: string;
  paymentStatus: string;
  paymentUrl: string;
}): AuthorProjectCapacitySuccessBody {
  return {
    order: {
      id: input.order.order_id,
      status: input.order.status,
      amount_minor: input.order.amount_minor,
      currency: input.order.currency,
      order_kind: AUTHOR_PROJECT_CAPACITY_ORDER_KIND,
      sku: input.order.sku as AuthorProjectCapacitySku,
      slots: input.order.slots,
      created_at: input.order.created_at,
    },
    payment: {
      id: input.paymentId,
      order_id: input.order.order_id,
      status: input.paymentStatus,
      payment_url: input.paymentUrl,
    },
  };
}

export function logAuthorProjectCapacityCheckoutFailure(input: {
  stage: string;
  error: string;
  status: number;
  orderId?: string | null;
  sku?: string | null;
}): void {
  console.error("author_project_capacity_checkout_failure", {
    stage: input.stage,
    error: input.error,
    status: input.status,
    orderId: input.orderId ?? null,
    sku: input.sku ?? null,
  });
}
