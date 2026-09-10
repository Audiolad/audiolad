const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const COURSE_UPGRADE_ORDER_KIND = "course_upgrade" as const;

export type CourseUpgradeOrderKind = typeof COURSE_UPGRADE_ORDER_KIND;

export type CourseUpgradeRequestBody = {
  practiceId: string;
  targetAccessLevel?: number;
};

export type CourseUpgradeOrderRow = {
  order_id: string;
  practice_id: string;
  practice_slug: string;
  status: string;
  amount_minor: number;
  currency: string;
  order_kind: string;
  target_access_level: number;
  created_at: string;
};

export type CourseUpgradeSuccessBody = {
  order: {
    id: string;
    practice_id: string;
    practice_slug: string;
    status: string;
    amount_minor: number;
    currency: string;
    order_kind: CourseUpgradeOrderKind;
    target_access_level: number;
    created_at: string;
  };
  payment: {
    id: string;
    order_id: string;
    status: string;
    payment_url: string;
  };
};

export type CourseUpgradeErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "invalid_target_access_level"
  | "practice_not_found"
  | "not_course"
  | "practice_not_for_sale"
  | "not_entitled"
  | "upgrade_not_configured"
  | "already_at_target"
  | "pending_order_exists"
  | "author_finance_not_ready"
  | "payments_not_configured"
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

export function parseCourseUpgradeRequest(
  body: Record<string, unknown>,
):
  | { ok: true; value: CourseUpgradeRequestBody }
  | { ok: false; error: CourseUpgradeErrorCode } {
  if ("userId" in body || "user_id" in body || "email" in body || "amount" in body) {
    return { ok: false, error: "invalid_request" };
  }

  if ("amount_minor" in body || "source" in body) {
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

  if (
    !("targetAccessLevel" in body) &&
    !("target_access_level" in body)
  ) {
    return { ok: true, value: { practiceId } };
  }

  const targetRaw = body.targetAccessLevel ?? body.target_access_level;

  if (typeof targetRaw !== "number" || !Number.isInteger(targetRaw) || targetRaw < 2) {
    return { ok: false, error: "invalid_target_access_level" };
  }

  return {
    ok: true,
    value: { practiceId, targetAccessLevel: targetRaw },
  };
}

export function mapCourseUpgradeRpcError(message: string): {
  status: number;
  error: CourseUpgradeErrorCode;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (normalized.includes("invalid_target_access_level")) {
    return { status: 400, error: "invalid_target_access_level" };
  }

  if (normalized.includes("not_course")) {
    return { status: 409, error: "not_course" };
  }

  if (normalized.includes("not_entitled")) {
    return { status: 409, error: "not_entitled" };
  }

  if (
    normalized.includes("upgrade_not_configured") ||
    normalized.includes("invalid_upgrade_price") ||
    normalized.includes("invalid_upgrade_currency") ||
    normalized.includes("invalid_upgrade_target")
  ) {
    return { status: 409, error: "upgrade_not_configured" };
  }

  if (normalized.includes("already_at_target")) {
    return { status: 409, error: "already_at_target" };
  }

  if (normalized.includes("pending_order_exists")) {
    return { status: 409, error: "pending_order_exists" };
  }

  if (normalized.includes("idempotency_key_conflict")) {
    return { status: 409, error: "invalid_request" };
  }

  if (
    normalized.includes("practice_not_for_sale") ||
    normalized.includes("invalid_practice_price")
  ) {
    return { status: 409, error: "practice_not_for_sale" };
  }

  if (
    normalized.includes("practice_not_found") ||
    normalized.includes("practice_not_published")
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

export function toCourseUpgradeSuccessBody(input: {
  order: CourseUpgradeOrderRow;
  paymentId: string;
  paymentUrl: string;
}): CourseUpgradeSuccessBody {
  return {
    order: {
      id: input.order.order_id,
      practice_id: input.order.practice_id,
      practice_slug: input.order.practice_slug,
      status: input.order.status,
      amount_minor: input.order.amount_minor,
      currency: input.order.currency,
      order_kind: COURSE_UPGRADE_ORDER_KIND,
      target_access_level: input.order.target_access_level,
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

export function coerceCourseUpgradeOrderRow(
  value: unknown,
): CourseUpgradeOrderRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const amountMinor = asInteger(row.amount_minor);
  const target = asInteger(row.target_access_level);
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
    row.order_kind !== COURSE_UPGRADE_ORDER_KIND ||
    target == null ||
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
    order_kind: COURSE_UPGRADE_ORDER_KIND,
    target_access_level: target,
    created_at: createdAt,
  };
}

export function isCourseUpgradeOrderRow(
  value: unknown,
): value is CourseUpgradeOrderRow {
  return coerceCourseUpgradeOrderRow(value) != null;
}
