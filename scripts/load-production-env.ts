/**
 * Load `.env.production` / `.env.local` from cwd (symlinked to shared/.env.production on VPS).
 * Must run before scripts that read SUPABASE_SERVICE_ROLE_KEY or TIMEWEB_S3_* .
 */
import { createRequire } from "node:module";

// @next/env is CommonJS only; default ESM import is undefined under tsx / Node 22.
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (
    dir: string,
    dev: boolean,
    log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
    forceReload?: boolean,
  ) => void;
};

export function loadProductionEnvFromCwd(): void {
  const dev = process.env.NODE_ENV !== "production";
  loadEnvConfig(process.cwd(), dev, { info() {}, error() {} });
}
