/**
 * Long-lived Music Analyzer queue consumer. Production PM2 name is
 * audiolad-music-analyzer-worker via deploy/music-analyzer-worker.ecosystem.config.cjs.
 * Python runs on the same Timeweb VPS as audiolad.ru, from the pinned checkout.
 */
import { createClient } from "@supabase/supabase-js";

import {
  MUSIC_ANALYZER_HEARTBEAT_INTERVAL_MS,
  MUSIC_ANALYZER_IDLE_INTERVAL_MS,
  MUSIC_ANALYZER_SHUTDOWN_DRAIN_MS,
} from "../src/lib/music-analyzer-runs/constants";
import { createMusicAnalyzerWorker } from "../src/lib/music-analyzer-runs/worker";
import {
  formatMusicAnalyzerWorkerEnvLog,
  redactMusicAnalyzerWorkerSecrets,
  requireMusicAnalyzerWorkerEnv,
} from "../src/lib/music-analyzer-runs/worker-env";
import {
  captureMusicAnalyzerBootRelease,
  compareMusicAnalyzerRelease,
  formatMusicAnalyzerWorkerBootLog,
} from "../src/lib/music-analyzer-runs/worker-release";
import { createMusicAnalyzerWorkerPort } from "../src/lib/music-analyzer-runs/worker-runtime";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const presence = requireMusicAnalyzerWorkerEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("music_analyzer_worker_environment_missing");
  }
  console.log(formatMusicAnalyzerWorkerEnvLog("music_analyzer_env_ready", presence));
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const port = createMusicAnalyzerWorkerPort(service);
  const boot = await captureMusicAnalyzerBootRelease();
  const bootComparison = await compareMusicAnalyzerRelease({ boot });
  console.log(formatMusicAnalyzerWorkerBootLog(bootComparison));
  const worker = createMusicAnalyzerWorker(port, {
    idleIntervalMs: envNumber("MUSIC_ANALYZER_IDLE_INTERVAL_MS", MUSIC_ANALYZER_IDLE_INTERVAL_MS),
    heartbeatIntervalMs: envNumber("MUSIC_ANALYZER_HEARTBEAT_INTERVAL_MS", MUSIC_ANALYZER_HEARTBEAT_INTERVAL_MS),
    shutdownDrainMs: envNumber("MUSIC_ANALYZER_SHUTDOWN_DRAIN_MS", MUSIC_ANALYZER_SHUTDOWN_DRAIN_MS),
    checkRelease: () => compareMusicAnalyzerRelease({ boot }),
  });
  const onSignal = (signal: NodeJS.Signals) => {
    console.log(JSON.stringify({ event: "music_analyzer_shutdown_signal", signal }));
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
  console.error("music-analyzer-worker:", redactMusicAnalyzerWorkerSecrets(raw));
  process.exitCode = 1;
});
