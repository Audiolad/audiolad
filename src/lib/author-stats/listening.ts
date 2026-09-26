/**
 * Author-dashboard projection of playback_usage_facts.
 * Ordinary author KPI counts stay on author_stats_summary / timeseries / products.
 * Averages use the measured window only.
 */

import type {
  AuthorStatsProductRow,
  AuthorStatsSummary,
  AuthorStatsTimeseriesPoint,
} from "./types";

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export type AuthorListeningSummary = {
  listenedMs: number | null;
  measuredListeners: number | null;
  measuredPlayStarts: number | null;
  listeningTimeValidFrom: string | null;
  listeningTimePartial: boolean;
  listeningTimeUnmeasured: boolean;
};

export type AuthorListeningTimeseries = {
  validFrom: string | null;
  unmeasured: boolean;
  points: Array<{ date: string; listenedMs: number | null }>;
};

export type AuthorListeningProductRow = {
  practiceId: string | null;
  productSlug: string | null;
  listenedMs: number;
};

export type AuthorListeningProducts = {
  validFrom: string | null;
  unmeasured: boolean;
  rows: AuthorListeningProductRow[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Rounded listened_ms per measured denominator.
 * Null when the window is unmeasured, the total is zero, or the denominator is zero.
 * A larger historical listener/start count must not be passed here.
 */
export function averageListenMs(
  listenedMs: number | null,
  denominator: number | null,
): number | null {
  if (listenedMs == null || denominator == null || denominator <= 0 || listenedMs <= 0) {
    return null;
  }
  return Math.round(listenedMs / denominator);
}

/** End of a Europe/Moscow calendar day, as a UTC instant. Moscow is UTC+3. */
export function moscowListeningDayEnd(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0) - MOSCOW_OFFSET_MS);
}

/** A chart day that ends at or before metering starts is unmeasured, not zero. */
export function isListeningDayUnmeasured(
  dateKey: string,
  validFromIso: string | null,
): boolean {
  if (!validFromIso) return true;
  const validFrom = new Date(validFromIso);
  const end = moscowListeningDayEnd(dateKey);
  if (!end || Number.isNaN(validFrom.getTime())) return true;
  return end.getTime() <= validFrom.getTime();
}

export function readAuthorListeningSummary(raw: unknown): AuthorListeningSummary | null {
  const row = asRecord(raw);
  if (!row || !("unmeasured" in row) || !("listened_ms" in row)) return null;

  const unmeasured = row.unmeasured === true;
  return {
    listenedMs: unmeasured ? null : asNullableNumber(row.listened_ms),
    measuredListeners: unmeasured ? null : asNullableNumber(row.measured_listeners),
    measuredPlayStarts: unmeasured ? null : asNullableNumber(row.measured_play_starts),
    listeningTimeValidFrom: asText(row.valid_from),
    listeningTimePartial: row.partial === true,
    listeningTimeUnmeasured: unmeasured,
  };
}

export function applyListeningSummary(
  summary: AuthorStatsSummary,
  listening: AuthorListeningSummary,
): AuthorStatsSummary {
  return {
    ...summary,
    listenedMs: listening.listenedMs,
    measuredListeners: listening.measuredListeners,
    measuredPlayStarts: listening.measuredPlayStarts,
    averageListenPerListenerMs: averageListenMs(
      listening.listenedMs,
      listening.measuredListeners,
    ),
    averageListenPerStartMs: averageListenMs(
      listening.listenedMs,
      listening.measuredPlayStarts,
    ),
    listeningTimeValidFrom: listening.listeningTimeValidFrom,
    listeningTimePartial: listening.listeningTimePartial,
    listeningTimeUnmeasured: listening.listeningTimeUnmeasured,
  };
}

export function readAuthorListeningTimeseries(raw: unknown): AuthorListeningTimeseries | null {
  const row = asRecord(raw);
  if (!row || !Array.isArray(row.points)) return null;

  const points = row.points.flatMap((item) => {
    const point = asRecord(item);
    const date = point ? asText(point.date) : null;
    if (!point || !date) return [];
    return [{ date, listenedMs: asNullableNumber(point.listened_ms) }];
  });

  return {
    validFrom: asText(row.valid_from),
    unmeasured: row.unmeasured === true,
    points,
  };
}

export function applyListeningTimeseries(
  points: readonly AuthorStatsTimeseriesPoint[],
  listening: AuthorListeningTimeseries,
): AuthorStatsTimeseriesPoint[] {
  const byDate = new Map(listening.points.map((point) => [point.date, point.listenedMs]));

  return points.map((point) => {
    if (byDate.has(point.date)) {
      return { ...point, listenedMs: byDate.get(point.date) ?? null };
    }
    if (isListeningDayUnmeasured(point.date, listening.validFrom)) {
      return { ...point, listenedMs: null };
    }
    return { ...point, listenedMs: 0 };
  });
}

/**
 * Appreciation can add a Moscow day that the listening query did not emit.
 * Measured days stay numeric. Days that end before metering stay null.
 */
export function finalizeListeningTimeseries(
  points: readonly AuthorStatsTimeseriesPoint[],
  validFrom: string | null,
): AuthorStatsTimeseriesPoint[] {
  return points.map((point) => {
    if (isListeningDayUnmeasured(point.date, validFrom)) {
      return { ...point, listenedMs: null };
    }
    return { ...point, listenedMs: point.listenedMs ?? 0 };
  });
}

export function readAuthorListeningProducts(raw: unknown): AuthorListeningProducts | null {
  const row = asRecord(raw);
  if (!row || !Array.isArray(row.rows)) return null;

  const rows = row.rows.flatMap((item) => {
    const product = asRecord(item);
    if (!product) return [];
    const listenedMs = asNullableNumber(product.listened_ms);
    if (listenedMs == null) return [];
    return [
      {
        practiceId: asText(product.practice_id),
        productSlug: asText(product.product_slug),
        listenedMs,
      },
    ];
  });

  return {
    validFrom: asText(row.valid_from),
    unmeasured: row.unmeasured === true,
    rows,
  };
}

export function applyListeningProducts(
  products: readonly AuthorStatsProductRow[],
  listening: AuthorListeningProducts,
): AuthorStatsProductRow[] {
  if (listening.unmeasured) {
    return products.map((product) => ({ ...product, listenedMs: null }));
  }

  const bySlug = new Map<string, number>();
  for (const row of listening.rows) {
    if (!row.productSlug) continue;
    bySlug.set(row.productSlug, (bySlug.get(row.productSlug) ?? 0) + row.listenedMs);
  }

  return products.map((product) => ({
    ...product,
    listenedMs: bySlug.get(product.productSlug) ?? 0,
  }));
}

/** Sum of listening rows that still have a current product slug. */
export function sumCurrentProductListenedMs(
  rows: readonly Pick<AuthorListeningProductRow, "productSlug" | "listenedMs">[],
): number {
  return rows.reduce(
    (total, row) => total + (row.productSlug ? row.listenedMs : 0),
    0,
  );
}

/** Summary total keeps snapshot usage even when the product row is gone. */
export function sumSnapshotListenedMs(
  rows: readonly Pick<AuthorListeningProductRow, "listenedMs">[],
): number {
  return rows.reduce((total, row) => total + row.listenedMs, 0);
}
