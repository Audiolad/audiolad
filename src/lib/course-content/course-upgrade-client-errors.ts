import {
  COURSE_UPGRADE_BOUNDARY_HEADER,
  COURSE_UPGRADE_MARKER_HEADER,
  COURSE_UPGRADE_REQUEST_ID_HEADER,
  COURSE_UPGRADE_STAGE_HEADER,
  isCourseUpgradeCheckoutStage,
} from "@/lib/course-content/course-upgrade-stages";

export type CourseUpgradeClientErrorCode =
  | "unauthorized"
  | "auth_unavailable"
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

const SAFE_COURSE_UPGRADE_ERROR_CODES = new Set<string>([
  "unauthorized",
  "auth_unavailable",
  "invalid_request",
  "invalid_target_access_level",
  "practice_not_found",
  "not_course",
  "practice_not_for_sale",
  "not_entitled",
  "upgrade_not_configured",
  "already_at_target",
  "pending_order_exists",
  "author_finance_not_ready",
  "payments_not_configured",
  "order_already_paid",
  "order_not_payable",
  "provider_checkout_failed",
  "internal_error",
]);

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CourseUpgradeDiagnosticBoundary =
  | "proxy"
  | "route"
  | "marked"
  | "no-marker";

export type CourseUpgradeCheckoutEvidence = {
  httpStatus: number;
  errorCode: string;
  boundary: CourseUpgradeDiagnosticBoundary;
  requestIdShort: string | null;
  stage?: string | null;
};

export {
  COURSE_UPGRADE_BOUNDARY_HEADER,
  COURSE_UPGRADE_MARKER_HEADER,
  COURSE_UPGRADE_REQUEST_ID_HEADER,
  COURSE_UPGRADE_STAGE_HEADER,
};

export const COURSE_UPGRADE_UNKNOWN_STAGE = "unknown-stage";

export const COURSE_UPGRADE_GENERIC_ERROR =
  "Не удалось начать оплату. Попробуйте ещё раз.";

export const COURSE_UPGRADE_NETWORK_ERROR =
  "Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.";

export const COURSE_UPGRADE_AUTH_UNAVAILABLE_ERROR =
  "Не удалось проверить вход в аккаунт. Обновите страницу и попробуйте ещё раз.";

export const COURSE_UPGRADE_UNEXPECTED_RESPONSE_ERROR =
  "Не удалось обработать ответ сервера. Обновите страницу и попробуйте ещё раз.";

/**
 * Stable listener-facing copy for known checkout states.
 * Does not include provider tokens, raw Tochka payloads, or internal stages.
 */
export function mapCourseUpgradeClientError(
  code: string | undefined,
): string {
  switch (code) {
    case "unauthorized":
      return "Войдите, чтобы открыть следующий уровень.";
    case "auth_unavailable":
      return COURSE_UPGRADE_AUTH_UNAVAILABLE_ERROR;
    case "not_entitled":
      return "Сначала нужен доступ к текущему уровню.";
    case "upgrade_not_configured":
    case "invalid_target_access_level":
      return "Следующий уровень сейчас недоступен.";
    case "already_at_target":
      return "Этот уровень уже открыт.";
    case "pending_order_exists":
      return "Есть незавершённый платёж. Дождитесь завершения или повторите позже.";
    case "author_finance_not_ready":
      return "Оплата временно недоступна. Попробуйте позже.";
    case "payments_not_configured":
      return "Оплата сейчас недоступна.";
    case "practice_not_found":
      return "Курс не найден или временно недоступен.";
    case "practice_not_for_sale":
    case "not_course":
      return "Этот уровень сейчас нельзя оплатить.";
    case "order_already_paid":
      return "Этот платёж уже завершён. Обновите страницу.";
    case "order_not_payable":
      return "Этот платёж больше нельзя продолжить. Обновите страницу и попробуйте снова.";
    case "invalid_request":
      return "Не удалось начать оплату. Обновите страницу и попробуйте ещё раз.";
    case "provider_checkout_failed":
      return "Платёжная система не создала ссылку. Попробуйте ещё раз через минуту.";
    case "internal_error":
      return COURSE_UPGRADE_GENERIC_ERROR;
    default:
      return COURSE_UPGRADE_GENERIC_ERROR;
  }
}

/**
 * Production main collapsed unmapped codes, 2xx-without-URL, and network
 * throws into the same generic sentence. Keep those three paths distinct
 * where the backend state is known and safe to show.
 */
export function resolveCourseUpgradeUiError(input: {
  httpStatus: number;
  errorCode?: string;
  paymentUrl?: string | null;
  networkFailed?: boolean;
  unexpectedResponse?: boolean;
}): string {
  if (input.networkFailed) {
    return COURSE_UPGRADE_NETWORK_ERROR;
  }

  if (input.unexpectedResponse) {
    return COURSE_UPGRADE_UNEXPECTED_RESPONSE_ERROR;
  }

  if (input.httpStatus === 401) {
    return mapCourseUpgradeClientError("unauthorized");
  }

  const paymentUrl = input.paymentUrl?.trim() ?? "";

  if (input.httpStatus >= 200 && input.httpStatus < 300 && !paymentUrl) {
    return mapCourseUpgradeClientError(
      input.errorCode ?? "provider_checkout_failed",
    );
  }

  if (input.httpStatus < 200 || input.httpStatus >= 300 || !paymentUrl) {
    return mapCourseUpgradeClientError(input.errorCode);
  }

  return "";
}

export function readCourseUpgradeErrorCode(body: unknown): string | undefined {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }

  return undefined;
}

export function readCourseUpgradePaymentUrl(body: unknown): string | null {
  if (
    body &&
    typeof body === "object" &&
    "payment" in body &&
    (body as { payment?: { payment_url?: unknown } }).payment &&
    typeof (body as { payment: { payment_url?: unknown } }).payment
      .payment_url === "string"
  ) {
    return (body as { payment: { payment_url: string } }).payment.payment_url;
  }

  return null;
}

export function readCourseUpgradeDiagnosticBoundary(input: {
  markerHeader?: string | null;
  boundaryHeader?: string | null;
}): CourseUpgradeDiagnosticBoundary {
  if (input.markerHeader?.trim() !== "1") {
    return "no-marker";
  }

  const boundary = input.boundaryHeader?.trim();

  if (boundary === "proxy" || boundary === "route") {
    return boundary;
  }

  return "marked";
}

export function readCourseUpgradeRequestIdShort(
  requestIdHeader?: string | null,
): string | null {
  const value = requestIdHeader?.trim() ?? "";

  if (!REQUEST_ID_PATTERN.test(value)) {
    return null;
  }

  return value.slice(0, 4).toLowerCase();
}

export function readSafeCourseUpgradeDiagnosticStage(
  stageHeader?: string | null,
): string | null {
  if (stageHeader == null || stageHeader === "") {
    return null;
  }

  if (isCourseUpgradeCheckoutStage(stageHeader)) {
    return stageHeader;
  }

  return COURSE_UPGRADE_UNKNOWN_STAGE;
}

export function readSafeCourseUpgradeDiagnosticErrorCode(input: {
  body?: unknown;
  unexpectedResponse?: boolean;
  networkFailed?: boolean;
}): string {
  if (input.networkFailed) {
    return "network";
  }

  if (input.unexpectedResponse) {
    return "non_json";
  }

  const code = readCourseUpgradeErrorCode(input.body);

  if (code && SAFE_COURSE_UPGRADE_ERROR_CODES.has(code)) {
    return code;
  }

  return "unknown";
}

export function readCourseUpgradeCheckoutEvidence(input: {
  httpStatus: number;
  body?: unknown;
  unexpectedResponse?: boolean;
  networkFailed?: boolean;
  markerHeader?: string | null;
  boundaryHeader?: string | null;
  requestIdHeader?: string | null;
  stageHeader?: string | null;
}): CourseUpgradeCheckoutEvidence {
  return {
    httpStatus: input.httpStatus,
    errorCode: readSafeCourseUpgradeDiagnosticErrorCode(input),
    boundary: readCourseUpgradeDiagnosticBoundary(input),
    requestIdShort: readCourseUpgradeRequestIdShort(input.requestIdHeader),
    stage: readSafeCourseUpgradeDiagnosticStage(input.stageHeader),
  };
}

export function formatCourseUpgradeCheckoutDiagnostic(
  evidence: CourseUpgradeCheckoutEvidence,
): string {
  const parts = [
    `HTTP ${evidence.httpStatus}`,
    evidence.errorCode,
    evidence.boundary,
  ];

  if (evidence.stage) {
    parts.push(evidence.stage);
  }

  if (evidence.requestIdShort) {
    parts.push(`${evidence.requestIdShort}…`);
  }

  return `Диагностика: ${parts.join(" · ")}`;
}

export function interpretCourseUpgradeCheckoutResponse(input: {
  httpStatus: number;
  body?: unknown;
  unexpectedResponse?: boolean;
  networkFailed?: boolean;
  markerHeader?: string | null;
  boundaryHeader?: string | null;
  requestIdHeader?: string | null;
  stageHeader?: string | null;
}):
  | { kind: "redirect"; paymentUrl: string }
  | { kind: "error"; message: string; diagnostic: string } {
  const paymentUrl = readCourseUpgradePaymentUrl(input.body);
  const uiError = resolveCourseUpgradeUiError({
    httpStatus: input.httpStatus,
    errorCode: readCourseUpgradeErrorCode(input.body),
    paymentUrl,
    networkFailed: input.networkFailed,
    unexpectedResponse: input.unexpectedResponse,
  });

  if (uiError) {
    return {
      kind: "error",
      message: uiError,
      diagnostic: formatCourseUpgradeCheckoutDiagnostic(
        readCourseUpgradeCheckoutEvidence(input),
      ),
    };
  }

  return { kind: "redirect", paymentUrl: (paymentUrl ?? "").trim() };
}
