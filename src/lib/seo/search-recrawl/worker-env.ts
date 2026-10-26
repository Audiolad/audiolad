/**
 * Env bootstrap for the search recrawl worker.
 * Loads cwd `.env.production` the same way `next start` does.
 * Logs boolean presence only. Never log secret values.
 */
import { loadEnvConfig } from "@next/env";

export const SEARCH_RECRAWL_WORKER_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const SECRET_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "YANDEX_WEBMASTER_OAUTH_TOKEN",
  "INDEXNOW_KEY",
] as const;

const silentNextEnvLog = {
  info() {},
  error() {},
};

export function searchRecrawlWorkerEnvPresence(env: NodeJS.ProcessEnv = process.env) {
  return {
    hasSupabaseUrl: Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
    hasServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    hasYandexToken: Boolean(env.YANDEX_WEBMASTER_OAUTH_TOKEN?.trim()),
    hasYandexUserId: Boolean(env.YANDEX_WEBMASTER_USER_ID?.trim()),
    hasYandexHostId: Boolean(env.YANDEX_WEBMASTER_HOST_ID?.trim()),
  };
}

export function formatSearchRecrawlWorkerEnvLog(
  presence: ReturnType<typeof searchRecrawlWorkerEnvPresence>,
): string {
  return JSON.stringify({
    at: new Date().toISOString(),
    event: "search_recrawl_env_ready",
    ...presence,
  });
}

export function redactSearchRecrawlSecrets(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let redacted = text;

  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    if (value) {
      redacted = redacted.split(value).join(`[redacted:${key}]`);
    }
  }

  return redacted.replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "[redacted-jwt]",
  );
}

export function bootstrapSearchRecrawlWorkerEnv(options?: {
  dir?: string;
  forceReload?: boolean;
}) {
  const dir = options?.dir ?? process.cwd();
  loadEnvConfig(
    dir,
    process.env.NODE_ENV !== "production",
    silentNextEnvLog,
    options?.forceReload,
  );
  return searchRecrawlWorkerEnvPresence();
}
