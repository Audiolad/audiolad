import { loadEnvConfig } from "@next/env";

export const PRODUCT_AUDIO_NORMALIZE_WORKER_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const PRODUCT_AUDIO_NORMALIZE_WORKER_ENV_MISSING =
  "product_audio_normalize_worker_environment_missing";

export type ProductAudioNormalizeWorkerEnvPresence = {
  NEXT_PUBLIC_SUPABASE_URL: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
};

const silentNextEnvLog = {
  info() {},
  error() {},
};

export function productAudioNormalizeWorkerEnvPresence(
  env: NodeJS.ProcessEnv = process.env,
): ProductAudioNormalizeWorkerEnvPresence {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function formatProductAudioNormalizeWorkerEnvLog(
  event: string,
  presence: ProductAudioNormalizeWorkerEnvPresence,
): string {
  return JSON.stringify({
    event,
    hasNextPublicSupabaseUrl: presence.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseServiceRoleKey: presence.SUPABASE_SERVICE_ROLE_KEY,
  });
}

export function redactProductAudioNormalizeWorkerSecrets(
  text: string,
  env: NodeJS.Dict<string> = process.env,
): string {
  let redacted = text;
  for (const key of PRODUCT_AUDIO_NORMALIZE_WORKER_REQUIRED_ENV) {
    const value = env[key];
    if (value) redacted = redacted.split(value).join(`[redacted:${key}]`);
  }
  return redacted;
}

export function requireProductAudioNormalizeWorkerEnv(options?: {
  dir?: string;
  forceReload?: boolean;
}): ProductAudioNormalizeWorkerEnvPresence {
  const dir = options?.dir ?? process.cwd();
  loadEnvConfig(
    dir,
    process.env.NODE_ENV !== "production",
    silentNextEnvLog,
    options?.forceReload,
  );
  const presence = productAudioNormalizeWorkerEnvPresence();
  if (!presence.NEXT_PUBLIC_SUPABASE_URL || !presence.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(PRODUCT_AUDIO_NORMALIZE_WORKER_ENV_MISSING);
  }
  return presence;
}
