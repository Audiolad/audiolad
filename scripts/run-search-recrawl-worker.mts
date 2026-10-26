/**
 * Long-lived audiolad.ru recrawl worker. PM2 keeps one process running
 * (`autorestart: true`, no cron_restart). It sleeps about five minutes
 * between cycles. Public page loads do not start it.
 *
 * Production env comes from cwd `.env.production` via Next.js `@next/env`.
 * Do not put secrets in the PM2 ecosystem file.
 */
import { createClient } from "@supabase/supabase-js";

import { runSupabaseSearchRecrawlCycle } from "../src/lib/seo/search-recrawl/supabase-cycle";
import { SEARCH_RECRAWL_INTERVAL_MS } from "../src/lib/seo/search-recrawl/policy";
import {
  bootstrapSearchRecrawlWorkerEnv,
  formatSearchRecrawlWorkerEnvLog,
  redactSearchRecrawlSecrets,
} from "../src/lib/seo/search-recrawl/worker-env";
import {
  captureSearchRecrawlBootRelease,
  compareSearchRecrawlRelease,
} from "../src/lib/seo/search-recrawl/worker-release";

const stop = { stopped: false };

function intervalMs(): number {
  const raw = Number(process.env.SEARCH_RECRAWL_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 60_000) {
    return raw;
  }

  return SEARCH_RECRAWL_INTERVAL_MS;
}

function sleep(ms: number): Promise<void> {
  const step = 1000;
  let left = ms;

  return new Promise((resolve) => {
    const tick = () => {
      if (stop.stopped || left <= 0) {
        resolve();
        return;
      }

      const wait = Math.min(step, left);
      left -= wait;
      setTimeout(tick, wait);
    };

    tick();
  });
}

async function main() {
  const presence = bootstrapSearchRecrawlWorkerEnv();

  if (!presence.hasSupabaseUrl || !presence.hasServiceRoleKey) {
    throw new Error("search_recrawl_worker_environment_missing");
  }

  console.info(formatSearchRecrawlWorkerEnvLog(presence));

  const bootRelease = await captureSearchRecrawlBootRelease();
  console.info(
    `[search-recrawl] ${new Date().toISOString()} worker_boot`,
    {
      bootReleasePath: bootRelease.path,
      bootSha: bootRelease.sha,
    },
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const once = process.env.SEARCH_RECRAWL_ONCE === "1";

  do {
    const release = await compareSearchRecrawlRelease({ boot: bootRelease });

    if (release.state === "STALE") {
      console.info(
        `[search-recrawl] ${new Date().toISOString()} release_mismatch`,
        {
          bootSha: release.bootSha,
          currentSha: release.currentSha,
        },
      );
      break;
    }

    if (release.state === "UNKNOWN") {
      console.error(
        `[search-recrawl] ${new Date().toISOString()} release_guard_unavailable`,
        { reason: release.reason ?? "unknown" },
      );

      if (once || stop.stopped) {
        break;
      }

      await sleep(intervalMs());
      continue;
    }

    try {
      await runSupabaseSearchRecrawlCycle(supabase);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "unknown_error";
      console.error(
        `[search-recrawl] ${new Date().toISOString()} cycle_failed`,
        redactSearchRecrawlSecrets(raw),
      );
    }

    if (once || stop.stopped) {
      break;
    }

    await sleep(intervalMs());
  } while (!stop.stopped);
}

process.on("SIGTERM", () => {
  stop.stopped = true;
});
process.on("SIGINT", () => {
  stop.stopped = true;
});

void main().catch((error) => {
  const raw = error instanceof Error ? error.message : "unknown_error";
  console.error("search-recrawl-worker:", redactSearchRecrawlSecrets(raw));
  process.exitCode = 1;
});
