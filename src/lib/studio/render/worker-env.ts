/**
 * Production env bootstrap for the Studio render worker.
 *
 * Reuses Next.js `@next/env` — the same loader `next start` uses — so a clean
 * `pm2 start deploy/studio-render-worker.ecosystem.config.cjs` picks up the
 * release cwd `.env.production` symlink that deploy already creates from
 * `shared/.env.production`. Do not put secrets in the PM2 ecosystem `env`
 * block or rely on a once-saved dump / inherited shell.
 *
 * Logs may mention file names and boolean presence only. Never log values.
 */
import { loadEnvConfig } from "@next/env";

export const STUDIO_RENDER_WORKER_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const STUDIO_RENDER_WORKER_ENV_MISSING = "render_worker_environment_missing";

export type StudioRenderWorkerEnvPresence = {
  NEXT_PUBLIC_SUPABASE_URL: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
};

const silentNextEnvLog = {
  info() {},
  error() {},
};

export function studioRenderWorkerEnvPresence(
  env: NodeJS.ProcessEnv = process.env,
): StudioRenderWorkerEnvPresence {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function formatStudioRenderWorkerEnvLog(
  event: string,
  presence: StudioRenderWorkerEnvPresence,
): string {
  return JSON.stringify({
    event,
    hasNextPublicSupabaseUrl: presence.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseServiceRoleKey: presence.SUPABASE_SERVICE_ROLE_KEY,
  });
}

export function redactStudioRenderWorkerSecrets(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let redacted = text;
  for (const key of STUDIO_RENDER_WORKER_REQUIRED_ENV) {
    const value = env[key];
    if (value) {
      redacted = redacted.split(value).join(`[redacted:${key}]`);
    }
  }
  return redacted;
}

export function bootstrapStudioRenderWorkerEnv(options?: {
  dir?: string;
  forceReload?: boolean;
}): StudioRenderWorkerEnvPresence {
  const dir = options?.dir ?? process.cwd();
  loadEnvConfig(dir, process.env.NODE_ENV !== "production", silentNextEnvLog, options?.forceReload);
  return studioRenderWorkerEnvPresence();
}

export function requireStudioRenderWorkerEnv(options?: {
  dir?: string;
  forceReload?: boolean;
}): StudioRenderWorkerEnvPresence {
  const presence = bootstrapStudioRenderWorkerEnv(options);
  if (!presence.NEXT_PUBLIC_SUPABASE_URL || !presence.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(STUDIO_RENDER_WORKER_ENV_MISSING);
  }
  return presence;
}
