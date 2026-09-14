import { loadEnvConfig } from "@next/env";

export const MUSIC_TRANSCODE_WORKER_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const MUSIC_TRANSCODE_WORKER_ENV_MISSING = "music_transcode_worker_environment_missing";

export type MusicTranscodeWorkerEnvPresence = {
  NEXT_PUBLIC_SUPABASE_URL: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
};

const silentNextEnvLog = {
  info() {},
  error() {},
};

export function musicTranscodeWorkerEnvPresence(
  env: NodeJS.ProcessEnv = process.env,
): MusicTranscodeWorkerEnvPresence {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function formatMusicTranscodeWorkerEnvLog(
  event: string,
  presence: MusicTranscodeWorkerEnvPresence,
): string {
  return JSON.stringify({
    event,
    hasNextPublicSupabaseUrl: presence.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseServiceRoleKey: presence.SUPABASE_SERVICE_ROLE_KEY,
  });
}

export function redactMusicTranscodeWorkerSecrets(
  text: string,
  env: NodeJS.Dict<string> = process.env,
): string {
  let redacted = text;
  for (const key of MUSIC_TRANSCODE_WORKER_REQUIRED_ENV) {
    const value = env[key];
    if (value) redacted = redacted.split(value).join(`[redacted:${key}]`);
  }
  return redacted;
}

export function bootstrapMusicTranscodeWorkerEnv(options?: {
  dir?: string;
  forceReload?: boolean;
}): MusicTranscodeWorkerEnvPresence {
  const dir = options?.dir ?? process.cwd();
  loadEnvConfig(dir, process.env.NODE_ENV !== "production", silentNextEnvLog, options?.forceReload);
  return musicTranscodeWorkerEnvPresence();
}

export function requireMusicTranscodeWorkerEnv(options?: {
  dir?: string;
  forceReload?: boolean;
}): MusicTranscodeWorkerEnvPresence {
  const presence = bootstrapMusicTranscodeWorkerEnv(options);
  if (!presence.NEXT_PUBLIC_SUPABASE_URL || !presence.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(MUSIC_TRANSCODE_WORKER_ENV_MISSING);
  }
  return presence;
}
