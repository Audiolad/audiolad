import {
  getYandexWebmasterConfig,
  type YandexWebmasterConfig,
} from "@/lib/seo/yandex-webmaster/config";
import {
  submitYandexRecrawl,
  type YandexRecrawlHttpResult,
  type YandexWebmasterClientOptions,
} from "@/lib/seo/yandex-webmaster/client";
import type { YandexRecrawlReason } from "@/lib/seo/yandex-webmaster/planner";

export type NotifyYandexRecrawlStatus =
  | "disabled"
  | "submitted"
  | "already_queued"
  | "failed"
  | "auth_failed"
  | "invalid_user_id"
  | "host_not_verified"
  | "quota_exhausted"
  | "quota_check_failed";

export type NotifyYandexRecrawlResult = {
  status: NotifyYandexRecrawlStatus;
  reason: string;
  url: string;
  canSubmit: boolean;
  http: YandexRecrawlHttpResult | null;
};

export type NotifyYandexRecrawlOptions = YandexWebmasterClientOptions & {
  config?: YandexWebmasterConfig;
  dryRun?: boolean;
};

const BLOCKED_LOG_FIELDS = new Set([
  "token",
  "oauth",
  "authorization",
  "oauth_token",
  "yandex_webmaster_oauth_token",
]);

function logYandexWebmasterEvent(
  message: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(
      ([field]) => !BLOCKED_LOG_FIELDS.has(field.toLowerCase()),
    ),
  );

  console.info(`[yandex-webmaster] ${message}`, safe);
}

function resultContainsSecret(
  result: NotifyYandexRecrawlResult,
  token: string | null,
): boolean {
  if (!token) {
    return false;
  }

  return JSON.stringify(result).includes(token);
}

/**
 * Best-effort Webmaster Recrawl. Never throws to callers.
 */
export async function notifyYandexRecrawlUrl(
  url: string,
  reason: YandexRecrawlReason | string,
  options: NotifyYandexRecrawlOptions = {},
): Promise<NotifyYandexRecrawlResult> {
  try {
    const config = options.config ?? getYandexWebmasterConfig(options.env);
    const trimmedUrl = url.trim();

    if (!config.canSubmit) {
      logYandexWebmasterEvent("skip_disabled", {
        reason,
        url: trimmedUrl || null,
        enabledFlag: config.enabledFlag,
        tokenPresent: config.tokenPresent,
        userIdPresent: config.userIdPresent,
        hostIdPresent: config.hostIdPresent,
        indexingEnabled: config.indexingEnabled,
        originIsProduction: config.originIsProduction,
      });

      return {
        status: "disabled",
        reason,
        url: trimmedUrl,
        canSubmit: false,
        http: null,
      };
    }

    if (!trimmedUrl) {
      return {
        status: "failed",
        reason,
        url: "",
        canSubmit: true,
        http: null,
      };
    }

    if (options.dryRun) {
      logYandexWebmasterEvent("dry_run", {
        reason,
        url: trimmedUrl,
      });

      return {
        status: "submitted",
        reason,
        url: trimmedUrl,
        canSubmit: true,
        http: null,
      };
    }

    const http = await submitYandexRecrawl(trimmedUrl, options);

    if (http.errorCode === "already_queued") {
      logYandexWebmasterEvent("already_queued", {
        reason,
        url: trimmedUrl,
        status: http.status,
        apiErrorCode: http.apiErrorCode ?? null,
      });

      return {
        status: "already_queued",
        reason,
        url: trimmedUrl,
        canSubmit: true,
        http,
      };
    }

    if (http.errorCode === "quota_exhausted") {
      logYandexWebmasterEvent("skip_quota_exhausted", {
        reason,
        url: trimmedUrl,
        status: http.status,
        dailyQuota: http.dailyQuota ?? null,
        quotaRemainder: http.quotaRemainder ?? null,
      });

      return {
        status: "quota_exhausted",
        reason,
        url: trimmedUrl,
        canSubmit: true,
        http,
      };
    }

    if (http.errorCode === "auth_failed") {
      logYandexWebmasterEvent("auth_failed", {
        reason,
        url: trimmedUrl,
        status: http.status,
        retried: http.retried,
      });

      return {
        status: "auth_failed",
        reason,
        url: trimmedUrl,
        canSubmit: true,
        http,
      };
    }

    if (http.errorCode === "invalid_user_id") {
      logYandexWebmasterEvent("invalid_user_id", {
        reason,
        url: trimmedUrl,
        status: http.status,
        apiErrorCode: http.apiErrorCode ?? null,
        retried: http.retried,
      });

      return {
        status: "invalid_user_id",
        reason,
        url: trimmedUrl,
        canSubmit: true,
        http,
      };
    }

    if (http.errorCode === "host_not_verified") {
      logYandexWebmasterEvent("host_not_verified", {
        reason,
        url: trimmedUrl,
        status: http.status,
        apiErrorCode: http.apiErrorCode ?? null,
        retried: http.retried,
      });

      return {
        status: "host_not_verified",
        reason,
        url: trimmedUrl,
        canSubmit: true,
        http,
      };
    }

    if (http.errorCode === "quota_check_failed") {
      logYandexWebmasterEvent("quota_check_failed", {
        reason,
        url: trimmedUrl,
        status: http.status,
        retried: http.retried,
      });

      return {
        status: "quota_check_failed",
        reason,
        url: trimmedUrl,
        canSubmit: true,
        http,
      };
    }

    if (http.ok && http.accepted) {
      logYandexWebmasterEvent("submitted", {
        reason,
        url: trimmedUrl,
        status: http.status,
        taskId: http.taskId ?? null,
        quotaRemainder: http.quotaRemainder ?? null,
        retried: http.retried,
      });

      const result: NotifyYandexRecrawlResult = {
        status: "submitted",
        reason,
        url: trimmedUrl,
        canSubmit: true,
        http,
      };

      if (resultContainsSecret(result, options.env?.YANDEX_WEBMASTER_OAUTH_TOKEN ?? null)) {
        return {
          status: "submitted",
          reason,
          url: trimmedUrl,
          canSubmit: true,
          http: {
            ok: true,
            status: http.status,
            accepted: true,
            retried: http.retried,
            taskId: http.taskId ?? null,
            quotaRemainder: http.quotaRemainder ?? null,
            dailyQuota: http.dailyQuota ?? null,
          },
        };
      }

      return result;
    }

    logYandexWebmasterEvent("failed", {
      reason,
      url: trimmedUrl,
      status: http.status,
      errorCode: http.errorCode ?? null,
      retried: http.retried,
      taskId: http.taskId ?? null,
      quotaRemainder: http.quotaRemainder ?? null,
    });

    return {
      status: "failed",
      reason,
      url: trimmedUrl,
      canSubmit: true,
      http,
    };
  } catch {
    logYandexWebmasterEvent("unexpected_error", { reason, url });

    return {
      status: "failed",
      reason,
      url,
      canSubmit: false,
      http: null,
    };
  }
}
