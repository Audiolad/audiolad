/**
 * t1523u: reconcile / one-off purge of redundant analyzer run copies.
 *
 * For each run id it applies the same rule as the analyzer worker hook
 * (src/lib/music-passport/analyzer-run-copy.ts): remove the run's object in
 * music-analyzer-runs only when the run succeeded, is linked to a product
 * passport and the track's current audio still hashes to the run's SHA256.
 * Deletion goes through the Supabase Storage API, never the volume.
 *
 * Default is a DRY RUN. Removal needs BOTH --apply and
 * MUSIC_ANALYZER_RUN_COPY_APPLY=1.
 *
 *   nice -n 10 npx tsx scripts/music-analyzer-run-copy-reconcile.mts --run-ids-file ids.txt
 *   MUSIC_ANALYZER_RUN_COPY_APPLY=1 nice -n 10 npx tsx scripts/music-analyzer-run-copy-reconcile.mts \
 *     --run-ids-file ids.txt --apply --sleep-ms 200
 *
 * Stop switch: touch /var/tmp/audiolad-run-copy-reconcile.STOP (checked per run).
 */
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import type { AnalyzerRunCopyOutcome } from "../src/lib/music-passport/analyzer-run-copy";
import { discardJazzRelaxAnalyzerRunCopy } from "../src/lib/music-passport/jazz-relax-pilot";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STOP_FILE = "/var/tmp/audiolad-run-copy-reconcile.STOP";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const file = arg("--run-ids-file");
  if (!file) throw new Error("--run-ids-file is required");
  const ids = readFileSync(file, "utf8").split(/\s+/).filter(Boolean);
  if (ids.some((id) => !UUID.test(id))) throw new Error("run_ids_file_invalid");
  const apply = process.argv.includes("--apply") && process.env.MUSIC_ANALYZER_RUN_COPY_APPLY === "1";
  const sleepMs = Math.max(0, Number(arg("--sleep-ms") ?? 200) || 0);
  const counts: Partial<Record<AnalyzerRunCopyOutcome, number>> = {};
  console.log(JSON.stringify({ event: "run_copy_reconcile_start", runs: ids.length, apply }));
  for (const id of ids) {
    if (existsSync(STOP_FILE)) {
      console.log(JSON.stringify({ event: "run_copy_reconcile_stopped" }));
      break;
    }
    const outcome = await discardJazzRelaxAnalyzerRunCopy(id, { dryRun: !apply });
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    console.log(JSON.stringify({ event: "run_copy", runId: id, outcome }));
    if (sleepMs) await delay(sleepMs);
  }
  console.log(JSON.stringify({ event: "run_copy_reconcile_done", apply, counts }));
}

void main().catch((error) => {
  console.error("run-copy-reconcile:", error instanceof Error ? error.message : "unknown_error");
  process.exitCode = 1;
});
