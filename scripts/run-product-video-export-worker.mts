import { createClient } from "@supabase/supabase-js";

import {
  requireProductVideoExportWorkerEnv,
  redactProductVideoWorkerSecrets,
} from "../src/lib/product-video-export/worker-env";
import { createProductVideoRenderWorker } from "../src/lib/product-video-export/worker";
import { createProductVideoRenderWorkerPort } from "../src/lib/product-video-export/worker-runtime";

async function main() {
  const presence = requireProductVideoExportWorkerEnv();
  console.log(
    JSON.stringify({
      event: "product_video_export_env_ready",
      hasNextPublicSupabaseUrl: presence.hasUrl,
      hasSupabaseServiceRoleKey: presence.hasServiceKey,
    }),
  );

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const maxJobsRaw = process.env.PRODUCT_VIDEO_EXPORT_MAX_JOBS;
  const maxJobs =
    maxJobsRaw && Number.isFinite(Number(maxJobsRaw))
      ? Number(maxJobsRaw)
      : undefined;
  const worker = createProductVideoRenderWorker(
    createProductVideoRenderWorkerPort(service),
    { maxJobs },
  );

  const onSignal = (signal: NodeJS.Signals) => {
    console.log(
      JSON.stringify({ event: "product_video_export_shutdown_signal", signal }),
    );
    worker.requestShutdown();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  await worker.run();
  process.off("SIGTERM", onSignal);
  process.off("SIGINT", onSignal);
}

void main().catch((error) => {
  const raw = error instanceof Error ? error.message : "unknown_error";
  console.error(
    "product-video-export-worker:",
    redactProductVideoWorkerSecrets(raw),
  );
  process.exitCode = 1;
});
