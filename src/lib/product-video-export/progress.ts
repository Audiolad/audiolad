/**
 * Real MP4 render progress from FFmpeg `-progress` blocks.
 * Percent is position / audio duration, clamped to 0–99 until the job completes.
 */

export const PRODUCT_VIDEO_PROGRESS_WRITE_MIN_INTERVAL_MS = 1_000;

export type ProductVideoRenderStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "superseded";

export type ProductVideoFfmpegProgressState = {
  rest: string;
  outTimeUs: number | null;
  outTime: string | null;
};

export type ProductVideoRenderStatusView = {
  label: string;
  percent: number | null;
  showBar: boolean;
  animate: boolean;
};

export function createProductVideoFfmpegProgressState(): ProductVideoFfmpegProgressState {
  return { rest: "", outTimeUs: null, outTime: null };
}

function parseNonNegative(value: string): number | null {
  if (!value || value === "N/A") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** `HH:MM:SS.micro` → microseconds. A leading minus is FFmpeg's unknown time. */
export function parseProductVideoOutTimeUs(value: string | null): number | null {
  if (!value || value.startsWith("-")) return null;
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((part) => Number.isFinite(part))) return null;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1_000_000);
}

function positionUsFromState(state: ProductVideoFfmpegProgressState): number | null {
  if (state.outTimeUs != null) return state.outTimeUs;
  return parseProductVideoOutTimeUs(state.outTime);
}

/**
 * Incremental parser for FFmpeg `-progress` blocks.
 * A sample is emitted when a block ends with `progress=...`.
 * Position prefers `out_time_us`. `out_time_ms` is ignored: FFmpeg has
 * historically printed microseconds under that name.
 */
export function consumeProductVideoFfmpegProgress(
  state: ProductVideoFfmpegProgressState,
  chunk: string,
): Array<{ positionUs: number | null }> {
  const lines = `${state.rest}${chunk}`.split(/\r?\n/);
  state.rest = lines.pop() ?? "";
  if (state.rest.length > 65_536) state.rest = "";
  const samples: Array<{ positionUs: number | null }> = [];
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === "out_time_us") state.outTimeUs = parseNonNegative(value);
    else if (key === "out_time") state.outTime = value || null;
    else if (key === "progress") {
      samples.push({ positionUs: positionUsFromState(state) });
      state.outTimeUs = null;
      state.outTime = null;
    }
  }
  return samples;
}

/** Floor of encoded position / audio duration, clamped to 0–99. */
export function productVideoPercentFromProgress(
  positionUs: number,
  durationUs: number,
): number | null {
  if (!Number.isFinite(durationUs) || durationUs <= 0) return null;
  if (!Number.isFinite(positionUs) || positionUs < 0) return null;
  const raw = Math.floor((positionUs / durationUs) * 100);
  if (raw < 0) return 0;
  return Math.min(99, raw);
}

function normalizeStoredPercent(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 99) return null;
  return rounded;
}

export function productVideoRenderStatusView(input: {
  status: ProductVideoRenderStatus;
  stale: boolean;
  progressPercent: number | null;
}): ProductVideoRenderStatusView {
  if (input.stale || input.status === "superseded") {
    return {
      label: "Нужно пересоздать",
      percent: null,
      showBar: false,
      animate: false,
    };
  }
  if (input.status === "queued") {
    return {
      label: "В очереди",
      percent: null,
      showBar: false,
      animate: false,
    };
  }
  if (input.status === "completed") {
    return {
      label: "Готово",
      percent: 100,
      showBar: true,
      animate: true,
    };
  }
  if (input.status === "failed") {
    const frozen = normalizeStoredPercent(input.progressPercent);
    return {
      label: "Ошибка",
      percent: frozen,
      showBar: frozen != null,
      animate: false,
    };
  }
  const percent = normalizeStoredPercent(input.progressPercent);
  if (percent == null) {
    return {
      label: "Создаётся…",
      percent: null,
      showBar: false,
      animate: false,
    };
  }
  return {
    label: "Создаётся",
    percent,
    showBar: true,
    animate: true,
  };
}

type ScheduledCallback = { cancel: () => void };

/**
 * Forwards a monotonic 0–99 percent to storage.
 * The first value is written immediately; later values are coalesced so the
 * worker does not update the row on every FFmpeg progress block.
 */
export function createProductVideoProgressPersister(options: {
  minIntervalMs: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => ScheduledCallback;
  write: (percent: number) => void | Promise<void>;
}): { note: (percent: number) => void; settle: () => Promise<void> } {
  const now = options.now ?? (() => Date.now());
  const schedule =
    options.schedule ??
    ((callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      return { cancel: () => clearTimeout(timer) };
    });
  let lastPersisted: number | null = null;
  let lastAt: number | null = null;
  let pending: number | null = null;
  let timer: ScheduledCallback | null = null;
  let chain: Promise<void> = Promise.resolve();

  const enqueueWrite = (percent: number) => {
    if (lastPersisted != null && percent <= lastPersisted) return;
    lastPersisted = percent;
    lastAt = now();
    chain = chain.then(() => options.write(percent)).then(
      () => undefined,
      () => undefined,
    );
  };

  const flushPending = () => {
    timer = null;
    const next = pending;
    pending = null;
    if (next == null) return;
    enqueueWrite(next);
  };

  return {
    note(raw: number) {
      if (!Number.isFinite(raw)) return;
      const percent = Math.floor(raw);
      if (percent < 0 || percent > 99) return;
      if (lastPersisted != null && percent <= lastPersisted) return;
      const at = now();
      if (lastAt == null || at - lastAt >= options.minIntervalMs) {
        if (timer) {
          timer.cancel();
          timer = null;
          pending = null;
        }
        enqueueWrite(percent);
        return;
      }
      pending = pending == null ? percent : Math.max(pending, percent);
      if (timer) return;
      const wait = Math.max(0, options.minIntervalMs - (at - lastAt));
      timer = schedule(flushPending, wait);
    },
    async settle() {
      if (timer) {
        timer.cancel();
        timer = null;
      }
      if (pending != null) {
        const next = pending;
        pending = null;
        enqueueWrite(next);
      }
      await chain;
    },
  };
}
