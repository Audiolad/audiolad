// t1485u: queue loop of the automatic Shazam check (PM2 audiolad-business-shazam-worker).
// Pure orchestration over an injected port so it is unit-testable without network, ffmpeg or DB.
// Never approves a passport: the only passport effect is complete_business_shazam_check('no_match').
import {
  SHAZAM_MAX_JOB_ATTEMPTS,
  SHAZAM_MAX_SKEW,
  SHAZAM_MIN_REQUEST_GAP_MS,
  SHAZAM_RATE_LIMIT_RETRIES,
  classifyShazamSegments,
  planShazamSegments,
  shazamJobRetryDelaySeconds,
  shazamRateLimitBackoffMs,
  type ShazamHelperOutput,
  type ShazamSegmentPlan,
  type ShazamSegmentResult,
} from './shazam';

export type ShazamClaimedJob = {
  id: string;
  audio_item_id: string;
  master_asset_id: string;
  attempts: number;
};

export type ShazamMasterInfo = {
  storageBucket: string;
  storagePath: string;
  durationSeconds: number | null;
  passportStatus: string | null;
};

export type ShazamPreparedAudio = {
  workDir: string;
  durationSeconds: number;
  segments: { plan: ShazamSegmentPlan; path: string }[];
};

export type ShazamCompleteOutcome = 'no_match' | 'match' | 'error' | 'skipped' | 'retry';

export type ShazamWorkerPort = {
  available: () => Promise<{ ok: true; libraryVersion: string | null } | { ok: false; reason: string }>;
  claim: () => Promise<ShazamClaimedJob | null>;
  loadMaster: (job: ShazamClaimedJob) => Promise<ShazamMasterInfo | null>;
  /** Downloads the master to a private temp dir and cuts the planned segments with ffmpeg. */
  prepare: (job: ShazamClaimedJob, master: ShazamMasterInfo, plan: (duration: number) => ShazamSegmentPlan[]) => Promise<ShazamPreparedAudio>;
  /** Deletes all audio of the job. Always called once prepare() created a work dir. */
  cleanup: (workDir: string) => Promise<void>;
  recognize: (segmentPath: string, maxSkew: number) => Promise<ShazamHelperOutput>;
  complete: (input: {
    job: ShazamClaimedJob;
    outcome: ShazamCompleteOutcome;
    segments: ShazamSegmentResult[];
    libraryVersion: string | null;
    error: string | null;
    retryAfterSeconds?: number;
  }) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (event: Record<string, unknown>) => void;
};

export type ShazamJobState = { lastRequestAt: number | null; stopping: () => boolean };

const MOSCOW_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

export function moscowTimestamp(ms: number): string {
  return `${MOSCOW_TIME.format(new Date(ms))} MSK`;
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? 'unknown_error');
  return text.slice(0, 300);
}

async function waitForGap(port: ShazamWorkerPort, state: ShazamJobState) {
  if (state.lastRequestAt === null) return;
  const wait = state.lastRequestAt + SHAZAM_MIN_REQUEST_GAP_MS - port.now();
  if (wait > 0) await port.sleep(wait);
}

async function recognizeWithBackoff(
  port: ShazamWorkerPort,
  state: ShazamJobState,
  job: ShazamClaimedJob,
  plan: ShazamSegmentPlan,
  path: string,
): Promise<{ result: ShazamSegmentResult; libraryVersion: string | null; rateLimitedOut: boolean }> {
  let retries = 0;
  for (;;) {
    await waitForGap(port, state);
    const started = port.now();
    const output = await port.recognize(path, SHAZAM_MAX_SKEW).catch((error: unknown): ShazamHelperOutput => ({
      ok: false, library_version: null, matched: null, title: null, artist: null, timeskew: null, frequencyskew: null,
      rejected_title: null, rejected_artist: null, rejected_timeskew: null, rejected_frequencyskew: null,
      rate_limited: false, error: errorText(error),
    }));
    const finished = port.now();
    state.lastRequestAt = finished;
    if (output.rate_limited && retries < SHAZAM_RATE_LIMIT_RETRIES && !state.stopping()) {
      const backoff = shazamRateLimitBackoffMs(retries);
      retries += 1;
      port.log({ event: 'business_shazam_rate_limited', checkId: job.id, segment: plan.label, retry: retries, backoffMs: backoff });
      await port.sleep(backoff);
      continue;
    }
    const result: ShazamSegmentResult = {
      label: plan.label,
      offset_seconds: plan.offsetSeconds,
      duration_seconds: plan.durationSeconds,
      started_at: new Date(started).toISOString(),
      finished_at: new Date(finished).toISOString(),
      elapsed_ms: Math.max(0, finished - started),
      matched: output.ok ? output.matched === true : null,
      title: output.title,
      artist: output.artist,
      timeskew: output.timeskew,
      frequencyskew: output.frequencyskew,
      rejected_title: output.rejected_title,
      rejected_artist: output.rejected_artist,
      rejected_timeskew: output.rejected_timeskew,
      rejected_frequencyskew: output.rejected_frequencyskew,
      rate_limit_retries: retries,
      error: output.ok ? null : (output.error ?? 'helper_failed'),
    };
    port.log({
      event: 'business_shazam_segment',
      checkId: job.id,
      audioItemId: job.audio_item_id,
      libraryVersion: output.library_version,
      segment: plan.label,
      offsetSeconds: plan.offsetSeconds,
      durationSeconds: plan.durationSeconds,
      startedAt: moscowTimestamp(started),
      finishedAt: moscowTimestamp(finished),
      elapsedMs: result.elapsed_ms,
      matched: result.matched,
      timeskew: result.timeskew,
      frequencyskew: result.frequencyskew,
      rejectedTimeskew: result.rejected_timeskew,
      rejectedFrequencyskew: result.rejected_frequencyskew,
      rateLimitRetries: retries,
      error: result.error,
    });
    return { result, libraryVersion: output.library_version, rateLimitedOut: output.rate_limited };
  }
}

function retryOrFail(job: ShazamClaimedJob): { outcome: 'retry' | 'error'; retryAfterSeconds?: number } {
  if (job.attempts >= SHAZAM_MAX_JOB_ATTEMPTS) return { outcome: 'error' };
  return { outcome: 'retry', retryAfterSeconds: shazamJobRetryDelaySeconds(job.attempts) };
}

export async function processShazamJob(
  port: ShazamWorkerPort,
  job: ShazamClaimedJob,
  state: ShazamJobState,
  libraryVersion: string | null,
): Promise<ShazamCompleteOutcome> {
  const startedAt = port.now();
  port.log({ event: 'business_shazam_job_start', checkId: job.id, audioItemId: job.audio_item_id, attempt: job.attempts, libraryVersion, startedAt: moscowTimestamp(startedAt) });
  const finish = async (
    outcome: ShazamCompleteOutcome,
    segments: ShazamSegmentResult[],
    error: string | null,
    retryAfterSeconds?: number,
    version: string | null = libraryVersion,
  ) => {
    const response = await port.complete({ job, outcome, segments, libraryVersion: version, error, retryAfterSeconds });
    port.log({
      event: 'business_shazam_job_done', checkId: job.id, audioItemId: job.audio_item_id, outcome, error,
      libraryVersion: version, retryAfterSeconds: retryAfterSeconds ?? null, response,
      finishedAt: moscowTimestamp(port.now()), elapsedMs: port.now() - startedAt,
    });
    return outcome;
  };

  if (job.attempts > SHAZAM_MAX_JOB_ATTEMPTS) return finish('error', [], 'too_many_attempts');
  let master: ShazamMasterInfo | null;
  try {
    master = await port.loadMaster(job);
  } catch (error) {
    const next = retryOrFail(job);
    return finish(next.outcome, [], `master_lookup_failed: ${errorText(error)}`, next.retryAfterSeconds);
  }
  if (!master) return finish('skipped', [], 'master_missing');
  if (master.passportStatus === 'approved' || master.passportStatus === 'revoked') {
    return finish('skipped', [], 'passport_not_draft');
  }

  let prepared: ShazamPreparedAudio | null = null;
  try {
    try {
      prepared = await port.prepare(job, master, planShazamSegments);
    } catch (error) {
      const next = retryOrFail(job);
      return await finish(next.outcome, [], `prepare_failed: ${errorText(error)}`, next.retryAfterSeconds);
    }
    const results: ShazamSegmentResult[] = [];
    let version = libraryVersion;
    for (const segment of prepared.segments) {
      if (state.stopping()) {
        return await finish('retry', results, 'worker_shutdown', 30, version);
      }
      const { result, libraryVersion: segmentVersion, rateLimitedOut } = await recognizeWithBackoff(port, state, job, segment.plan, segment.path);
      version = segmentVersion ?? version;
      results.push(result);
      if (rateLimitedOut) {
        const next = retryOrFail(job);
        return await finish(next.outcome, results, 'rate_limited', next.retryAfterSeconds, version);
      }
    }
    const outcome = classifyShazamSegments(results);
    if (outcome === 'error') {
      const next = retryOrFail(job);
      const firstError = results.find((r) => r.error)?.error ?? 'segment_missing';
      return await finish(next.outcome, results, firstError, next.retryAfterSeconds, version);
    }
    return await finish(outcome, results, null, undefined, version);
  } finally {
    if (prepared?.workDir) {
      await port.cleanup(prepared.workDir).catch((error: unknown) => {
        port.log({ event: 'business_shazam_cleanup_failed', checkId: job.id, error: errorText(error) });
      });
    }
  }
}

export type ShazamReleaseCheck = () => Promise<{ state: 'CURRENT' | 'STALE' | 'UNKNOWN' }>;

export function createBusinessShazamWorker(port: ShazamWorkerPort, options: {
  idleIntervalMs: number;
  unavailableIntervalMs?: number;
  checkRelease?: ShazamReleaseCheck;
}) {
  let stopping = false;
  const state: ShazamJobState = { lastRequestAt: null, stopping: () => stopping };
  let lastUnavailable: string | null = null;
  async function runOnce(): Promise<'stale' | 'unavailable' | 'idle' | ShazamCompleteOutcome> {
    if (options.checkRelease) {
      const release = await options.checkRelease().catch(() => ({ state: 'UNKNOWN' as const }));
      if (release.state === 'STALE') return 'stale';
    }
    const available = await port.available();
    if (!available.ok) {
      if (available.reason !== lastUnavailable) {
        port.log({ event: 'business_shazam_unavailable', reason: available.reason });
        lastUnavailable = available.reason;
      }
      return 'unavailable';
    }
    lastUnavailable = null;
    const job = await port.claim();
    if (!job) return 'idle';
    return processShazamJob(port, job, state, available.libraryVersion);
  }
  async function run() {
    while (!stopping) {
      let step: Awaited<ReturnType<typeof runOnce>>;
      try {
        step = await runOnce();
      } catch (error) {
        port.log({ event: 'business_shazam_loop_error', error: errorText(error) });
        step = 'idle';
      }
      if (step === 'stale') {
        port.log({ event: 'business_shazam_release_stale_exit' });
        return;
      }
      if (step === 'idle') await port.sleep(options.idleIntervalMs);
      if (step === 'unavailable') await port.sleep(options.unavailableIntervalMs ?? 10 * 60_000);
    }
  }
  return {
    requestShutdown() { stopping = true; },
    isStopping() { return stopping; },
    runOnce,
    run,
  };
}
