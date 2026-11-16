/**
 * t1485u: automatic Shazam check for closed Business album passports.
 * Production PM2 name: audiolad-business-shazam-worker
 * (deploy/business-shazam-worker.ecosystem.config.cjs, started by
 * deploy/scripts/ensure-business-shazam-worker.sh after cutover).
 * Python + shazamio live outside the release in a pinned venv
 * (deploy/scripts/setup-business-shazam-venv.sh). Without it the worker stays online and idle.
 * Never runs inside a Next.js request. Never approves a passport.
 */
import { createClient } from "@supabase/supabase-js";
// @next/env is CommonJS: a named ESM import fails at runtime in this .mts entrypoint.
import nextEnv from "@next/env";
import { createBusinessShazamWorker } from "../src/lib/business-track-passports/shazam-worker";
import { businessShazamWorkerId, createBusinessShazamPort } from "../src/lib/business-track-passports/shazam-runtime";
import {
  captureStudioRenderBootRelease,
  compareStudioRenderRelease,
} from "../src/lib/studio/render/worker-release";

const { loadEnvConfig } = nextEnv;

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function redact(text: string): string {
  let out = text;
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const value = process.env[key];
    if (value) out = out.split(value).join(`[redacted:${key}]`);
  }
  return out;
}

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info() {}, error() {} });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("business_shazam_worker_environment_missing");
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let wake: (() => void) | null = null;
  const port = createBusinessShazamPort(service, { log: (event) => console.log(redact(JSON.stringify(event))) });
  port.sleep = (ms) => new Promise((done) => {
    const timer = setTimeout(() => { wake = null; done(); }, ms);
    wake = () => { clearTimeout(timer); wake = null; done(); };
  });

  const boot = await captureStudioRenderBootRelease();
  console.log(JSON.stringify({ event: "business_shazam_worker_boot", worker: businessShazamWorkerId(), bootSha: boot.sha }));
  const worker = createBusinessShazamWorker(port, {
    idleIntervalMs: envNumber("BUSINESS_SHAZAM_IDLE_INTERVAL_MS", 30_000),
    unavailableIntervalMs: envNumber("BUSINESS_SHAZAM_UNAVAILABLE_INTERVAL_MS", 600_000),
    checkRelease: () => compareStudioRenderRelease({ boot }),
  });
  const onSignal = (signal: NodeJS.Signals) => {
    console.log(JSON.stringify({ event: "business_shazam_shutdown_signal", signal }));
    worker.requestShutdown();
    (wake as (() => void) | null)?.();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  await worker.run();
  process.exit(0);
}

void main().catch((error) => {
  console.error("business-shazam-worker:", redact(error instanceof Error ? error.message : "unknown_error"));
  process.exitCode = 1;
});
