import "server-only";

import {
  getWordstatConfig,
  readWordstatApiKey,
  type WordstatConfig,
} from "@/lib/seo/wordstat/config";
import { wordstatError } from "@/lib/seo/wordstat/errors";
import { normalizeWordstatSuggestions } from "@/lib/seo/wordstat/normalize";
import { normalizeWordstatPhrase } from "@/lib/seo/wordstat/phrase";
import {
  buildWordstatCacheKey,
  getProcessWordstatCache,
  type WordstatCacheStore,
} from "@/lib/seo/wordstat/cache";
import {
  consumeWordstatOutboundSlot,
  consumeWordstatUserRateLimit,
  getProcessWordstatRateLimit,
  type WordstatRateLimitStore,
} from "@/lib/seo/wordstat/rate-limit";
import {
  WORDSTAT_GET_TOP_URL,
  WORDSTAT_TIMEOUT_MS,
  type WordstatResult,
} from "@/lib/seo/wordstat/types";

export type WordstatClientOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  config?: WordstatConfig;
  cache?: WordstatCacheStore;
  rateLimit?: WordstatRateLimitStore;
  userId?: string;
};

type WordstatRequestError = "timeout" | "network";

type WordstatHttpAttempt = {
  status: number | null;
  body: unknown;
  errorCode?: WordstatRequestError;
};

const BLOCKED_LOG_FIELDS = new Set([
  "token",
  "apikey",
  "api_key",
  "authorization",
  "yandex_search_api_key",
  "folderid",
  "folder_id",
]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientFailure(
  errorCode: WordstatRequestError | undefined,
  status: number | null,
): boolean {
  if (errorCode === "timeout" || errorCode === "network") {
    return true;
  }

  return typeof status === "number" && status >= 500;
}

function readSafeJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function logWordstatEvent(
  message: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(
      ([field]) => !BLOCKED_LOG_FIELDS.has(field.toLowerCase()),
    ),
  );

  console.info(`[wordstat] ${message}`, safe);
}

function resultContainsSecret(result: WordstatResult, secret: string | null): boolean {
  if (!secret) {
    return false;
  }

  return JSON.stringify(result).includes(secret);
}

function redactResult(result: WordstatResult, env?: NodeJS.ProcessEnv): WordstatResult {
  const key = readWordstatApiKey(env);
  if (resultContainsSecret(result, key)) {
    return wordstatError("UPSTREAM_ERROR");
  }

  return result;
}

async function requestOnce(
  url: string,
  init: {
    apiKey: string;
    body: string;
    fetchImpl: typeof fetch;
    timeoutMs: number;
  },
): Promise<WordstatHttpAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);

  try {
    const response = await init.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${init.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body,
      signal: controller.signal,
    });

    return {
      status: response.status,
      body: await parseJsonBody(response),
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

const PHRASE_FIELD_NAMES = new Set(["phrase", "query"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeViolationFieldPath(field: string): string {
  const last = field.trim().split(".").pop() ?? "";
  return last.replace(/\[\d+\]$/g, "");
}

function readFieldViolationFields(value: unknown): string[] {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.fieldViolations)) {
    return [];
  }

  const fields: string[] = [];
  for (const item of record.fieldViolations) {
    const violation = asRecord(item);
    if (violation && typeof violation.field === "string") {
      fields.push(violation.field);
    }
  }

  return fields;
}

function collectWordstatFieldViolationFields(body: unknown): string[] {
  const record = asRecord(body);
  if (!record) {
    return [];
  }

  const fields = readFieldViolationFields(record);
  const detailLists = [record.details];
  const nestedError = asRecord(record.error);
  if (nestedError) {
    fields.push(...readFieldViolationFields(nestedError));
    detailLists.push(nestedError.details);
  }

  for (const details of detailLists) {
    if (!Array.isArray(details)) {
      continue;
    }

    for (const detail of details) {
      fields.push(...readFieldViolationFields(detail));
    }
  }

  return fields;
}

/** True only when structured fieldViolations name the GetTop phrase/query field. */
export function isWordstatInvalidQueryResponse(body: unknown): boolean {
  const fields = collectWordstatFieldViolationFields(body);
  if (fields.length === 0) {
    return false;
  }

  return fields.every((field) =>
    PHRASE_FIELD_NAMES.has(normalizeViolationFieldPath(field)),
  );
}

export function classifyWordstatHttpError(input: {
  status: number | null;
  requestError?: WordstatRequestError;
  body?: unknown;
}): "TIMEOUT" | "UPSTREAM_ERROR" | "RATE_LIMITED" | "INVALID_QUERY" {
  if (input.requestError === "timeout") {
    return "TIMEOUT";
  }

  if (input.status === 429) {
    return "RATE_LIMITED";
  }

  if (input.status === 400 && isWordstatInvalidQueryResponse(input.body)) {
    return "INVALID_QUERY";
  }

  return "UPSTREAM_ERROR";
}

/**
 * Official Cloud Search API GetTop only. Never scrapes the public Wordstat site.
 * Client-facing callers must not pass folderId, API key, region, or URL.
 */
export async function fetchWordstatSuggestions(
  phrase: string,
  options: WordstatClientOptions = {},
): Promise<WordstatResult> {
  const env = options.env ?? process.env;
  const config = options.config ?? getWordstatConfig(env);
  const normalized = normalizeWordstatPhrase(phrase);

  if (!normalized) {
    return redactResult(wordstatError("INVALID_PHRASE"), env);
  }

  if (!config.enabledFlag) {
    return redactResult(wordstatError("WORDSTAT_DISABLED"), env);
  }

  if (!config.apiKeyPresent || !config.folderIdPresent || !config.folderId) {
    return redactResult(wordstatError("NOT_CONFIGURED"), env);
  }

  const apiKey = readWordstatApiKey(env);
  if (!apiKey) {
    return redactResult(wordstatError("NOT_CONFIGURED"), env);
  }

  const cache = options.cache ?? getProcessWordstatCache();
  const cacheKey = buildWordstatCacheKey({
    phrase: normalized,
    regionId: config.regionId,
    device: config.device,
  });

  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached) {
      logWordstatEvent("cache_hit", {
        phraseLength: normalized.length,
        regionId: config.regionId,
      });
      return redactResult({ ok: true, data: cached }, env);
    }
  }

  const userId = options.userId?.trim() || "anonymous";
  const rateLimit = options.rateLimit ?? getProcessWordstatRateLimit();
  if (!consumeWordstatUserRateLimit(userId, rateLimit)) {
    return redactResult(wordstatError("RATE_LIMITED"), env);
  }

  if (!consumeWordstatOutboundSlot(rateLimit)) {
    return redactResult(wordstatError("RATE_LIMITED"), env);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? WORDSTAT_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const requestBody = JSON.stringify({
    phrase: normalized,
    folderId: config.folderId,
    numPhrases: config.numPhrases,
    regions: [config.regionId],
    devices: [config.device],
  });

  const first = await requestOnce(WORDSTAT_GET_TOP_URL, {
    apiKey,
    body: requestBody,
    fetchImpl,
    timeoutMs,
  });

  let attempt = first;
  let retried = false;

  if (
    first.status !== 200 &&
    isTransientFailure(first.errorCode, first.status)
  ) {
    if (!consumeWordstatOutboundSlot(rateLimit)) {
      logWordstatEvent("get_top_failed", {
        status: first.status,
        retried: false,
        error: "RATE_LIMITED",
        phraseLength: normalized.length,
      });
      return redactResult(wordstatError("RATE_LIMITED"), env);
    }

    await sleepImpl(400);
    attempt = await requestOnce(WORDSTAT_GET_TOP_URL, {
      apiKey,
      body: requestBody,
      fetchImpl,
      timeoutMs,
    });
    retried = true;
  }

  if (attempt.status !== 200) {
    const code = classifyWordstatHttpError({
      status: attempt.status,
      requestError: attempt.errorCode,
      body: attempt.body,
    });
    logWordstatEvent("get_top_failed", {
      status: attempt.status,
      retried,
      error: code,
      phraseLength: normalized.length,
    });
    return redactResult(wordstatError(code), env);
  }

  const payload = normalizeWordstatSuggestions({
    phrase: normalized,
    regionId: config.regionId,
    body: attempt.body,
  });

  if (payload.suggestions.length === 0) {
    if (cacheKey) {
      cache.set(cacheKey, payload);
    }
    logWordstatEvent("get_top_empty", {
      retried,
      phraseLength: normalized.length,
    });
    return redactResult(wordstatError("NO_RESULTS"), env);
  }

  if (cacheKey) {
    cache.set(cacheKey, payload);
  }

  logWordstatEvent("get_top_ok", {
    retried,
    phraseLength: normalized.length,
    suggestionCount: payload.suggestions.length,
    status: attempt.status,
  });

  const result: WordstatResult = { ok: true, data: payload };
  if (resultContainsSecret(result, apiKey) || resultContainsSecret(result, config.folderId)) {
    return wordstatError("UPSTREAM_ERROR");
  }

  return result;
}

export function readSafeWordstatJson(value: unknown): Record<string, unknown> | null {
  return readSafeJson(value);
}
