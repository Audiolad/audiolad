import {
  YANDEX_RECRAWL_OFFICIAL_SUCCESS_STATUS,
  YANDEX_WEBMASTER_TIMEOUT_MS,
  buildYandexRecrawlQueueUrl,
  buildYandexRecrawlQuotaUrl,
  getYandexWebmasterConfig,
  isYandexRecrawlAcceptedStatus,
  readYandexWebmasterOAuthToken,
  type YandexWebmasterConfig,
} from "@/lib/seo/yandex-webmaster/config";

export type YandexRecrawlErrorCode =
  | "auth_failed"
  | "invalid_user_id"
  | "host_not_verified"
  | "already_queued"
  | "timeout"
  | "network"
  | "http_error"
  | "quota_check_failed"
  | "quota_exhausted"
  | "disabled"
  | "invalid_url"
  | "aborted";

export type YandexRecrawlQuota = {
  dailyQuota: number | null;
  quotaRemainder: number | null;
};

export type YandexRecrawlHttpResult = {
  ok: boolean;
  status: number | null;
  accepted: boolean;
  retried: boolean;
  errorCode?: YandexRecrawlErrorCode;
  apiErrorCode?: string | null;
  taskId?: string | null;
  quotaRemainder?: number | null;
  dailyQuota?: number | null;
};

export type YandexWebmasterClientOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  config?: YandexWebmasterConfig;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readSafeJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNumberField(
  body: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!body) {
    return null;
  }

  for (const key of keys) {
    const raw = body[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
  }

  return null;
}

function readStringField(
  body: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!body) {
    return null;
  }

  for (const key of keys) {
    const raw = body[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }

  return null;
}

async function parseJsonBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return readSafeJson(await response.json());
  } catch {
    return null;
  }
}

export function readYandexApiErrorCode(
  body: Record<string, unknown> | null,
): string | null {
  return readStringField(body, ["error_code", "errorCode"]);
}

/**
 * Classify an official Webmaster HTTP response. Never logs or returns the token.
 */
export function classifyYandexWebmasterError(
  status: number | null,
  body: Record<string, unknown> | null,
  requestError?: YandexRecrawlErrorCode,
): YandexRecrawlErrorCode {
  if (requestError === "timeout" || requestError === "network") {
    return requestError;
  }

  const apiErrorCode = readYandexApiErrorCode(body);

  if (status === 401) {
    return "auth_failed";
  }

  if (status === 403 && apiErrorCode === "INVALID_USER_ID") {
    return "invalid_user_id";
  }

  if (status === 403) {
    return "auth_failed";
  }

  if (status === 404 && apiErrorCode === "HOST_NOT_VERIFIED") {
    return "host_not_verified";
  }

  if (status === 409 && apiErrorCode === "URL_ALREADY_ADDED") {
    return "already_queued";
  }

  if (status === 429 && (apiErrorCode === "QUOTA_EXCEEDED" || !apiErrorCode)) {
    return "quota_exhausted";
  }

  if (status === 400 && (apiErrorCode === "INVALID_URL" || !apiErrorCode)) {
    return "invalid_url";
  }

  return "http_error";
}

function isTransientWebmasterFailure(
  errorCode: YandexRecrawlErrorCode | undefined,
  status: number | null,
): boolean {
  if (errorCode === "timeout" || errorCode === "network") {
    return true;
  }

  return typeof status === "number" && status >= 500;
}

function classifyPostResponse(
  status: number | null,
  body: Record<string, unknown> | null,
  requestError?: YandexRecrawlErrorCode,
): Pick<YandexRecrawlHttpResult, "ok" | "accepted" | "errorCode"> {
  if (typeof status === "number" && isYandexRecrawlAcceptedStatus(status)) {
    return { ok: true, accepted: true };
  }

  const errorCode = classifyYandexWebmasterError(status, body, requestError);

  if (errorCode === "already_queued") {
    return { ok: true, accepted: false, errorCode };
  }

  return { ok: false, accepted: false, errorCode };
}

async function requestOnce(
  url: string,
  init: {
    method: "GET" | "POST";
    token: string;
    body?: string;
    fetchImpl: typeof fetch;
    timeoutMs: number;
  },
): Promise<{
  status: number | null;
  errorCode?: YandexRecrawlErrorCode;
  body: Record<string, unknown> | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);

  try {
    const response = await init.fetchImpl(url, {
      method: init.method,
      headers: {
        Authorization: `OAuth ${init.token}`,
        Accept: "application/json",
        ...(init.body
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: init.body,
      signal: controller.signal,
    });

    const body = await parseJsonBody(response);

    return {
      status: response.status,
      body,
      errorCode:
        response.status === 200 ||
        (init.method === "POST" &&
          response.status === YANDEX_RECRAWL_OFFICIAL_SUCCESS_STATUS)
          ? undefined
          : classifyYandexWebmasterError(response.status, body),
    };
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: string }).name)
        : "";

    if (name === "AbortError") {
      return { status: null, body: null, errorCode: "timeout" };
    }

    return { status: null, body: null, errorCode: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export function parseYandexRecrawlQuota(body: unknown): YandexRecrawlQuota {
  const record = readSafeJson(body);

  return {
    dailyQuota: readNumberField(record, ["daily_quota", "dailyQuota"]),
    quotaRemainder: readNumberField(record, [
      "quota_remainder",
      "quotaRemainder",
    ]),
  };
}

function toQuotaResult(
  response: {
    status: number | null;
    errorCode?: YandexRecrawlErrorCode;
    body: Record<string, unknown> | null;
  },
  retried: boolean,
): YandexRecrawlHttpResult {
  const quota = parseYandexRecrawlQuota(response.body);
  const ok = response.status === 200;

  return {
    ok,
    status: response.status,
    accepted: ok,
    retried,
    errorCode: ok
      ? undefined
      : classifyYandexWebmasterError(
          response.status,
          response.body,
          response.errorCode,
        ),
    apiErrorCode: readYandexApiErrorCode(response.body),
    dailyQuota: quota.dailyQuota,
    quotaRemainder: quota.quotaRemainder,
  };
}

/**
 * GET /recrawl/quota. Never throws. Does not return the token.
 * Auth/config errors stay distinct. Only transient 5xx / network / timeout retry once.
 */
export async function checkYandexRecrawlQuota(
  options: YandexWebmasterClientOptions = {},
): Promise<YandexRecrawlHttpResult> {
  const config = options.config ?? getYandexWebmasterConfig(options.env);
  const token = readYandexWebmasterOAuthToken(options.env);

  if (!config.canSubmit || !token || !config.userId || !config.hostId) {
    return {
      ok: false,
      status: null,
      accepted: false,
      retried: false,
      errorCode: "disabled",
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? YANDEX_WEBMASTER_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const url = buildYandexRecrawlQuotaUrl({
    userId: config.userId,
    hostId: config.hostId,
  });

  const first = await requestOnce(url, {
    method: "GET",
    token,
    fetchImpl,
    timeoutMs,
  });
  const firstResult = toQuotaResult(first, false);

  if (firstResult.ok || !isTransientWebmasterFailure(firstResult.errorCode, firstResult.status)) {
    return firstResult;
  }

  await sleepImpl(400);

  const second = await requestOnce(url, {
    method: "GET",
    token,
    fetchImpl,
    timeoutMs,
  });
  const secondResult = toQuotaResult(second, true);

  if (secondResult.ok) {
    return secondResult;
  }

  if (
    secondResult.errorCode === "auth_failed" ||
    secondResult.errorCode === "invalid_user_id" ||
    secondResult.errorCode === "host_not_verified"
  ) {
    return secondResult;
  }

  return {
    ...secondResult,
    errorCode: "quota_check_failed",
  };
}

/**
 * POST /recrawl/queue after a successful quota check.
 * Retries at most once on 5xx / timeout / network. Never throws.
 * Token never appears in the returned result.
 */
export async function submitYandexRecrawl(
  url: string,
  options: YandexWebmasterClientOptions = {},
): Promise<YandexRecrawlHttpResult> {
  const config = options.config ?? getYandexWebmasterConfig(options.env);
  const token = readYandexWebmasterOAuthToken(options.env);
  const trimmedUrl = url.trim();

  if (!config.canSubmit || !token || !config.userId || !config.hostId) {
    return {
      ok: false,
      status: null,
      accepted: false,
      retried: false,
      errorCode: "disabled",
    };
  }

  if (!trimmedUrl) {
    return {
      ok: false,
      status: null,
      accepted: false,
      retried: false,
      errorCode: "invalid_url",
    };
  }

  const quota = await checkYandexRecrawlQuota(options);

  if (!quota.ok) {
    return {
      ok: false,
      status: quota.status,
      accepted: false,
      retried: quota.retried,
      errorCode: quota.errorCode ?? "quota_check_failed",
      apiErrorCode: quota.apiErrorCode ?? null,
      dailyQuota: quota.dailyQuota,
      quotaRemainder: quota.quotaRemainder,
    };
  }

  if ((quota.quotaRemainder ?? 0) <= 0) {
    return {
      ok: false,
      status: quota.status,
      accepted: false,
      retried: false,
      errorCode: "quota_exhausted",
      dailyQuota: quota.dailyQuota,
      quotaRemainder: quota.quotaRemainder,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? YANDEX_WEBMASTER_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const endpoint = buildYandexRecrawlQueueUrl({
    userId: config.userId,
    hostId: config.hostId,
  });

  const first = await requestOnce(endpoint, {
    method: "POST",
    token,
    body: JSON.stringify({ url: trimmedUrl }),
    fetchImpl,
    timeoutMs,
  });
  const firstClassified = classifyPostResponse(
    first.status,
    first.body,
    first.errorCode,
  );
  const firstResult: YandexRecrawlHttpResult = {
    ok: firstClassified.ok,
    status: first.status,
    accepted: firstClassified.accepted,
    retried: false,
    errorCode: firstClassified.errorCode,
    apiErrorCode: readYandexApiErrorCode(first.body),
    taskId: readStringField(first.body, ["task_id", "taskId"]),
    quotaRemainder:
      readNumberField(first.body, ["quota_remainder", "quotaRemainder"]) ??
      quota.quotaRemainder,
    dailyQuota: quota.dailyQuota,
  };

  if (
    firstResult.ok ||
    firstResult.errorCode === "already_queued" ||
    !isTransientWebmasterFailure(firstResult.errorCode, firstResult.status)
  ) {
    return firstResult;
  }

  await sleepImpl(400);

  const second = await requestOnce(endpoint, {
    method: "POST",
    token,
    body: JSON.stringify({ url: trimmedUrl }),
    fetchImpl,
    timeoutMs,
  });
  const secondClassified = classifyPostResponse(
    second.status,
    second.body,
    second.errorCode,
  );

  return {
    ok: secondClassified.ok,
    status: second.status,
    accepted: secondClassified.accepted,
    retried: true,
    errorCode: secondClassified.errorCode,
    apiErrorCode: readYandexApiErrorCode(second.body),
    taskId: readStringField(second.body, ["task_id", "taskId"]),
    quotaRemainder:
      readNumberField(second.body, ["quota_remainder", "quotaRemainder"]) ??
      quota.quotaRemainder,
    dailyQuota: quota.dailyQuota,
  };
}
