export const SEARCH_RECRAWL_INTERVAL_MS = 5 * 60 * 1000;
export const SEARCH_RECRAWL_BATCH_LIMIT = 20;
export const SEARCH_RECRAWL_MAX_ATTEMPTS = 20;
export const SEARCH_RECRAWL_BACKOFF_BASE_MS = 5 * 60 * 1000;
export const SEARCH_RECRAWL_BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;
export const SEARCH_RECRAWL_QUOTA_DELAY_MS = 24 * 60 * 60 * 1000;
export const YANDEX_STALE_SUCCESS_MS = 24 * 60 * 60 * 1000;

export type RecrawlDisposition =
  | { action: "delivered" }
  | { action: "dead"; error: string }
  | { action: "rejected"; error: string }
  | { action: "retry"; delayMs: number; error: string; countAttempt: boolean };

/** Exponential delay after a failed attempt. `attemptsAfter` is 1 on the first failure. */
export function recrawlBackoffMs(attemptsAfter: number): number {
  const step = Math.max(1, Math.floor(attemptsAfter));
  const exponent = step - 1;
  const multiplier = exponent >= 20 ? Number.POSITIVE_INFINITY : 2 ** exponent;
  const raw = SEARCH_RECRAWL_BACKOFF_BASE_MS * multiplier;

  if (!Number.isFinite(raw)) {
    return SEARCH_RECRAWL_BACKOFF_CAP_MS;
  }

  return Math.min(SEARCH_RECRAWL_BACKOFF_CAP_MS, raw);
}

function cappedRetry(
  attemptsAfter: number,
  delayMs: number,
  error: string,
  countAttempt: boolean,
): RecrawlDisposition {
  if (countAttempt && attemptsAfter >= SEARCH_RECRAWL_MAX_ATTEMPTS) {
    return { action: "dead", error: "max_attempts" };
  }

  return { action: "retry", delayMs, error, countAttempt };
}

/**
 * Yandex POST outcome for one leased queue row.
 * 409 URL_ALREADY_ADDED is done. 429 waits until the next day.
 * 5xx, including 504, uses exponential backoff.
 */
export function disposeYandexAttempt(input: {
  status: string;
  errorCode?: string | null;
  httpStatus?: number | null;
  attemptsAfter: number;
}): RecrawlDisposition {
  const status = input.status;
  const errorCode = input.errorCode ?? null;
  const httpStatus = input.httpStatus ?? null;

  if (
    status === "submitted" ||
    status === "already_queued" ||
    status === "disabled" ||
    errorCode === "already_queued" ||
    httpStatus === 409
  ) {
    return { action: "delivered" };
  }

  if (status === "foreign_origin" || errorCode === "foreign_origin") {
    return { action: "rejected", error: "foreign_origin" };
  }

  if (
    status === "auth_failed" ||
    status === "invalid_user_id" ||
    status === "host_not_verified" ||
    status === "host_mismatch" ||
    errorCode === "auth_failed" ||
    errorCode === "invalid_user_id" ||
    errorCode === "host_not_verified" ||
    errorCode === "host_mismatch" ||
    errorCode === "invalid_url" ||
    errorCode === "disabled" ||
    httpStatus === 400 ||
    httpStatus === 401 ||
    httpStatus === 403 ||
    httpStatus === 404
  ) {
    return { action: "dead", error: errorCode ?? status };
  }

  if (
    status === "quota_exhausted" ||
    errorCode === "quota_exhausted" ||
    httpStatus === 429
  ) {
    return cappedRetry(
      input.attemptsAfter,
      SEARCH_RECRAWL_QUOTA_DELAY_MS,
      "quota_exhausted",
      true,
    );
  }

  const error = errorCode ?? (status || "failed");
  return cappedRetry(
    input.attemptsAfter,
    recrawlBackoffMs(input.attemptsAfter),
    error,
    true,
  );
}

export function disposeIndexNowAttempt(input: {
  status: string;
  attemptsAfter: number;
}): RecrawlDisposition {
  if (
    input.status === "submitted" ||
    input.status === "disabled" ||
    input.status === "no_urls"
  ) {
    return { action: "delivered" };
  }

  return cappedRetry(
    input.attemptsAfter,
    recrawlBackoffMs(input.attemptsAfter),
    input.status || "failed",
    true,
  );
}

export function yandexSendBudget(input: {
  quotaOk: boolean;
  quotaRemainder: number | null;
  batchLimit?: number;
}): number {
  const cap = input.batchLimit ?? SEARCH_RECRAWL_BATCH_LIMIT;

  if (!input.quotaOk) {
    return cap;
  }

  if ((input.quotaRemainder ?? 0) <= 0) {
    return 0;
  }

  return Math.min(cap, input.quotaRemainder ?? 0);
}

/**
 * Alert when Yandex has no delivered recrawl for more than 24 hours
 * while work is still waiting. A brand-new queue alerts only after the
 * oldest pending row has itself waited 24 hours.
 */
export function shouldAlertYandexStale(input: {
  pendingCount: number;
  oldestPendingAt: number | null;
  lastDeliveredAt: number | null;
  now: number;
}): boolean {
  if (input.pendingCount <= 0) {
    return false;
  }

  if (input.lastDeliveredAt != null) {
    return input.now - input.lastDeliveredAt > YANDEX_STALE_SUCCESS_MS;
  }

  if (input.oldestPendingAt == null) {
    return false;
  }

  return input.now - input.oldestPendingAt > YANDEX_STALE_SUCCESS_MS;
}
