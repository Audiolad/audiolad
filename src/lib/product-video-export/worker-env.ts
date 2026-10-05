import { loadEnvConfig } from "@next/env";

const silentNextEnvLog = { info() {}, error() {} };

export function requireProductVideoExportWorkerEnv(options?: {
  dir?: string;
  forceReload?: boolean;
}) {
  loadEnvConfig(
    options?.dir ?? process.cwd(),
    process.env.NODE_ENV !== "production",
    silentNextEnvLog,
    options?.forceReload,
  );
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasUrl || !hasServiceKey) {
    throw new Error("product_video_export_worker_environment_missing");
  }
  return { hasUrl, hasServiceKey };
}

export function redactProductVideoWorkerSecrets(text: string): string {
  let redacted = text;
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const value = process.env[key];
    if (value) redacted = redacted.split(value).join(`[redacted:${key}]`);
  }
  return redacted;
}
