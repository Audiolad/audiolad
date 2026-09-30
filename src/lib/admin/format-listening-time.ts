import { formatAdminDelta } from "@/lib/admin/analytics-period";

/** Display trusted listened_ms. Hours drop seconds; under an hour keeps them. */

export function formatListeningDuration(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toLocaleString("ru-RU")} ч ${minutes} мин`;
  }

  return `${minutes} мин ${seconds} сек`;
}

export function formatAverageListening(totalMs: number, count: number): string {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(totalMs) || totalMs <= 0) {
    return "—";
  }

  return formatListeningDuration(totalMs / count);
}

/**
 * Listening averages use the measured window, not the selected-period KPIs.
 * effective_from = valid_from when the selection starts earlier or is All.
 */
export function effectiveListeningFrom(
  selectedFrom: string | null,
  validFrom: string | null,
): string | null {
  if (!validFrom) {
    return selectedFrom;
  }
  if (!selectedFrom || selectedFrom < validFrom) {
    return validFrom;
  }
  return selectedFrom;
}

export function listeningAverageLabels(
  listenedMs: number | null,
  measuredListeners: number,
  measuredStarts: number,
): { perListener: string; perStart: string } {
  if (listenedMs == null) {
    return { perListener: "—", perStart: "—" };
  }
  return {
    perListener: formatAverageListening(listenedMs, measuredListeners),
    perStart: formatAverageListening(listenedMs, measuredStarts),
  };
}

export function formatListeningTimeNotice(validFromIso: string): string {
  const date = new Date(validFromIso);

  if (Number.isNaN(date.getTime())) {
    return "Время прослушивания собирается с момента включения учёта";
  }

  const formatted = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(date);

  return `Время прослушивания собирается с ${formatted}`;
}

export function listenedMsToChartMinutes(ms: number): number {
  return Math.max(0, ms) / 60_000;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rolling windows that match WAL/MAL in analytics_owner_overview:
 * [end-7d, end) vs [end-14d, end-7d), and [end-30d, end) vs [end-60d, end-30d).
 * `end` is the overview p_to, or now when the selected period is all-time.
 */
export function rollingListeningBounds(endIso: string): {
  end: string;
  weekFrom: string;
  weekPrevFrom: string;
  weekPrevTo: string;
  monthFrom: string;
  monthPrevFrom: string;
  monthPrevTo: string;
} {
  const endMs = Date.parse(endIso);

  if (!Number.isFinite(endMs)) {
    throw new Error("invalid_listening_window_end");
  }

  const iso = (ms: number) => new Date(ms).toISOString();

  return {
    end: iso(endMs),
    weekFrom: iso(endMs - 7 * DAY_MS),
    weekPrevFrom: iso(endMs - 14 * DAY_MS),
    weekPrevTo: iso(endMs - 7 * DAY_MS),
    monthFrom: iso(endMs - 30 * DAY_MS),
    monthPrevFrom: iso(endMs - 60 * DAY_MS),
    monthPrevTo: iso(endMs - 30 * DAY_MS),
  };
}

export type QualifiedListeningWindow = {
  listenedMs: number | null;
  /** False when the measured sum does not cover the whole window. */
  fullWindow: boolean;
};

export type QualifiedListeningComparison = {
  currentLabel: string;
  previousLabel: string;
  compactLabel: string;
};

/**
 * Percent change of two qualified listening sums.
 * A zero or unmeasured previous window stays "—" — never an infinite percent.
 */
export function compareQualifiedListeningWindows(
  current: QualifiedListeningWindow,
  previous: QualifiedListeningWindow,
): QualifiedListeningComparison {
  const currentLabel =
    current.listenedMs == null ? "—" : formatListeningDuration(current.listenedMs);
  const previousLabel =
    previous.listenedMs == null ? "—" : formatListeningDuration(previous.listenedMs);
  const currentMs = current.listenedMs;
  const previousMs = previous.listenedMs;

  if (
    currentMs == null ||
    previousMs == null ||
    !current.fullWindow ||
    !previous.fullWindow
  ) {
    return { currentLabel, previousLabel, compactLabel: "—" };
  }

  return {
    currentLabel,
    previousLabel,
    compactLabel: formatAdminDelta(currentMs, previousMs)?.compactLabel ?? "—",
  };
}
