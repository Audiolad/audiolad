"use client";

import { useMemo, useState } from "react";

import type { AdminAnalyticsTimeseriesPoint } from "@/lib/admin/analytics-queries";

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
}: {
  points: AdminAnalyticsTimeseriesPoint[];
  granularity: "day" | "week";
  error: string | null;
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

  const activeSeries = SERIES.filter((series) => enabled[series.key]);

  const { max, pathMap } = useMemo(() => {
    const width = 640;
    const height = 220;
    const padX = 28;
    const padY = 20;
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
            const x =
              padX +
              (points.length === 1
                ? (width - padX * 2) / 2
                : (index / (points.length - 1)) * (width - padX * 2));
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
  }, [activeSeries, points]);

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
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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
            viewBox="0 0 640 220"
            className="h-56 w-full min-w-[320px]"
            role="img"
            aria-label="Динамика показателей"
          >
            <line
              x1="28"
              y1="200"
              x2="612"
              y2="200"
              stroke="#eadff8"
              strokeWidth="1"
            />
            <text x="8" y="24" className="fill-[#9485b4]" fontSize="11">
              {max.toLocaleString("ru-RU")}
            </text>
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
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-[#9485b4]">
            <span>{points[0]?.bucket}</span>
            <span>{points[points.length - 1]?.bucket}</span>
          </div>
        </div>
      )}
    </section>
  );
}
