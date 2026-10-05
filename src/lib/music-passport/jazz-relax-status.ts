import type { MusicAnalyzerPassport } from "@/lib/music-analyzer-runs/passport";
import type { AlbumPassportDisplay } from "@/lib/music-passport/album-passport-display";

export type JazzRelaxTrackState =
  | "missing_audio"
  | "not_ready"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

/** Track card for product mode. Provenance and raw JSON are not part of this payload. */
export type JazzRelaxProductTrackPassport = {
  filename: string;
  analyzedAt: string | null;
  passport: MusicAnalyzerPassport;
};

export type JazzRelaxPassportTrackView = {
  audioItemId: string;
  title: string;
  state: JazzRelaxTrackState;
  errorCode: string | null;
  passportVersionId: string | null;
  runId: string | null;
  productPassport: JazzRelaxProductTrackPassport | null;
};

export type JazzRelaxPassportView = {
  phase: "idle" | "running" | "partial" | "completed" | "failed";
  readyCount: number;
  totalCount: number;
  tracks: JazzRelaxPassportTrackView[];
  completedAlbumPassportVersionId: string | null;
  /** Frozen album row for this settled analysis. Null while a run is still in progress. */
  album: AlbumPassportDisplay | null;
  summary: string[];
  progressLabel: string;
  /**
   * True when this response copied fewer eligible masters than the album still needs.
   * The wizard repeats the request from `enqueueCursor` until this is false.
   */
  enqueueDeferred: boolean;
  /** Last master handled by this response. The next request resumes after it. */
  enqueueCursor: string | null;
};

/**
 * Heavy work inside one passport HTTP request: download a master, hash it, and
 * copy it into the analyzer bucket. Analysis itself stays on the worker.
 * One track per request keeps a 10-track album from holding the request open
 * for every WAV.
 */
export const JAZZ_RELAX_PASSPORT_ENQUEUE_BATCH_SIZE = 1;

/** Safety cap for the wizard continuation. Ten tracks need one request each. */
export const JAZZ_RELAX_PASSPORT_ENQUEUE_MAX_REQUESTS = 24;

export type JazzRelaxEnqueueKind = "skip" | "enqueue" | "compare";

export function jazzRelaxTrackEnqueueKind(input: {
  action: "start" | "retry" | "reanalyze";
  runStatus: "queued" | "processing" | "succeeded" | "failed" | null;
  hasPassport: boolean;
}): JazzRelaxEnqueueKind {
  if (input.action === "retry") {
    return input.runStatus === "failed" ? "enqueue" : "skip";
  }
  if (input.action === "start") {
    if (input.runStatus === "queued" || input.runStatus === "processing") return "skip";
    if (input.runStatus === "succeeded" && input.hasPassport) return "compare";
    return "enqueue";
  }
  return "enqueue";
}

export type JazzRelaxEnqueueCandidate = {
  audioItemId: string;
  kind: JazzRelaxEnqueueKind;
};

/**
 * Next slice of an album enqueue wave.
 * Skip does not consume the batch. The cursor moves only past handled tracks,
 * so repeating the call covers every enqueue/compare candidate. There is no
 * album-size cap.
 */
export function selectJazzRelaxPassportEnqueue(input: {
  candidates: readonly JazzRelaxEnqueueCandidate[];
  cursor: string | null;
  batchSize?: number;
}): {
  selected: JazzRelaxEnqueueCandidate[];
  deferred: boolean;
  cursor: string | null;
} {
  const requested = input.batchSize ?? JAZZ_RELAX_PASSPORT_ENQUEUE_BATCH_SIZE;
  const batchSize = Number.isInteger(requested) && requested > 0 ? Math.floor(requested) : 1;
  const cursorIndex = input.cursor
    ? input.candidates.findIndex((item) => item.audioItemId === input.cursor)
    : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const selected: JazzRelaxEnqueueCandidate[] = [];
  let deferred = false;
  let cursor = cursorIndex >= 0 ? input.cursor : null;
  for (let index = start; index < input.candidates.length; index += 1) {
    const candidate = input.candidates[index];
    if (!candidate || candidate.kind === "skip") continue;
    if (selected.length >= batchSize) {
      deferred = true;
      break;
    }
    selected.push(candidate);
    cursor = candidate.audioItemId;
  }
  return { selected, deferred, cursor };
}

export function jazzRelaxPassportEnqueueShouldContinue(input: {
  singleTrack: boolean;
  enqueueDeferred: boolean;
}): boolean {
  return !input.singleTrack && input.enqueueDeferred;
}

export function jazzRelaxProgressLabel(readyCount: number, totalCount: number): string {
  return `Музыкальный паспорт: ${readyCount} из ${totalCount} треков готовы`;
}

export function buildJazzRelaxPassportView(input: {
  tracks: JazzRelaxPassportTrackView[];
  completedAlbumPassportVersionId: string | null;
  album: AlbumPassportDisplay | null;
  summary: string[];
}): JazzRelaxPassportView {
  const totalCount = input.tracks.length;
  const readyCount = input.tracks.filter((track) => track.state === "ready").length;
  const running = input.tracks.some((track) => (
    track.state === "queued" || track.state === "processing"
  ));
  const failedCount = input.tracks.filter((track) => track.state === "failed").length;
  const blocked = input.tracks.some((track) => (
    track.state === "missing_audio" || track.state === "not_ready"
  ));
  let phase: JazzRelaxPassportView["phase"] = "idle";
  if (running) {
    phase = "running";
  } else if (totalCount > 0 && readyCount === totalCount && input.completedAlbumPassportVersionId) {
    phase = "completed";
  } else if (failedCount > 0 && !blocked) {
    phase = failedCount === totalCount ? "failed" : "partial";
  } else if (readyCount > 0 || failedCount > 0) {
    phase = "partial";
  }
  return {
    phase,
    readyCount,
    totalCount,
    tracks: input.tracks,
    completedAlbumPassportVersionId: input.completedAlbumPassportVersionId,
    album: input.album,
    summary: input.summary,
    progressLabel: jazzRelaxProgressLabel(readyCount, totalCount),
    enqueueDeferred: false,
    enqueueCursor: null,
  };
}
