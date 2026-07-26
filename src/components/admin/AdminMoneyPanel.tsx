"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ADMIN_MONEY_AUTHOR_GROSS_TOOLTIP,
  ADMIN_MONEY_FUNNEL_NOTE,
  ADMIN_MONEY_PROVIDER_FEES_NOTE,
  ADMIN_MONEY_REFUNDS_NOTE,
  ADMIN_REFUND_ACCESS_NOTE,
  ADMIN_REFUND_METRIC_DICTIONARY,
} from "@/lib/admin/analytics-money-dictionary";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import type {
  AdminMoneyAuthorRow,
  AdminMoneyBreakdownBundle,
  AdminMoneyKpiCard,
  AdminMoneyProductRow,
  AdminMoneySummaryBundle,
} from "@/lib/admin/analytics-money-queries";
import { ADMIN_ANALYTICS_PERIOD_OPTIONS } from "@/lib/admin/analytics-period";
import { buildCsv, downloadCsv } from "@/lib/admin/analytics-csv";
import {
  buildAdminAnalyticsSearchParams,
  topNToLimit,
  type AdminAnalyticsUrlState,
  type AdminMoneyTab,
} from "@/lib/admin/analytics-url-state";
import AdminPathToPurchasePanel from "@/components/admin/AdminPathToPurchasePanel";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return <div className="h-8 w-16" aria-hidden />;
  const max = Math.max(...values, 1);
  const width = 64;
  const height = 28;
  const d = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function deltaTone(direction: "up" | "down" | "flat" | "neutral" | undefined): string {
  if (direction === "up") return "text-[#2f7d4a]";
  if (direction === "down") return "text-[#b34f63]";
  return "text-[#796ba0]";
}

const emptyBreakdown: AdminMoneyBreakdownBundle = {
  products: { total: 0, rows: [], sort: "gross_minor", sortDir: "desc", error: null },
  authors: { total: 0, rows: [], sort: "gross_minor", sortDir: "desc", error: null },
};

export default function AdminMoneyPanel({
  urlState,
  onPatch,
}: {
  urlState: AdminAnalyticsUrlState;
  onPatch: (patch: Partial<AdminAnalyticsUrlState>) => void;
}) {
  const [summary, setSummary] = useState<AdminMoneySummaryBundle | null>(null);
  const [breakdown, setBreakdown] = useState(emptyBreakdown);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const summaryKey = [
    urlState.moneyPeriod,
    urlState.includeTestPayments ? "1" : "0",
    urlState.moneyAuthorId ?? "",
    urlState.moneyPracticeId ?? "",
  ].join("|");

  const breakdownKey = [
    summaryKey,
    urlState.moneyTab,
    urlState.moneyQ,
    urlState.moneyTop,
    urlState.moneyProductsSort,
    urlState.moneyProductsSortDir,
    urlState.moneyAuthorsSort,
    urlState.moneyAuthorsSortDir,
  ].join("|");

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoadingSummary(true);
      setError(null);
      try {
        const params = buildAdminAnalyticsSearchParams(urlState);
        const response = await fetch(
          `/api/admin/analytics/money/summary?${params.toString()}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error(`summary_${response.status}`);
        const data = (await response.json()) as AdminMoneySummaryBundle;
        if (!controller.signal.aborted) {
          setSummary(data);
          setLoadingSummary(false);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "error");
        setLoadingSummary(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoadingBreakdown(true);
      try {
        const params = buildAdminAnalyticsSearchParams(urlState);
        params.set("moneyTop", urlState.moneyTop);
        const response = await fetch(
          `/api/admin/analytics/money/breakdown?${params.toString()}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error(`breakdown_${response.status}`);
        const data = (await response.json()) as AdminMoneyBreakdownBundle;
        if (!controller.signal.aborted) {
          setBreakdown(data);
          setLoadingBreakdown(false);
        }
      } catch {
        if (controller.signal.aborted) return;
        setLoadingBreakdown(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownKey]);

  const activeKpi = useMemo(() => {
    if (!summary || !urlState.moneyDrill) return null;
    return summary.kpi.find((item) => item.key === urlState.moneyDrill) ?? null;
  }, [summary, urlState.moneyDrill]);

  function exportProducts(rows: AdminMoneyProductRow[]) {
    const csv = buildCsv(
      [
        "practice_slug",
        "practice_title",
        "author_slug",
        "payment_count",
        "unique_buyers",
        "amount_minor",
        "formatted_amount",
        "currency",
        "aov_minor",
        "first_time_buyers",
        "repeat_buyers",
        "access_granted",
        "post_purchase_play",
      ],
      rows.map((row) => [
        row.slug ?? "",
        row.title,
        row.authorSlug ?? "",
        row.paymentCount,
        row.uniqueBuyers,
        row.grossMinor,
        formatRubFromMinor(row.grossMinor),
        "RUB",
        row.aovMinor ?? "",
        row.firstTimeBuyers,
        row.repeatBuyers,
        row.accessGranted,
        row.postPurchasePlay,
      ]),
    );
    downloadCsv("audiolad-money-products.csv", csv);
  }

  function exportAuthors(rows: AdminMoneyAuthorRow[]) {
    const csv = buildCsv(
      [
        "author_slug",
        "author_name",
        "published_practices",
        "sold_products",
        "payment_count",
        "unique_buyers",
        "amount_minor",
        "formatted_amount",
        "currency",
        "aov_minor",
        "first_time_buyers",
        "repeat_buyers",
      ],
      rows.map((row) => [
        row.authorSlug ?? "",
        row.authorName,
        row.publishedPractices,
        row.soldProducts,
        row.paymentCount,
        row.uniqueBuyers,
        row.grossMinor,
        formatRubFromMinor(row.grossMinor),
        "RUB",
        row.aovMinor ?? "",
        row.firstTimeBuyers,
        row.repeatBuyers,
      ]),
    );
    downloadCsv("audiolad-money-authors.csv", csv);
  }

  function exportSummary() {
    if (!summary) return;
    const csv = buildCsv(
      ["metric", "value", "amount_minor", "formatted_amount", "currency", "include_test"],
      [
        [
          "payment_count",
          summary.paymentCount,
          "",
          "",
          "RUB",
          summary.includeTest ? "1" : "0",
        ],
        [
          "unique_buyers",
          summary.uniqueBuyers,
          "",
          "",
          "RUB",
          summary.includeTest ? "1" : "0",
        ],
        [
          "gross",
          "",
          summary.grossMinor,
          formatRubFromMinor(summary.grossMinor),
          "RUB",
          summary.includeTest ? "1" : "0",
        ],
        [
          "aov",
          "",
          summary.aovMinor ?? "",
          formatRubFromMinor(summary.aovMinor),
          "RUB",
          summary.includeTest ? "1" : "0",
        ],
        [
          "new_buyers",
          summary.newBuyers,
          "",
          "",
          "RUB",
          summary.includeTest ? "1" : "0",
        ],
        [
          "repeat_buyers",
          summary.repeatBuyers,
          "",
          "",
          "RUB",
          summary.includeTest ? "1" : "0",
        ],
      ],
    );
    downloadCsv("audiolad-money-summary.csv", csv);
  }

  const rows =
    urlState.moneyTab === "authors" ? breakdown.authors.rows : breakdown.products.rows;
  const emptyPayments = summary && summary.paymentCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[19px] font-semibold text-[#25135c]">Деньги</h3>
          <p className="mt-1 text-sm text-[#796ba0]">
            Источник истины: успешные платежи (`payments.succeeded`).{" "}
            {ADMIN_MONEY_REFUNDS_NOTE}
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-full border border-[#eadff8] bg-white px-3 py-2 text-sm text-[#25135c]">
          <input
            type="checkbox"
            checked={urlState.includeTestPayments}
            onChange={(event) =>
              onPatch({ includeTestPayments: event.target.checked })
            }
          />
          Включить тестовые платежи
        </label>
      </div>

      {urlState.includeTestPayments ? (
        <p
          className="rounded-[14px] border border-[#f0d48a] bg-[#fff8e8] px-3 py-2 text-sm text-[#6a5310]"
          role="status"
        >
          Включены тестовые платежи. Сейчас в выборке test gross:{" "}
          {formatRubFromMinor(summary?.testGrossMinor ?? 0)}.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Денежный период">
        {ADMIN_ANALYTICS_PERIOD_OPTIONS.map((option) => {
          const active = option.id === urlState.moneyPeriod;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onPatch({ moneyPeriod: option.id, moneyDrill: null })}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                active
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#eadff8] bg-white text-[#7042c5]"
              }`}
              aria-pressed={active}
            >
              {option.id === "7d"
                ? "7"
                : option.id === "30d"
                  ? "30"
                  : option.id === "all"
                    ? "Все"
                    : option.label}
            </button>
          );
        })}
      </div>

      {loadingSummary ? (
        <p className="text-sm text-[#796ba0]">Загрузка денежных показателей…</p>
      ) : error ? (
        <p className="text-sm text-[#b34f63]">Не удалось загрузить деньги: {error}</p>
      ) : summary ? (
        <>
          {emptyPayments ? (
            <p className="rounded-[16px] border border-[#eadff8] bg-white px-4 py-6 text-sm text-[#796ba0]">
              За выбранный период успешных оплат не было.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {summary.kpi.map((item: AdminMoneyKpiCard) => {
              const tone = item.delta ? deltaTone(item.delta.direction) : "text-[#796ba0]";
              const sparkColor =
                item.delta?.direction === "down"
                  ? "#b34f63"
                  : item.delta?.direction === "up"
                    ? "#2f7d4a"
                    : "#7042c5";
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onPatch({ moneyDrill: item.key })}
                  className="rounded-[18px] border border-[#eadff8] bg-white p-3 text-left shadow-sm transition hover:border-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                  title={`${item.hint}\nТип: ${item.kindLabel}\nФормула: ${item.formula}`}
                  aria-label={`${item.label}: ${item.formatted}. ${item.delta?.compactLabel ?? "без сравнения"}.`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-[#796ba0]">{item.label}</p>
                    <Sparkline values={item.sparkline} color={sparkColor} />
                  </div>
                  <p className="mt-1 text-xl font-semibold text-[#25135c] sm:text-2xl">
                    {item.formatted}
                  </p>
                  <p className={`mt-1 text-xs font-medium ${tone}`}>
                    {item.delta?.compactLabel ?? "—"}
                  </p>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-[#796ba0]">
            Новые покупатели: {summary.newBuyers}. Повторные: {summary.repeatBuyers}.{" "}
            {ADMIN_MONEY_FUNNEL_NOTE}
          </p>

          <section className="space-y-3" aria-labelledby="money-refunds-heading">
            <h4 id="money-refunds-heading" className="text-[17px] font-semibold">
              Возвраты и чистые поступления
            </h4>
            {summary.refunds ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  {(
                    [
                      {
                        key: "refunded" as const,
                        value: formatRubFromMinor(summary.refunds.refundedMinor),
                        sub: `${summary.refunds.refundCount} шт.`,
                      },
                      {
                        key: "netCollected" as const,
                        value: formatRubFromMinor(summary.refunds.netMinor),
                        sub: "до комиссий",
                      },
                      {
                        key: "providerFees" as const,
                        value: ADMIN_MONEY_PROVIDER_FEES_NOTE,
                        sub: "—",
                      },
                      {
                        key: "refundsPending" as const,
                        value: String(summary.refunds.pendingCount),
                        sub: formatRubFromMinor(summary.refunds.pendingMinor),
                      },
                      {
                        key: "refundsRequiresReview" as const,
                        value: String(summary.refunds.requiresReviewCount),
                        sub: formatRubFromMinor(summary.refunds.requiresReviewMinor),
                      },
                    ]
                  ).map((card) => {
                    const def = ADMIN_REFUND_METRIC_DICTIONARY[card.key];
                    return (
                      <div
                        key={card.key}
                        className="rounded-[18px] border border-[#eadff8] bg-white p-3 shadow-sm"
                        title={`${def.hint}\nТип: ${def.kindLabel}\nФормула: ${def.formula}`}
                      >
                        <p className="text-xs font-medium text-[#796ba0]">{def.label}</p>
                        <p className="mt-1 text-xl font-semibold text-[#25135c] sm:text-2xl">
                          {card.value}
                        </p>
                        <p className="mt-1 text-xs text-[#796ba0]">{card.sub}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-[#796ba0]">
                  Полностью возвращённых оплат: {summary.refunds.fullyRefundedPayments}.
                  Частично: {summary.refunds.partiallyRefundedPayments}.{" "}
                  {ADMIN_REFUND_ACCESS_NOTE}
                </p>
                <p className="text-xs text-[#796ba0]">
                  Доля авторов в этих суммах не учтена: обязательства перед
                  авторами считаются отдельным реестром в разделе «Экономика
                  авторов».
                </p>
              </>
            ) : (
              <p className="rounded-[16px] border border-[#eadff8] bg-white px-4 py-4 text-sm text-[#796ba0]">
                Слой возвратов недоступен. «Получено оплат» показано без изменений.
              </p>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="money-funnel-heading">
            <h4 id="money-funnel-heading" className="text-[17px] font-semibold">
              Денежная воронка
            </h4>
            <div className="overflow-x-auto rounded-[16px] border border-[#eadff8] bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#faf7ff] text-[#796ba0]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Этап</th>
                    <th className="px-3 py-2 font-medium">Тип</th>
                    <th className="px-3 py-2 font-medium">Значение</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.funnel.map((step) => (
                    <tr key={step.key} className="border-t border-[#f1e9fb]">
                      <td className="px-3 py-2 text-[#25135c]">{step.label}</td>
                      <td className="px-3 py-2 text-[#796ba0]">{step.entity}</td>
                      <td className="px-3 py-2 font-medium text-[#25135c]">
                        {step.value.toLocaleString("ru-RU")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="money-ts-heading">
            <h4 id="money-ts-heading" className="text-[17px] font-semibold">
              Динамика
            </h4>
            <p className="text-xs text-[#796ba0]">
              Daily unique buyers не суммируются в period unique buyers.
            </p>
            <div className="overflow-x-auto rounded-[16px] border border-[#eadff8] bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#faf7ff] text-[#796ba0]">
                  <tr>
                    <th className="px-3 py-2 font-medium">День</th>
                    <th className="px-3 py-2 font-medium">Оплаты</th>
                    <th className="px-3 py-2 font-medium">Покупатели</th>
                    <th className="px-3 py-2 font-medium">Сумма</th>
                    <th className="px-3 py-2 font-medium">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.timeseries.map((point) => (
                    <tr key={point.bucket} className="border-t border-[#f1e9fb]">
                      <td className="px-3 py-2">{point.bucket}</td>
                      <td className="px-3 py-2">{point.payments}</td>
                      <td className="px-3 py-2">{point.uniqueBuyers}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatRubFromMinor(point.grossMinor)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatRubFromMinor(point.aovMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <AdminPathToPurchasePanel urlState={urlState} onPatch={onPatch} />

      <section className="space-y-3" aria-labelledby="money-breakdown-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id="money-breakdown-heading" className="text-[17px] font-semibold">
            Разрезы
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
              onClick={exportSummary}
            >
              CSV summary
            </button>
            <button
              type="button"
              className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
              onClick={() =>
                urlState.moneyTab === "authors"
                  ? exportAuthors(breakdown.authors.rows)
                  : exportProducts(breakdown.products.rows)
              }
            >
              CSV {urlState.moneyTab === "authors" ? "авторы" : "продукты"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["products", "authors"] as AdminMoneyTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onPatch({ moneyTab: tab })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                urlState.moneyTab === tab
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#eadff8] bg-white text-[#7042c5]"
              }`}
            >
              {tab === "products" ? "Продукты" : "Авторы"}
            </button>
          ))}
          {(["10", "25", "all"] as const).map((top) => (
            <button
              key={top}
              type="button"
              onClick={() => onPatch({ moneyTop: top })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                urlState.moneyTop === top
                  ? "bg-[#eadff8] text-[#25135c]"
                  : "border border-[#eadff8] bg-white text-[#796ba0]"
              }`}
            >
              {top === "all" ? "Все" : `Top ${top}`}
            </button>
          ))}
        </div>

        <input
          value={urlState.moneyQ}
          onChange={(event) => onPatch({ moneyQ: event.target.value })}
          placeholder="Поиск по названию, slug, автору"
          className="w-full rounded-[14px] border border-[#eadff8] bg-white px-3 py-2 text-sm text-[#25135c]"
        />

        {loadingBreakdown ? (
          <p className="text-sm text-[#796ba0]">Загрузка таблицы…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-[16px] border border-[#eadff8] bg-white px-4 py-6 text-sm text-[#796ba0]">
            За выбранный период успешных оплат не было.
          </p>
        ) : urlState.moneyTab === "products" ? (
          <div className="overflow-x-auto rounded-[16px] border border-[#eadff8] bg-white">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-[#faf7ff] text-[#796ba0]">
                <tr>
                  <th className="px-3 py-2">Продукт</th>
                  <th className="px-3 py-2">Автор</th>
                  <th className="px-3 py-2">Оплаты</th>
                  <th className="px-3 py-2">Покупатели</th>
                  <th className="px-3 py-2">Сумма</th>
                  <th className="px-3 py-2">AOV</th>
                  <th className="px-3 py-2">New</th>
                  <th className="px-3 py-2">Repeat</th>
                  <th className="px-3 py-2">Доступ</th>
                  <th className="px-3 py-2">Play</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.products.rows.map((row) => (
                  <tr key={row.practiceId} className="border-t border-[#f1e9fb]">
                    <td className="px-3 py-2">
                      {row.href ? (
                        <Link href={row.href} className="text-[#7042c5] underline-offset-2 hover:underline">
                          {row.title}
                        </Link>
                      ) : (
                        row.title
                      )}
                    </td>
                    <td className="px-3 py-2">{row.authorName}</td>
                    <td className="px-3 py-2">{row.paymentCount}</td>
                    <td className="px-3 py-2">{row.uniqueBuyers}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatRubFromMinor(row.grossMinor)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatRubFromMinor(row.aovMinor)}
                    </td>
                    <td className="px-3 py-2">{row.firstTimeBuyers}</td>
                    <td className="px-3 py-2">{row.repeatBuyers}</td>
                    <td className="px-3 py-2">{row.accessGranted}</td>
                    <td className="px-3 py-2">
                      {row.postPurchasePlay}
                      {row.playConversionPct !== null ? ` (${row.playConversionPct}%)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[16px] border border-[#eadff8] bg-white">
            <table className="min-w-[860px] w-full text-left text-sm">
              <thead className="bg-[#faf7ff] text-[#796ba0]">
                <tr>
                  <th className="px-3 py-2">Автор</th>
                  <th className="px-3 py-2">Опубл.</th>
                  <th className="px-3 py-2">Продано</th>
                  <th className="px-3 py-2">Оплаты</th>
                  <th className="px-3 py-2">Покупатели</th>
                  <th className="px-3 py-2" title={ADMIN_MONEY_AUTHOR_GROSS_TOOLTIP}>
                    Сумма оплат
                  </th>
                  <th className="px-3 py-2">AOV</th>
                  <th className="px-3 py-2">New</th>
                  <th className="px-3 py-2">Repeat</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.authors.rows.map((row) => (
                  <tr
                    key={row.authorId ?? row.authorName}
                    className="border-t border-[#f1e9fb]"
                  >
                    <td className="px-3 py-2">{row.authorName}</td>
                    <td className="px-3 py-2">{row.publishedPractices}</td>
                    <td className="px-3 py-2">{row.soldProducts}</td>
                    <td className="px-3 py-2">{row.paymentCount}</td>
                    <td className="px-3 py-2">{row.uniqueBuyers}</td>
                    <td
                      className="px-3 py-2 whitespace-nowrap"
                      title={ADMIN_MONEY_AUTHOR_GROSS_TOOLTIP}
                    >
                      {formatRubFromMinor(row.grossMinor)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatRubFromMinor(row.aovMinor)}
                    </td>
                    <td className="px-3 py-2">{row.firstTimeBuyers}</td>
                    <td className="px-3 py-2">{row.repeatBuyers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-[#796ba0]">
              {ADMIN_MONEY_AUTHOR_GROSS_TOOLTIP}
            </p>
          </div>
        )}
        <p className="text-xs text-[#796ba0]">
          Показано до {topNToLimit(urlState.moneyTop)} строк. Staff payments не
          исключаются автоматически: test и staff — разные понятия.
        </p>
      </section>

      {activeKpi ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeKpi.label}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 sm:items-center"
          onClick={() => onPatch({ moneyDrill: null })}
          onKeyDown={(event) => {
            if (event.key === "Escape") onPatch({ moneyDrill: null });
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[20px] bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-[#25135c]">{activeKpi.label}</h4>
                <p className="mt-1 text-2xl font-semibold">{activeKpi.formatted}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-[#eadff8] px-3 py-1 text-sm"
                onClick={() => onPatch({ moneyDrill: null })}
              >
                Закрыть
              </button>
            </div>
            <p className="mt-3 text-sm text-[#796ba0]">{activeKpi.hint}</p>
            <p className="mt-2 text-xs text-[#796ba0]">Тип: {activeKpi.kindLabel}</p>
            <p className="mt-1 text-xs text-[#796ba0]">Формула: {activeKpi.formula}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
