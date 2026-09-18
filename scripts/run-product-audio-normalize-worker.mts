/**
 * Product audio M4A/AAC → MP3 normalize worker CLI.
 * Foundation only: NOT wired into PM2 / production deploy lifecycle in Slice 1.
 *
 * Usage:
 *   npx tsx scripts/run-product-audio-normalize-worker.mts
 *   PRODUCT_AUDIO_NORMALIZE_MAX_JOBS=1 npx tsx scripts/run-product-audio-normalize-worker.mts
 */
import { createClient } from "@supabase/supabase-js";
import {
  formatProductAudioNormalizeWorkerEnvLog,
  redactProductAudioNormalizeWorkerSecrets,
  requireProductAudioNormalizeWorkerEnv,
} from "../src/lib/product-audio-normalize/worker-env";
import { createProductAudioNormalizeWorker } from "../src/lib/product-audio-normalize/worker";
import {
  PRODUCT_AUDIO_NORMALIZE_HEARTBEAT_INTERVAL_MS as CONTRACT_HEARTBEAT,
  PRODUCT_AUDIO_NORMALIZE_IDLE_INTERVAL_MS as CONTRACT_IDLE,
  PRODUCT_AUDIO_NORMALIZE_SHUTDOWN_DRAIN_MS as CONTRACT_DRAIN,
} from "../src/lib/product-audio-normalize/contract";
import { createProductAudioNormalizeWorkerPort } from "../src/lib/product-audio-normalize/worker-runtime";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const presence = requireProductAudioNormalizeWorkerEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("product_audio_normalize_worker_environment_missing");
  }
  console.log(
    formatProductAudioNormalizeWorkerEnvLog(
      "product_audio_normalize_env_ready",
      presence,
    ),
  );
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const port = createProductAudioNormalizeWorkerPort(service);
  const maxJobsRaw = process.env.PRODUCT_AUDIO_NORMALIZE_MAX_JOBS;
  const maxJobs =
    maxJobsRaw && Number.isFinite(Number(maxJobsRaw))
      ? Number(maxJobsRaw)
      : undefined;
  const worker = createProductAudioNormalizeWorker(port, {
    idleIntervalMs: envNumber("PRODUCT_AUDIO_NORMALIZE_IDLE_INTERVAL_MS", CONTRACT_IDLE),
    heartbeatIntervalMs: envNumber(
      "PRODUCT_AUDIO_NORMALIZE_HEARTBEAT_INTERVAL_MS",
      CONTRACT_HEARTBEAT,
    ),
    shutdownDrainMs: envNumber(
      "PRODUCT_AUDIO_NORMALIZE_SHUTDOWN_DRAIN_MS",
      CONTRACT_DRAIN,
    ),
    maxJobs,
  });

  const onSignal = (signal: NodeJS.Signals) => {
    console.log(
      JSON.stringify({ event: "product_audio_normalize_shutdown_signal", signal }),
    );
    worker.requestShutdown();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  await worker.run();
  process.off("SIGTERM", onSignal);
  process.off("SIGINT", onSignal);
  process.exit(0);
}

void main().catch((error) => {
  const raw = error instanceof Error ? error.message : "unknown_error";
  console.error(
    "product-audio-normalize-worker:",
    redactProductAudioNormalizeWorkerSecrets(raw),
  );
  process.exitCode = 1;
});
