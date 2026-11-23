/**
 * Hover/tap tooltip for the admin «Динамика» chart.
 * Dates stay plain bucket strings (Europe/Moscow), never Date-parsed.
 * Visible copy uses the en dash (U+2013), never the em dash.
 */

import type { AdminAnalyticsTimeseriesPoint } from "@/lib/admin/analytics-queries";
import { formatListeningDuration } from "@/lib/admin/format-listening-time";
import {
  TIMESERIES_PAD_Y,
  TIMESERIES_PLOT_HEIGHT,
  formatTimeseriesAxisLabel,
} from "@/lib/admin/timeseries-axis";

export const TIMESERIES_EN_DASH = "\u2013";

export const TIMESERIES_LISTENING_SERIES = {
  key: "listening",
  label: "Время прослушивания",
  color: "#1f7a4d",
} as const;

export const TIMESERIES_COUNT_SERIES = [
  { key: "visitors", label: "Посетители", color: "#7042c5" },
  { key: "registrations", label: "Регистрации", color: "#2f7d4a" },
  { key: "practiceViews", label: "Просмотры", color: "#c47a1a" },
  { key: "playStarts", label: "Запуски", color: "#3b6fd4" },
  { key: "listeners", label: "Слушатели", color: "#9b3d8a" },
  { key: "completions", label: "Дослушивания", color: "#b34f63" },
  { key: "saves", label: "Сохранения", color: "#4f7c6b" },
] as const;

export type TimeseriesCountSeriesKey = (typeof TIMESERIES_COUNT_SERIES)[number]["key"];

export type TimeseriesTooltipLine = {
  key: string;
  label: string;
  color: string;
  value: string;
};

export type TimeseriesTooltipModel = {
  index: number;
  date: string;
  lines: TimeseriesTooltipLine[];
};

export type TimeseriesMarker = {
  key: string;
  x: number;
  y: number;
  color: string;
};

export type TimeseriesTooltipBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** «22.11», or «неделя с 16.11»; year is added only when the axis also shows it. */
export function formatTimeseriesTooltipDate(
  bucket: string,
  granularity: "day" | "week",
  withYear = false,
): string {
  const label = formatTimeseriesAxisLabel(bucket, withYear);
  return granularity === "week" ? `неделя с ${label}` : label;
}

export function formatTimeseriesCount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.round(safe).toLocaleString("ru-RU");
}

export function formatTimeseriesListeningValue(listenedMs: number | null): string {
  if (listenedMs == null || !Number.isFinite(listenedMs)) {
    return "нет данных";
  }
  return formatListeningDuration(listenedMs);
}

export function formatTimeseriesTooltipLine(label: string, value: string): string {
  return `${label} ${TIMESERIES_EN_DASH} ${value}`;
}

export function nearestTimeseriesIndex(
  x: number,
  xAt: (index: number) => number,
  count: number,
): number | null {
  if (!Number.isFinite(x) || count <= 0) {
    return null;
  }

  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const dist = Math.abs(xAt(index) - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

export function timeseriesPlotY(
  value: number,
  maxValue: number,
  plotHeight = TIMESERIES_PLOT_HEIGHT,
  padY = TIMESERIES_PAD_Y,
): number {
  const max = Math.max(maxValue, 1);
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return plotHeight - padY - (safe / max) * (plotHeight - padY * 2);
}

export function buildTimeseriesTooltip(options: {
  point: AdminAnalyticsTimeseriesPoint;
  index: number;
  granularity: "day" | "week";
  withYear?: boolean;
  listeningEnabled: boolean;
  enabledSeries: readonly TimeseriesCountSeriesKey[];
}): TimeseriesTooltipModel | null {
  const lines: TimeseriesTooltipLine[] = [];

  if (options.listeningEnabled) {
    lines.push({
      key: TIMESERIES_LISTENING_SERIES.key,
      label: TIMESERIES_LISTENING_SERIES.label,
      color: TIMESERIES_LISTENING_SERIES.color,
      value: formatTimeseriesListeningValue(options.point.listenedMs),
    });
  }

  for (const series of TIMESERIES_COUNT_SERIES) {
    if (!options.enabledSeries.includes(series.key)) {
      continue;
    }
    lines.push({
      key: series.key,
      label: series.label,
      color: series.color,
      value: formatTimeseriesCount(options.point[series.key]),
    });
  }

  if (lines.length === 0) {
    return null;
  }

  return {
    index: options.index,
    date: formatTimeseriesTooltipDate(
      options.point.bucket,
      options.granularity,
      options.withYear ?? false,
    ),
    lines,
  };
}

export function buildTimeseriesMarkers(options: {
  point: AdminAnalyticsTimeseriesPoint;
  x: number;
  listeningEnabled: boolean;
  listeningMaxMinutes: number;
  enabledSeries: readonly TimeseriesCountSeriesKey[];
  countMax: number;
}): TimeseriesMarker[] {
  const markers: TimeseriesMarker[] = [];

  if (
    options.listeningEnabled &&
    options.point.listenedMinutes != null &&
    options.listeningMaxMinutes > 0
  ) {
    markers.push({
      key: TIMESERIES_LISTENING_SERIES.key,
      x: options.x,
      y: timeseriesPlotY(options.point.listenedMinutes, options.listeningMaxMinutes),
      color: TIMESERIES_LISTENING_SERIES.color,
    });
  }

  for (const series of TIMESERIES_COUNT_SERIES) {
    if (!options.enabledSeries.includes(series.key)) {
      continue;
    }
    markers.push({
      key: series.key,
      x: options.x,
      y: timeseriesPlotY(options.point[series.key], options.countMax),
      color: series.color,
    });
  }

  return markers;
}

export function measureTimeseriesTooltipBox(
  model: TimeseriesTooltipModel,
): { width: number; height: number } {
  const padX = 10;
  const padY = 8;
  const titleH = 16;
  const lineH = 15;
  const charW = 6.6;
  const texts = [
    model.date,
    ...model.lines.map((line) => formatTimeseriesTooltipLine(line.label, line.value)),
  ];
  const maxChars = Math.max(...texts.map((text) => text.length), 0);
  const width = Math.min(268, Math.max(128, Math.ceil(maxChars * charW) + padX * 2));
  const height = padY * 2 + titleH + model.lines.length * lineH;
  return { width, height };
}

/** Keep the box near the active markers and inside the SVG. */
export function placeTimeseriesTooltipBox(
  box: { width: number; height: number },
  chartWidth: number,
  chartHeight: number,
  anchorX: number,
  anchorsY: readonly number[],
): TimeseriesTooltipBox {
  const gap = 10;
  const minX = 4;
  const maxX = Math.max(minX, chartWidth - box.width - 4);
  const x = Math.max(minX, Math.min(maxX, anchorX - box.width / 2));
  const highest = anchorsY.length > 0 ? Math.min(...anchorsY) : TIMESERIES_PAD_Y;
  const lowest = anchorsY.length > 0 ? Math.max(...anchorsY) : TIMESERIES_PLOT_HEIGHT / 2;
  const above = highest - box.height - gap;
  const below = lowest + gap;
  let y = above >= 4 ? above : below;
  y = Math.max(4, Math.min(y, Math.max(4, chartHeight - box.height - 4)));
  return { x, y, width: box.width, height: box.height };
}

export function pointerClientToSvgX(
  clientX: number,
  svg: Pick<SVGSVGElement, "getScreenCTM" | "createSVGPoint">,
): number | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return null;
  }
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = 0;
  return point.matrixTransform(ctm.inverse()).x;
}
