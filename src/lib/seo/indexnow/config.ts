import {
  PRODUCTION_APP_ORIGIN,
  getAppOrigin,
} from "@/lib/seo/app-origin";
import { isPublicSeoIndexingEnabled } from "@/lib/seo/indexing";

/** Canonical IndexNow host for audiolad.ru (apex, no www). */
export const INDEXNOW_HOST = "audiolad.ru";

/** Official IndexNow submit endpoint (shared with participating engines). */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Max URLs per IndexNow POST. */
export const INDEXNOW_MAX_URLS_PER_BATCH = 100;

/** Request timeout for IndexNow submit. */
export const INDEXNOW_TIMEOUT_MS = 5_000;

const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export type IndexNowConfig = {
  enabledFlag: boolean;
  key: string | null;
  keyValid: boolean;
  indexingEnabled: boolean;
  originIsProduction: boolean;
  canSubmit: boolean;
  host: typeof INDEXNOW_HOST;
  endpoint: typeof INDEXNOW_ENDPOINT;
  keyLocation: string | null;
};

/**
 * IndexNow key rules: 8–128 chars of [A-Za-z0-9-].
 * Never log the key value.
 */
export function isValidIndexNowKey(value: string | null | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }

  return INDEXNOW_KEY_PATTERN.test(value);
}

export function readIndexNowKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.INDEXNOW_KEY?.trim() ?? "";

  if (!raw) {
    return null;
  }

  return isValidIndexNowKey(raw) ? raw : null;
}

export function isIndexNowEnabledFlag(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.INDEXNOW_ENABLED?.trim() === "true";
}

export function buildIndexNowKeyLocation(key: string): string {
  return `${PRODUCTION_APP_ORIGIN}/${key}.txt`;
}

/**
 * Resolve IndexNow runtime config.
 * Missing or invalid env must not throw.
 */
export function getIndexNowConfig(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    indexingEnabled?: boolean;
    appOrigin?: string;
  },
): IndexNowConfig {
  const enabledFlag = isIndexNowEnabledFlag(env);
  const key = readIndexNowKeyFromEnv(env);
  const keyValid = key !== null;
  const indexingEnabled =
    options?.indexingEnabled ?? isPublicSeoIndexingEnabled();
  const appOrigin = (options?.appOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const originIsProduction = appOrigin === PRODUCTION_APP_ORIGIN;

  const canSubmit =
    enabledFlag && keyValid && indexingEnabled && originIsProduction;

  return {
    enabledFlag,
    key,
    keyValid,
    indexingEnabled,
    originIsProduction,
    canSubmit,
    host: INDEXNOW_HOST,
    endpoint: INDEXNOW_ENDPOINT,
    keyLocation: keyValid && key ? buildIndexNowKeyLocation(key) : null,
  };
}

/**
 * Whether a requested key-file name matches the configured IndexNow key.
 * Does not reveal the configured key when mismatched.
 */
export function matchesConfiguredIndexNowKey(
  requestedKey: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = readIndexNowKeyFromEnv(env);

  if (!configured || typeof requestedKey !== "string") {
    return false;
  }

  return requestedKey === configured;
}

/** Plain-text body for the key file (exact key, no BOM / trailing text). */
export function getIndexNowKeyFileBody(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readIndexNowKeyFromEnv(env);
}
