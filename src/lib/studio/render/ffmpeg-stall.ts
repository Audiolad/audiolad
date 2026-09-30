/**
 * FFmpeg stall watchdog types and progress parsing.
 * No Node I/O here so the Studio client can reuse the safe message.
 */

/** No encoded-position growth for this long means the FFmpeg child is stalled. */
export const STUDIO_RENDER_FFMPEG_STALL_MS = 10 * 60 * 1000;

export const STUDIO_RENDER_FFMPEG_STALLED_CODE = "ffmpeg_stalled";

export const STUDIO_RENDER_FFMPEG_STALLED_MESSAGE =
  "Создание MP3 остановилось. Исходники проекта сохранены — попробуйте создать MP3 ещё раз.";

const STUDIO_RENDER_EXPORT_FAILED_FALLBACK = "Не удалось создать MP3. Попробуйте ещё раз.";

export type StudioRenderFfmpegStallDetails = {
  elapsedMs: number;
  lastProgressUs: number | null;
  lastOutTime: string | null;
  expectedDurationSeconds: number | null;
  closeSignal: NodeJS.Signals | null;
};

export type StudioRenderFfmpegProgressSample = {
  positionUs: number | null;
  outTime: string | null;
};

export type StudioRenderFfmpegProgressState = {
  rest: string;
  outTimeUs: number | null;
  outTimeMs: number | null;
  outTimeNs: number | null;
  outTime: string | null;
};

export function createStudioRenderFfmpegProgressState(): StudioRenderFfmpegProgressState {
  return {
    rest: "",
    outTimeUs: null,
    outTimeMs: null,
    outTimeNs: null,
    outTime: null,
  };
}

function parseNonNegative(value: string): number | null {
  if (!value || value === "N/A") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** `HH:MM:SS.micro` → microseconds. A leading minus is FFmpeg's unknown time. */
export function parseStudioRenderFfmpegOutTime(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((part) => Number.isFinite(part))) return null;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1_000_000);
}

function sampleFromState(state: StudioRenderFfmpegProgressState): StudioRenderFfmpegProgressSample {
  let positionUs: number | null = null;
  if (state.outTimeUs != null) positionUs = state.outTimeUs;
  else if (state.outTimeNs != null) positionUs = Math.round(state.outTimeNs / 1000);
  else {
    const clock = parseStudioRenderFfmpegOutTime(state.outTime);
    positionUs = clock ?? state.outTimeMs;
  }
  return { positionUs, outTime: state.outTime };
}

/**
 * Incremental parser for FFmpeg `-progress` blocks. A sample is emitted when
 * a block ends with `progress=...`. Position prefers `out_time_us`.
 */
export function consumeStudioRenderFfmpegProgress(
  state: StudioRenderFfmpegProgressState,
  chunk: string,
): StudioRenderFfmpegProgressSample[] {
  const lines = `${state.rest}${chunk}`.split(/\r?\n/);
  state.rest = lines.pop() ?? "";
  if (state.rest.length > 65_536) state.rest = "";
  const samples: StudioRenderFfmpegProgressSample[] = [];
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === "out_time_us") state.outTimeUs = parseNonNegative(value);
    else if (key === "out_time_ms") state.outTimeMs = parseNonNegative(value);
    else if (key === "out_time_ns") state.outTimeNs = parseNonNegative(value);
    else if (key === "out_time") state.outTime = value || null;
    else if (key === "progress") {
      samples.push(sampleFromState(state));
      state.outTimeUs = null;
      state.outTimeMs = null;
      state.outTimeNs = null;
      state.outTime = null;
    }
  }
  return samples;
}

/** True only when the encoded position moves forward. Zero and repeats do not count. */
export function studioRenderFfmpegProgressAdvanced(
  previousUs: number | null,
  nextUs: number | null,
): boolean {
  if (nextUs == null || !Number.isFinite(nextUs) || nextUs <= 0) return false;
  if (previousUs == null) return true;
  return nextUs > previousUs;
}

export function studioRenderExportErrorMessage(job: {
  error_code?: string | null;
  error_message_safe?: string | null;
}): string {
  const safe = job.error_message_safe?.trim() ?? "";
  if (safe) return safe;
  if (job.error_code === STUDIO_RENDER_FFMPEG_STALLED_CODE) {
    return STUDIO_RENDER_FFMPEG_STALLED_MESSAGE;
  }
  return STUDIO_RENDER_EXPORT_FAILED_FALLBACK;
}
