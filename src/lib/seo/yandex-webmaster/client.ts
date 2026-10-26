import { isAudioladRecrawlUrl } from "@/lib/seo/search-recrawl/origin";
import {
  YANDEX_RECRAWL_OFFICIAL_SUCCESS_STATUS,
  YANDEX_WEBMASTER_API_ORIGIN,
  YANDEX_WEBMASTER_TIMEOUT_MS,
  buildYandexRecrawlQueueUrl,
  buildYandexRecrawlQuotaUrl,
  getYandexWebmasterConfig,
  isYandexRecrawlAcceptedStatus,
  readYandexWebmasterOAuthToken,
  type YandexWebmasterConfig,
} from "@/lib/seo/yandex-webmaster/config";
import {
  parseYandexWebmasterHosts,
  resolveAudioladHostId,
  type YandexWebmasterHostRecord,
} from "@/lib/seo/yandex-webmaster/host";

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
  | "foreign_origin"
  | "host_empty"
  | "host_not_found"
  | "host_ambiguous"
  | "host_unverified"
  | "host_id_missing"
  | "host_mismatch"
  | "host_unresolved"
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
  /** Override used after audiolad.ru host resolution. */
  hostId?: string;
  /**
   * Test seam. Production send omits this so host_id comes from the
   * hosts list, matched to exactly https://audiolad.ru.
   */
  verifiedHostId?: string;
  now?: () => number;
};

const AUDIOLAD_HOST_CACHE_MS = 60 * 60 * 1000;

type AudioladHostCache = {
  hostId: string;
  configuredHostId: string;
  userId: string;
  expiresAt: number;
};

let audioladHostCache: AudioladHostCache | null = null;

export function clearAudioladWebmasterHostCache(): void {
  audioladHostCache = null;
}

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

  let hostId = options.hostId?.trim() ?? "";

  if (!hostId) {
    const resolved = await resolveSubmitHostId(options, config);

    if (!resolved.ok) {
      return {
        ok: false,
        status: resolved.status,
        accepted: false,
        retried: false,
        errorCode: resolved.errorCode,
      };
    }

    hostId = resolved.hostId;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? YANDEX_WEBMASTER_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const url = buildYandexRecrawlQuotaUrl({
    userId: config.userId,
    hostId,
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

function buildYandexHostsUrl(userId: string): string {
  return `${YANDEX_WEBMASTER_API_ORIGIN}/v4/user/${encodeURIComponent(userId)}/hosts`;
}

async function listYandexWebmasterHosts(
  options: YandexWebmasterClientOptions,
  token: string,
  userId: string,
): Promise<
  | { ok: true; hosts: YandexWebmasterHostRecord[] }
  | { ok: false; errorCode: YandexRecrawlErrorCode; status: number | null }
> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? YANDEX_WEBMASTER_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const url = buildYandexHostsUrl(userId);

  const first = await requestOnce(url, {
    method: "GET",
    token,
    fetchImpl,
    timeoutMs,
  });

  if (first.status === 200) {
    return { ok: true, hosts: parseYandexWebmasterHosts(first.body) };
  }

  const firstCode = classifyYandexWebmasterError(
    first.status,
    first.body,
    first.errorCode,
  );

  if (
    firstCode === "auth_failed" ||
    firstCode === "invalid_user_id" ||
    !isTransientWebmasterFailure(firstCode, first.status)
  ) {
    return { ok: false, errorCode: firstCode, status: first.status };
  }

  await sleepImpl(400);

  const second = await requestOnce(url, {
    method: "GET",
    token,
    fetchImpl,
    timeoutMs,
  });

  if (second.status === 200) {
    return { ok: true, hosts: parseYandexWebmasterHosts(second.body) };
  }

  const secondCode = classifyYandexWebmasterError(
    second.status,
    second.body,
    second.errorCode,
  );

  if (secondCode === "auth_failed" || secondCode === "invalid_user_id") {
    return { ok: false, errorCode: secondCode, status: second.status };
  }

  return { ok: false, errorCode: "host_unresolved", status: second.status };
}

/**
 * Resolve the audiolad.ru Webmaster host_id from GET /hosts.
 * A configured id that belongs to any other host is not used.
 */
export async function resolveAudioladWebmasterHost(
  options: YandexWebmasterClientOptions = {},
): Promise<
  | { ok: true; hostId: string }
  | { ok: false; errorCode: YandexRecrawlErrorCode; status: number | null }
> {
  const config = options.config ?? getYandexWebmasterConfig(options.env);
  const token = readYandexWebmasterOAuthToken(options.env);

  if (!config.canSubmit || !token || !config.userId || !config.hostId) {
    return { ok: false, errorCode: "disabled", status: null };
  }

  const now = options.now?.() ?? Date.now();

  if (
    audioladHostCache &&
    audioladHostCache.expiresAt > now &&
    audioladHostCache.configuredHostId === config.hostId &&
    audioladHostCache.userId === config.userId
  ) {
    return { ok: true, hostId: audioladHostCache.hostId };
  }

  const listed = await listYandexWebmasterHosts(options, token, config.userId);

  if (!listed.ok) {
    audioladHostCache = null;
    return listed;
  }

  const resolved = resolveAudioladHostId(listed.hosts, config.hostId);

  if (!resolved.ok) {
    audioladHostCache = null;
    return { ok: false, errorCode: resolved.reason, status: null };
  }

  audioladHostCache = {
    hostId: resolved.hostId,
    configuredHostId: config.hostId,
    userId: config.userId,
    expiresAt: now + AUDIOLAD_HOST_CACHE_MS,
  };

  return { ok: true, hostId: resolved.hostId };
}

async function resolveSubmitHostId(
  options: YandexWebmasterClientOptions,
  config: YandexWebmasterConfig,
): Promise<
  | { ok: true; hostId: string }
  | { ok: false; errorCode: YandexRecrawlErrorCode; status: number | null }
> {
  const verified = options.verifiedHostId?.trim() ?? "";

  if (verified) {
    if (!config.hostId || verified !== config.hostId) {
      return { ok: false, errorCode: "host_mismatch", status: null };
    }

    return { ok: true, hostId: verified };
  }

  return resolveAudioladWebmasterHost(options);
}

/**
 * POST /recrawl/queue for an audiolad.ru URL on the audiolad.ru host only.
 * A failed or timed-out quota check still sends. Quota remainder 0 does not.
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

  if (!trimmedUrl || !isAudioladRecrawlUrl(trimmedUrl)) {
    return {
      ok: false,
      status: null,
      accepted: false,
      retried: false,
      errorCode: trimmedUrl ? "foreign_origin" : "invalid_url",
    };
  }

  const host = await resolveSubmitHostId(options, config);

  if (!host.ok) {
    return {
      ok: false,
      status: host.status,
      accepted: false,
      retried: false,
      errorCode: host.errorCode,
    };
  }

  const quota = await checkYandexRecrawlQuota({
    ...options,
    hostId: host.hostId,
  });

  const quotaBlocksPost =
    !quota.ok &&
    (quota.errorCode === "disabled" ||
      quota.errorCode === "auth_failed" ||
      quota.errorCode === "invalid_user_id" ||
      quota.errorCode === "host_not_verified");

  if (quotaBlocksPost) {
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

  if (quota.ok && (quota.quotaRemainder ?? 0) <= 0) {
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
    hostId: host.hostId,
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
