/**
 * Music Passport backfill (29.10.2026, Sergey): pure planning for
 * scripts/music-passport-backfill.mts. No I/O here – the server loader
 * builds a snapshot from the DB, this module decides what to do with it.
 *
 * Scope: only authors (projects) whose owner account is admitted into
 * AudioLad Business (business_rightsholder_verifications.status = verified,
 * account level), further narrowed to an explicit slug allowlist so a newly
 * verified account is never picked up without the owner's say-so.
 *
 * Idempotent and resumable: every tick re-derives state from the DB, so a
 * track with an active passport or a queued/processing run is never
 * enqueued again, and a stopped run simply continues on the next tick.
 */
import { MUSIC_ANALYZER_MAX_UPLOAD_BYTES } from "@/lib/music-analyzer-runs/constants";

export const MUSIC_PASSPORT_BACKFILL_TIME_ZONE = "Europe/Moscow";
export const MUSIC_PASSPORT_BACKFILL_DEFAULT_WINDOW = "00:00-07:00";
export const MUSIC_PASSPORT_BACKFILL_DEFAULT_STOP_FILE = "/var/tmp/audiolad-music-passport-backfill.STOP";
export const MUSIC_PASSPORT_BACKFILL_DEFAULT_STATE_FILE = "/var/tmp/audiolad-music-passport-backfill.state.json";
/** Env guard for --execute, on top of the CLI flag. */
export const MUSIC_PASSPORT_BACKFILL_EXECUTE_ENV = "MUSIC_PASSPORT_BACKFILL_EXECUTE";
/** Observed analyzer cost per track on the Moscow worker (concurrency 1). */
export const MUSIC_PASSPORT_BACKFILL_SECONDS_PER_TRACK = 72;

export type BackfillRunStatus = "queued" | "processing" | "succeeded" | "failed";

export type BackfillTrackInput = {
  audioItemId: string;
  practiceId: string;
  authorId: string;
  /** Album order inside the product. */
  position: number | null;
  /** Any active music_passport_versions row, or the latest run produced one. */
  hasPassport: boolean;
  latestRunStatus: BackfillRunStatus | null;
  /** practice_audio | music_master | missing (resolved like the wizard does). */
  source: "practice_audio" | "music_master" | "missing";
  sizeBytes: number | null;
  /** Effective duration of the analysis source. */
  durationSeconds: number | null;
  prepareInFlight: boolean;
  prepareFailed: boolean;
};

export type BackfillTrackClass =
  | "has_passport"
  | "in_flight"
  | "succeeded_unmaterialized"
  | "previously_failed"
  | "enqueue_error"
  | "blocked_missing_audio"
  | "blocked_preparing"
  | "blocked_prepare_failed"
  | "blocked_too_long"
  | "blocked_file_too_large"
  | "candidate";

export function classifyBackfillTrack(
  track: BackfillTrackInput,
  options: { retryFailed?: boolean; enqueueErrors?: ReadonlySet<string>; maxDurationSeconds?: number | null } = {},
): BackfillTrackClass {
  if (track.hasPassport) return "has_passport";
  if (track.latestRunStatus === "queued" || track.latestRunStatus === "processing") return "in_flight";
  // The worker hook / next status read materializes it; never re-run.
  if (track.latestRunStatus === "succeeded") return "succeeded_unmaterialized";
  if (track.source === "missing") return "blocked_missing_audio";
  if (track.prepareInFlight) return "blocked_preparing";
  if (track.prepareFailed) return "blocked_prepare_failed";
  if (typeof track.sizeBytes === "number" && track.sizeBytes > MUSIC_ANALYZER_MAX_UPLOAD_BYTES) {
    return "blocked_file_too_large";
  }
  if (typeof options.maxDurationSeconds === "number" && options.maxDurationSeconds > 0
    && typeof track.durationSeconds === "number" && track.durationSeconds > options.maxDurationSeconds) {
    return "blocked_too_long";
  }
  if (track.latestRunStatus === "failed" && !options.retryFailed) return "previously_failed";
  if (options.enqueueErrors?.has(track.audioItemId)) return "enqueue_error";
  return "candidate";
}

export type BackfillAuthor = {
  id: string;
  slug: string;
  name: string;
  ownerUserId: string;
};

export type BackfillScope =
  | { ok: true; authors: BackfillAuthor[]; excludedVerified: BackfillAuthor[] }
  | {
      ok: false;
      error: "authors_allowlist_required" | "author_not_verified" | "exclude_not_verified" | "scope_empty";
      slugs: string[];
    };

function normalizeSlugs(list: readonly string[] | null | undefined): string[] {
  return [...new Set((list ?? []).map((slug) => slug.trim()).filter(Boolean))];
}

/**
 * Narrow verified Business authors to the slug allowlist, minus the explicit
 * project exclusions (exclusion wins over the allowlist). Fails closed: an
 * allowlisted or excluded slug that is not a verified-rights author aborts
 * the run (a typo must never silently widen or keep the scope).
 */
export function resolveBackfillScope(input: {
  verifiedAuthors: readonly BackfillAuthor[];
  allowlist: readonly string[] | null;
  exclude?: readonly string[] | null;
  requireAllowlist: boolean;
}): BackfillScope {
  const slugs = normalizeSlugs(input.allowlist);
  const excludeSlugs = normalizeSlugs(input.exclude);
  if (slugs.length === 0 && input.requireAllowlist) {
    return { ok: false, error: "authors_allowlist_required", slugs: [] };
  }
  const bySlug = new Map(input.verifiedAuthors.map((author) => [author.slug, author]));
  const unknown = slugs.filter((slug) => !bySlug.has(slug));
  if (unknown.length > 0) return { ok: false, error: "author_not_verified", slugs: unknown };
  const unknownExcluded = excludeSlugs.filter((slug) => !bySlug.has(slug));
  if (unknownExcluded.length > 0) return { ok: false, error: "exclude_not_verified", slugs: unknownExcluded };
  const excluded = new Set(excludeSlugs);
  const allowed = new Set(slugs.length > 0 ? slugs : input.verifiedAuthors.map((author) => author.slug));
  const inScope = (author: BackfillAuthor) => allowed.has(author.slug) && !excluded.has(author.slug);
  const authors = sortAuthors(input.verifiedAuthors.filter(inScope));
  if (authors.length === 0) return { ok: false, error: "scope_empty", slugs: excludeSlugs };
  return {
    ok: true,
    authors,
    excludedVerified: sortAuthors(input.verifiedAuthors.filter((author) => !inScope(author))),
  };
}

function sortAuthors(authors: readonly BackfillAuthor[]): BackfillAuthor[] {
  return [...authors].sort((a, b) => a.slug.localeCompare(b.slug));
}

export type BackfillProjectSummary = {
  slug: string;
  name: string;
  products: number;
  tracks: number;
  counts: Record<BackfillTrackClass, number>;
  candidateBytes: number;
};

function emptyCounts(): Record<BackfillTrackClass, number> {
  return {
    has_passport: 0,
    in_flight: 0,
    succeeded_unmaterialized: 0,
    previously_failed: 0,
    enqueue_error: 0,
    blocked_missing_audio: 0,
    blocked_preparing: 0,
    blocked_prepare_failed: 0,
    blocked_file_too_large: 0,
    blocked_too_long: 0,
    candidate: 0,
  };
}

export function summarizeBackfill(input: {
  authors: readonly BackfillAuthor[];
  tracks: readonly BackfillTrackInput[];
  retryFailed?: boolean;
  enqueueErrors?: ReadonlySet<string>;
  maxDurationSeconds?: number | null;
}): { projects: BackfillProjectSummary[]; total: BackfillProjectSummary } {
  const total: BackfillProjectSummary = {
    slug: "*",
    name: "TOTAL",
    products: 0,
    tracks: 0,
    counts: emptyCounts(),
    candidateBytes: 0,
  };
  const projects = input.authors.map((author) => {
    const own = input.tracks.filter((track) => track.authorId === author.id);
    const summary: BackfillProjectSummary = {
      slug: author.slug,
      name: author.name,
      products: new Set(own.map((track) => track.practiceId)).size,
      tracks: own.length,
      counts: emptyCounts(),
      candidateBytes: 0,
    };
    for (const track of own) {
      const kind = classifyBackfillTrack(track, input);
      summary.counts[kind] += 1;
      if (kind === "candidate") summary.candidateBytes += Math.max(0, track.sizeBytes ?? 0);
    }
    total.products += summary.products;
    total.tracks += summary.tracks;
    total.candidateBytes += summary.candidateBytes;
    for (const key of Object.keys(summary.counts) as BackfillTrackClass[]) {
      total.counts[key] += summary.counts[key];
    }
    return summary;
  });
  return { projects, total };
}

/**
 * Deterministic order: author slug → product → album position. Finishing one
 * product before the next lets the worker hook assemble album passports early.
 */
export function orderBackfillCandidates(input: {
  authors: readonly BackfillAuthor[];
  tracks: readonly BackfillTrackInput[];
  practiceOrder: ReadonlyMap<string, number>;
  retryFailed?: boolean;
  enqueueErrors?: ReadonlySet<string>;
  maxDurationSeconds?: number | null;
}): BackfillTrackInput[] {
  const authorRank = new Map(sortAuthors(input.authors).map((author, index) => [author.id, index]));
  return input.tracks
    .filter((track) => authorRank.has(track.authorId))
    .filter((track) => classifyBackfillTrack(track, input) === "candidate")
    .sort((a, b) => (
      (authorRank.get(a.authorId) ?? 0) - (authorRank.get(b.authorId) ?? 0)
      || (input.practiceOrder.get(a.practiceId) ?? 0) - (input.practiceOrder.get(b.practiceId) ?? 0)
      || a.practiceId.localeCompare(b.practiceId)
      || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
      || a.audioItemId.localeCompare(b.audioItemId)
    ));
}

export type BackfillWindow = { startMinute: number; endMinute: number } | "any";

export function parseBackfillWindow(raw: string): BackfillWindow | null {
  const value = raw.trim().toLowerCase();
  // Around the clock (29.10.2026, Sergey): the window is disabled entirely.
  if (value === "always" || value === "any" || value === "24h" || value === "off") return "any";
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [h1, m1, h2, m2] = match.slice(1).map(Number);
  if ([h1, h2].some((h) => h > 24) || [m1, m2].some((m) => m > 59)) return null;
  const startMinute = h1 * 60 + m1;
  const endMinute = h2 * 60 + m2;
  if (startMinute === endMinute || startMinute > 1440 || endMinute > 1440) return null;
  return { startMinute, endMinute };
}

/** Minute of the day in Europe/Moscow. */
export function moscowMinuteOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MUSIC_PASSPORT_BACKFILL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function insideBackfillWindow(now: Date, window: BackfillWindow): boolean {
  if (window === "any") return true;
  const minute = moscowMinuteOfDay(now);
  if (window.startMinute < window.endMinute) {
    return minute >= window.startMinute && minute < window.endMinute;
  }
  return minute >= window.startMinute || minute < window.endMinute;
}

export type BackfillTickDecision =
  | { action: "enqueue"; tracks: BackfillTrackInput[] }
  | {
      action: "wait";
      reason:
        | "dry_run"
        | "stop_file"
        | "execute_env_missing"
        | "outside_window"
        | "queue_busy"
        | "per_run_budget_spent"
        | "done";
    };

/**
 * Throttle: enqueue only while the global analyzer queue (queued+processing,
 * every source, not just the backfill) is below maxInflight. The default of
 * 1 means "only when the queue is empty", so authors' own runs always go first.
 */
export function decideBackfillTick(input: {
  execute: boolean;
  executeEnvSet: boolean;
  stopRequested: boolean;
  now: Date;
  window: BackfillWindow;
  globalInflight: number;
  maxInflight: number;
  perTick: number;
  remainingBudget: number;
  candidates: readonly BackfillTrackInput[];
}): BackfillTickDecision {
  if (!input.execute) return { action: "wait", reason: "dry_run" };
  if (input.stopRequested) return { action: "wait", reason: "stop_file" };
  if (!input.executeEnvSet) return { action: "wait", reason: "execute_env_missing" };
  if (input.candidates.length === 0) return { action: "wait", reason: "done" };
  if (input.remainingBudget <= 0) return { action: "wait", reason: "per_run_budget_spent" };
  if (!insideBackfillWindow(input.now, input.window)) return { action: "wait", reason: "outside_window" };
  const free = Math.max(0, Math.floor(input.maxInflight) - Math.max(0, input.globalInflight));
  if (free <= 0) return { action: "wait", reason: "queue_busy" };
  const take = Math.min(free, Math.max(1, Math.floor(input.perTick)), input.remainingBudget);
  return { action: "enqueue", tracks: input.candidates.slice(0, take) };
}

export function estimateBackfillHours(tracks: number, secondsPerTrack = MUSIC_PASSPORT_BACKFILL_SECONDS_PER_TRACK): number {
  return Math.round(((tracks * secondsPerTrack) / 3600) * 10) / 10;
}

export type BackfillArgs = {
  execute: boolean;
  authors: string[] | null;
  /** Project (author) slugs never enqueued, even if listed in --authors. */
  excludeAuthors: string[];
  window: BackfillWindow;
  maxInflight: number;
  maxDurationSeconds: number | null;
  perTick: number;
  maxPerRun: number;
  loop: boolean;
  intervalSeconds: number;
  retryFailed: boolean;
  retryErrors: boolean;
  stopFile: string;
  stateFile: string;
  json: boolean;
};

export class BackfillArgsError extends Error {}

function positiveInt(name: string, raw: string | undefined, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new BackfillArgsError(`${name} must be an integer 1..${max}`);
  }
  return value;
}

/** Default is a dry run. --execute is the only way to enqueue anything. */
export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  const args: BackfillArgs = {
    execute: false,
    authors: null,
    excludeAuthors: [],
    window: parseBackfillWindow(MUSIC_PASSPORT_BACKFILL_DEFAULT_WINDOW) as BackfillWindow,
    maxInflight: 1,
    maxDurationSeconds: null,
    perTick: 1,
    maxPerRun: 1,
    loop: false,
    intervalSeconds: 60,
    retryFailed: false,
    retryErrors: false,
    stopFile: MUSIC_PASSPORT_BACKFILL_DEFAULT_STOP_FILE,
    stateFile: MUSIC_PASSPORT_BACKFILL_DEFAULT_STATE_FILE,
    json: false,
  };
  let explicitMaxPerRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => {
      const next = inline ?? argv[++index];
      if (next === undefined || next === "") throw new BackfillArgsError(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case "--dry-run": args.execute = false; break;
      case "--execute": args.execute = true; break;
      case "--authors": args.authors = value().split(",").map((slug) => slug.trim()).filter(Boolean); break;
      case "--exclude-projects":
      case "--exclude-authors":
        args.excludeAuthors = [...args.excludeAuthors, ...value().split(",").map((slug) => slug.trim()).filter(Boolean)];
        break;
      case "--window": {
        const parsed = parseBackfillWindow(value());
        if (!parsed) throw new BackfillArgsError("--window must be HH:MM-HH:MM (Europe/Moscow) or always");
        args.window = parsed;
        break;
      }
      case "--max-duration-sec": args.maxDurationSeconds = positiveInt(flag, value(), 86400); break;
      case "--max-inflight": args.maxInflight = positiveInt(flag, value(), 4); break;
      case "--per-tick": args.perTick = positiveInt(flag, value(), 4); break;
      case "--max-per-run": args.maxPerRun = positiveInt(flag, value(), 1000); explicitMaxPerRun = true; break;
      case "--loop": args.loop = true; break;
      case "--interval": args.intervalSeconds = positiveInt(flag, value(), 3600); break;
      case "--retry-failed": args.retryFailed = true; break;
      case "--retry-errors": args.retryErrors = true; break;
      case "--stop-file": args.stopFile = value(); break;
      case "--state-file": args.stateFile = value(); break;
      case "--json": args.json = true; break;
      default: throw new BackfillArgsError(`unknown argument ${flag}`);
    }
  }
  if (args.loop && !explicitMaxPerRun) args.maxPerRun = 1000;
  if (args.execute && (!args.authors || args.authors.length === 0)) {
    throw new BackfillArgsError("--execute requires --authors slug1,slug2,…");
  }
  return args;
}
