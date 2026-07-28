import {
  getIndexNowConfig,
  type IndexNowConfig,
} from "@/lib/seo/indexnow/config";
import {
  buildIndexNowPayload,
  redactIndexNowPayload,
  submitIndexNowUrlLists,
  type IndexNowClientOptions,
  type IndexNowHttpResult,
} from "@/lib/seo/indexnow/client";
import {
  normalizeIndexNowUrls,
  type IndexNowUrlReject,
} from "@/lib/seo/indexnow/urls";

export type NotifyIndexNowStatus =
  | "disabled"
  | "no_urls"
  | "submitted"
  | "partial"
  | "failed";

export type NotifyIndexNowResult = {
  status: NotifyIndexNowStatus;
  reason: string;
  canSubmit: boolean;
  acceptedUrls: string[];
  rejected: IndexNowUrlReject[];
  batchResults: Array<{
    urlCount: number;
    urls: string[];
    http: IndexNowHttpResult;
  }>;
  /** Redacted payload samples for dry-run / tests (no key). */
  redactedPayloads: Array<{
    host: string;
    keyLocation: string;
    urlList: string[];
    urlCount: number;
  }>;
};

export type NotifyIndexNowOptions = IndexNowClientOptions & {
  env?: NodeJS.ProcessEnv;
  config?: IndexNowConfig;
  /** When true, never call the network even if canSubmit. */
  dryRun?: boolean;
};

function logIndexNowEvent(
  message: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  // Never include key material. Boolean flags like keyValid are allowed.
  const blocked = new Set(["key", "indexnow_key", "authorization", "keylocation"]);
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([field]) => !blocked.has(field.toLowerCase())),
  );

  console.info(`[indexnow] ${message}`, safe);
}

/**
 * Safely notify IndexNow about URL changes.
 * Never throws to callers (publish APIs must stay unaffected).
 */
export async function notifyIndexNowUrls(
  urls: ReadonlyArray<string | null | undefined>,
  reason: string,
  options: NotifyIndexNowOptions = {},
): Promise<NotifyIndexNowResult> {
  try {
    const config = options.config ?? getIndexNowConfig(options.env);
    const { accepted, rejected } = normalizeIndexNowUrls(urls);

    if (!config.canSubmit) {
      logIndexNowEvent("skip_disabled", {
        reason,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        enabledFlag: config.enabledFlag,
        keyValid: config.keyValid,
        indexingEnabled: config.indexingEnabled,
        originIsProduction: config.originIsProduction,
      });

      return {
        status: "disabled",
        reason,
        canSubmit: false,
        acceptedUrls: accepted,
        rejected,
        batchResults: [],
        redactedPayloads: [],
      };
    }

    if (accepted.length === 0) {
      return {
        status: "no_urls",
        reason,
        canSubmit: true,
        acceptedUrls: [],
        rejected,
        batchResults: [],
        redactedPayloads: [],
      };
    }

    if (options.dryRun) {
      const redactedPayloads =
        accepted.length && config.key
          ? [redactIndexNowPayload(buildIndexNowPayload(config.key, accepted))]
          : [];

      logIndexNowEvent("dry_run", {
        reason,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
      });

      return {
        status: "submitted",
        reason,
        canSubmit: true,
        acceptedUrls: accepted,
        rejected,
        batchResults: [],
        redactedPayloads,
      };
    }

    const outcomes = await submitIndexNowUrlLists(config, accepted, options);
    const batchResults = outcomes.map((outcome) => ({
      urlCount: outcome.urls.length,
      urls: outcome.urls,
      http: outcome.result,
    }));

    const redactedPayloads = outcomes.map((outcome) =>
      redactIndexNowPayload(
        // key guaranteed by canSubmit
        {
          host: config.host,
          key: config.key as string,
          keyLocation: config.keyLocation as string,
          urlList: outcome.urls,
        },
      ),
    );

    const successCount = batchResults.filter((batch) => batch.http.ok).length;
    let status: NotifyIndexNowStatus = "failed";

    if (successCount === batchResults.length) {
      status = "submitted";
    } else if (successCount > 0) {
      status = "partial";
    }

    for (const batch of batchResults) {
      logIndexNowEvent("batch_result", {
        reason,
        urlCount: batch.urlCount,
        status: batch.http.status,
        ok: batch.http.ok,
        retried: batch.http.retried,
        errorCode: batch.http.errorCode ?? null,
      });
    }

    return {
      status,
      reason,
      canSubmit: true,
      acceptedUrls: accepted,
      rejected,
      batchResults,
      redactedPayloads,
    };
  } catch {
    logIndexNowEvent("unexpected_error", { reason });

    return {
      status: "failed",
      reason,
      canSubmit: false,
      acceptedUrls: [],
      rejected: [],
      batchResults: [],
      redactedPayloads: [],
    };
  }
}
