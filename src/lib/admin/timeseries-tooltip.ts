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
  // Listening peaks can be a fraction of a minute; only fall back to 1 when
  // the scale is missing or not positive. Count series still pass max >= 1.
  const max = maxValue > 0 ? maxValue : 1;
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return plotHeight - padY - (safe / max) * (plotHeight - padY * 2);
}

/** Fingerprint of the plotted series; hover is ignored when this changes. */
export function timeseriesPointsSignature(
  points: readonly AdminAnalyticsTimeseriesPoint[],
  granularity: "day" | "week",
): string {
  const body = points
    .map((point) =>
      [
        point.bucket,
        point.visitors,
        point.registrations,
        point.practiceViews,
        point.playStarts,
        point.listeners,
        point.completions,
        point.saves,
        point.listenedMs ?? "",
      ].join(","),
    )
    .join(";");
  return `${granularity}:${body}`;
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

  // A measured zero still gets a marker even when the period max is 0;
  // timeseriesPlotY already falls back to a unit scale and sits on the baseline.
  // A missing sample (listenedMinutes == null) still has no listening marker.
  if (options.listeningEnabled && options.point.listenedMinutes != null) {
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

export function buildTimeseriesListeningPath(
  samples: readonly (number | null)[],
  xAt: (index: number) => number,
): { d: string; maxMinutes: number } {
  const measured = samples.filter((value): value is number => value != null);
  const maxMinutes = measured.length === 0 ? 0 : Math.max(0, ...measured);
  if (measured.length === 0) {
    return { d: "", maxMinutes };
  }

  let segmentStart = true;
  const d = samples
    .map((minutes, index) => {
      const x = xAt(index);
      if (minutes == null) {
        segmentStart = true;
        return "";
      }
      const y = timeseriesPlotY(minutes, maxMinutes);
      const command = `${segmentStart ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      segmentStart = false;
      return command;
    })
    .filter(Boolean)
    .join(" ");

  return { d, maxMinutes };
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

function tooltipBoxFits(
  x: number,
  y: number,
  box: { width: number; height: number },
  chartWidth: number,
  chartHeight: number,
): boolean {
  return (
    x >= 4 &&
    y >= 4 &&
    x + box.width <= chartWidth - 4 &&
    y + box.height <= chartHeight - 4
  );
}

function tooltipBoxOverlapsMarkers(
  x: number,
  y: number,
  box: { width: number; height: number },
  markers: readonly { x: number; y: number }[],
  pad = 10,
): boolean {
  const left = x - pad;
  const right = x + box.width + pad;
  const top = y - pad;
  const bottom = y + box.height + pad;
  return markers.some(
    (marker) =>
      marker.x >= left && marker.x <= right && marker.y >= top && marker.y <= bottom,
  );
}

/** Keep the box near the active markers, inside the SVG, and clear of the dots. */
export function placeTimeseriesTooltipBox(
  box: { width: number; height: number },
  chartWidth: number,
  chartHeight: number,
  anchorX: number,
  markers: readonly { x: number; y: number }[],
): TimeseriesTooltipBox {
  const gap = 10;
  const clearance = 12;
  const minX = 4;
  const maxX = Math.max(minX, chartWidth - box.width - 4);
  const minY = 4;
  const maxY = Math.max(minY, chartHeight - box.height - 4);
  const anchorsY = markers.map((marker) => marker.y);
  const highest = anchorsY.length > 0 ? Math.min(...anchorsY) : TIMESERIES_PAD_Y;
  const lowest = anchorsY.length > 0 ? Math.max(...anchorsY) : TIMESERIES_PLOT_HEIGHT / 2;
  const centeredX = Math.max(minX, Math.min(maxX, anchorX - box.width / 2));
  const rightX = Math.max(minX, Math.min(maxX, anchorX + clearance));
  const leftX = Math.max(minX, Math.min(maxX, anchorX - box.width - clearance));
  const aboveY = highest - box.height - gap;
  const belowY = lowest + gap;
  const midY = Math.max(minY, Math.min(maxY, (highest + lowest) / 2 - box.height / 2));

  const candidates = [
    { x: centeredX, y: aboveY },
    { x: rightX, y: midY },
    { x: leftX, y: midY },
    { x: rightX, y: minY },
    { x: leftX, y: minY },
    { x: rightX, y: aboveY },
    { x: leftX, y: aboveY },
    { x: maxX, y: midY },
    { x: minX, y: midY },
    { x: maxX, y: minY },
    { x: minX, y: minY },
    { x: centeredX, y: belowY },
    { x: centeredX, y: minY },
  ];

  for (const candidate of candidates) {
    const x = Math.max(minX, Math.min(maxX, candidate.x));
    const y = Math.max(minY, Math.min(maxY, candidate.y));
    if (
      tooltipBoxFits(x, y, box, chartWidth, chartHeight) &&
      !tooltipBoxOverlapsMarkers(x, y, box, markers)
    ) {
      return { x, y, width: box.width, height: box.height };
    }
  }

  return { x: maxX, y: minY, width: box.width, height: box.height };
}


export type TimeseriesHover = {
  index: number;
  sticky: boolean;
  signature: string;
};

export type TimeseriesHoverEvent =
  | { type: "move"; index: number | null; signature: string; pointerType?: string }
  | { type: "leave-mouse" }
  | { type: "tap"; index: number; signature: string }
  | { type: "reset" };

/**
 * Hover/tap state. A data or period change must send `reset` so a later
 * return to the previous period does not revive a sticky tooltip.
 */
export function reduceTimeseriesHover(
  hover: TimeseriesHover | null,
  event: TimeseriesHoverEvent,
): TimeseriesHover | null {
  if (event.type === "reset") {
    return null;
  }
  if (event.type === "move") {
    // Touch/pen moves must not revive a tooltip after a second tap (or during a tap).
    if (event.pointerType && event.pointerType !== "mouse") {
      return hover;
    }
    if (hover?.sticky && hover.signature === event.signature) {
      return hover;
    }
    if (event.index == null) {
      return null;
    }
    return { index: event.index, sticky: false, signature: event.signature };
  }
  if (event.type === "leave-mouse") {
    if (hover?.sticky) {
      return hover;
    }
    return null;
  }
  if (hover?.sticky && hover.index === event.index && hover.signature === event.signature) {
    return null;
  }
  return { index: event.index, sticky: true, signature: event.signature };
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
