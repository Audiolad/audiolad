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

/**
 * measured — sum covers the whole window, including a real zero.
 * unmeasured — the window ends at or before listening_time_valid_from.
 * partial — the window starts before valid_from; listenedMs is the measured slice.
 * unavailable — the RPC or DTO failed. Never rendered as zero.
 */
export type ListeningWindowStatus =
  | "measured"
  | "unmeasured"
  | "partial"
  | "unavailable";

export type ListeningWindowReading = QualifiedListeningWindow & {
  status: ListeningWindowStatus;
};

export type ListeningWindowFilters = {
  p_include_test: boolean;
  p_author_id: string | null;
  p_practice_id: string | null;
  p_utm_source: string | null;
  p_device_type: string | null;
};

export function listeningWindowRpcArgs(
  endIso: string,
  filters: ListeningWindowFilters,
) {
  return {
    p_to: endIso,
    p_include_test: filters.p_include_test,
    p_author_id: filters.p_author_id,
    p_practice_id: filters.p_practice_id,
    p_utm_source: filters.p_utm_source,
    p_device_type: filters.p_device_type,
  };
}

function measuredMilliseconds(value: unknown): number | null {
  if (typeof value === "boolean" || value == null) {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.floor(numeric);
}

/** Map one window object from admin_analytics_listening_time_windows. */
export function readListeningWindow(
  data: unknown,
  errored = false,
): ListeningWindowReading {
  if (errored || data == null || typeof data !== "object") {
    return { status: "unavailable", listenedMs: null, fullWindow: false };
  }

  const raw = data as {
    listened_ms?: unknown;
    partial?: unknown;
    unmeasured?: unknown;
  };

  if (raw.unmeasured === true) {
    return { status: "unmeasured", listenedMs: null, fullWindow: false };
  }

  const listenedMs = measuredMilliseconds(raw.listened_ms);

  if (listenedMs == null) {
    return { status: "unavailable", listenedMs: null, fullWindow: false };
  }

  const partial = raw.partial === true;

  return {
    status: partial ? "partial" : "measured",
    listenedMs,
    fullWindow: !partial,
  };
}

export function readListeningWindowsPayload(
  data: unknown,
  errored = false,
): {
  validFrom: string | null;
  week: ListeningWindowReading;
  weekPrev: ListeningWindowReading;
  month: ListeningWindowReading;
  monthPrev: ListeningWindowReading;
} {
  const record =
    !errored && data != null && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const failed = errored || record == null;
  const validFrom = typeof record?.valid_from === "string" ? record.valid_from : null;

  return {
    validFrom,
    week: readListeningWindow(record?.week, failed),
    weekPrev: readListeningWindow(record?.week_prev, failed),
    month: readListeningWindow(record?.month, failed),
    monthPrev: readListeningWindow(record?.month_prev, failed),
  };
}

function coverageNotice(
  status: ListeningWindowStatus,
  validFromIso: string | null,
): string | null {
  if (status !== "unmeasured" && status !== "partial") {
    return null;
  }

  if (!validFromIso) {
    return "Время прослушивания собирается с момента включения учёта";
  }

  return formatListeningTimeNotice(validFromIso);
}

/**
 * One short Russian line for a rolling card.
 * An RPC failure stays distinct from an unmeasured or partial window.
 */
export function rollingListeningNotice(
  current: ListeningWindowReading,
  previous: ListeningWindowReading,
  validFromIso: string | null,
): string | null {
  if (current.status === "unavailable" && previous.status === "unavailable") {
    return "Окна сейчас недоступны";
  }

  if (current.status === "unavailable") {
    return "Текущее окно сейчас недоступно";
  }

  const currentCoverage = coverageNotice(current.status, validFromIso);

  if (previous.status === "unavailable") {
    return currentCoverage
      ? `${currentCoverage}. Предыдущее окно сейчас недоступно`
      : "Предыдущее окно сейчас недоступно";
  }

  return currentCoverage ?? coverageNotice(previous.status, validFromIso);
}

export function presentRollingListeningPair(
  current: ListeningWindowReading,
  previous: ListeningWindowReading,
  validFromIso: string | null,
): {
  label: string;
  previousLabel: string;
  deltaLabel: string;
  notice: string | null;
} {
  const compared = compareQualifiedListeningWindows(current, previous);

  return {
    label: compared.currentLabel,
    previousLabel: compared.previousLabel,
    deltaLabel: compared.compactLabel,
    notice: rollingListeningNotice(current, previous, validFromIso),
  };
}

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
