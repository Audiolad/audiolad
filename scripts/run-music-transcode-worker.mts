/**
 * Long-lived music transcode queue consumer. Production PM2 name is
 * audiolad-music-transcode-worker via deploy/music-transcode-worker.ecosystem.config.cjs.
 */
import { createClient } from "@supabase/supabase-js";
import {
  formatMusicTranscodeWorkerEnvLog,
  redactMusicTranscodeWorkerSecrets,
  requireMusicTranscodeWorkerEnv,
} from "../src/lib/music-transcode/worker-env";
import { createMusicTranscodeWorker } from "../src/lib/music-transcode/worker";
import {
  MUSIC_TRANSCODE_HEARTBEAT_INTERVAL_MS as CONTRACT_HEARTBEAT,
  MUSIC_TRANSCODE_IDLE_INTERVAL_MS as CONTRACT_IDLE,
  MUSIC_TRANSCODE_SHUTDOWN_DRAIN_MS as CONTRACT_DRAIN,
} from "../src/lib/music-transcode/contract";
import {
  captureMusicTranscodeBootRelease,
  compareMusicTranscodeRelease,
  formatMusicTranscodeWorkerBootLog,
} from "../src/lib/music-transcode/worker-release";
import { createMusicTranscodeWorkerPort } from "../src/lib/music-transcode/worker-runtime";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const presence = requireMusicTranscodeWorkerEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("music_transcode_worker_environment_missing");
  }
  console.log(formatMusicTranscodeWorkerEnvLog("music_transcode_env_ready", presence));
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const port = createMusicTranscodeWorkerPort(service);
  const boot = await captureMusicTranscodeBootRelease();
  const bootComparison = await compareMusicTranscodeRelease({ boot });
  console.log(formatMusicTranscodeWorkerBootLog(bootComparison));
  const worker = createMusicTranscodeWorker(port, {
    idleIntervalMs: envNumber("MUSIC_TRANSCODE_IDLE_INTERVAL_MS", CONTRACT_IDLE),
    heartbeatIntervalMs: envNumber("MUSIC_TRANSCODE_HEARTBEAT_INTERVAL_MS", CONTRACT_HEARTBEAT),
    shutdownDrainMs: envNumber("MUSIC_TRANSCODE_SHUTDOWN_DRAIN_MS", CONTRACT_DRAIN),
    checkRelease: () => compareMusicTranscodeRelease({ boot }),
  });

  const onSignal = (signal: NodeJS.Signals) => {
    console.log(JSON.stringify({ event: "music_transcode_shutdown_signal", signal }));
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
  console.error("music-transcode-worker:", redactMusicTranscodeWorkerSecrets(raw));
  process.exitCode = 1;
});
