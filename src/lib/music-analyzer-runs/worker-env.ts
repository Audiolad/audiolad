import { loadEnvConfig } from "@next/env";

export const MUSIC_ANALYZER_WORKER_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function musicAnalyzerWorkerEnvPresence(env: NodeJS.ProcessEnv = process.env) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function formatMusicAnalyzerWorkerEnvLog(event: string, presence: ReturnType<typeof musicAnalyzerWorkerEnvPresence>): string {
  return JSON.stringify({
    event,
    hasNextPublicSupabaseUrl: presence.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseServiceRoleKey: presence.SUPABASE_SERVICE_ROLE_KEY,
  });
}

export function redactMusicAnalyzerWorkerSecrets(text: string, env: NodeJS.Dict<string> = process.env): string {
  let redacted = text;
  for (const key of MUSIC_ANALYZER_WORKER_REQUIRED_ENV) {
    const value = env[key];
    if (value) redacted = redacted.split(value).join(`[redacted:${key}]`);
  }
  return redacted;
}

export function requireMusicAnalyzerWorkerEnv(options?: { dir?: string; forceReload?: boolean }) {
  const dir = options?.dir ?? process.cwd();
  loadEnvConfig(dir, process.env.NODE_ENV !== "production", { info() {}, error() {} }, options?.forceReload);
  const presence = musicAnalyzerWorkerEnvPresence();
  if (!presence.NEXT_PUBLIC_SUPABASE_URL || !presence.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("music_analyzer_worker_environment_missing");
  }
  return presence;
}
