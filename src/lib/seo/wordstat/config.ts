import "server-only";

import {
  WORDSTAT_API_ORIGIN,
  WORDSTAT_CACHE_TTL_MS,
  WORDSTAT_DEFAULT_REGION_ID,
  WORDSTAT_DEVICE_ALL,
  WORDSTAT_NUM_PHRASES,
  WORDSTAT_RUSSIA_REGION_LABEL,
  WORDSTAT_TIMEOUT_MS,
} from "@/lib/seo/wordstat/types";

export type WordstatConfig = {
  enabledFlag: boolean;
  apiKeyPresent: boolean;
  folderIdPresent: boolean;
  canCall: boolean;
  folderId: string | null;
  regionId: string;
  regionLabel: string;
  device: typeof WORDSTAT_DEVICE_ALL;
  numPhrases: typeof WORDSTAT_NUM_PHRASES;
  timeoutMs: typeof WORDSTAT_TIMEOUT_MS;
  cacheTtlMs: typeof WORDSTAT_CACHE_TTL_MS;
  apiOrigin: typeof WORDSTAT_API_ORIGIN;
};

function readNonEmptyEnv(
  env: NodeJS.ProcessEnv,
  key: string,
): string | null {
  const raw = env[key]?.trim() ?? "";
  return raw ? raw : null;
}

export function isWordstatEnabledFlag(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.YANDEX_WORDSTAT_ENABLED?.trim() === "true";
}

export function readWordstatApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readNonEmptyEnv(env, "YANDEX_SEARCH_API_KEY");
}

export function readWordstatFolderId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readNonEmptyEnv(env, "YANDEX_SEARCH_FOLDER_ID");
}

export function readWordstatRegionId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    readNonEmptyEnv(env, "YANDEX_WORDSTAT_REGION_ID") ??
    WORDSTAT_DEFAULT_REGION_ID
  );
}

export function wordstatRegionLabel(regionId: string): string {
  return regionId === WORDSTAT_DEFAULT_REGION_ID
    ? WORDSTAT_RUSSIA_REGION_LABEL
    : `регион ${regionId}`;
}

/**
 * Resolve Wordstat GetTop runtime config.
 * Missing env must not throw. API key is never returned.
 */
export function getWordstatConfig(
  env: NodeJS.ProcessEnv = process.env,
): WordstatConfig {
  const enabledFlag = isWordstatEnabledFlag(env);
  const apiKey = readWordstatApiKey(env);
  const folderId = readWordstatFolderId(env);
  const regionId = readWordstatRegionId(env);

  return {
    enabledFlag,
    apiKeyPresent: Boolean(apiKey),
    folderIdPresent: Boolean(folderId),
    canCall: enabledFlag && Boolean(apiKey) && Boolean(folderId),
    folderId,
    regionId,
    regionLabel: wordstatRegionLabel(regionId),
    device: WORDSTAT_DEVICE_ALL,
    numPhrases: WORDSTAT_NUM_PHRASES,
    timeoutMs: WORDSTAT_TIMEOUT_MS,
    cacheTtlMs: WORDSTAT_CACHE_TTL_MS,
    apiOrigin: WORDSTAT_API_ORIGIN,
  };
}
