"use client";

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { AdminAnalyticsTimeseriesPoint } from "@/lib/admin/analytics-queries";
import { formatListeningDuration } from "@/lib/admin/format-listening-time";
import {
  TIMESERIES_PAD_X,
  buildTimeseriesAxisLayout,
} from "@/lib/admin/timeseries-axis";
import {
  TIMESERIES_COUNT_SERIES,
  type TimeseriesCountSeriesKey,
  buildTimeseriesMarkers,
  buildTimeseriesTooltip,
  measureTimeseriesTooltipBox,
  nearestTimeseriesIndex,
  placeTimeseriesTooltipBox,
  pointerClientToSvgX,
  timeseriesPlotY,
} from "@/lib/admin/timeseries-tooltip";
import AdminAnalyticsTimeseriesTooltip from "@/components/admin/AdminAnalyticsTimeseriesTooltip";

const SERIES = TIMESERIES_COUNT_SERIES;

type SeriesKey = TimeseriesCountSeriesKey;

const DEFAULT_ENABLED: Record<SeriesKey, boolean> = {
  visitors: true,
  registrations: false,
  practiceViews: false,
  playStarts: true,
  listeners: false,
  completions: false,
  saves: false,
};

export default function AdminAnalyticsTimeseriesChart({
  points,
  granularity,
  error,
  listeningTimeNotice,
}: {
  points: AdminAnalyticsTimeseriesPoint[];
  granularity: "day" | "week";
  error: string | null;
  listeningTimeNotice?: string | null;
}) {
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>(DEFAULT_ENABLED);
  const [listeningEnabled, setListeningEnabled] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [sticky, setSticky] = useState(false);

  const activeSeries = SERIES.filter((series) => enabled[series.key]);
  const enabledKeys = activeSeries.map((series) => series.key);

  const axis = useMemo(
    () =>
      buildTimeseriesAxisLayout(
        points.map((point) => point.bucket),
        granularity,
      ),
    [granularity, points],
  );

  const withYear = useMemo(() => {
    const years = new Set(points.map((point) => point.bucket.slice(0, 4)).filter(Boolean));
    return years.size > 1;
  }, [points]);

  const pointsSignature = `${granularity}:${points.length}:${points[0]?.bucket ?? ""}:${points[points.length - 1]?.bucket ?? ""}`;

  useEffect(() => {
    setActiveIndex(null);
    setSticky(false);
  }, [pointsSignature]);

  const { max, pathMap } = useMemo(() => {
    const maxValue = Math.max(
      1,
      ...points.flatMap((point) => activeSeries.map((series) => point[series.key])),
    );

    const paths = Object.fromEntries(
      activeSeries.map((series) => {
        if (points.length === 0) {
          return [series.key, ""];
        }

        const d = points
          .map((point, index) => {
            const x = axis.xAt(index);
            const y = timeseriesPlotY(point[series.key], maxValue);
            return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");

        return [series.key, d];
      }),
    ) as Record<SeriesKey, string>;

    return { max: maxValue, pathMap: paths };
  }, [activeSeries, axis, points]);

  const listeningPath = useMemo(() => {
    const samples = points.map((point) => point.listenedMinutes);
    const maxMinutes = Math.max(
      0,
      ...samples.filter((value): value is number => value != null),
    );
    if (!listeningEnabled || maxMinutes <= 0) {
      return { d: "", maxMinutes };
    }

    let segmentStart = true;
    const d = samples
      .map((minutes, index) => {
        const x = axis.xAt(index);
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
  }, [axis, listeningEnabled, points]);

  const tooltip = useMemo(() => {
    if (activeIndex == null || activeIndex < 0 || activeIndex >= points.length) {
      return null;
    }
    const point = points[activeIndex];
    const model = buildTimeseriesTooltip({
      point,
      index: activeIndex,
      granularity,
      withYear,
      listeningEnabled,
      enabledSeries: enabledKeys,
    });
    if (!model) {
      return null;
    }
    const x = axis.xAt(activeIndex);
    const markers = buildTimeseriesMarkers({
      point,
      x,
      listeningEnabled,
      listeningMaxMinutes: listeningPath.maxMinutes,
      enabledSeries: enabledKeys,
      countMax: max,
    });
    const box = placeTimeseriesTooltipBox(
      measureTimeseriesTooltipBox(model),
      axis.width,
      axis.height,
      x,
      markers.map((marker) => marker.y),
    );
    return { model, markers, box, x };
  }, [
    activeIndex,
    axis,
    enabledKeys,
    granularity,
    listeningEnabled,
    listeningPath.maxMinutes,
    max,
    points,
    withYear,
  ]);

  function readIndex(event: ReactPointerEvent<SVGSVGElement>): number | null {
    const svgX = pointerClientToSvgX(event.clientX, event.currentTarget);
    if (svgX == null) {
      return null;
    }
    return nearestTimeseriesIndex(svgX, axis.xAt, points.length);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (sticky) {
      return;
    }
    setActiveIndex(readIndex(event));
  }

  function onPointerLeave(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType !== "mouse" || sticky) {
      return;
    }
    setActiveIndex(null);
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }
    const index = readIndex(event);
    if (index == null) {
      return;
    }
    if (sticky && activeIndex === index) {
      setSticky(false);
      setActiveIndex(null);
      return;
    }
    setSticky(true);
    setActiveIndex(index);
  }

  return (
    <section
      aria-labelledby="admin-timeseries-heading"
      className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-timeseries-heading" className="text-[19px] font-semibold">
            Динамика
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            {granularity === "week" ? "По неделям" : "По дням"} · Europe/Moscow ·
            пустые периоды = 0
          </p>
          {listeningTimeNotice ? (
            <p className="mt-1 text-sm text-[#7042c5]">{listeningTimeNotice}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setListeningEnabled((current) => !current)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            listeningEnabled
              ? "border-transparent text-white"
              : "border-[#eadff8] bg-white text-[#7042c5]"
          }`}
          style={listeningEnabled ? { backgroundColor: "#1f7a4d" } : undefined}
          aria-pressed={listeningEnabled}
        >
          Время прослушивания
        </button>
        {SERIES.map((series) => {
          const active = enabled[series.key];

          return (
            <button
              key={series.key}
              type="button"
              onClick={() =>
                setEnabled((current) => ({
                  ...current,
                  [series.key]: !current[series.key],
                }))
              }
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                active
                  ? "border-transparent text-white"
                  : "border-[#eadff8] bg-white text-[#7042c5]"
              }`}
              style={active ? { backgroundColor: series.color } : undefined}
              aria-pressed={active}
            >
              {series.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-[#b34f63]">
          Не удалось загрузить график. Остальные блоки доступны.
        </p>
      ) : points.length === 0 ? (
        <p className="mt-4 text-sm text-[#9485b4]">Нет точек за выбранный период.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${axis.width} ${axis.height}`}
            className="w-full"
            style={{
              height: `${axis.height}px`,
              // Never shrink below the layout width: dates stay readable (11px) on
              // phones and long periods; the wrapper scrolls horizontally instead.
              minWidth: `${axis.width}px`,
            }}
            role="img"
            aria-label="Динамика показателей"
            data-testid="admin-timeseries-svg"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
          >
            <line
              x1={TIMESERIES_PAD_X}
              y1={axis.axisY}
              x2={axis.width - TIMESERIES_PAD_X}
              y2={axis.axisY}
              stroke="#eadff8"
              strokeWidth="1"
            />
            <text x="8" y="24" className="fill-[#9485b4]" fontSize="11">
              {max.toLocaleString("ru-RU")}
            </text>
            {listeningEnabled && listeningPath.maxMinutes > 0 ? (
              <text x={axis.width - 140} y="24" className="fill-[#1f7a4d]" fontSize="11">
                {formatListeningDuration(listeningPath.maxMinutes * 60_000)}
              </text>
            ) : null}
            {activeSeries.map((series) => (
              <path
                key={series.key}
                d={pathMap[series.key]}
                fill="none"
                stroke={series.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {listeningEnabled && listeningPath.d ? (
              <path
                d={listeningPath.d}
                fill="none"
                stroke="#1f7a4d"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            <g data-testid="admin-timeseries-x-axis">
              {axis.ticks.map((tick) => (
                <g key={`${tick.index}-${tick.label}`} data-bucket={points[tick.index]?.bucket}>
                  <title>{tick.title}</title>
                  <line
                    x1={tick.x}
                    y1={axis.axisY}
                    x2={tick.x}
                    y2={axis.axisY + 4}
                    stroke="#d9cdee"
                    strokeWidth="1"
                  />
                  <text
                    x={tick.x}
                    y={axis.labelY}
                    textAnchor={axis.rotated ? "end" : "middle"}
                    transform={
                      axis.rotated
                        ? `rotate(${axis.labelAngle} ${tick.x.toFixed(1)} ${axis.labelY})`
                        : undefined
                    }
                    className="fill-[#9485b4]"
                    fontSize="11"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}
            </g>
            {tooltip ? (
              <AdminAnalyticsTimeseriesTooltip
                model={tooltip.model}
                box={tooltip.box}
                anchorX={tooltip.x}
                axisY={axis.axisY}
                markers={tooltip.markers}
              />
            ) : null}
          </svg>
        </div>
      )}
    </section>
  );
}
