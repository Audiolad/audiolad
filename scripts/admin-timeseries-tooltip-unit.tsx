/**
 * Admin analytics «Динамика»: hover/tap tooltip with the date and the exact
 * value of the selected metric (owner request t1661u, 2026-11-23).
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import AdminAnalyticsTimeseriesChart from "../src/components/admin/AdminAnalyticsTimeseriesChart";
import AdminAnalyticsTimeseriesTooltip from "../src/components/admin/AdminAnalyticsTimeseriesTooltip";
import type { AdminAnalyticsTimeseriesPoint } from "../src/lib/admin/analytics-queries";
import { formatListeningDuration } from "../src/lib/admin/format-listening-time";
import {
  TIMESERIES_BASE_WIDTH,
  TIMESERIES_PAD_X,
  buildTimeseriesAxisLayout,
} from "../src/lib/admin/timeseries-axis";
import {
  TIMESERIES_EN_DASH,
  TIMESERIES_LISTENING_SERIES,
  buildTimeseriesMarkers,
  buildTimeseriesTooltip,
  formatTimeseriesCount,
  formatTimeseriesListeningValue,
  formatTimeseriesTooltipDate,
  formatTimeseriesTooltipLine,
  measureTimeseriesTooltipBox,
  nearestTimeseriesIndex,
  placeTimeseriesTooltipBox,
  timeseriesPlotY,
  timeseriesPointsSignature,
} from "../src/lib/admin/timeseries-tooltip";

const EM_DASH = "\u2014";

function point(
  bucket: string,
  visitors: number,
  extras: Partial<AdminAnalyticsTimeseriesPoint> = {},
): AdminAnalyticsTimeseriesPoint {
  return {
    bucket,
    visitors,
    registrations: 0,
    practiceViews: 0,
    playStarts: Math.round(visitors / 4),
    listeners: 0,
    completions: 0,
    saves: 0,
    listenedMs: visitors * 1000,
    listenedMinutes: visitors / 60,
    ...extras,
  };
}

function assertNoEmDash(value: string) {
  assert.equal(value.includes(EM_DASH), false, `em dash in: ${value}`);
  assert.equal(TIMESERIES_EN_DASH, "\u2013");
}

// 1. Date format matches the axis label under the point: «22.11».
assert.equal(formatTimeseriesTooltipDate("2026-11-22", "day"), "22.11");
assert.equal(formatTimeseriesTooltipDate("2026-11-16", "week"), "неделя с 16.11");
assert.equal(formatTimeseriesTooltipDate("2026-01-01", "day", true), "01.01.26");
assert.equal(formatTimeseriesTooltipDate("2026-12-29", "week", true), "неделя с 29.12.26");

// 2. Listening time is readable; missing values are not shown as zero.
assert.equal(formatTimeseriesListeningValue(12 * 3_600_000 + 30 * 60_000), "12 ч 30 мин");
assert.equal(formatTimeseriesListeningValue(12 * 3_600_000 + 30 * 60_000), formatListeningDuration(12 * 3_600_000 + 30 * 60_000));
assert.equal(formatTimeseriesListeningValue(5 * 60_000 + 4_000), "5 мин 4 сек");
assert.equal(formatTimeseriesListeningValue(null), "нет данных");
assert.equal(formatTimeseriesListeningValue(Number.NaN), "нет данных");
assert.equal(formatTimeseriesCount(503), "503");
assert.equal(formatTimeseriesCount(1503), (1503).toLocaleString("ru-RU"));
assert.equal(formatTimeseriesCount(Number.NaN), "0");

const visitorsLine = formatTimeseriesTooltipLine("Посетители", "503");
assert.equal(visitorsLine, `Посетители ${TIMESERIES_EN_DASH} 503`);
assertNoEmDash(visitorsLine);
assertNoEmDash(formatTimeseriesTooltipLine("Время прослушивания", "12 ч 30 мин"));

// 3. Tooltip model for the selected metric(s) on 22.11 – the peak on the owner screenshot.
const peak = point("2026-11-22", 503, {
  playStarts: 120,
  listenedMs: 12 * 3_600_000 + 30 * 60_000,
  listenedMinutes: 12 * 60 + 30,
});
const listeningOnly = buildTimeseriesTooltip({
  point: peak,
  index: 6,
  granularity: "day",
  listeningEnabled: true,
  enabledSeries: [],
});
assert.ok(listeningOnly);
assert.equal(listeningOnly.date, "22.11");
assert.equal(listeningOnly.lines.length, 1);
assert.equal(listeningOnly.lines[0].key, TIMESERIES_LISTENING_SERIES.key);
assert.equal(listeningOnly.lines[0].label, "Время прослушивания");
assert.equal(listeningOnly.lines[0].value, "12 ч 30 мин");
assertNoEmDash(formatTimeseriesTooltipLine(listeningOnly.lines[0].label, listeningOnly.lines[0].value));

const visitorsOnly = buildTimeseriesTooltip({
  point: peak,
  index: 6,
  granularity: "day",
  listeningEnabled: false,
  enabledSeries: ["visitors"],
});
assert.ok(visitorsOnly);
assert.equal(visitorsOnly.date, "22.11");
assert.deepEqual(
  visitorsOnly.lines.map((line) => formatTimeseriesTooltipLine(line.label, line.value)),
  [`Посетители ${TIMESERIES_EN_DASH} 503`],
);

const several = buildTimeseriesTooltip({
  point: peak,
  index: 6,
  granularity: "day",
  listeningEnabled: true,
  enabledSeries: ["visitors", "playStarts"],
});
assert.ok(several);
assert.deepEqual(
  several.lines.map((line) => line.label),
  ["Время прослушивания", "Посетители", "Запуски"],
);
assert.deepEqual(
  several.lines.map((line) => line.value),
  ["12 ч 30 мин", "503", "120"],
);

assert.equal(
  buildTimeseriesTooltip({
    point: peak,
    index: 6,
    granularity: "day",
    listeningEnabled: false,
    enabledSeries: [],
  }),
  null,
);

const missingListening = buildTimeseriesTooltip({
  point: point("2026-11-21", 40, { listenedMs: null, listenedMinutes: null }),
  index: 5,
  granularity: "day",
  listeningEnabled: true,
  enabledSeries: ["visitors"],
});
assert.ok(missingListening);
assert.equal(missingListening.lines[0].value, "нет данных");
assert.equal(missingListening.lines[1].value, "40");

const weekModel = buildTimeseriesTooltip({
  point: peak,
  index: 0,
  granularity: "week",
  listeningEnabled: false,
  enabledSeries: ["completions"],
});
assert.ok(weekModel);
assert.equal(weekModel.date, "неделя с 22.11");
assert.equal(weekModel.lines[0].label, "Дослушивания");

// 4. Nearest point by X (hover and tap use the same helper).
const week = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
const layout = buildTimeseriesAxisLayout(week, "day");
assert.equal(layout.width, TIMESERIES_BASE_WIDTH);
assert.equal(nearestTimeseriesIndex(layout.xAt(0), layout.xAt, 7), 0);
assert.equal(nearestTimeseriesIndex(layout.xAt(6), layout.xAt, 7), 6);
assert.equal(nearestTimeseriesIndex(layout.xAt(6) - 1, layout.xAt, 7), 6);
const mid = (layout.xAt(5) + layout.xAt(6)) / 2;
assert.ok(mid > layout.xAt(5));
assert.equal(nearestTimeseriesIndex(mid + 0.01, layout.xAt, 7), 6);
assert.equal(nearestTimeseriesIndex(layout.xAt(0) - 40, layout.xAt, 7), 0);
assert.equal(nearestTimeseriesIndex(layout.xAt(6) + 40, layout.xAt, 7), 6);
assert.equal(nearestTimeseriesIndex(0, layout.xAt, 0), null);
assert.equal(nearestTimeseriesIndex(Number.NaN, layout.xAt, 7), null);
assert.equal(nearestTimeseriesIndex(TIMESERIES_PAD_X, layout.xAt, 1), 0);

// 5. Markers sit on the line; a missing listening sample has no listening marker.
const plotMax = 503;
assert.equal(timeseriesPlotY(0, plotMax), 200);
assert.equal(timeseriesPlotY(plotMax, plotMax), 20);
// Listening scale under a minute must not be stretched as if the max were 1 minute.
assert.equal(timeseriesPlotY(0.5, 0.5), 20);
assert.equal(timeseriesPlotY(0, 0.5), 200);
assert.equal(timeseriesPlotY(0, 0), 200);
const markers = buildTimeseriesMarkers({
  point: peak,
  x: layout.xAt(6),
  listeningEnabled: true,
  listeningMaxMinutes: 12 * 60 + 30,
  enabledSeries: ["visitors"],
  countMax: 503,
});
assert.deepEqual(
  markers.map((marker) => marker.key),
  ["listening", "visitors"],
);
assert.equal(markers[0].y, timeseriesPlotY(12 * 60 + 30, 12 * 60 + 30));
assert.equal(markers[1].y, timeseriesPlotY(503, 503));
assert.equal(markers[1].x, layout.xAt(6));

const noListeningMarker = buildTimeseriesMarkers({
  point: point("2026-11-21", 40, { listenedMs: null, listenedMinutes: null }),
  x: layout.xAt(5),
  listeningEnabled: true,
  listeningMaxMinutes: 100,
  enabledSeries: ["visitors"],
  countMax: 503,
});
assert.deepEqual(
  noListeningMarker.map((marker) => marker.key),
  ["visitors"],
);

// 6. Tooltip box stays inside the chart and does not cover active markers.
const measured = measureTimeseriesTooltipBox(visitorsOnly!);
assert.ok(measured.width >= 128);
assert.ok(measured.height >= 24);

function assertBoxInside(box: { x: number; y: number; width: number; height: number }) {
  assert.ok(box.x >= 4);
  assert.ok(box.y >= 4);
  assert.ok(box.x + box.width <= 640 - 4);
  assert.ok(box.y + box.height <= 260 - 4);
}

function assertBoxMisses(
  box: { x: number; y: number; width: number; height: number },
  marks: Array<{ x: number; y: number }>,
) {
  const pad = 10;
  for (const mark of marks) {
    const hits =
      mark.x >= box.x - pad &&
      mark.x <= box.x + box.width + pad &&
      mark.y >= box.y - pad &&
      mark.y <= box.y + box.height + pad;
    assert.equal(hits, false, `tooltip covers marker at ${mark.x},${mark.y}`);
  }
}

const leftMarks = [{ x: 28, y: 40 }];
const leftBox = placeTimeseriesTooltipBox(measured, 640, 260, 28, leftMarks);
assertBoxInside(leftBox);
assertBoxMisses(leftBox, leftMarks);
const rightMarks = [{ x: 612, y: 40 }];
const rightBox = placeTimeseriesTooltipBox(measured, 640, 260, 612, rightMarks);
assertBoxInside(rightBox);
assertBoxMisses(rightBox, rightMarks);
const topMarks = [{ x: 320, y: 24 }];
const topBox = placeTimeseriesTooltipBox(measured, 640, 260, 320, topMarks);
assertBoxInside(topBox);
assertBoxMisses(topBox, topMarks);

// Reviewer case: a high visitors peak and a low playStarts point on the same day.
const splitMarks = [
  { x: 612, y: 20 },
  { x: 612, y: timeseriesPlotY(10, 503) },
];
const splitBox = placeTimeseriesTooltipBox(measured, 640, 260, 612, splitMarks);
assertBoxInside(splitBox);
assertBoxMisses(splitBox, splitMarks);

// 7. Rendered annotation shows the date, the formatted value, a marker, and no em dash.
const annotation = renderToStaticMarkup(
  <AdminAnalyticsTimeseriesTooltip
    model={visitorsOnly!}
    box={{ x: 100, y: 40, width: 160, height: 50 }}
    anchorX={layout.xAt(6)}
    axisY={layout.axisY}
    markers={[markers[1]]}
  />,
);
assert.match(annotation, /data-testid="admin-timeseries-tooltip"/);
assert.match(annotation, />22\.11</);
assert.match(annotation, /Посетители/);
assert.match(annotation, /503/);
assert.match(annotation, /data-testid="admin-timeseries-marker"/);
assert.match(annotation, /data-series="visitors"/);
assert.equal(annotation.includes(EM_DASH), false);
assert.equal(annotation.includes(TIMESERIES_EN_DASH), true);

// 8. A filter change that keeps the same date range still changes the signature.
const weekPoints = week.map((bucket, index) => point(bucket, [180, 205, 160, 140, 175, 200, 503][index]));
const sameRangeOtherFilter = weekPoints.map((item, index) =>
  index === 3 ? { ...item, visitors: item.visitors + 15 } : item,
);
assert.equal(
  timeseriesPointsSignature(weekPoints, "day"),
  timeseriesPointsSignature(weekPoints, "day"),
);
assert.notEqual(
  timeseriesPointsSignature(weekPoints, "day"),
  timeseriesPointsSignature(sameRangeOtherFilter, "day"),
);
assert.notEqual(
  timeseriesPointsSignature(weekPoints, "day"),
  timeseriesPointsSignature(weekPoints, "week"),
);

// 9. Idle chart has no tooltip (it appears only on hover or tap).
const idle = renderToStaticMarkup(
  <AdminAnalyticsTimeseriesChart
    points={week.map((bucket, index) => point(bucket, [180, 205, 160, 140, 175, 200, 503][index]))}
    granularity="day"
    error={null}
  />,
);
assert.doesNotMatch(idle, /data-testid="admin-timeseries-tooltip"/);
assert.doesNotMatch(idle, /data-testid="admin-timeseries-marker"/);
assert.match(idle, /data-testid="admin-timeseries-svg"/);
assert.match(idle, /Время прослушивания/);
assert.match(idle, /Посетители/);

console.log("admin-timeseries-tooltip-unit: ok");
