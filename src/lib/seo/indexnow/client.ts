import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_HOST,
  INDEXNOW_MAX_URLS_PER_BATCH,
  INDEXNOW_TIMEOUT_MS,
  type IndexNowConfig,
  buildIndexNowKeyLocation,
} from "@/lib/seo/indexnow/config";
import { batchIndexNowUrls } from "@/lib/seo/indexnow/urls";

export type IndexNowSubmitPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export type IndexNowHttpResult = {
  ok: boolean;
  status: number | null;
  accepted: boolean;
  retried: boolean;
  errorCode?:
    | "timeout"
    | "network"
    | "http_error"
    | "invalid_response"
    | "aborted";
};

export type IndexNowClientOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxUrlsPerBatch?: number;
  sleepImpl?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function buildIndexNowPayload(
  key: string,
  urlList: ReadonlyArray<string>,
): IndexNowSubmitPayload {
  return {
    host: INDEXNOW_HOST,
    key,
    keyLocation: buildIndexNowKeyLocation(key),
    urlList: [...urlList],
  };
}

/** Payload safe for logs / dry-run output (no key, even inside keyLocation). */
export function redactIndexNowPayload(payload: IndexNowSubmitPayload): {
  host: string;
  keyLocation: string;
  urlList: string[];
  urlCount: number;
} {
  const redactedLocation = payload.key
    ? payload.keyLocation.split(payload.key).join("<redacted>")
    : payload.keyLocation;

  return {
    host: payload.host,
    keyLocation: redactedLocation,
    urlList: [...payload.urlList],
    urlCount: payload.urlList.length,
  };
}

async function postOnce(
  payload: IndexNowSubmitPayload,
  options: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
  },
): Promise<IndexNowHttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const status = response.status;
    const accepted = status === 200 || status === 202;

    return {
      ok: accepted,
      status,
      accepted,
      retried: false,
      errorCode: accepted ? undefined : "http_error",
    };
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: string }).name)
        : "";

    if (name === "AbortError") {
      return {
        ok: false,
        status: null,
        accepted: false,
        retried: false,
        errorCode: "timeout",
      };
    }

    return {
      ok: false,
      status: null,
      accepted: false,
      retried: false,
      errorCode: "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

function shouldRetry(result: IndexNowHttpResult): boolean {
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

/**
 * Submit one IndexNow batch. Retries once on 429 / 5xx / timeout / network.
 * Never throws.
 */
export async function submitIndexNowBatch(
  config: Pick<IndexNowConfig, "key" | "canSubmit">,
  urlList: ReadonlyArray<string>,
  options: IndexNowClientOptions = {},
): Promise<{
  result: IndexNowHttpResult;
  payload: IndexNowSubmitPayload | null;
}> {
  if (!config.canSubmit || !config.key || urlList.length === 0) {
    return {
      payload: null,
      result: {
        ok: false,
        status: null,
        accepted: false,
        retried: false,
        errorCode: "invalid_response",
      },
    };
  }

  const payload = buildIndexNowPayload(config.key, urlList);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? INDEXNOW_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? defaultSleep;

  const first = await postOnce(payload, { fetchImpl, timeoutMs });

  if (first.ok || !shouldRetry(first)) {
    return { payload, result: first };
  }

  await sleepImpl(400);

  const second = await postOnce(payload, { fetchImpl, timeoutMs });

  return {
    payload,
    result: {
      ...second,
      retried: true,
    },
  };
}

export async function submitIndexNowUrlLists(
  config: Pick<IndexNowConfig, "key" | "canSubmit">,
  urls: ReadonlyArray<string>,
  options: IndexNowClientOptions = {},
): Promise<
  Array<{
    urls: string[];
    result: IndexNowHttpResult;
  }>
> {
  const max = options.maxUrlsPerBatch ?? INDEXNOW_MAX_URLS_PER_BATCH;
  const batches = batchIndexNowUrls(urls, max);
  const outcomes: Array<{ urls: string[]; result: IndexNowHttpResult }> = [];

  for (const batch of batches) {
    const { result } = await submitIndexNowBatch(config, batch, options);
    outcomes.push({ urls: batch, result });
  }

  return outcomes;
}
