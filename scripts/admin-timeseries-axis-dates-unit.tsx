/**
 * Admin analytics «Динамика»: a date under every point of the chart, not only the
 * first and the last one (owner request t1373u, 2026-11-11).
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import AdminAnalyticsTimeseriesChart from "../src/components/admin/AdminAnalyticsTimeseriesChart";
import type { AdminAnalyticsTimeseriesPoint } from "../src/lib/admin/analytics-queries";
import {
  TIMESERIES_BASE_WIDTH,
  TIMESERIES_MIN_STEP_ROTATED,
  buildTimeseriesAxisLayout,
  formatTimeseriesAxisLabel,
  formatTimeseriesAxisTitle,
} from "../src/lib/admin/timeseries-axis";

function days(from: string, count: number): string[] {
  const [y, m, d] = from.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  );
}

function point(bucket: string, visitors: number): AdminAnalyticsTimeseriesPoint {
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
  };
}

// 1. Label format: plain string parsing, no time-zone shift.
assert.equal(formatTimeseriesAxisLabel("2026-11-05"), "05.11");
assert.equal(formatTimeseriesAxisLabel("2026-12-31", true), "31.12.26");
assert.equal(formatTimeseriesAxisLabel("garbage"), "garbage");
assert.equal(formatTimeseriesAxisTitle("2026-11-05", "day"), "05.11.2026");
assert.equal(formatTimeseriesAxisTitle("2026-11-02", "week"), "неделя с 02.11.2026");

// 2. Owner screenshot case: 7 days 05.11–11.11, every day labelled, horizontal.
const week = days("2026-11-05", 7);
const weekLayout = buildTimeseriesAxisLayout(week, "day");
assert.equal(weekLayout.ticks.length, 7);
assert.deepEqual(
  weekLayout.ticks.map((tick) => tick.label),
  ["05.11", "06.11", "07.11", "08.11", "09.11", "10.11", "11.11"],
);
assert.equal(weekLayout.rotated, false);
assert.equal(weekLayout.width, TIMESERIES_BASE_WIDTH);
// Labels sit exactly under the points (same x formula as the lines).
weekLayout.ticks.forEach((tick, index) => assert.equal(tick.x, weekLayout.xAt(index)));
assert.equal(weekLayout.ticks[0].x, 28);
assert.equal(weekLayout.ticks[6].x, 612);

// 3. 30 days: still one label per day, rotated, fits the base width.
const month = buildTimeseriesAxisLayout(days("2026-10-13", 30), "day");
assert.equal(month.ticks.length, 30);
assert.equal(month.rotated, true);
assert.equal(month.width, TIMESERIES_BASE_WIDTH);
assert.equal(new Set(month.ticks.map((tick) => tick.label)).size, 30);

// 4. 120 days: the chart widens (horizontal scroll) instead of overlapping labels.
const long = buildTimeseriesAxisLayout(days("2026-07-15", 120), "day");
assert.equal(long.ticks.length, 120);
assert.ok(long.width > TIMESERIES_BASE_WIDTH);
for (let i = 1; i < long.ticks.length; i += 1) {
  assert.ok(long.ticks[i].x - long.ticks[i - 1].x >= TIMESERIES_MIN_STEP_ROTATED - 1e-9);
}

// 5. Year boundary → labels carry the year.
const newYear = buildTimeseriesAxisLayout(days("2026-12-29", 5), "day");
assert.deepEqual(
  newYear.ticks.map((tick) => tick.label),
  ["29.12.26", "30.12.26", "31.12.26", "01.01.27", "02.01.27"],
);

// 6. One point: label under the centred point.
const single = buildTimeseriesAxisLayout(["2026-11-11"], "day");
assert.equal(single.ticks.length, 1);
assert.equal(single.ticks[0].x, TIMESERIES_BASE_WIDTH / 2);

// 7. Rendered chart: a <text> date per point inside the x axis, old first/last row gone.
const visitors = [180, 205, 160, 140, 175, 200, 503];
const html = renderToStaticMarkup(
  <AdminAnalyticsTimeseriesChart
    points={week.map((bucket, index) => point(bucket, visitors[index]))}
    granularity="day"
    error={null}
  />,
);
const axisHtml = html.split('data-testid="admin-timeseries-x-axis"')[1]?.split("</svg>")[0] ?? "";
const labels = [...axisHtml.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]);
assert.deepEqual(labels, ["05.11", "06.11", "07.11", "08.11", "09.11", "10.11", "11.11"]);
assert.equal((axisHtml.match(/<title>/g) ?? []).length, 7);
assert.match(axisHtml, /<title>11\.11\.2026<\/title>/);
assert.doesNotMatch(html, /<span>2026-11-05<\/span>/, "old first/last-only row is removed");

// 8. Empty and error states unchanged.
assert.match(
  renderToStaticMarkup(<AdminAnalyticsTimeseriesChart points={[]} granularity="day" error={null} />),
  /Нет точек за выбранный период/,
);
assert.match(
  renderToStaticMarkup(<AdminAnalyticsTimeseriesChart points={[]} granularity="day" error="x" />),
  /Не удалось загрузить график/,
);

console.log("admin-timeseries-axis-dates-unit: ok");
