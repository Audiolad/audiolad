/**
 * Music Passport backfill for AudioLad Business authors (29.10.2026, Sergey).
 *
 * Default is a DRY RUN: reads the DB and prints counts per project only.
 * Nothing is enqueued unless BOTH --execute and
 * MUSIC_PASSPORT_BACKFILL_EXECUTE=1 are given, plus an explicit --authors
 * slug allowlist (each slug must be a verified-rights Business author).
 *
 *   # counts only (safe):
 *   nice -n 10 npx tsx scripts/music-passport-backfill.mts --dry-run [--authors a,b] [--max-duration-sec 1200]
 *   # one throttled tick (cron every 2 min, night window 00:00–07:00 MSK):
 *   MUSIC_PASSPORT_BACKFILL_EXECUTE=1 nice -n 10 npx tsx scripts/music-passport-backfill.mts \
 *     --execute --authors a,b --window 00:00-07:00 --max-inflight 1
 *   # or a supervised loop around the clock (only into an empty analyzer queue):
 *   … --execute --authors a,b --exclude-projects c --loop --interval 60 --window=always --max-inflight 1
 *
 * Scope: --authors is a project (author) slug allowlist; --exclude-projects
 * removes projects from it (exclusion wins). Any slug in either list that is
 * not a verified Business author aborts the run.
 *
 * Throttle: enqueues only while the global analyzer queue (queued+processing,
 * all sources) is below --max-inflight (default 1 = only when empty).
 * Idempotent/resumable: state is re-read from the DB every tick.
 * Stop switch: touch the --stop-file (default
 * /var/tmp/audiolad-music-passport-backfill.STOP) – checked before every enqueue.
 * Album passports: built by the analyzer worker hook after a product's last track.
 */
import { closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { createClient } from "@supabase/supabase-js";

import { requireMusicAnalyzerWorkerEnv } from "../src/lib/music-analyzer-runs/worker-env";
import {
  BackfillArgsError,
  decideBackfillTick,
  estimateBackfillHours,
  MUSIC_PASSPORT_BACKFILL_EXECUTE_ENV,
  orderBackfillCandidates,
  parseBackfillArgs,
  resolveBackfillScope,
  summarizeBackfill,
  type BackfillArgs,
  type BackfillProjectSummary,
} from "../src/lib/music-passport/backfill-plan";
import {
  countGlobalAnalyzerInflight,
  loadBackfillSnapshot,
  loadVerifiedBusinessAuthors,
} from "../src/lib/music-passport/backfill.server";
import { enqueueJazzRelaxTrackForBackfill } from "../src/lib/music-passport/jazz-relax-pilot";

type State = { enqueueErrors: Record<string, { code: string; at: string }> };

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...data }));
}

function readState(path: string): State {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<State>;
    return { enqueueErrors: parsed.enqueueErrors ?? {} };
  } catch {
    return { enqueueErrors: {} };
  }
}

function writeState(path: string, state: State) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

function acquireLock(path: string): () => void {
  try {
    const fd = openSync(path, "wx");
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
  } catch {
    const pid = Number(readFileSync(path, "utf8").trim());
    let alive = false;
    try { if (pid > 0) { process.kill(pid, 0); alive = true; } } catch { alive = false; }
    if (alive) throw new Error("music_passport_backfill_already_running");
    unlinkSync(path);
    return acquireLock(path);
  }
  return () => { try { unlinkSync(path); } catch { /* already gone */ } };
}

function mib(bytes: number): string {
  return (bytes / 1048576).toFixed(1);
}

function printSummary(title: string, rows: BackfillProjectSummary[], total: BackfillProjectSummary, json: boolean) {
  if (json) {
    log("music_passport_backfill_summary", { title, rows, total, estimateHoursAt72s: estimateBackfillHours(total.counts.candidate) });
    return;
  }
  console.log(`\n${title}`);
  console.log("slug | project | products | tracks | has_passport | in_flight | to_enqueue | prev_failed | blocked(missing/preparing/prepare_failed/>100MiB/too_long) | to_enqueue_MiB");
  for (const row of [...rows, total]) {
    const c = row.counts;
    console.log([
      row.slug, row.name, row.products, row.tracks, c.has_passport, c.in_flight + c.succeeded_unmaterialized, c.candidate,
      c.previously_failed + c.enqueue_error,
      `${c.blocked_missing_audio}/${c.blocked_preparing}/${c.blocked_prepare_failed}/${c.blocked_file_too_large}/${c.blocked_too_long}`,
      mib(row.candidateBytes),
    ].join(" | "));
  }
  console.log(`estimate: ${total.counts.candidate} tracks × 72 s ≈ ${estimateBackfillHours(total.counts.candidate)} h of analyzer time`);
}

async function main(args: BackfillArgs) {
  requireMusicAnalyzerWorkerEnv();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verified = await loadVerifiedBusinessAuthors(db);
  const scope = resolveBackfillScope({
    verifiedAuthors: verified,
    allowlist: args.authors,
    exclude: args.excludeAuthors,
    requireAllowlist: args.execute,
  });
  if (!scope.ok) {
    log("music_passport_backfill_scope_rejected", { error: scope.error, slugs: scope.slugs });
    process.exitCode = 2;
    return;
  }
  log("music_passport_backfill_scope", {
    mode: args.execute ? "execute" : "dry_run",
    inScope: scope.authors.map((author) => author.slug),
    excludedProjects: args.excludeAuthors,
    window: args.window === "any" ? "always" : args.window,
    maxInflight: args.maxInflight,
    maxDurationSec: args.maxDurationSeconds,
  });
  const release = args.execute ? acquireLock(`${args.stateFile}.lock`) : () => {};
  let stopping = false;
  const onSignal = () => { stopping = true; };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  try {
    let budget = args.maxPerRun;
    let enqueued = 0;
    for (;;) {
      const state = readState(args.stateFile);
      const enqueueErrors = args.retryErrors ? new Set<string>() : new Set(Object.keys(state.enqueueErrors));
      const snapshot = await loadBackfillSnapshot(db, [...scope.authors, ...scope.excludedVerified]);
      const summary = summarizeBackfill({ authors: scope.authors, tracks: snapshot.tracks, retryFailed: args.retryFailed, enqueueErrors, maxDurationSeconds: args.maxDurationSeconds });
      if (!args.execute) {
        if (!args.json && args.maxDurationSeconds !== null) {
          console.log(`max duration: ${args.maxDurationSeconds} s (longer tracks are not enqueued)`);
        }
        printSummary("In scope", summary.projects, summary.total, args.json);
        if (scope.excludedVerified.length > 0) {
          const excluded = summarizeBackfill({ authors: scope.excludedVerified, tracks: snapshot.tracks, maxDurationSeconds: args.maxDurationSeconds });
          printSummary("Verified Business authors NOT in scope (--authors / --exclude-projects; never enqueued)", excluded.projects, excluded.total, args.json);
        }
        log("music_passport_backfill_dry_run_done", { mode: "dry_run", enqueued: 0 });
        return;
      }
      const candidates = orderBackfillCandidates({
        authors: scope.authors,
        tracks: snapshot.tracks,
        practiceOrder: snapshot.practiceOrder,
        maxDurationSeconds: args.maxDurationSeconds,
        retryFailed: args.retryFailed,
        enqueueErrors,
      });
      const decision = decideBackfillTick({
        execute: args.execute,
        executeEnvSet: process.env[MUSIC_PASSPORT_BACKFILL_EXECUTE_ENV] === "1",
        stopRequested: stopping || existsSync(args.stopFile),
        now: new Date(),
        window: args.window,
        globalInflight: await countGlobalAnalyzerInflight(db),
        maxInflight: args.maxInflight,
        perTick: args.perTick,
        remainingBudget: budget,
        candidates,
      });
      log("music_passport_backfill_tick", {
        decision: decision.action === "enqueue" ? "enqueue" : decision.reason,
        remaining: candidates.length,
        enqueuedThisRun: enqueued,
      });
      if (decision.action === "enqueue") {
        const owners = new Map(scope.authors.map((author) => [author.id, author.ownerUserId]));
        for (const track of decision.tracks) {
          if (stopping || existsSync(args.stopFile)) break;
          try {
            const result = await enqueueJazzRelaxTrackForBackfill({
              practiceId: track.practiceId,
              audioItemId: track.audioItemId,
              userId: owners.get(track.authorId) as string,
              retryFailed: args.retryFailed,
            });
            log("music_passport_backfill_track", { audioItemId: track.audioItemId, practiceId: track.practiceId, ...result });
            if (result.outcome === "enqueued") { enqueued += 1; budget -= 1; }
          } catch (error) {
            const code = error instanceof Error ? error.message.slice(0, 120) : "unknown";
            state.enqueueErrors[track.audioItemId] = { code, at: new Date().toISOString() };
            writeState(args.stateFile, state);
            log("music_passport_backfill_track_error", { audioItemId: track.audioItemId, practiceId: track.practiceId, code });
          }
        }
      }
      const terminal = decision.action === "wait"
        && (decision.reason === "done" || decision.reason === "stop_file"
          || decision.reason === "execute_env_missing" || decision.reason === "per_run_budget_spent");
      if (!args.loop || terminal || stopping || budget <= 0) break;
      await delay(args.intervalSeconds * 1000);
      if (stopping) break;
    }
    log("music_passport_backfill_run_done", { enqueued });
  } finally {
    release();
  }
}

let parsed: BackfillArgs;
try {
  parsed = parseBackfillArgs(process.argv.slice(2));
} catch (error) {
  if (error instanceof BackfillArgsError) {
    console.error(error.message);
    process.exit(2);
  }
  throw error;
}
main(parsed).catch((error) => {
  log("music_passport_backfill_failed", { code: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
  process.exitCode = 1;
});
