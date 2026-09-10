import { extractExpectedAmountMinor } from "@/lib/orders/create-order-api";

import { STUDIO_MUSIC_ORDER_KIND } from "./access";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const STUDIO_MUSIC_CHECKOUT_STAGES = {
  AUTH: "auth",
  PARSE: "parse",
  CREATE_ORDER: "create_studio_music_order",
  COERCE: "coerceStudioMusicOrderRow",
  RELOAD: "reload_orders_row",
  START_TOCHKA: "startTochkaCheckoutForPendingOrder",
  PAYMENT_URL: "payment_url_returned",
} as const;

export type StudioMusicCheckoutRequestBody = {
  practiceId: string;
  expectedAmountMinor?: number;
};

export type StudioMusicOrderRow = {
  order_id: string;
  practice_id: string;
  practice_slug: string;
  status: string;
  amount_minor: number;
  currency: string;
  order_kind: string;
  created_at: string;
};

export type StudioMusicCheckoutSuccessBody = {
  order: {
    id: string;
    practice_id: string;
    practice_slug: string;
    status: string;
    amount_minor: number;
    currency: string;
    order_kind: typeof STUDIO_MUSIC_ORDER_KIND;
    created_at: string;
  };
  payment: {
    id: string;
    order_id: string;
    status: string;
    payment_url: string;
  };
};

export type StudioMusicCheckoutErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "practice_not_found"
  | "practice_not_for_sale"
  | "already_studio_entitled"
  | "pending_order_exists"
  | "price_changed"
  | "author_finance_not_ready"
  | "payments_not_configured"
  | "order_already_paid"
  | "order_not_payable"
  | "provider_checkout_failed"
  | "internal_error";

export type StudioMusicPriceChangedBody = {
  error: "price_changed";
  current_amount_minor: number;
  listener_amount_minor: number | null;
  base_price_minor: number | null;
  promotion_price_minor: number | null;
  promotion_id: string | null;
  promotion_type: string | null;
  message: string;
};

export function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  return raw as Record<string, unknown>;
}

export function parseStudioMusicCheckoutRequest(
  body: Record<string, unknown>,
):
  | { ok: true; value: StudioMusicCheckoutRequestBody }
  | { ok: false; error: StudioMusicCheckoutErrorCode } {
  if (
    "userId" in body ||
    "user_id" in body ||
    "email" in body ||
    "amount" in body ||
    "source" in body ||
    "paymentLinkId" in body ||
    "payment_link_id" in body
  ) {
    return { ok: false, error: "invalid_request" };
  }

  const practiceIdRaw = body.practiceId ?? body.practice_id;

  if (typeof practiceIdRaw !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  const practiceId = practiceIdRaw.trim().toLowerCase();

  if (!UUID_PATTERN.test(practiceId)) {
    return { ok: false, error: "invalid_request" };
  }

  if (!("expectedAmountMinor" in body) && !("expected_amount_minor" in body)) {
    return { ok: true, value: { practiceId } };
  }

  const expectedAmountMinor = extractExpectedAmountMinor({
    expected_amount_minor:
      body.expectedAmountMinor ?? body.expected_amount_minor,
  });

  if (expectedAmountMinor == null) {
    return { ok: false, error: "invalid_request" };
  }

  return {
    ok: true,
    value: { practiceId, expectedAmountMinor },
  };
}

export function mapStudioMusicCheckoutRpcError(message: string): {
  status: number;
  error: StudioMusicCheckoutErrorCode;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (normalized.includes("already_studio_entitled")) {
    return { status: 409, error: "already_studio_entitled" };
  }

  if (normalized.includes("already_owned")) {
    return { status: 500, error: "internal_error" };
  }

  if (normalized.includes("pending_order_exists")) {
    return { status: 409, error: "pending_order_exists" };
  }

  if (normalized.includes("idempotency_key_conflict")) {
    return { status: 409, error: "invalid_request" };
  }

  if (normalized.includes("price_changed")) {
    return { status: 409, error: "price_changed" };
  }

  if (
    normalized.includes("practice_not_for_sale") ||
    normalized.includes("invalid_practice_price")
  ) {
    return { status: 409, error: "practice_not_for_sale" };
  }

  if (
    normalized.includes("practice_not_found") ||
    normalized.includes("practice_not_published") ||
    normalized.includes("not_studio_music") ||
    normalized.includes("studio_reuse_not_allowed")
  ) {
    return { status: 404, error: "practice_not_found" };
  }

  if (
    normalized.includes("practice_id_required") ||
    normalized.includes("idempotency_key_required")
  ) {
    return { status: 400, error: "invalid_request" };
  }

  return { status: 500, error: "internal_error" };
}

const PRICE_CHANGED_DETAIL_PATTERN =
  /current_amount_minor=(\d+);listener_amount_minor=(\d+);base_price_minor=(\d+);promotion_price_minor=([^;]*);promotion_id=([^;]*);promotion_type=([^;\s]*)/;

export function parseStudioMusicPriceChangedDetail(
  detail: string | null | undefined,
): {
  current_amount_minor: number;
  listener_amount_minor: number | null;
  base_price_minor: number | null;
  promotion_price_minor: number | null;
  promotion_id: string | null;
  promotion_type: string | null;
} | null {
  if (!detail) {
    return null;
  }

  const match = PRICE_CHANGED_DETAIL_PATTERN.exec(detail);

  if (!match) {
    return null;
  }

  const current = Number(match[1]);
  const listener = Number(match[2]);
  const base = Number(match[3]);
  const promoMinor = match[4] ? Number(match[4]) : NaN;

  if (!Number.isInteger(current) || current <= 0) {
    return null;
  }

  return {
    current_amount_minor: current,
    listener_amount_minor: Number.isInteger(listener) ? listener : null,
    base_price_minor: Number.isInteger(base) ? base : null,
    promotion_price_minor: Number.isInteger(promoMinor) ? promoMinor : null,
    promotion_id: match[5] && match[5].length > 0 ? match[5] : null,
    promotion_type: match[6] && match[6].length > 0 ? match[6] : null,
  };
}

export function toStudioMusicCheckoutSuccessBody(input: {
  order: StudioMusicOrderRow;
  paymentId: string;
  paymentUrl: string;
}): StudioMusicCheckoutSuccessBody {
  return {
    order: {
      id: input.order.order_id,
      practice_id: input.order.practice_id,
      practice_slug: input.order.practice_slug,
      status: input.order.status,
      amount_minor: input.order.amount_minor,
      currency: input.order.currency,
      order_kind: STUDIO_MUSIC_ORDER_KIND,
      created_at: input.order.created_at,
    },
    payment: {
      id: input.paymentId,
      order_id: input.order.order_id,
      status: "pending",
      payment_url: input.paymentUrl,
    },
  };
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

export function coerceStudioMusicOrderRow(
  value: unknown,
): StudioMusicOrderRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const amountMinor = asInteger(row.amount_minor);
  const createdAt =
    typeof row.created_at === "string"
      ? row.created_at
      : row.created_at instanceof Date
        ? row.created_at.toISOString()
        : null;

  if (
    typeof row.order_id !== "string" ||
    typeof row.practice_id !== "string" ||
    typeof row.practice_slug !== "string" ||
    typeof row.status !== "string" ||
    amountMinor == null ||
    typeof row.currency !== "string" ||
    row.order_kind !== STUDIO_MUSIC_ORDER_KIND ||
    createdAt == null
  ) {
    return null;
  }

  return {
    order_id: row.order_id,
    practice_id: row.practice_id,
    practice_slug: row.practice_slug,
    status: row.status,
    amount_minor: amountMinor,
    currency: row.currency,
    order_kind: STUDIO_MUSIC_ORDER_KIND,
    created_at: createdAt,
  };
}

export function logStudioMusicCheckoutFailure(input: {
  stage: string;
  error: string;
  status: number;
  orderId?: string | null;
  practiceId?: string | null;
}): void {
  console.error("studio_music_checkout_failed", {
    FAILED_STAGE: input.stage,
    ACTUAL_API_ERROR: input.error,
    ACTUAL_HTTP_STATUS: input.status,
    order_id: input.orderId ?? null,
    practice_id: input.practiceId ?? null,
  });
}
