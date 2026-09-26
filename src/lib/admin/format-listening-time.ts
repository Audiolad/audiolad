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
