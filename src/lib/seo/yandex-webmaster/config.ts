import {
  PRODUCTION_APP_ORIGIN,
  getAppOrigin,
} from "@/lib/seo/app-origin";
import { isPublicSeoIndexingEnabled } from "@/lib/seo/indexing";

/** Official Yandex Webmaster API v4 origin. */
export const YANDEX_WEBMASTER_API_ORIGIN = "https://api.webmaster.yandex.net";

/** Request timeout for Webmaster Recrawl calls. */
export const YANDEX_WEBMASTER_TIMEOUT_MS = 5_000;

/**
 * Official documented success for POST /recrawl/queue is 202 ACCEPTED.
 * 200/201 are accepted as extra HTTP success if the API ever returns them.
 * Source: https://yandex.com/dev/webmaster/doc/en/reference/host-recrawl-post
 */
export const YANDEX_RECRAWL_OFFICIAL_SUCCESS_STATUS = 202;
export const YANDEX_RECRAWL_ACCEPTED_STATUSES = [200, 201, 202] as const;

export type YandexWebmasterConfig = {
  enabledFlag: boolean;
  tokenPresent: boolean;
  userIdPresent: boolean;
  hostIdPresent: boolean;
  indexingEnabled: boolean;
  originIsProduction: boolean;
  canSubmit: boolean;
  userId: string | null;
  hostId: string | null;
  apiOrigin: typeof YANDEX_WEBMASTER_API_ORIGIN;
};

function readNonEmptyEnv(
  env: NodeJS.ProcessEnv,
  key: string,
): string | null {
  const raw = env[key]?.trim() ?? "";
  return raw ? raw : null;
}

export function isYandexWebmasterRecrawlEnabledFlag(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.YANDEX_WEBMASTER_RECRAWL_ENABLED?.trim() === "true";
}

export function readYandexWebmasterOAuthToken(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readNonEmptyEnv(env, "YANDEX_WEBMASTER_OAUTH_TOKEN");
}

export function readYandexWebmasterUserId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readNonEmptyEnv(env, "YANDEX_WEBMASTER_USER_ID");
}

export function readYandexWebmasterHostId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readNonEmptyEnv(env, "YANDEX_WEBMASTER_HOST_ID");
}

/**
 * Resolve Webmaster Recrawl runtime config.
 * Missing env must not throw. Token is never returned.
 */
export function getYandexWebmasterConfig(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    indexingEnabled?: boolean;
    appOrigin?: string;
  },
): YandexWebmasterConfig {
  const enabledFlag = isYandexWebmasterRecrawlEnabledFlag(env);
  const token = readYandexWebmasterOAuthToken(env);
  const userId = readYandexWebmasterUserId(env);
  const hostId = readYandexWebmasterHostId(env);
  const indexingEnabled =
    options?.indexingEnabled ?? isPublicSeoIndexingEnabled();
  const appOrigin = (options?.appOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const originIsProduction = appOrigin === PRODUCTION_APP_ORIGIN;

  const canSubmit =
    enabledFlag &&
    Boolean(token) &&
    Boolean(userId) &&
    Boolean(hostId) &&
    indexingEnabled &&
    originIsProduction;

  return {
    enabledFlag,
    tokenPresent: Boolean(token),
    userIdPresent: Boolean(userId),
    hostIdPresent: Boolean(hostId),
    indexingEnabled,
    originIsProduction,
    canSubmit,
    userId,
    hostId,
    apiOrigin: YANDEX_WEBMASTER_API_ORIGIN,
  };
}

export function isYandexRecrawlAcceptedStatus(status: number): boolean {
  return (YANDEX_RECRAWL_ACCEPTED_STATUSES as readonly number[]).includes(
    status,
  );
}

export function buildYandexRecrawlQuotaUrl(input: {
  userId: string;
  hostId: string;
  apiOrigin?: string;
}): string {
  const origin = input.apiOrigin ?? YANDEX_WEBMASTER_API_ORIGIN;
  return `${origin}/v4/user/${encodeURIComponent(input.userId)}/hosts/${encodeURIComponent(input.hostId)}/recrawl/quota`;
}

export function buildYandexRecrawlQueueUrl(input: {
  userId: string;
  hostId: string;
  apiOrigin?: string;
}): string {
  const origin = input.apiOrigin ?? YANDEX_WEBMASTER_API_ORIGIN;
  return `${origin}/v4/user/${encodeURIComponent(input.userId)}/hosts/${encodeURIComponent(input.hostId)}/recrawl/queue`;
}
