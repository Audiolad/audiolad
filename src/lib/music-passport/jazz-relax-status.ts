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
  /**
   * idle — no accepted album command in progress.
   * preparing — the server has not yet queued every eligible track.
   * durable — every eligible track has a run row; the existing analyzer worker
   * owns whatever is still queued or processing.
   */
  albumLaunch: "idle" | "preparing" | "durable";
  /** True only while this server process is still copying masters into the queue. */
  launchInFlight: boolean;
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

export const JAZZ_RELAX_PASSPORT_CREATING_BUTTON_LABEL = "Создаём музыкальный паспорт…";
export const JAZZ_RELAX_PASSPORT_START_BUTTON_LABEL = "Сохранить и создать музыкальный паспорт";
export const JAZZ_RELAX_PASSPORT_NEXT_BUTTON_LABEL = "Перейти к оформлению";

export type JazzRelaxPassportActivityKind =
  | "saving"
  | "enqueueing"
  | "queued"
  | "analyzing"
  | "completed"
  | "partial"
  | "failed"
  | "stale"
  | "idle";

/** What the wizard may claim about the passport action. Counts are facts only. */
export type JazzRelaxPassportActivity = {
  kind: JazzRelaxPassportActivityKind;
  headline: string;
  /** Ready-track sentence. Null until that count is a fact worth showing. */
  readyLabel: string | null;
  /** Determinate bar of finished tracks. Null while the share is unknown. */
  progress: { ready: number; total: number } | null;
  indeterminate: boolean;
  buttonLabel: string;
  buttonDisabled: boolean;
  ariaBusy: boolean;
  /** Extra fact that is not the headline. Poll failure lives in the headline. */
  statusNotice: string | null;
  /** Set only when the whole album command is already in the durable analyzer queue. */
  closeHint: string | null;
};

export function jazzRelaxReadyTrackLabel(readyCount: number, totalCount: number): string {
  return `Готово ${readyCount} из ${totalCount} треков`;
}

function startButton(): Pick<
  JazzRelaxPassportActivity,
  "buttonLabel" | "buttonDisabled" | "ariaBusy"
> {
  return {
    buttonLabel: JAZZ_RELAX_PASSPORT_START_BUTTON_LABEL,
    buttonDisabled: false,
    ariaBusy: false,
  };
}

function creatingButton(): Pick<
  JazzRelaxPassportActivity,
  "buttonLabel" | "buttonDisabled" | "ariaBusy"
> {
  return {
    buttonLabel: JAZZ_RELAX_PASSPORT_CREATING_BUTTON_LABEL,
    buttonDisabled: true,
    ariaBusy: true,
  };
}

/**
 * Visible stages for the Jazz Relax step-2 action.
 * A spinner is allowed only while this client knows the stage from a fresh
 * fact: the click itself, the enqueue loop, or a successful status read.
 * A failed poll is stale, not proof that analysis is still running.
 */
export function describeJazzRelaxPassportActivity(input: {
  saving: boolean;
  enqueueing: boolean;
  status: Pick<
    JazzRelaxPassportView,
    "phase" | "readyCount" | "totalCount" | "tracks" | "albumLaunch" | "launchInFlight"
  > | null;
  pollFailed: boolean;
}): JazzRelaxPassportActivity {
  const quiet = { statusNotice: null, closeHint: null };
  if (input.saving) {
    return {
      kind: "saving",
      headline: "Сохраняем…",
      readyLabel: null,
      progress: null,
      indeterminate: true,
      ...quiet,
      ...creatingButton(),
    };
  }

  if (input.pollFailed) {
    const known = input.status && input.status.totalCount > 0
      ? `Последние данные: готово ${input.status.readyCount} из ${input.status.totalCount} треков`
      : null;
    return {
      kind: "stale",
      headline: "Не удаётся обновить статус",
      readyLabel: known,
      progress: null,
      indeterminate: false,
      statusNotice: null,
      closeHint: null,
      ...startButton(),
    };
  }

  const preparing = input.enqueueing || input.status?.albumLaunch === "preparing";
  if (preparing) {
    const busy = input.enqueueing || input.status?.launchInFlight === true;
    const progress = input.status && input.status.readyCount > 0 && input.status.totalCount > 0
      ? { ready: input.status.readyCount, total: input.status.totalCount }
      : null;
    return {
      kind: "enqueueing",
      headline: JAZZ_RELAX_PASSPORT_PREPARING_LABEL,
      readyLabel: progress ? jazzRelaxReadyTrackLabel(progress.ready, progress.total) : null,
      progress,
      indeterminate: busy && progress === null,
      ...quiet,
      ...(busy ? creatingButton() : startButton()),
    };
  }

  const status = input.status;
  if (!status) {
    return {
      kind: "idle",
      headline: "",
      readyLabel: null,
      progress: null,
      indeterminate: false,
      statusNotice: null,
      closeHint: null,
      ...startButton(),
    };
  }

  if (status.phase === "completed") {
    const progress = status.totalCount > 0
      ? { ready: status.readyCount, total: status.totalCount }
      : null;
    return {
      kind: "completed",
      headline: "",
      readyLabel: progress ? jazzRelaxReadyTrackLabel(progress.ready, progress.total) : null,
      progress,
      indeterminate: false,
      statusNotice: null,
      closeHint: null,
      buttonLabel: JAZZ_RELAX_PASSPORT_NEXT_BUTTON_LABEL,
      buttonDisabled: false,
      ariaBusy: false,
    };
  }

  if (status.phase === "running") {
    const processing = status.tracks.some((track) => track.state === "processing");
    const queued = status.tracks.some((track) => track.state === "queued");
    const confirmedAnalysis = processing || status.readyCount > 0;
    if (!confirmedAnalysis) {
      const durable = status.albumLaunch === "durable";
      return {
        kind: "queued",
        headline: durable ? "Музыкальный паспорт готовится" : "Треки в очереди",
        readyLabel: null,
        progress: null,
        indeterminate: !durable,
        statusNotice: durable ? "В очереди" : null,
        closeHint: durable ? JAZZ_RELAX_PASSPORT_SERVER_CONTINUATION_HINT : null,
        ...creatingButton(),
      };
    }
    const progress = status.totalCount > 0
      ? { ready: status.readyCount, total: status.totalCount }
      : null;
    let statusNotice: string | null = null;
    if (processing) statusNotice = "Анализируем";
    else if (queued) statusNotice = "В очереди";
    const durable = status.albumLaunch === "durable";
    return {
      kind: "analyzing",
      headline: "Музыкальный паспорт готовится",
      readyLabel: progress ? jazzRelaxReadyTrackLabel(progress.ready, progress.total) : null,
      progress,
      indeterminate: progress === null,
      statusNotice,
      closeHint: durable ? JAZZ_RELAX_PASSPORT_SERVER_CONTINUATION_HINT : null,
      ...creatingButton(),
    };
  }

  if (status.phase === "partial") {
    const progress = status.totalCount > 0
      ? { ready: status.readyCount, total: status.totalCount }
      : null;
    return {
      kind: "partial",
      headline: "Музыкальный паспорт готов частично",
      readyLabel: progress ? jazzRelaxReadyTrackLabel(progress.ready, progress.total) : null,
      progress,
      indeterminate: false,
      statusNotice: null,
      closeHint: null,
      ...startButton(),
    };
  }

  if (status.phase === "failed") {
    return {
      kind: "failed",
      headline: "Не удалось создать музыкальный паспорт",
      readyLabel: status.totalCount > 0
        ? jazzRelaxReadyTrackLabel(status.readyCount, status.totalCount)
        : null,
      progress: null,
      indeterminate: false,
      statusNotice: null,
      closeHint: null,
      ...startButton(),
    };
  }

  return {
    kind: "idle",
    headline: "",
    readyLabel: null,
    progress: null,
    indeterminate: false,
    statusNotice: null,
    ...startButton(),
  };
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
    albumLaunch: "idle",
    launchInFlight: false,
  };
}

export const JAZZ_RELAX_PASSPORT_PREPARING_LABEL = "Подготавливаем запуск…";

/** Shown only after every eligible track is already in the durable analyzer queue. */
export const JAZZ_RELAX_PASSPORT_SERVER_CONTINUATION_HINT =
  "Музыкальный паспорт формируется на сервере. Можно закрыть страницу и вернуться позже — процесс продолжится";

export function resolveJazzRelaxAlbumLaunch(input: {
  tracks: readonly Pick<JazzRelaxPassportTrackView, "state" | "errorCode">[];
  launchInFlight: boolean;
}): { albumLaunch: JazzRelaxPassportView["albumLaunch"]; launchInFlight: boolean } {
  const launchInFlight = input.launchInFlight;
  const blocked = input.tracks.some((track) => (
    track.state === "missing_audio"
    || (track.state === "not_ready" && track.errorCode !== "not_started")
  ));
  const notStarted = input.tracks.some((track) => (
    track.state === "not_ready" && track.errorCode === "not_started"
  ));
  const accepted = input.tracks.some((track) => (
    track.state === "queued"
    || track.state === "processing"
    || track.state === "ready"
    || track.state === "failed"
  ));
  const running = input.tracks.some((track) => (
    track.state === "queued" || track.state === "processing"
  ));
  if (launchInFlight || (notStarted && accepted) || (blocked && accepted)) {
    return { albumLaunch: "preparing", launchInFlight };
  }
  if (!blocked && !notStarted && running && input.tracks.length > 0) {
    return { albumLaunch: "durable", launchInFlight: false };
  }
  return { albumLaunch: "idle", launchInFlight: false };
}
