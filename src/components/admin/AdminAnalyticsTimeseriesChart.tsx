"use client";

import { useMemo, useState } from "react";

import type { AdminAnalyticsTimeseriesPoint } from "@/lib/admin/analytics-queries";
import { formatListeningDuration } from "@/lib/admin/format-listening-time";
import {
  TIMESERIES_PAD_X,
  TIMESERIES_PAD_Y,
  TIMESERIES_PLOT_HEIGHT,
  buildTimeseriesAxisLayout,
} from "@/lib/admin/timeseries-axis";

const SERIES = [
  { key: "visitors", label: "Посетители", color: "#7042c5" },
  { key: "registrations", label: "Регистрации", color: "#2f7d4a" },
  { key: "practiceViews", label: "Просмотры", color: "#c47a1a" },
  { key: "playStarts", label: "Запуски", color: "#3b6fd4" },
  { key: "listeners", label: "Слушатели", color: "#9b3d8a" },
  { key: "completions", label: "Дослушивания", color: "#b34f63" },
  { key: "saves", label: "Сохранения", color: "#4f7c6b" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

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
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>({
    visitors: true,
    registrations: false,
    practiceViews: false,
    playStarts: true,
    listeners: false,
    completions: false,
    saves: false,
  });
  const [listeningEnabled, setListeningEnabled] = useState(true);

  const activeSeries = SERIES.filter((series) => enabled[series.key]);

  const axis = useMemo(
    () =>
      buildTimeseriesAxisLayout(
        points.map((point) => point.bucket),
        granularity,
      ),
    [granularity, points],
  );

  const { max, pathMap } = useMemo(() => {
    const height = TIMESERIES_PLOT_HEIGHT;
    const padY = TIMESERIES_PAD_Y;
    const maxValue = Math.max(
      1,
      ...points.flatMap((point) =>
        activeSeries.map((series) => point[series.key]),
      ),
    );

    const paths = Object.fromEntries(
      activeSeries.map((series) => {
        if (points.length === 0) {
          return [series.key, ""];
        }

        const d = points
          .map((point, index) => {
            const x = axis.xAt(index);
            const y =
              height -
              padY -
              (point[series.key] / maxValue) * (height - padY * 2);
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
      return { d: "", maxMinutes, titles: [] as Array<{ x: number; y: number; label: string }> };
    }

    const height = TIMESERIES_PLOT_HEIGHT;
    const padY = TIMESERIES_PAD_Y;
    const titles: Array<{ x: number; y: number; label: string }> = [];
    let segmentStart = true;
    const d = samples
      .map((minutes, index) => {
        const x = axis.xAt(index);
        if (minutes == null) {
          segmentStart = true;
          return "";
        }
        const y = height - padY - (minutes / maxMinutes) * (height - padY * 2);
        titles.push({
          x,
          y,
          label: `${points[index]?.bucket}: ${formatListeningDuration(points[index]?.listenedMs ?? 0)}`,
        });
        const command = `${segmentStart ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        segmentStart = false;
        return command;
      })
      .filter(Boolean)
      .join(" ");

    return { d, maxMinutes, titles };
  }, [axis, listeningEnabled, points]);

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
            {listeningEnabled
              ? listeningPath.titles.map((title) => (
                  <g key={`${title.x}-${title.label}`}>
                    <circle cx={title.x} cy={title.y} r="6" fill="transparent">
                      <title>{title.label}</title>
                    </circle>
                  </g>
                ))
              : null}
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
          </svg>
        </div>
      )}
    </section>
  );
}
