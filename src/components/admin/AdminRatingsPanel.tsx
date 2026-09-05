"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildCsv, downloadCsv } from "@/lib/admin/analytics-csv";
import { getProductKindLabel } from "@/lib/author-products/product-kind";
import {
  ADMIN_RATINGS_AVG_NOTE,
  ADMIN_RATINGS_DIAGNOSTICS_NOTE,
  ADMIN_RATINGS_EXCLUDED_NOTE,
  ADMIN_RATINGS_JOURNAL_NOTE,
  ADMIN_RATINGS_MODERATION_FOLLOWUP,
  ADMIN_RATINGS_PREVIEW_UX_BACKLOG,
  ADMIN_RATINGS_TEMPORAL_NOTE,
} from "@/lib/admin/analytics-ratings-dictionary";
import {
  ADMIN_RATINGS_JOURNAL_PAGE_SIZE,
  type AdminRatingsBreakdownBundle,
  type AdminRatingsDiagnosticsBundle,
  type AdminRatingsEventsBundle,
  type AdminRatingsSummaryBundle,
} from "@/lib/admin/analytics-ratings";
import {
  buildAdminAnalyticsSearchParams,
  type AdminAnalyticsUrlState,
  type AdminRatingsAuthorSort,
  type AdminRatingsPeriod,
  type AdminRatingsProductSort,
  type AdminRatingsTab,
} from "@/lib/admin/analytics-url-state";

const PERIODS: ReadonlyArray<{ id: AdminRatingsPeriod; label: string }> = [
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "all", label: "Всё время" },
];

const emptyBreakdown: AdminRatingsBreakdownBundle = {
  products: {
    total: 0,
    rows: [],
    sort: "total_stars",
    sortDir: "desc",
    error: null,
  },
  authors: {
    total: 0,
    rows: [],
    sort: "total_stars",
    sortDir: "desc",
    error: null,
  },
};

function sortMark(active: boolean, dir: "asc" | "desc"): string {
  if (!active) return "";
  return dir === "desc" ? " ↓" : " ↑";
}

function formatWhen(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export default function AdminRatingsPanel({
  urlState,
  onPatch,
}: {
  urlState: AdminAnalyticsUrlState;
  onPatch: (patch: Partial<AdminAnalyticsUrlState>) => void;
}) {
  const [summary, setSummary] = useState<AdminRatingsSummaryBundle | null>(null);
  const [breakdown, setBreakdown] = useState(emptyBreakdown);
  const [events, setEvents] = useState<AdminRatingsEventsBundle | null>(null);
  const [diagnostics, setDiagnostics] =
    useState<AdminRatingsDiagnosticsBundle | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const summaryKey = urlState.ratingsPeriod;
  const breakdownKey = [
    urlState.ratingsQ,
    urlState.ratingsProductsSort,
    urlState.ratingsProductsSortDir,
    urlState.ratingsAuthorsSort,
    urlState.ratingsAuthorsSortDir,
  ].join("|");
  const eventsKey = [
    urlState.ratingsPeriod,
    urlState.ratingsEventKind,
    urlState.ratingsExcludedFilter,
    urlState.ratingsJournalPracticeId ?? "",
    urlState.ratingsJournalAuthorId ?? "",
    String(urlState.ratingsJournalOffset),
  ].join("|");

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoadingSummary(true);
      setLoadingBreakdown(true);
      setLoadingEvents(true);
      setError(null);

      const params = buildAdminAnalyticsSearchParams(urlState);
      try {
        const [summaryRes, breakdownRes, eventsRes, diagRes] = await Promise.all([
          fetch(`/api/admin/analytics/ratings/summary?${params}`, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }),
          fetch(`/api/admin/analytics/ratings/breakdown?${params}`, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }),
          fetch(`/api/admin/analytics/ratings/events?${params}`, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }),
          fetch("/api/admin/analytics/ratings/diagnostics", {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }),
        ]);

        if (!summaryRes.ok) throw new Error(`ratings_summary_${summaryRes.status}`);
        if (!breakdownRes.ok) {
          throw new Error(`ratings_breakdown_${breakdownRes.status}`);
        }
        if (!eventsRes.ok) throw new Error(`ratings_events_${eventsRes.status}`);
        if (!diagRes.ok) throw new Error(`ratings_diagnostics_${diagRes.status}`);

        const [summaryData, breakdownData, eventsData, diagData] =
          (await Promise.all([
            summaryRes.json(),
            breakdownRes.json(),
            eventsRes.json(),
            diagRes.json(),
          ])) as [
            AdminRatingsSummaryBundle,
            AdminRatingsBreakdownBundle,
            AdminRatingsEventsBundle,
            AdminRatingsDiagnosticsBundle,
          ];

        if (controller.signal.aborted) return;
        setSummary(summaryData);
        setBreakdown(breakdownData);
        setEvents(eventsData);
        setDiagnostics(diagData);
        setLoadingSummary(false);
        setLoadingBreakdown(false);
        setLoadingEvents(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "error");
        setLoadingSummary(false);
        setLoadingBreakdown(false);
        setLoadingEvents(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed fetch
  }, [summaryKey, breakdownKey, eventsKey]);

  const cards = useMemo(() => {
    if (!summary) return [];
    return [
      {
        key: "count",
        label: "Всего оценок",
        value: summary.ratingCount.toLocaleString("ru-RU"),
        hint: "Активные (excluded_at IS NULL) в окне created_at",
      },
      {
        key: "stars",
        label: "Всего звёзд",
        value: summary.totalStars.toLocaleString("ru-RU"),
        hint: "SUM(stars) тех же активных строк",
      },
      {
        key: "raters",
        label: "Уникальных оценивших",
        value: summary.uniqueRaters.toLocaleString("ru-RU"),
        hint: "DISTINCT user_id",
      },
      {
        key: "avg",
        label: "Средняя оценка",
        value: summary.averageFormatted,
        hint: ADMIN_RATINGS_AVG_NOTE,
      },
      {
        key: "eligible",
        label: "Eligible listeners",
        value: summary.eligibleListeners.toLocaleString("ru-RU"),
        hint: "Пары user×practice с rating_eligible_at",
      },
      {
        key: "unrated",
        label: "Eligible, но не оценили",
        value: summary.eligibleUnrated.toLocaleString("ru-RU"),
        hint: "Eligible без активной неисключённой оценки",
      },
      {
        key: "conversion",
        label: "Конверсия eligible → rating",
        value: summary.conversionFormatted,
        hint: "rated_eligible / eligible, без деления на ноль",
      },
    ];
  }, [summary]);

  function toggleProductSort(sort: AdminRatingsProductSort) {
    if (urlState.ratingsProductsSort === sort) {
      onPatch({
        ratingsProductsSortDir:
          urlState.ratingsProductsSortDir === "desc" ? "asc" : "desc",
      });
      return;
    }
    onPatch({ ratingsProductsSort: sort, ratingsProductsSortDir: "desc" });
  }

  function toggleAuthorSort(sort: AdminRatingsAuthorSort) {
    if (urlState.ratingsAuthorsSort === sort) {
      onPatch({
        ratingsAuthorsSortDir:
          urlState.ratingsAuthorsSortDir === "desc" ? "asc" : "desc",
      });
      return;
    }
    onPatch({ ratingsAuthorsSort: sort, ratingsAuthorsSortDir: "desc" });
  }

  function exportCurrent() {
    if (urlState.ratingsTab === "authors") {
      downloadCsv(
        "audiolad-ratings-authors.csv",
        buildCsv(
          [
            "author",
            "total_stars",
            "rating_count",
            "average",
            "unique_raters",
            "stars_7d",
            "count_7d",
            "stars_30d",
            "count_30d",
            "rating_bearing_products",
          ],
          breakdown.authors.rows.map((row) => [
            row.authorName,
            row.totalStars,
            row.ratingCount,
            row.averageFormatted,
            row.uniqueRaters,
            row.stars7d,
            row.count7d,
            row.stars30d,
            row.count30d,
            row.ratingBearingProducts,
          ]),
        ),
      );
      return;
    }
    downloadCsv(
      "audiolad-ratings-products.csv",
      buildCsv(
        [
          "product",
          "author",
          "type",
          "total_stars",
          "rating_count",
          "average",
          "stars_7d",
          "count_7d",
          "stars_30d",
          "count_30d",
          "eligible",
          "conversion",
        ],
        breakdown.products.rows.map((row) => [
          row.title,
          row.authorName,
          row.productKind,
          row.totalStars,
          row.ratingCount,
          row.averageFormatted,
          row.stars7d,
          row.count7d,
          row.stars30d,
          row.count30d,
          row.eligibleListeners,
          row.conversionFormatted,
        ]),
      ),
    );
  }

  const tab: AdminRatingsTab = urlState.ratingsTab;
  const journalPage =
    Math.floor(urlState.ratingsJournalOffset / ADMIN_RATINGS_JOURNAL_PAGE_SIZE) +
    1;
  const journalPages = Math.max(
    1,
    Math.ceil((events?.total ?? 0) / ADMIN_RATINGS_JOURNAL_PAGE_SIZE),
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[19px] font-semibold text-[#25135c]">Оценки</h3>
        <p className="mt-1 text-sm text-[#796ba0]">{ADMIN_RATINGS_TEMPORAL_NOTE}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Период оценок">
        {PERIODS.map((option) => {
          const active = option.id === urlState.ratingsPeriod;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() =>
                onPatch({
                  ratingsPeriod: option.id,
                  ratingsJournalOffset: 0,
                })
              }
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                active
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#eadff8] bg-white text-[#7042c5]"
              }`}
              aria-pressed={active}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {loadingSummary ? (
        <p className="text-sm text-[#796ba0]">Загрузка сводки оценок…</p>
      ) : error ? (
        <p className="text-sm text-[#b34f63]">Не удалось загрузить оценки: {error}</p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {cards.map((card) => (
              <article
                key={card.key}
                className="rounded-[18px] border border-[#eadff8] bg-white p-4 shadow-sm"
                title={card.hint}
              >
                <p className="text-xs font-medium text-[#796ba0]">{card.label}</p>
                <p className="mt-1 text-xl font-semibold text-[#25135c]">
                  {card.value}
                </p>
              </article>
            ))}
          </div>
          <p className="text-xs text-[#796ba0]">
            Активных: {summary.activeCount.toLocaleString("ru-RU")}. Исключённых:{" "}
            {summary.excludedCount.toLocaleString("ru-RU")}. Период:{" "}
            {summary.periodLabel}.
          </p>
        </>
      ) : null}

      {diagnostics?.attention ? (
        <section
          className="rounded-[18px] border border-[#f0d48a] bg-[#fff8e8] p-4"
          aria-labelledby="ratings-attention-heading"
        >
          <h4
            id="ratings-attention-heading"
            className="text-sm font-semibold text-[#6a5310]"
          >
            Требует внимания
          </h4>
          <p className="mt-1 text-xs text-[#6a5310]">
            {ADMIN_RATINGS_DIAGNOSTICS_NOTE}
          </p>
          <ul className="mt-3 space-y-2">
            {diagnostics.observations.map((item) => (
              <li key={item.kind} className="text-sm text-[#6a5310]">
                <span className="font-medium">{item.label}.</span> {item.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : diagnostics ? (
        <p className="text-xs text-[#796ba0]">{ADMIN_RATINGS_DIAGNOSTICS_NOTE}</p>
      ) : null}

      <section
        className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
        aria-labelledby="ratings-tables-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 id="ratings-tables-heading" className="text-[19px] font-semibold">
              Продукты и авторы
            </h4>
            <p className="mt-1 text-sm text-[#796ba0]">
              Таблицы всегда показывают all-time + окна 7/30 дней по created_at.
            </p>
          </div>
          <button
            type="button"
            onClick={exportCurrent}
            className="rounded-full border border-[#eadff8] px-4 py-2 text-sm font-medium text-[#7042c5]"
          >
            Export CSV
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["products", "Продукты"],
              ["authors", "Авторы"],
              ["journal", "Журнал"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onPatch({ ratingsTab: id })}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                tab === id
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#eadff8] text-[#7042c5]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab !== "journal" ? (
          <div className="mt-4">
            <input
              type="search"
              value={urlState.ratingsQ}
              onChange={(event) => onPatch({ ratingsQ: event.target.value })}
              placeholder="Поиск: название или автор"
              className="min-w-[220px] w-full rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm"
              aria-label="Поиск продуктов и авторов"
            />
          </div>
        ) : null}

        {loadingBreakdown && tab !== "journal" ? (
          <p className="mt-6 text-sm text-[#796ba0]">Загружаем таблицы…</p>
        ) : null}

        {!loadingBreakdown && tab === "products" ? (
          breakdown.products.rows.length === 0 ? (
            <p className="mt-6 text-sm text-[#9485b4]">
              Нет продуктов с оценками или eligible-слушателями.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="text-[#796ba0]">
                  <tr className="border-b border-[#eadff8]">
                    <th className="px-2 py-2">Продукт</th>
                    <th className="px-2 py-2">Автор</th>
                    <th className="px-2 py-2">Тип</th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleProductSort("total_stars")}
                      >
                        Звёзды
                        {sortMark(
                          breakdown.products.sort === "total_stars",
                          breakdown.products.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleProductSort("rating_count")}
                      >
                        Оценок
                        {sortMark(
                          breakdown.products.sort === "rating_count",
                          breakdown.products.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">Средняя</th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleProductSort("stars_7d")}
                      >
                        7д ★
                        {sortMark(
                          breakdown.products.sort === "stars_7d",
                          breakdown.products.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">7д N</th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleProductSort("stars_30d")}
                      >
                        30д ★
                        {sortMark(
                          breakdown.products.sort === "stars_30d",
                          breakdown.products.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">30д N</th>
                    <th className="px-2 py-2">Eligible</th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleProductSort("conversion")}
                      >
                        Conv.
                        {sortMark(
                          breakdown.products.sort === "conversion",
                          breakdown.products.sortDir,
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.products.rows.map((row) => (
                    <tr key={row.practiceId} className="border-b border-[#f3ecfb]">
                      <td className="px-2 py-3 font-medium text-[#25135c]">
                        {row.href ? (
                          <Link
                            href={row.href}
                            className="text-[#7042c5] hover:underline"
                          >
                            {row.title}
                          </Link>
                        ) : (
                          row.title
                        )}
                      </td>
                      <td className="px-2 py-3">{row.authorName}</td>
                      <td className="px-2 py-3">
                        {getProductKindLabel(row.productKind)}
                      </td>
                      <td className="px-2 py-3">
                        {row.totalStars.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.ratingCount.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">{row.averageFormatted}</td>
                      <td className="px-2 py-3">
                        {row.stars7d.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.count7d.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.stars30d.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.count30d.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.eligibleListeners.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">{row.conversionFormatted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {!loadingBreakdown && tab === "authors" ? (
          breakdown.authors.rows.length === 0 ? (
            <p className="mt-6 text-sm text-[#9485b4]">
              Нет авторов с активными оценками.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="text-[#796ba0]">
                  <tr className="border-b border-[#eadff8]">
                    <th className="px-2 py-2">Автор</th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleAuthorSort("total_stars")}
                      >
                        Звёзды
                        {sortMark(
                          breakdown.authors.sort === "total_stars",
                          breakdown.authors.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleAuthorSort("rating_count")}
                      >
                        Оценок
                        {sortMark(
                          breakdown.authors.sort === "rating_count",
                          breakdown.authors.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">Средняя</th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleAuthorSort("unique_raters")}
                      >
                        Оценивших
                        {sortMark(
                          breakdown.authors.sort === "unique_raters",
                          breakdown.authors.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleAuthorSort("stars_7d")}
                      >
                        7д ★
                        {sortMark(
                          breakdown.authors.sort === "stars_7d",
                          breakdown.authors.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">7д N</th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleAuthorSort("stars_30d")}
                      >
                        30д ★
                        {sortMark(
                          breakdown.authors.sort === "stars_30d",
                          breakdown.authors.sortDir,
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2">30д N</th>
                    <th className="px-2 py-2">Продуктов</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.authors.rows.map((row) => (
                    <tr key={row.authorId} className="border-b border-[#f3ecfb]">
                      <td className="px-2 py-3 font-medium text-[#25135c]">
                        {row.href ? (
                          <Link
                            href={row.href}
                            className="text-[#7042c5] hover:underline"
                          >
                            {row.authorName}
                          </Link>
                        ) : (
                          row.authorName
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {row.totalStars.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.ratingCount.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">{row.averageFormatted}</td>
                      <td className="px-2 py-3">
                        {row.uniqueRaters.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.stars7d.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.count7d.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.stars30d.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.count30d.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-3">
                        {row.ratingBearingProducts.toLocaleString("ru-RU")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "journal" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-[#796ba0]">{ADMIN_RATINGS_JOURNAL_NOTE}</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Все события"],
                  ["first", "Первые"],
                  ["changed", "Изменения"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    onPatch({
                      ratingsEventKind: id,
                      ratingsJournalOffset: 0,
                    })
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    urlState.ratingsEventKind === id
                      ? "bg-[#7042c5] text-white"
                      : "border border-[#eadff8] text-[#7042c5]"
                  }`}
                >
                  {label}
                </button>
              ))}
              {(
                [
                  ["all", "Все строки"],
                  ["included", "Активные"],
                  ["excluded", "Исключённые"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={`ex-${id}`}
                  type="button"
                  onClick={() =>
                    onPatch({
                      ratingsExcludedFilter: id,
                      ratingsJournalOffset: 0,
                    })
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    urlState.ratingsExcludedFilter === id
                      ? "bg-[#25135c] text-white"
                      : "border border-[#eadff8] text-[#7042c5]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="text-xs text-[#796ba0]">
                Продукт
                <select
                  className="mt-1 block min-w-[220px] rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm text-[#25135c]"
                  value={urlState.ratingsJournalPracticeId ?? ""}
                  onChange={(event) =>
                    onPatch({
                      ratingsJournalPracticeId: event.target.value || null,
                      ratingsJournalOffset: 0,
                    })
                  }
                >
                  <option value="">Все продукты</option>
                  {breakdown.products.rows.map((row) => (
                    <option key={row.practiceId} value={row.practiceId}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[#796ba0]">
                Автор
                <select
                  className="mt-1 block min-w-[220px] rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm text-[#25135c]"
                  value={urlState.ratingsJournalAuthorId ?? ""}
                  onChange={(event) =>
                    onPatch({
                      ratingsJournalAuthorId: event.target.value || null,
                      ratingsJournalOffset: 0,
                    })
                  }
                >
                  <option value="">Все авторы</option>
                  {breakdown.authors.rows.map((row) => (
                    <option key={row.authorId} value={row.authorId}>
                      {row.authorName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {loadingEvents ? (
              <p className="text-sm text-[#796ba0]">Загружаем журнал…</p>
            ) : events?.rows.length === 0 ? (
              <p className="text-sm text-[#9485b4]">В журнале нет событий.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full text-left text-sm">
                  <thead className="text-[#796ba0]">
                    <tr className="border-b border-[#eadff8]">
                      <th className="px-2 py-2">Время</th>
                      <th className="px-2 py-2">Продукт</th>
                      <th className="px-2 py-2">Автор</th>
                      <th className="px-2 py-2">Слушатель</th>
                      <th className="px-2 py-2">Было</th>
                      <th className="px-2 py-2">Стало</th>
                      <th className="px-2 py-2">Тип</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(events?.rows ?? []).map((row) => (
                      <tr key={row.id} className="border-b border-[#f3ecfb]">
                        <td className="px-2 py-3 whitespace-nowrap">
                          {formatWhen(row.occurredAt)}
                        </td>
                        <td className="px-2 py-3">
                          {row.href ? (
                            <Link
                              href={row.href}
                              className="text-[#7042c5] hover:underline"
                            >
                              {row.title}
                            </Link>
                          ) : (
                            row.title
                          )}
                          {row.excluded ? (
                            <span className="ml-2 rounded-full bg-[#fff8e8] px-2 py-0.5 text-[11px] text-[#6a5310]">
                              исключена
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-3">{row.authorName}</td>
                        <td className="px-2 py-3">{row.listenerLabel}</td>
                        <td className="px-2 py-3">
                          {row.oldStars == null ? "—" : row.oldStars}
                        </td>
                        <td className="px-2 py-3">{row.newStars}</td>
                        <td className="px-2 py-3">
                          {row.eventKind === "first" ? "first" : "changed"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm text-[#796ba0]">
              <span>
                Показано {events?.rows.length ?? 0} из {events?.total ?? 0}.
                Страница {journalPage} / {journalPages}.
              </span>
              <button
                type="button"
                disabled={urlState.ratingsJournalOffset <= 0}
                onClick={() =>
                  onPatch({
                    ratingsJournalOffset: Math.max(
                      0,
                      urlState.ratingsJournalOffset -
                        ADMIN_RATINGS_JOURNAL_PAGE_SIZE,
                    ),
                  })
                }
                className="rounded-full border border-[#eadff8] px-3 py-1 text-[#7042c5] disabled:opacity-40"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={
                  !events ||
                  urlState.ratingsJournalOffset + ADMIN_RATINGS_JOURNAL_PAGE_SIZE >=
                    events.total
                }
                onClick={() =>
                  onPatch({
                    ratingsJournalOffset:
                      urlState.ratingsJournalOffset +
                      ADMIN_RATINGS_JOURNAL_PAGE_SIZE,
                  })
                }
                className="rounded-full border border-[#eadff8] px-3 py-1 text-[#7042c5] disabled:opacity-40"
              >
                Дальше
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section
        className="rounded-[18px] border border-[#eadff8] bg-[#fcfaff] p-4"
        aria-labelledby="ratings-excluded-heading"
      >
        <h4 id="ratings-excluded-heading" className="text-sm font-semibold">
          Исключённые оценки
        </h4>
        <p className="mt-1 text-xs text-[#796ba0]">{ADMIN_RATINGS_EXCLUDED_NOTE}</p>
        <p className="mt-2 text-xs text-[#796ba0]">{ADMIN_RATINGS_MODERATION_FOLLOWUP}</p>
        {diagnostics && diagnostics.excluded.total === 0 ? (
          <p className="mt-3 text-sm text-[#9485b4]">Исключённых оценок нет.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {(diagnostics?.excluded.rows ?? []).map((row) => (
              <li key={row.id} className="text-[#25135c]">
                {row.title} · {row.authorName} · {row.stars}★ ·{" "}
                {row.excludedReason || "без причины"} ·{" "}
                {formatWhen(row.excludedAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-[#9485b4]">{ADMIN_RATINGS_PREVIEW_UX_BACKLOG}</p>
    </div>
  );
}
