/**
 * Long-lived Studio render queue consumer. PM2 keeps this process running
 * (`autorestart: true`, no cron_restart). One job at a time; idle-polls after.
 */
import { createClient } from "@supabase/supabase-js";
import {
  createStudioRenderWorker,
  STUDIO_RENDER_HEARTBEAT_INTERVAL_MS,
  STUDIO_RENDER_IDLE_INTERVAL_MS,
  STUDIO_RENDER_SHUTDOWN_DRAIN_MS,
} from "../src/lib/studio/render/worker";
import { createStudioRenderWorkerPort } from "../src/lib/studio/render/worker-runtime";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("render_worker_environment_missing");
  }
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const port = createStudioRenderWorkerPort(service);
  const worker = createStudioRenderWorker(port, {
    idleIntervalMs: envNumber("STUDIO_RENDER_IDLE_INTERVAL_MS", STUDIO_RENDER_IDLE_INTERVAL_MS),
    heartbeatIntervalMs: envNumber("STUDIO_RENDER_HEARTBEAT_INTERVAL_MS", STUDIO_RENDER_HEARTBEAT_INTERVAL_MS),
    shutdownDrainMs: envNumber("STUDIO_RENDER_SHUTDOWN_DRAIN_MS", STUDIO_RENDER_SHUTDOWN_DRAIN_MS),
  });

  const onSignal = (signal: NodeJS.Signals) => {
    console.log(JSON.stringify({ event: "studio_render_shutdown_signal", signal }));
    worker.requestShutdown();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  await worker.run();
  process.off("SIGTERM", onSignal);
  process.off("SIGINT", onSignal);
  // Drain may leave FFmpeg still running; exit so PM2/treekill can reap it.
  process.exit(0);
}

void main().catch((error) => {
  console.error("studio-render-worker:", error);
  process.exitCode = 1;
});
