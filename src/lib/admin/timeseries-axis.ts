/**
 * X-axis layout for the admin «Динамика» chart: a date under every point.
 *
 * Buckets come from the RPC as `YYYY-MM-DD` in Europe/Moscow (day or week start).
 * They are parsed as plain strings, never through `Date`, so the label never shifts
 * a day because of the browser time zone.
 */

export const TIMESERIES_BASE_WIDTH = 640;
export const TIMESERIES_PAD_X = 28;
export const TIMESERIES_PAD_Y = 20;
/** Plot area (lines) height; the horizontal axis line sits at PLOT_HEIGHT - PAD_Y. */
export const TIMESERIES_PLOT_HEIGHT = 220;

/** Minimum distance between points for a horizontal «05.11» label (11px font). */
export const TIMESERIES_MIN_STEP_HORIZONTAL = 40;
/** Minimum distance between points for a rotated label. Below that the chart scrolls. */
export const TIMESERIES_MIN_STEP_ROTATED = 18;

const HORIZONTAL_LABEL_AREA = 20;
const ROTATED_LABEL_AREA = 46;
const ROTATED_LABEL_ANGLE = -55;

const BUCKET_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export type TimeseriesAxisTick = {
  index: number;
  x: number;
  label: string;
  title: string;
};

export type TimeseriesAxisLayout = {
  width: number;
  height: number;
  axisY: number;
  rotated: boolean;
  labelY: number;
  labelAngle: number;
  /** x of the point with this index; same formula for lines, ticks and labels. */
  xAt: (index: number) => number;
  ticks: TimeseriesAxisTick[];
};

function parseBucket(bucket: string): { year: string; month: string; day: string } | null {
  const match = BUCKET_RE.exec(bucket);
  if (!match) return null;
  return { year: match[1], month: match[2], day: match[3] };
}

/** «05.11», or «05.11.26» when the period crosses a year boundary. */
export function formatTimeseriesAxisLabel(bucket: string, withYear = false): string {
  const parsed = parseBucket(bucket);
  if (!parsed) return bucket;
  const base = `${parsed.day}.${parsed.month}`;
  return withYear ? `${base}.${parsed.year.slice(2)}` : base;
}

/** Full date for the tooltip: «05.11.2026» / «неделя с 02.11.2026». */
export function formatTimeseriesAxisTitle(
  bucket: string,
  granularity: "day" | "week",
): string {
  const parsed = parseBucket(bucket);
  const full = parsed ? `${parsed.day}.${parsed.month}.${parsed.year}` : bucket;
  return granularity === "week" ? `неделя с ${full}` : full;
}

export function buildTimeseriesAxisLayout(
  buckets: readonly string[],
  granularity: "day" | "week",
): TimeseriesAxisLayout {
  const count = buckets.length;
  const baseInner = TIMESERIES_BASE_WIDTH - TIMESERIES_PAD_X * 2;
  const gaps = Math.max(count - 1, 0);
  const baseStep = gaps > 0 ? baseInner / gaps : baseInner;

  const rotated = gaps > 0 && baseStep < TIMESERIES_MIN_STEP_HORIZONTAL;
  const step = rotated ? Math.max(baseStep, TIMESERIES_MIN_STEP_ROTATED) : baseStep;
  const inner = gaps > 0 ? Math.max(baseInner, step * gaps) : baseInner;
  const width = Math.ceil(inner + TIMESERIES_PAD_X * 2);

  const axisY = TIMESERIES_PLOT_HEIGHT - TIMESERIES_PAD_Y;
  const height =
    TIMESERIES_PLOT_HEIGHT + (rotated ? ROTATED_LABEL_AREA : HORIZONTAL_LABEL_AREA);

  const xAt = (index: number) =>
    TIMESERIES_PAD_X + (count <= 1 ? inner / 2 : (index / gaps) * inner);

  const years = new Set(
    buckets.map((bucket) => parseBucket(bucket)?.year).filter(Boolean),
  );
  const withYear = years.size > 1;

  const ticks = buckets.map((bucket, index) => ({
    index,
    x: xAt(index),
    label: formatTimeseriesAxisLabel(bucket, withYear),
    title: formatTimeseriesAxisTitle(bucket, granularity),
  }));

  return {
    width,
    height,
    axisY,
    rotated,
    labelY: axisY + (rotated ? 12 : 16),
    labelAngle: rotated ? ROTATED_LABEL_ANGLE : 0,
    xAt,
    ticks,
  };
}
