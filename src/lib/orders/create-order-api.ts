export const PRACTICE_SLUG_MAX_LENGTH = 128;

export const PRACTICE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateOrderRpcRow = {
  order_id: string;
  practice_id: string;
  practice_slug: string;
  status: string;
  amount_minor: number;
  currency: string;
  created_at: string;
  attribution_confidence?: string | null;
  buy_click_linked?: boolean | null;
  buy_click_link_reason?: string | null;
};

export type OrderAnalyticsClaims = {
  analyticsSessionId: string | null;
  analyticsAnonymousId: string | null;
  checkoutOriginPath: string | null;
  buyClickClientEventId: string | null;
};

export type CreateOrderSuccessBody = {
  order: {
    id: string;
    practice_id: string;
    practice_slug: string;
    status: string;
    amount_minor: number;
    currency: string;
    created_at: string;
  };
};

export type PublicApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "already_owned"
  | "pending_order_exists"
  | "practice_not_found"
  | "practice_not_for_sale"
  | "quick_offer_invalid"
  | "internal_error";

export function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  return raw as Record<string, unknown>;
}

export function extractPracticeSlug(
  body: Record<string, unknown>,
): string | null {
  const value = body.practice_slug;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > PRACTICE_SLUG_MAX_LENGTH) {
    return null;
  }

  if (!PRACTICE_SLUG_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function extractQuickOfferId(
  body: Record<string, unknown>,
): string | null {
  const value = body.quick_offer_id;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!UUID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function extractOfferWindowExpiresAt(
  body: Record<string, unknown>,
): string | null {
  const value = body.offer_window_expires_at;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

/**
 * Client analytics claims for order attribution.
 * UTM/referrer/confidence from body are intentionally ignored.
 */
export function extractOrderAnalyticsClaims(
  body: Record<string, unknown>,
  sanitizeOrigin: (value: string | null | undefined) => string | null,
): OrderAnalyticsClaims {
  const sessionRaw = body.analytics_session_id;
  const anonymousRaw = body.analytics_anonymous_id;
  const originRaw = body.checkout_origin_path;
  const buyClickRaw = body.buy_click_client_event_id;

  const analyticsSessionId =
    typeof sessionRaw === "string" && UUID_PATTERN.test(sessionRaw.trim())
      ? sessionRaw.trim().toLowerCase()
      : null;

  const analyticsAnonymousId =
    typeof anonymousRaw === "string" && anonymousRaw.trim().length > 0
      ? anonymousRaw.trim().slice(0, 128)
      : null;

  const checkoutOriginPath =
    typeof originRaw === "string" ? sanitizeOrigin(originRaw) : null;

  const buyClickClientEventId =
    typeof buyClickRaw === "string" && UUID_PATTERN.test(buyClickRaw.trim())
      ? buyClickRaw.trim().toLowerCase()
      : null;

  return {
    analyticsSessionId,
    analyticsAnonymousId,
    checkoutOriginPath,
    buyClickClientEventId,
  };
}

export function resolveIdempotencyKey(
  headerValue: string | null,
): string | { error: "invalid_request" } {
  if (headerValue === null || headerValue.trim() === "") {
    return crypto.randomUUID();
  }

  const trimmed = headerValue.trim();

  if (!UUID_PATTERN.test(trimmed)) {
    return { error: "invalid_request" };
  }

  return trimmed.toLowerCase();
}

export function mapRpcErrorMessage(message: string): {
  status: number;
  error: PublicApiErrorCode;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (normalized.includes("already_owned")) {
    return { status: 409, error: "already_owned" };
  }

  if (normalized.includes("pending_order_exists")) {
    return { status: 409, error: "pending_order_exists" };
  }

  if (normalized.includes("practice_not_found")) {
    return { status: 404, error: "practice_not_found" };
  }

  if (normalized.includes("practice_not_published")) {
    return { status: 404, error: "practice_not_found" };
  }

  if (
    normalized.includes("practice_not_for_sale") ||
    normalized.includes("invalid_practice_price")
  ) {
    return { status: 409, error: "practice_not_for_sale" };
  }

  if (
    normalized.includes("quick_offer_invalid") ||
    normalized.includes("quick_offer_not_found")
  ) {
    return { status: 409, error: "quick_offer_invalid" };
  }

  return { status: 500, error: "internal_error" };
}

export function toCreateOrderSuccessBody(
  row: CreateOrderRpcRow,
): CreateOrderSuccessBody {
  return {
    order: {
      id: row.order_id,
      practice_id: row.practice_id,
      practice_slug: row.practice_slug,
      status: row.status,
      amount_minor: row.amount_minor,
      currency: row.currency,
      created_at: row.created_at,
    },
  };
}

export type PendingOrderRow = {
  id: string;
  practice_id: string;
  practice_slug_snapshot: string;
  status: string;
  amount_minor: number;
  currency: string;
  created_at: string;
};

export function pendingOrderToSuccessBody(
  row: PendingOrderRow,
): CreateOrderSuccessBody {
  return {
    order: {
      id: row.id,
      practice_id: row.practice_id,
      practice_slug: row.practice_slug_snapshot,
      status: row.status,
      amount_minor: row.amount_minor,
      currency: row.currency,
      created_at: row.created_at,
    },
  };
}
