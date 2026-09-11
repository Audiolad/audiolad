export const COURSE_UPGRADE_CHECKOUT_PATH = "/api/checkout/course-upgrade";

export const COURSE_UPGRADE_MARKER_HEADER = "x-audiolad-course-upgrade";
export const COURSE_UPGRADE_REQUEST_ID_HEADER = "x-audiolad-request-id";
export const COURSE_UPGRADE_BOUNDARY_HEADER =
  "x-audiolad-course-upgrade-boundary";

export type CourseUpgradeResponseBoundary = "proxy" | "route";

export function createCourseUpgradeRequestId(): string {
  return crypto.randomUUID();
}

export function courseUpgradeObservabilityHeaders(
  boundary: CourseUpgradeResponseBoundary,
  requestId: string,
): Record<string, string> {
  return {
    [COURSE_UPGRADE_MARKER_HEADER]: "1",
    [COURSE_UPGRADE_REQUEST_ID_HEADER]: requestId,
    [COURSE_UPGRADE_BOUNDARY_HEADER]: boundary,
  };
}

export const COURSE_UPGRADE_CHECKOUT_STAGES = {
  PROXY_AUTH: "proxy_auth",
  CREATE_REQUEST_CLIENT: "create_request_client",
  AUTHENTICATE_USER: "authenticate_user",
  AUTH: "auth",
  PARSE: "parse",
  CREATE_ORDER: "create_course_upgrade_order",
  COERCE: "coerceCourseUpgradeOrderRow",
  RELOAD: "reload_orders_row",
  START_TOCHKA: "startTochkaCheckoutForPendingOrder",
  ACCRUAL: "getOrderSaleAccrualReady",
  EXISTING_PAYMENTS: "existing_payments_lookup",
  PAYMENT_INSERT_REUSE: "payment_insert_or_reuse",
  CREATE_TOCHKA: "createTochkaPaymentOperation",
  METADATA_SAVE: "provider_metadata_save",
  PAYMENT_URL: "payment_url_returned",
} as const;

export type CourseUpgradeCheckoutStage =
  (typeof COURSE_UPGRADE_CHECKOUT_STAGES)[keyof typeof COURSE_UPGRADE_CHECKOUT_STAGES];

export function logCourseUpgradeFailure(input: {
  stage: string;
  error: string;
  status: number;
  orderId?: string | null;
  practiceId?: string | null;
  targetAccessLevel?: number | null;
}): void {
  console.error("course_upgrade_failed", {
    FAILED_STAGE: input.stage,
    ACTUAL_API_ERROR: input.error,
    ACTUAL_HTTP_STATUS: input.status,
    order_id: input.orderId ?? null,
    practice_id: input.practiceId ?? null,
    target_access_level: input.targetAccessLevel ?? null,
  });
}

export function logCourseUpgradeAuthError(input: {
  stage: string;
  error: string;
  status: number;
}): void {
  console.error("course_upgrade_auth_error", {
    FAILED_STAGE: input.stage,
    ACTUAL_API_ERROR: input.error,
    ACTUAL_HTTP_STATUS: input.status,
  });
}

export function isCourseUpgradeCheckoutPath(pathname: string): boolean {
  return pathname === COURSE_UPGRADE_CHECKOUT_PATH;
}

/**
 * Fail-closed wrapper for proxy updateSession. Only the exact checkout
 * pathname is caught; every other path keeps existing throw semantics.
 */
export async function runCourseUpgradeProtectedUpdateSession<TResponse>(input: {
  pathname: string;
  updateSession: () => Promise<TResponse>;
  failClosed: () => TResponse;
}): Promise<TResponse> {
  if (!isCourseUpgradeCheckoutPath(input.pathname)) {
    return input.updateSession();
  }

  try {
    return await input.updateSession();
  } catch {
    logCourseUpgradeAuthError({
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.PROXY_AUTH,
      error: "auth_unavailable",
      status: 503,
    });
    return input.failClosed();
  }
}

export type CourseUpgradeAuthUser = {
  id: string;
  email?: string | null;
};

export type CourseUpgradeAuthFailure = {
  ok: false;
  stage: string;
  error: "auth_unavailable";
  status: 503;
};

export async function createCourseUpgradeRequestClient<TClient>(
  createClient: () => Promise<TClient>,
): Promise<
  { ok: true; client: TClient } | CourseUpgradeAuthFailure
> {
  try {
    return { ok: true, client: await createClient() };
  } catch {
    return {
      ok: false,
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.CREATE_REQUEST_CLIENT,
      error: "auth_unavailable",
      status: 503,
    };
  }
}

export async function readCourseUpgradeRequestUser(
  getUser: () => Promise<{
    data: { user: CourseUpgradeAuthUser | null };
    error: { message?: string } | null;
  }>,
): Promise<
  | {
      ok: true;
      user: CourseUpgradeAuthUser | null;
      authError: { message?: string } | null;
    }
  | CourseUpgradeAuthFailure
> {
  try {
    const { data, error } = await getUser();
    return {
      ok: true,
      user: data.user ?? null,
      authError: error ?? null,
    };
  } catch {
    return {
      ok: false,
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.AUTHENTICATE_USER,
      error: "auth_unavailable",
      status: 503,
    };
  }
}
