import {
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

function classifyHttpError(status: number | null): YandexRecrawlErrorCode {
  if (status === 401) {
    return "auth_failed";
  }

  return "http_error";
}

function shouldRetry(result: YandexRecrawlHttpResult): boolean {
  if (result.errorCode === "timeout" || result.errorCode === "network") {
    return true;
  }

  if (result.status === 429) {
    return true;
  }

  if (typeof result.status === "number" && result.status >= 500) {
    return true;
  }

  return false;
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

    return {
      status: response.status,
      body: await parseJsonBody(response),
      errorCode:
        response.ok || isYandexRecrawlAcceptedStatus(response.status)
          ? undefined
          : classifyHttpError(response.status),
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

/**
 * GET /recrawl/quota. Never throws. Does not return the token.
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

  const firstResult: YandexRecrawlHttpResult = {
    ok: first.status === 200,
    status: first.status,
    accepted: first.status === 200,
    retried: false,
    errorCode: first.status === 200 ? undefined : first.errorCode ?? "quota_check_failed",
    dailyQuota: parseYandexRecrawlQuota(first.body).dailyQuota,
    quotaRemainder: parseYandexRecrawlQuota(first.body).quotaRemainder,
  };

  if (firstResult.ok || !shouldRetry(firstResult)) {
    return firstResult.ok
      ? firstResult
      : { ...firstResult, errorCode: "quota_check_failed" };
  }

  await sleepImpl(400);

  const second = await requestOnce(url, {
    method: "GET",
    token,
    fetchImpl,
    timeoutMs,
  });
  const quota = parseYandexRecrawlQuota(second.body);

  return {
    ok: second.status === 200,
    status: second.status,
    accepted: second.status === 200,
    retried: true,
    errorCode:
      second.status === 200 ? undefined : "quota_check_failed",
    dailyQuota: quota.dailyQuota,
    quotaRemainder: quota.quotaRemainder,
  };
}

/**
 * POST /recrawl/queue after a successful quota check.
 * Retries once on 429 / 5xx / timeout / network. Never throws.
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
      errorCode: "quota_check_failed",
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

  const firstAccepted =
    typeof first.status === "number" &&
    isYandexRecrawlAcceptedStatus(first.status);
  const firstResult: YandexRecrawlHttpResult = {
    ok: firstAccepted,
    status: first.status,
    accepted: firstAccepted,
    retried: false,
    errorCode: firstAccepted
      ? undefined
      : first.errorCode ?? classifyHttpError(first.status),
    taskId: readStringField(first.body, ["task_id", "taskId"]),
    quotaRemainder:
      readNumberField(first.body, ["quota_remainder", "quotaRemainder"]) ??
      quota.quotaRemainder,
    dailyQuota: quota.dailyQuota,
  };

  if (firstResult.ok || !shouldRetry(firstResult)) {
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
  const secondAccepted =
    typeof second.status === "number" &&
    isYandexRecrawlAcceptedStatus(second.status);

  return {
    ok: secondAccepted,
    status: second.status,
    accepted: secondAccepted,
    retried: true,
    errorCode: secondAccepted
      ? undefined
      : second.errorCode ?? classifyHttpError(second.status),
    taskId: readStringField(second.body, ["task_id", "taskId"]),
    quotaRemainder:
      readNumberField(second.body, ["quota_remainder", "quotaRemainder"]) ??
      quota.quotaRemainder,
    dailyQuota: quota.dailyQuota,
  };
}
