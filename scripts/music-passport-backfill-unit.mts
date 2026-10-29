import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BackfillArgsError,
  classifyBackfillTrack,
  decideBackfillTick,
  estimateBackfillHours,
  insideBackfillWindow,
  orderBackfillCandidates,
  parseBackfillArgs,
  parseBackfillWindow,
  resolveBackfillScope,
  summarizeBackfill,
  type BackfillAuthor,
  type BackfillTrackInput,
  type BackfillWindow,
} from "../src/lib/music-passport/backfill-plan";
import { jazzRelaxTrackEnqueueKind } from "../src/lib/music-passport/jazz-relax-status";

const read = (path: string) => readFileSync(path, "utf8");

// --- Duplicate-job guard: no action stacks a job on a queued/processing run.
for (const action of ["start", "retry", "reanalyze"] as const) {
  for (const runStatus of ["queued", "processing"] as const) {
    for (const hasPassport of [false, true]) {
      assert.equal(jazzRelaxTrackEnqueueKind({ action, runStatus, hasPassport }), "skip", `${action}/${runStatus}`);
    }
  }
}
assert.equal(jazzRelaxTrackEnqueueKind({ action: "reanalyze", runStatus: "succeeded", hasPassport: true }), "enqueue");
assert.equal(jazzRelaxTrackEnqueueKind({ action: "reanalyze", runStatus: "failed", hasPassport: false }), "enqueue");
assert.equal(jazzRelaxTrackEnqueueKind({ action: "reanalyze", runStatus: null, hasPassport: false }), "enqueue");
assert.equal(jazzRelaxTrackEnqueueKind({ action: "retry", runStatus: "failed", hasPassport: false }), "enqueue");
assert.equal(jazzRelaxTrackEnqueueKind({ action: "start", runStatus: null, hasPassport: false }), "enqueue");
assert.equal(jazzRelaxTrackEnqueueKind({ action: "start", runStatus: "succeeded", hasPassport: true }), "compare");

// --- Fixtures
const authors: BackfillAuthor[] = [
  { id: "a-jazz", slug: "jazz-relax", name: "Джаз Релакс", ownerUserId: "u-1" },
  { id: "a-lara", slug: "lara-larina", name: "Лара Ларина", ownerUserId: "u-2" },
  { id: "a-new", slug: "liniya-dnya", name: "Линия дня", ownerUserId: "u-3" },
];
function track(id: string, patch: Partial<BackfillTrackInput> = {}): BackfillTrackInput {
  return {
    audioItemId: id,
    practiceId: "p-1",
    authorId: "a-jazz",
    position: 1,
    hasPassport: false,
    latestRunStatus: null,
    source: "practice_audio",
    sizeBytes: 10 * 1048576,
    durationSeconds: null,
    prepareInFlight: false,
    prepareFailed: false,
    ...patch,
  };
}

// --- Classification (idempotency)
assert.equal(classifyBackfillTrack(track("t")), "candidate");
assert.equal(classifyBackfillTrack(track("t", { source: "music_master" })), "candidate");
assert.equal(classifyBackfillTrack(track("t", { hasPassport: true })), "has_passport");
assert.equal(classifyBackfillTrack(track("t", { hasPassport: true, latestRunStatus: "queued" })), "has_passport");
assert.equal(classifyBackfillTrack(track("t", { latestRunStatus: "queued" })), "in_flight");
assert.equal(classifyBackfillTrack(track("t", { latestRunStatus: "processing" })), "in_flight");
assert.equal(classifyBackfillTrack(track("t", { latestRunStatus: "succeeded" })), "succeeded_unmaterialized");
assert.equal(classifyBackfillTrack(track("t", { latestRunStatus: "failed" })), "previously_failed");
assert.equal(classifyBackfillTrack(track("t", { latestRunStatus: "failed" }), { retryFailed: true }), "candidate");
assert.equal(classifyBackfillTrack(track("t", { source: "missing" })), "blocked_missing_audio");
assert.equal(classifyBackfillTrack(track("t", { prepareInFlight: true })), "blocked_preparing");
assert.equal(classifyBackfillTrack(track("t", { prepareFailed: true })), "blocked_prepare_failed");
assert.equal(classifyBackfillTrack(track("t", { sizeBytes: 100 * 1048576 })), "candidate");
assert.equal(classifyBackfillTrack(track("t", { sizeBytes: 100 * 1048576 + 1 })), "blocked_file_too_large");
assert.equal(classifyBackfillTrack(track("t"), { enqueueErrors: new Set(["t"]) }), "enqueue_error");

// --- Duration limits affect only new enqueues; equal/unknown durations remain candidates.
const durationLimit = { maxDurationSeconds: 1200 };
assert.equal(classifyBackfillTrack(track("t", { durationSeconds: 1201 }), durationLimit), "blocked_too_long");
assert.equal(classifyBackfillTrack(track("t", { durationSeconds: 1200 }), durationLimit), "candidate");
assert.equal(classifyBackfillTrack(track("t", { durationSeconds: null }), durationLimit), "candidate");
assert.equal(classifyBackfillTrack(track("t", { durationSeconds: 3600 })), "candidate");
assert.equal(classifyBackfillTrack(track("t", { durationSeconds: 3600 }), { maxDurationSeconds: null }), "candidate");
assert.equal(classifyBackfillTrack(track("t", { durationSeconds: 3600 }), { maxDurationSeconds: 0 }), "candidate");
assert.equal(classifyBackfillTrack(track("t", { durationSeconds: 3600, hasPassport: true }), durationLimit), "has_passport");
for (const latestRunStatus of ["queued", "processing", "succeeded"] as const) {
  assert.equal(classifyBackfillTrack(track("t", { durationSeconds: 3600, latestRunStatus }), durationLimit),
    latestRunStatus === "succeeded" ? "succeeded_unmaterialized" : "in_flight");
}
assert.equal(classifyBackfillTrack(track("t", { durationSeconds: 3600, sizeBytes: 150 * 1048576 }), durationLimit), "blocked_file_too_large");

// --- Scope: Business-verified authors narrowed to an explicit allowlist, fail closed.
assert.deepEqual(resolveBackfillScope({ verifiedAuthors: authors, allowlist: null, requireAllowlist: true }),
  { ok: false, error: "authors_allowlist_required", slugs: [] });
const unknown = resolveBackfillScope({ verifiedAuthors: authors, allowlist: ["jazz-relax", "someone-else"], requireAllowlist: true });
assert.deepEqual(unknown, { ok: false, error: "author_not_verified", slugs: ["someone-else"] });
const scoped = resolveBackfillScope({ verifiedAuthors: authors, allowlist: ["lara-larina", "jazz-relax", "jazz-relax"], requireAllowlist: true });
assert.equal(scoped.ok, true);
if (scoped.ok) {
  assert.deepEqual(scoped.authors.map((a) => a.slug), ["jazz-relax", "lara-larina"]);
  assert.deepEqual(scoped.excludedVerified.map((a) => a.slug), ["liniya-dnya"]);
}
const dryAll = resolveBackfillScope({ verifiedAuthors: authors, allowlist: null, requireAllowlist: false });
assert.equal(dryAll.ok && dryAll.authors.length, 3);

// --- Project-level exclusion (29.10.2026: «Орий» stays out), exclusion wins, fail closed.
const withOrij: BackfillAuthor[] = [...authors, { id: "a-orij", slug: "orij", name: "Орий", ownerUserId: "u-1" }];
const noOrij = resolveBackfillScope({
  verifiedAuthors: withOrij,
  allowlist: ["jazz-relax", "orij", "liniya-dnya"],
  exclude: ["orij", " orij "],
  requireAllowlist: true,
});
assert.equal(noOrij.ok, true);
if (noOrij.ok) {
  assert.deepEqual(noOrij.authors.map((a) => a.slug), ["jazz-relax", "liniya-dnya"]);
  assert.deepEqual(noOrij.excludedVerified.map((a) => a.slug), ["lara-larina", "orij"]);
}
assert.deepEqual(
  resolveBackfillScope({ verifiedAuthors: withOrij, allowlist: ["jazz-relax"], exclude: ["orjj"], requireAllowlist: true }),
  { ok: false, error: "exclude_not_verified", slugs: ["orjj"] },
);
assert.deepEqual(
  resolveBackfillScope({ verifiedAuthors: withOrij, allowlist: ["orij", "not-business"], exclude: ["orij"], requireAllowlist: true }),
  { ok: false, error: "author_not_verified", slugs: ["not-business"] },
  "an unverified slug still aborts even next to an exclusion",
);
assert.deepEqual(
  resolveBackfillScope({ verifiedAuthors: withOrij, allowlist: ["orij"], exclude: ["orij"], requireAllowlist: true }),
  { ok: false, error: "scope_empty", slugs: ["orij"] },
);
assert.deepEqual(
  resolveBackfillScope({ verifiedAuthors: withOrij, allowlist: null, exclude: ["orij"], requireAllowlist: true }),
  { ok: false, error: "authors_allowlist_required", slugs: [] },
);
const dryNoOrij = resolveBackfillScope({ verifiedAuthors: withOrij, allowlist: null, exclude: ["orij"], requireAllowlist: false });
assert.equal(dryNoOrij.ok && dryNoOrij.authors.some((a) => a.slug === "orij"), false);
assert.equal(dryNoOrij.ok && dryNoOrij.authors.length, 3);
const orijTracks = [track("o-1", { authorId: "a-orij", practiceId: "p-9" }), track("j-1")];
if (noOrij.ok) {
  const ordered = orderBackfillCandidates({ authors: noOrij.authors, tracks: orijTracks, practiceOrder: new Map() });
  assert.deepEqual(ordered.map((t) => t.audioItemId), ["j-1"], "excluded project is never enqueued");
}

// --- Summary + order
const tracks: BackfillTrackInput[] = [
  track("j-p2-1", { practiceId: "p-2", position: 1 }),
  track("j-p1-2", { practiceId: "p-1", position: 2, sizeBytes: 3 * 1048576 }),
  track("j-p1-1", { practiceId: "p-1", position: 1 }),
  track("j-done", { practiceId: "p-1", position: 3, hasPassport: true }),
  track("j-run", { practiceId: "p-1", position: 4, latestRunStatus: "processing" }),
  track("l-1", { authorId: "a-lara", practiceId: "p-3", position: 1 }),
  track("l-big", { authorId: "a-lara", practiceId: "p-3", position: 2, sizeBytes: 150 * 1048576 }),
  track("n-1", { authorId: "a-new", practiceId: "p-4", position: 1 }),
];
const inScope = scoped.ok ? scoped.authors : [];
const summary = summarizeBackfill({ authors: inScope, tracks });
assert.equal(summary.projects[0]?.slug, "jazz-relax");
assert.equal(summary.projects[0]?.products, 2);
assert.equal(summary.projects[0]?.tracks, 5);
assert.equal(summary.projects[0]?.counts.candidate, 3);
assert.equal(summary.projects[0]?.counts.has_passport, 1);
assert.equal(summary.projects[0]?.counts.in_flight, 1);
assert.equal(summary.projects[0]?.candidateBytes, 23 * 1048576);
assert.equal(summary.projects[1]?.counts.blocked_file_too_large, 1);
assert.equal(summary.total.counts.candidate, 4);
assert.equal(summary.total.tracks, 7, "excluded author never counted in scope");
const order = orderBackfillCandidates({
  authors: inScope,
  tracks,
  practiceOrder: new Map([["p-1", 0], ["p-2", 1], ["p-3", 2], ["p-4", 3]]),
});
assert.deepEqual(order.map((t) => t.audioItemId), ["j-p1-1", "j-p1-2", "j-p2-1", "l-1"]);
assert.equal(order.some((t) => t.authorId === "a-new"), false);

const durationTracks = tracks.map((t) => t.audioItemId === "j-p1-2" ? { ...t, durationSeconds: 1201 } : t);
const durationOrder = orderBackfillCandidates({
  authors: inScope,
  tracks: durationTracks,
  practiceOrder: new Map([["p-1", 0], ["p-2", 1], ["p-3", 2], ["p-4", 3]]),
  ...durationLimit,
});
assert.deepEqual(durationOrder.map((t) => t.audioItemId), ["j-p1-1", "j-p2-1", "l-1"]);
const durationSummary = summarizeBackfill({ authors: inScope, tracks: durationTracks, ...durationLimit });
assert.equal(durationSummary.projects[0]?.counts.blocked_too_long, 1);
assert.equal(durationSummary.projects[0]?.candidateBytes, 20 * 1048576);
assert.equal(durationSummary.total.counts.blocked_too_long, 1);
assert.equal(durationSummary.total.counts.candidate, 3);
assert.equal(durationSummary.total.candidateBytes, summary.total.candidateBytes - 3 * 1048576);

// --- Night window in Europe/Moscow (UTC+3)
const night = parseBackfillWindow("00:00-07:00") as BackfillWindow;
assert.equal(insideBackfillWindow(new Date("2026-10-29T21:00:00Z"), night), true); // 00:00 MSK
assert.equal(insideBackfillWindow(new Date("2026-10-30T03:59:00Z"), night), true); // 06:59 MSK
assert.equal(insideBackfillWindow(new Date("2026-10-30T04:00:00Z"), night), false); // 07:00 MSK
assert.equal(insideBackfillWindow(new Date("2026-10-29T20:59:00Z"), night), false); // 23:59 MSK
const wrap = parseBackfillWindow("23:00-06:00") as BackfillWindow;
assert.equal(insideBackfillWindow(new Date("2026-10-29T20:30:00Z"), wrap), true); // 23:30 MSK
assert.equal(insideBackfillWindow(new Date("2026-10-29T12:00:00Z"), wrap), false);
assert.equal(parseBackfillWindow("any"), "any");
assert.equal(parseBackfillWindow("7-8"), null);
assert.equal(parseBackfillWindow("05:00-05:00"), null);

// --- Tick decision: dry run, stop switch, env guard, window, queue throttle.
const base = {
  execute: true,
  executeEnvSet: true,
  stopRequested: false,
  now: new Date("2026-10-29T22:00:00Z"),
  window: night,
  globalInflight: 0,
  maxInflight: 1,
  perTick: 1,
  remainingBudget: 10,
  candidates: order,
};
assert.deepEqual(decideBackfillTick({ ...base, execute: false }), { action: "wait", reason: "dry_run" });
assert.deepEqual(decideBackfillTick({ ...base, stopRequested: true }), { action: "wait", reason: "stop_file" });
assert.deepEqual(decideBackfillTick({ ...base, executeEnvSet: false }), { action: "wait", reason: "execute_env_missing" });
assert.deepEqual(decideBackfillTick({ ...base, now: new Date("2026-10-29T09:00:00Z") }), { action: "wait", reason: "outside_window" });
assert.deepEqual(decideBackfillTick({ ...base, globalInflight: 1 }), { action: "wait", reason: "queue_busy" });
assert.deepEqual(decideBackfillTick({ ...base, candidates: [] }), { action: "wait", reason: "done" });
assert.deepEqual(decideBackfillTick({ ...base, remainingBudget: 0 }), { action: "wait", reason: "per_run_budget_spent" });
const one = decideBackfillTick(base);
assert.equal(one.action === "enqueue" && one.tracks.map((t) => t.audioItemId).join(), "j-p1-1");
const two = decideBackfillTick({ ...base, maxInflight: 3, globalInflight: 1, perTick: 4 });
assert.equal(two.action === "enqueue" && two.tracks.length, 2);

// --- Args: dry run by default; --execute needs an allowlist.
const defaults = parseBackfillArgs([]);
assert.equal(defaults.execute, false);
assert.equal(defaults.maxInflight, 1);
assert.equal(defaults.maxPerRun, 1);
assert.deepEqual(defaults.window, night);
assert.throws(() => parseBackfillArgs(["--execute"]), BackfillArgsError);
assert.throws(() => parseBackfillArgs(["--bogus"]), BackfillArgsError);
assert.throws(() => parseBackfillArgs(["--max-inflight", "0"]), BackfillArgsError);
const exec = parseBackfillArgs(["--execute", "--authors=jazz-relax,lara-larina", "--window", "any", "--loop"]);
assert.equal(exec.execute, true);
assert.deepEqual(exec.authors, ["jazz-relax", "lara-larina"]);
assert.equal(exec.window, "any");
assert.equal(exec.maxPerRun, 1000);
assert.equal(parseBackfillArgs(["--execute", "--dry-run", "--authors", "x"]).execute, false);

assert.equal(parseBackfillArgs([]).maxDurationSeconds, null);
assert.equal(parseBackfillArgs(["--max-duration-sec", "1200"]).maxDurationSeconds, 1200);
assert.equal(parseBackfillArgs(["--max-duration-sec=1200"]).maxDurationSeconds, 1200);
assert.equal(parseBackfillArgs(["--max-duration-sec=86400"]).maxDurationSeconds, 86400);
for (const raw of ["0", "-5", "1.5", "abc", "86401"]) {
  assert.throws(() => parseBackfillArgs(["--max-duration-sec", raw]), BackfillArgsError, raw);
  assert.throws(() => parseBackfillArgs([`--max-duration-sec=${raw}`]), BackfillArgsError, raw);
}
assert.throws(() => parseBackfillArgs(["--max-duration-sec"]), BackfillArgsError);

assert.equal(estimateBackfillHours(518), 10.4);

// --exclude-projects / --exclude-authors (repeatable, comma list) and --window=always.
const scoped643 = parseBackfillArgs([
  "--execute", "--authors=jazz-relax,orij,liniya-dnya", "--exclude-projects=orij", "--exclude-authors", "x,y",
  "--window=always", "--max-inflight", "1", "--loop",
]);
assert.deepEqual(scoped643.excludeAuthors, ["orij", "x", "y"]);
assert.equal(scoped643.window, "any");
assert.equal(scoped643.maxInflight, 1);
assert.deepEqual(parseBackfillArgs([]).excludeAuthors, []);
assert.throws(() => parseBackfillArgs(["--exclude-projects"]), BackfillArgsError);
assert.throws(() => parseBackfillArgs(["--window", "sometimes"]), BackfillArgsError);
for (const raw of ["always", "ALWAYS", "off", "any", "24h"]) assert.equal(parseBackfillWindow(raw), "any", raw);
// Around the clock: daytime MSK is not "outside_window", but the empty-queue throttle still holds.
const always = parseBackfillWindow("always") as BackfillWindow;
for (const iso of ["2026-10-29T09:00:00Z", "2026-10-29T15:30:00Z", "2026-10-29T21:00:00Z"]) {
  assert.equal(insideBackfillWindow(new Date(iso), always), true, iso);
  assert.equal(decideBackfillTick({ ...base, window: always, now: new Date(iso) }).action, "enqueue", iso);
  assert.deepEqual(decideBackfillTick({ ...base, window: always, now: new Date(iso), globalInflight: 1 }), { action: "wait", reason: "queue_busy" });
}
assert.equal(estimateBackfillHours(639), 12.8);



// --- Source guards
const pilot = read("src/lib/music-passport/jazz-relax-pilot.ts");
const backfillFn = pilot.slice(pilot.indexOf("export async function enqueueJazzRelaxTrackForBackfill"), pilot.indexOf("export function jazzRelaxPassportTrackBlock"));
assert.match(backfillFn, /await enqueueTrack\(/);
assert.doesNotMatch(backfillFn, /insertAlbum|ensureJazzRelaxAlbumContinuation/);
assert.match(backfillFn, /\.eq\("status", "active"\)/);
const script = read("scripts/music-passport-backfill.mts");
assert.match(script, /MUSIC_PASSPORT_BACKFILL_EXECUTE_ENV\] === "1"/);
assert.match(script, /existsSync\(args\.stopFile\)/);
assert.match(script, /countGlobalAnalyzerInflight/);
assert.match(script, /exclude: args\.excludeAuthors/);
const server = read("src/lib/music-passport/backfill.server.ts");
assert.doesNotMatch(server, /\.(insert|update|upsert|delete|rpc)\(/, "snapshot loader is read-only");

console.log("music-passport-backfill unit: ok");
