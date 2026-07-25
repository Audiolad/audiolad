"use client";

import { useEffect, useId, useRef } from "react";

import type {
  AdminAnalyticsAcquisitionRow,
  AdminAnalyticsAuthorRow,
  AdminAnalyticsKpiCard,
  AdminAnalyticsPracticeRow,
  AdminAnalyticsTimeseriesPoint,
} from "@/lib/admin/analytics-queries";

function metricSeries(
  points: AdminAnalyticsTimeseriesPoint[],
  key: AdminAnalyticsKpiCard["key"],
): number[] {
  switch (key) {
    case "visitors":
      return points.map((p) => p.visitors);
    case "registrations":
      return points.map((p) => p.registrations);
    case "playStarts":
      return points.map((p) => p.playStarts);
    case "completions":
      return points.map((p) => p.completions);
    case "saves":
      return points.map((p) => p.saves);
    default:
      return [];
  }
}

function sortPractices(
  rows: AdminAnalyticsPracticeRow[],
  key: AdminAnalyticsKpiCard["key"],
): AdminAnalyticsPracticeRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (key === "playStarts") return b.playStarts - a.playStarts;
    if (key === "completions") return b.completions - a.completions;
    if (key === "saves") return b.saves - a.saves;
    if (key === "visitors") return b.uniqueVisitors - a.uniqueVisitors;
    return b.views - a.views;
  });
  return copy.slice(0, 8);
}

function sortAuthors(
  rows: AdminAnalyticsAuthorRow[],
  key: AdminAnalyticsKpiCard["key"],
): AdminAnalyticsAuthorRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (key === "playStarts") return b.playStarts - a.playStarts;
    if (key === "completions") return b.completions - a.completions;
    if (key === "saves") return b.saves - a.saves;
    return b.views - a.views;
  });
  return copy.slice(0, 8);
}

function sortUtm(
  rows: AdminAnalyticsAcquisitionRow[],
  key: AdminAnalyticsKpiCard["key"],
): AdminAnalyticsAcquisitionRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (key === "playStarts") return b.playStarts - a.playStarts;
    if (key === "saves") return b.saves - a.saves;
    if (key === "registrations") return b.registrations - a.registrations;
    if (key === "visitors") return b.visitors - a.visitors;
    return b.sessions - a.sessions;
  });
  return copy.slice(0, 8);
}

export default function AdminAnalyticsDrilldownDrawer({
  open,
  kpi,
  points,
  practices,
  authors,
  acquisition,
  loading,
  onClose,
}: {
  open: boolean;
  kpi: AdminAnalyticsKpiCard | null;
  points: AdminAnalyticsTimeseriesPoint[];
  practices: AdminAnalyticsPracticeRow[];
  authors: AdminAnalyticsAuthorRow[];
  acquisition: AdminAnalyticsAcquisitionRow[];
  loading: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !kpi) {
    return null;
  }

  const series = metricSeries(points, kpi.key);
  const max = Math.max(...series, 1);
  const topPractices = sortPractices(practices, kpi.key);
  const topAuthors = sortAuthors(authors, kpi.key);
  const topUtm = sortUtm(acquisition, kpi.key);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 p-0 sm:p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Закрыть детали"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl sm:rounded-[22px]"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[#eadff8] bg-white p-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-[#25135c]">
              {kpi.label}
            </h2>
            <p className="mt-1 text-sm text-[#796ba0]">
              {kpi.value.toLocaleString("ru-RU")} · {kpi.kindLabel} · {kpi.formula}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#eadff8] px-3 py-1 text-sm text-[#7042c5]"
          >
            Закрыть
          </button>
        </div>

        <div className="space-y-6 p-5">
          <section>
            <h3 className="text-sm font-semibold text-[#25135c]">Динамика</h3>
            {series.length === 0 ? (
              <p className="mt-2 text-sm text-[#9485b4]">Нет точек за период.</p>
            ) : (
              <svg viewBox="0 0 320 120" className="mt-3 h-28 w-full" role="img" aria-label="График">
                <path
                  d={series
                    .map((value, index) => {
                      const x =
                        series.length === 1
                          ? 160
                          : (index / (series.length - 1)) * 300 + 10;
                      const y = 110 - (value / max) * 90;
                      return `${index === 0 ? "M" : "L"}${x},${y}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="#7042c5"
                  strokeWidth="2.5"
                />
              </svg>
            )}
          </section>

          {loading ? (
            <p className="text-sm text-[#796ba0]">Загружаем разрезы…</p>
          ) : (
            <>
              <section>
                <h3 className="text-sm font-semibold text-[#25135c]">Практики</h3>
                {topPractices.length === 0 ? (
                  <p className="mt-2 text-sm text-[#9485b4]">
                    Нет продуктовой активности по этому показателю.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {topPractices.map((row) => (
                      <li key={row.practiceId} className="flex justify-between gap-3">
                        <span className="text-[#25135c]">{row.title}</span>
                        <span className="text-[#7042c5]">
                          {kpi.key === "completions"
                            ? row.completions
                            : kpi.key === "saves"
                              ? row.saves
                              : kpi.key === "visitors"
                                ? row.uniqueVisitors
                                : row.playStarts}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[#25135c]">Авторы</h3>
                {topAuthors.length === 0 ? (
                  <p className="mt-2 text-sm text-[#9485b4]">Нет данных по авторам.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {topAuthors.map((row) => (
                      <li key={row.authorId} className="flex justify-between gap-3">
                        <span className="text-[#25135c]">
                          {row.name}
                          <span className="ml-1 text-xs text-[#9485b4]">
                            · {row.publishedPractices} практ.
                          </span>
                        </span>
                        <span className="text-[#7042c5]">
                          {kpi.key === "completions"
                            ? row.completions
                            : kpi.key === "saves"
                              ? row.saves
                              : row.playStarts}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[#25135c]">UTM</h3>
                {topUtm.length === 0 ? (
                  <p className="mt-2 text-sm text-[#9485b4]">Нет данных по источникам.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {topUtm.map((row, index) => (
                      <li key={`${row.label}-${index}`} className="flex justify-between gap-3">
                        <span className="text-[#25135c]">{row.label}</span>
                        <span className="text-[#7042c5]">
                          {kpi.key === "registrations"
                            ? row.registrations
                            : kpi.key === "saves"
                              ? row.saves
                              : kpi.key === "visitors"
                                ? row.visitors
                                : row.playStarts}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          <p className="text-xs leading-5 text-[#9485b4]">{kpi.hint}</p>
        </div>
      </aside>
    </div>
  );
}
