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
  | {
      action: "retry";
      delayMs: number;
      error: string;
      countAttempt: boolean;
      /** Config or auth is broken for every URL. Do not take another batch. */
      pauseQueue?: boolean;
    };

export type YandexQuotaState = "known" | "transient" | "unknown" | "blocked";

export type YandexQuotaSnapshot = {
  state: YandexQuotaState;
  remainder: number | null;
  reason: string | null;
};

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
 * Config, auth, or an unresolved audiolad.ru host. The URL was not accepted.
 * Leave it pending and pause the rest of the batch. Do not set delivered_at
 * and do not burn attempts toward dead-letter.
 */
function pausedRetry(error: string): RecrawlDisposition {
  return {
    action: "retry",
    delayMs: SEARCH_RECRAWL_BACKOFF_BASE_MS,
    error,
    countAttempt: false,
    pauseQueue: true,
  };
}

const YANDEX_QUEUE_PAUSE_REASONS = new Set([
  "disabled",
  "auth_failed",
  "invalid_user_id",
  "host_not_verified",
  "host_not_found",
  "host_empty",
  "host_ambiguous",
  "host_unverified",
  "host_id_missing",
  "host_mismatch",
  "host_unresolved",
]);

const QUOTA_TRANSIENT_REASONS = new Set([
  "timeout",
  "network",
  "quota_check_failed",
  "http_error",
]);

const QUOTA_BLOCKED_REASONS = YANDEX_QUEUE_PAUSE_REASONS;

function isYandexQueuePause(status: string, errorCode: string | null, httpStatus: number | null): boolean {
  if (YANDEX_QUEUE_PAUSE_REASONS.has(status) || (errorCode != null && YANDEX_QUEUE_PAUSE_REASONS.has(errorCode))) {
    return true;
  }

  return httpStatus === 401 || httpStatus === 403 || httpStatus === 404;
}

/**
 * A quota read with no remainder and no classified transport/config error.
 * Not a license to send the whole batch.
 */
export function classifyYandexQuotaRead(input: {
  ok: boolean;
  remainder?: number | null;
  errorCode?: string | null;
}): YandexQuotaSnapshot {
  if (input.ok) {
    return {
      state: "known",
      remainder: input.remainder ?? 0,
      reason: null,
    };
  }

  const reason = input.errorCode ?? null;

  if (reason && QUOTA_TRANSIENT_REASONS.has(reason)) {
    return { state: "transient", remainder: null, reason };
  }

  if (reason && QUOTA_BLOCKED_REASONS.has(reason)) {
    return { state: "blocked", remainder: null, reason };
  }

  return { state: "unknown", remainder: null, reason };
}

/**
 * Yandex POST outcome for one leased queue row.
 * 409 URL_ALREADY_ADDED is done. 429 waits until the next day.
 * 5xx, including 504, uses exponential backoff.
 * disabled, auth, and host-list failures stay pending and pause the queue.
 * Only a malformed URL (400) or a foreign origin is terminal.
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
    errorCode === "already_queued" ||
    httpStatus === 409
  ) {
    return { action: "delivered" };
  }

  if (status === "foreign_origin" || errorCode === "foreign_origin") {
    return { action: "rejected", error: "foreign_origin" };
  }

  if (status === "invalid_url" || errorCode === "invalid_url" || httpStatus === 400) {
    return { action: "dead", error: errorCode ?? status ?? "invalid_url" };
  }

  if (isYandexQueuePause(status, errorCode, httpStatus)) {
    return pausedRetry(errorCode ?? status);
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
  if (input.status === "disabled") {
    return pausedRetry("disabled");
  }

  if (input.status === "submitted" || input.status === "no_urls") {
    return { action: "delivered" };
  }

  return cappedRetry(
    input.attemptsAfter,
    recrawlBackoffMs(input.attemptsAfter),
    input.status || "failed",
    true,
  );
}

/**
 * Known remainder limits the batch. A timed-out quota check still allows
 * POSTs. An unknown or blocked read allows none: it is not a full budget.
 */
export function yandexSendBudget(input: {
  quotaState: YandexQuotaState;
  quotaRemainder: number | null;
  batchLimit?: number;
}): number {
  const cap = input.batchLimit ?? SEARCH_RECRAWL_BATCH_LIMIT;

  if (input.quotaState === "unknown" || input.quotaState === "blocked") {
    return 0;
  }

  if (input.quotaState === "transient") {
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
