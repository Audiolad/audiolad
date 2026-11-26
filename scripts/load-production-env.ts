/**
 * Load `.env.production` / `.env.local` from cwd (symlinked to shared/.env.production on VPS).
 * Must run before scripts that read SUPABASE_SERVICE_ROLE_KEY or TIMEWEB_S3_* .
 */
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

export function loadProductionEnvFromCwd(): void {
  const dev = process.env.NODE_ENV !== "production";
  loadEnvConfig(process.cwd(), dev, { info() {}, error() {} });
}