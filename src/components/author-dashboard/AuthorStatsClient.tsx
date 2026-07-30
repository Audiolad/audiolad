"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import {
  getAuthorStatsPeriodLabel,
  parseAuthorStatsPeriod,
} from "@/lib/author-stats/dates";
import {
  AUTHOR_STATS_CHART_METRIC_LABELS,
  AUTHOR_STATS_METHOD_NOTES,
  AUTHOR_STATS_PROMOTION_LINK_LABEL,
  AUTHOR_STATS_SOURCE_LABELS,
  formatAuthorStatsCount,
  formatAuthorStatsProductStatus,
  formatAuthorStatsRate,
} from "@/lib/author-stats/labels";
import type {
  AuthorStatsChartMetric,
  AuthorStatsPeriodKey,
  AuthorStatsProductRow,
  AuthorStatsSourceRow,
  AuthorStatsSummary,
  AuthorStatsTimeseriesPoint,
} from "@/lib/author-stats/types";
import type { AuthorWorkspace } from "@/lib/author-products/types";

type AuthorStatsClientProps = {
  authors: AuthorWorkspace[];
};

type LoadState = "loading" | "ready" | "error";

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[#9a8bb8]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[#2b2145]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#7d70a2]">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-[#2b2145]">{title}</h2>
      {children}
    </section>
  );
}

function pointValue(
  point: AuthorStatsTimeseriesPoint,
  metric: AuthorStatsChartMetric,
): number {
  switch (metric) {
    case "practice_views":
      return point.practiceViews;
    case "practice_unique_visitors":
      return point.practiceUniqueVisitors;
    case "plays":
      return point.plays;
    case "completions":
      return point.completions;
    case "library_saves":
      return point.librarySaves;
    case "gross_purchases":
      return point.grossPurchases;
    case "refund_sales":
      return point.refundSales;
    case "net_sales":
      return point.netSales;
    case "author_page_views":
      return point.authorPageViews;
    case "author_page_unique_visitors":
      return point.authorPageUniqueVisitors;
    default:
      return 0;
  }
}

function formatRubMinor(value: number): string {
  return `${(value / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function StatsSparkline({
  points,
  metric,
}: {
  points: AuthorStatsTimeseriesPoint[];
  metric: AuthorStatsChartMetric;
}) {
  const values = points.map((point) => pointValue(point, metric));
  const max = Math.max(...values, 0);
  const width = 640;
  const height = 180;
  const padX = 12;
  const padY = 16;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords = values.map((value, index) => {
    const x =
      values.length <= 1
        ? padX + innerW / 2
        : padX + (index / (values.length - 1)) * innerW;
    const y =
      max <= 0
        ? padY + innerH
        : padY + innerH - (value / max) * innerH;
    return { x, y, value, date: points[index]?.date ?? "" };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="rounded-[20px] border border-dashed border-[#eadff8] bg-white px-4 py-8 text-sm text-[#7d70a2]">
        Нет данных за выбранный период.
      </p>
    );
  }

  return (
    <div className="rounded-[20px] border border-[#eadff8] bg-white p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        role="img"
        aria-label={AUTHOR_STATS_CHART_METRIC_LABELS[metric]}
      >
        <line
          x1={padX}
          y1={padY + innerH}
          x2={padX + innerW}
          y2={padY + innerH}
          stroke="#eadff8"
          strokeWidth="1"
        />
        {max > 0 ? (
          <polyline
            fill="none"
            stroke="#7042c5"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polyline}
          />
        ) : null}
        {coords.map((c, index) => (
          <circle
            key={`${c.date}-${index}`}
            cx={c.x}
            cy={c.y}
            r={active === index ? 5 : 3}
            fill="#7042c5"
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            tabIndex={0}
            role="img"
            aria-label={`${c.date}: ${formatAuthorStatsCount(c.value)}`}
          />
        ))}
      </svg>
      {active !== null && coords[active] ? (
        <p className="mt-2 text-sm text-[#2b2145]">
          {coords[active].date}:{" "}
          <span className="font-semibold">
            {formatAuthorStatsCount(coords[active].value)}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-[#7d70a2]">
          Наведите на точку или сфокусируйте её с клавиатуры, чтобы увидеть
          значение.
        </p>
      )}
      <div className="mt-3 max-h-40 overflow-auto">
        <table className="w-full text-left text-xs text-[#5c5080]">
          <caption className="sr-only">
            Значения по дням: {AUTHOR_STATS_CHART_METRIC_LABELS[metric]}
          </caption>
          <thead>
            <tr className="border-b border-[#eadff8]">
              <th className="py-1 pr-3 font-medium">Дата</th>
              <th className="py-1 font-medium">Значение</th>
            </tr>
          </thead>
          <tbody>
            {coords.map((c) => (
              <tr key={c.date} className="border-b border-[#f4eefb]">
                <td className="py-1 pr-3">{c.date}</td>
                <td className="py-1">{formatAuthorStatsCount(c.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuthorStatsClient({ authors }: AuthorStatsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = parseAuthorStatsPeriod(searchParams.get("period"));
  const authorSlug = searchParams.get("author");

  const selectedAuthor = useMemo(() => {
    if (authorSlug) {
      return authors.find((item) => item.slug === authorSlug) ?? authors[0];
    }
    return authors[0];
  }, [authorSlug, authors]);

  const [summary, setSummary] = useState<AuthorStatsSummary | null>(null);
  const [points, setPoints] = useState<AuthorStatsTimeseriesPoint[]>([]);
  const [products, setProducts] = useState<AuthorStatsProductRow[]>([]);
  const [sources, setSources] = useState<AuthorStatsSourceRow[]>([]);
  const [summaryState, setSummaryState] = useState<LoadState>("loading");
  const [seriesState, setSeriesState] = useState<LoadState>("loading");
  const [productsState, setProductsState] = useState<LoadState>("loading");
  const [sourcesState, setSourcesState] = useState<LoadState>("loading");
  const [chartMetric, setChartMetric] =
    useState<AuthorStatsChartMetric>("practice_views");
  const [reloadToken, setReloadToken] = useState(0);

  function updateQuery(next: {
    author?: string;
    period?: AuthorStatsPeriodKey;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.author) params.set("author", next.author);
    if (next.period) params.set("period", next.period);
    router.replace(`/author-dashboard/stats?${params.toString()}`);
  }

  useEffect(() => {
    if (!selectedAuthor) return;

    let cancelled = false;
    const query = `author_id=${encodeURIComponent(selectedAuthor.id)}&period=${encodeURIComponent(period)}`;

    async function loadJson<T>(url: string): Promise<T> {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`status_${response.status}`);
      }
      return (await response.json()) as T;
    }

    async function loadAll() {
      await Promise.resolve();
      if (cancelled) return;

      setSummaryState("loading");
      setSeriesState("loading");
      setProductsState("loading");
      setSourcesState("loading");

      const summaryPromise = loadJson<{ summary: AuthorStatsSummary }>(
        `/api/author/stats/summary?${query}`,
      )
        .then((payload) => {
          if (cancelled) return;
          setSummary(payload.summary);
          setSummaryState("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setSummary(null);
          setSummaryState("error");
        });

      const seriesPromise = loadJson<{
        timeseries: { points: AuthorStatsTimeseriesPoint[] };
      }>(`/api/author/stats/timeseries?${query}`)
        .then((payload) => {
          if (cancelled) return;
          setPoints(payload.timeseries?.points ?? []);
          setSeriesState("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setPoints([]);
          setSeriesState("error");
        });

      const productsPromise = loadJson<{ products: AuthorStatsProductRow[] }>(
        `/api/author/stats/products?${query}`,
      )
        .then((payload) => {
          if (cancelled) return;
          setProducts(payload.products ?? []);
          setProductsState("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setProducts([]);
          setProductsState("error");
        });

      const sourcesPromise = loadJson<{ sources: AuthorStatsSourceRow[] }>(
        `/api/author/stats/sources?${query}`,
      )
        .then((payload) => {
          if (cancelled) return;
          setSources(payload.sources ?? []);
          setSourcesState("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setSources([]);
          setSourcesState("error");
        });

      await Promise.all([
        summaryPromise,
        seriesPromise,
        productsPromise,
        sourcesPromise,
      ]);
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [period, reloadToken, selectedAuthor]);

  const sourceTotalVisitors = sources.reduce(
    (total, row) => total + row.visitors,
    0,
  );

  const hasAnyActivity =
    summary !== null &&
    (summary.authorPageViews > 0 ||
      summary.practiceViews > 0 ||
      summary.plays > 0 ||
      summary.librarySaves > 0 ||
      summary.grossPurchases > 0);

  const anyError =
    summaryState === "error" ||
    seriesState === "error" ||
    productsState === "error" ||
    sourcesState === "error";

  return (
    <div className="space-y-6">
      <AuthorDashboardNav authorSlug={selectedAuthor?.slug} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <label className="block text-sm text-[#5c5080]">
          Период
          <select
            className="mt-1 block w-full min-w-[180px] rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm font-semibold text-[#2b2145]"
            value={period}
            onChange={(event) =>
              updateQuery({
                period: parseAuthorStatsPeriod(event.target.value),
              })
            }
          >
            <option value="7d">7 дней</option>
            <option value="30d">30 дней</option>
            <option value="90d">90 дней</option>
            <option value="all">Всё время</option>
          </select>
        </label>
      </div>

      <p className="text-sm text-[#7d70a2]">
        Сводка за {getAuthorStatsPeriodLabel(period).toLowerCase()}.
      </p>

      {anyError ? (
        <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          Не удалось загрузить часть статистики.
          <button
            type="button"
            className="ml-3 font-semibold underline"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            Повторить
          </button>
        </div>
      ) : null}

      {summaryState === "loading" ? (
        <p className="text-sm text-[#7d70a2]">Загрузка показателей…</p>
      ) : null}

      {summaryState === "ready" && summary && !hasAnyActivity ? (
        <div className="rounded-[20px] border border-dashed border-[#eadff8] bg-white px-5 py-8 text-center">
          <p className="text-[17px] font-semibold text-[#2b2145]">
            Пока нет данных за этот период
          </p>
          <p className="mt-2 text-sm text-[#7d70a2]">
            Когда слушатели откроют вашу страницу или продукты, здесь появятся
            показатели.
          </p>
        </div>
      ) : null}

      {summary ? (
        <>
          <Section title="Аудитория">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Посетители страницы автора"
                value={formatAuthorStatsCount(summary.authorPageUniqueVisitors)}
                hint="С даты запуска раздела"
              />
              <MetricCard
                label="Просмотры страницы автора"
                value={formatAuthorStatsCount(summary.authorPageViews)}
              />
              <MetricCard
                label="Посетители продуктов"
                value={formatAuthorStatsCount(summary.practiceUniqueVisitors)}
              />
              <MetricCard
                label="Просмотры продуктов"
                value={formatAuthorStatsCount(summary.practiceViews)}
              />
            </div>
          </Section>

          <Section title="Прослушивания, действия и продажи">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Запуски"
                value={formatAuthorStatsCount(summary.plays)}
              />
              <MetricCard
                label="Дошли до 25%"
                value={formatAuthorStatsCount(summary.progress25)}
              />
              <MetricCard
                label="Завершения"
                value={formatAuthorStatsCount(summary.completions)}
              />
              <MetricCard
                label="Добавления в Аудиотеку"
                value={formatAuthorStatsCount(summary.librarySaves)}
              />
              <MetricCard
                label="Покупки"
                value={formatAuthorStatsCount(summary.grossPurchases)}
              />
              <MetricCard
                label="Возвраты"
                value={formatAuthorStatsCount(summary.refundSales)}
                hint={`Полных: ${formatAuthorStatsCount(summary.fullRefunds)}, частичных: ${formatAuthorStatsCount(summary.partialRefunds)}`}
              />
              <MetricCard
                label="Чистые продажи"
                value={formatAuthorStatsCount(summary.netSales)}
              />
              <MetricCard
                label="Валовая выручка"
                value={formatRubMinor(summary.grossRevenueMinor)}
              />
              <MetricCard
                label="Возвращено"
                value={formatRubMinor(summary.refundedAmountMinor)}
              />
              <MetricCard
                label="Чистая выручка"
                value={formatRubMinor(summary.netRevenueMinor)}
              />
            </div>
          </Section>

          <Section title="Конверсии">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Просмотр → запуск"
                value={formatAuthorStatsRate(summary.viewToPlayRate)}
              />
              <MetricCard
                label="Запуск → завершение"
                value={formatAuthorStatsRate(summary.playToCompleteRate)}
              />
              <MetricCard
                label="Просмотр → сохранение"
                value={formatAuthorStatsRate(summary.viewToSaveRate)}
              />
              <MetricCard
                label="Просмотр → покупка"
                value={formatAuthorStatsRate(summary.viewToPurchaseRate)}
              />
            </div>
          </Section>
        </>
      ) : null}

      <Section title="Динамика">
        <label className="block text-sm text-[#5c5080]">
          Показатель
          <select
            className="mt-1 block w-full max-w-md rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm font-semibold text-[#2b2145]"
            value={chartMetric}
            onChange={(event) =>
              setChartMetric(event.target.value as AuthorStatsChartMetric)
            }
          >
            {(
              Object.keys(
                AUTHOR_STATS_CHART_METRIC_LABELS,
              ) as AuthorStatsChartMetric[]
            ).map((key) => (
              <option key={key} value={key}>
                {AUTHOR_STATS_CHART_METRIC_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        {seriesState === "loading" ? (
          <p className="text-sm text-[#7d70a2]">Загрузка графика…</p>
        ) : (
          <StatsSparkline points={points} metric={chartMetric} />
        )}
      </Section>

      <Section title="Продукты">
        {productsState === "loading" ? (
          <p className="text-sm text-[#7d70a2]">Загрузка таблицы…</p>
        ) : products.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#eadff8] bg-white px-5 py-8 text-center text-sm text-[#7d70a2]">
            У автора пока нет продуктов.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-[20px] border border-[#eadff8] bg-white md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#faf7ff] text-[#5c5080]">
                  <tr>
                    <th className="px-3 py-3 font-medium">Продукт</th>
                    <th className="px-3 py-3 font-medium">Статус</th>
                    <th className="px-3 py-3 font-medium">Просмотры</th>
                    <th className="px-3 py-3 font-medium">Посетители</th>
                    <th className="px-3 py-3 font-medium">Запуски</th>
                    <th className="px-3 py-3 font-medium">25%</th>
                    <th className="px-3 py-3 font-medium">Завершения</th>
                    <th className="px-3 py-3 font-medium">Сохранения</th>
                    <th className="px-3 py-3 font-medium">Покупки</th>
                    <th className="px-3 py-3 font-medium">Возвраты</th>
                    <th className="px-3 py-3 font-medium">Чистые продажи</th>
                    <th className="px-3 py-3 font-medium">Просмотр → запуск</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product.productSlug}
                      className="border-t border-[#f0e8fb]"
                    >
                      <td className="max-w-[220px] truncate px-3 py-3 font-medium text-[#2b2145]">
                        {product.title}
                      </td>
                      <td className="px-3 py-3 text-[#5c5080]">
                        {formatAuthorStatsProductStatus(product.status)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.practiceViews)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.practiceUniqueVisitors)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.plays)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.progress25)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.completions)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.librarySaves)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.grossPurchases)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.refundSales)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsCount(product.netSales)}
                      </td>
                      <td className="px-3 py-3">
                        {formatAuthorStatsRate(product.viewToPlayRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {products.map((product) => (
                <article
                  key={product.productSlug}
                  className="rounded-[20px] border border-[#eadff8] bg-white px-4 py-4"
                >
                  <h3 className="break-words text-base font-semibold text-[#2b2145]">
                    {product.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#7d70a2]">
                    {formatAuthorStatsProductStatus(product.status)}
                    {product.isFree ? " · бесплатный" : " · платный"}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-[#9a8bb8]">Просмотры</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.practiceViews)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">Посетители</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.practiceUniqueVisitors)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">Запуски</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.plays)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">25%</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.progress25)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">Завершения</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.completions)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">Сохранения</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.librarySaves)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">Покупки</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.grossPurchases)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">Возвраты</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.refundSales)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">Чистые продажи</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsCount(product.netSales)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#9a8bb8]">Просмотр → запуск</dt>
                      <dd className="font-semibold">
                        {formatAuthorStatsRate(product.viewToPlayRate)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Источники">
        {sourcesState === "loading" ? (
          <p className="text-sm text-[#7d70a2]">Загрузка источников…</p>
        ) : (
          <div className="space-y-3 rounded-[20px] border border-[#eadff8] bg-white p-4">
            {sources
              .filter((row) => row.visitors > 0 || row.views > 0 || row.plays > 0)
              .map((row) => {
                const share =
                  sourceTotalVisitors > 0
                    ? Math.round((row.visitors / sourceTotalVisitors) * 1000) /
                      10
                    : 0;
                return (
                  <div
                    key={row.bucket}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#f4eefb] pb-2 last:border-0"
                  >
                    <div>
                      <p className="font-semibold text-[#2b2145]">
                        {AUTHOR_STATS_SOURCE_LABELS[row.bucket]}
                      </p>
                      <p className="text-xs text-[#7d70a2]">
                        {formatAuthorStatsCount(row.views)} просмотров ·{" "}
                        {formatAuthorStatsCount(row.plays)} запусков
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[#7042c5]">
                      {formatAuthorStatsCount(row.visitors)} · {share}%
                    </p>
                  </div>
                );
              })}
            {sources.every(
              (row) => row.visitors === 0 && row.views === 0 && row.plays === 0,
            ) ? (
              <p className="text-sm text-[#7d70a2]">
                Источники появятся после первых визитов.
              </p>
            ) : null}
            <Link
              href={`/author-dashboard/promotion${
                selectedAuthor
                  ? `?author=${encodeURIComponent(selectedAuthor.slug)}`
                  : ""
              }`}
              className="inline-flex text-sm font-semibold text-[#7042c5] underline-offset-2 hover:underline"
            >
              {AUTHOR_STATS_PROMOTION_LINK_LABEL}
            </Link>
          </div>
        )}
      </Section>

      <section className="rounded-[20px] border border-[#eadff8] bg-[#faf7ff] px-4 py-4">
        <h2 className="text-sm font-semibold text-[#2b2145]">Как считаем</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#5c5080]">
          {AUTHOR_STATS_METHOD_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
