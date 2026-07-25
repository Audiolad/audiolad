"use client";

import { useEffect, useState } from "react";

import {
  buildPathProductsCsv,
  buildPathSummaryCsv,
  buildPathSurfacesCsv,
  formatPathRate,
  type AdminPathBundle,
} from "@/lib/admin/analytics-path-queries";
import { downloadCsv } from "@/lib/admin/analytics-csv";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import { ADMIN_ANALYTICS_PERIOD_OPTIONS } from "@/lib/admin/analytics-period";
import {
  buildAdminAnalyticsSearchParams,
  type AdminAnalyticsUrlState,
} from "@/lib/admin/analytics-url-state";

type Props = {
  urlState: AdminAnalyticsUrlState;
  onPatch: (patch: Partial<AdminAnalyticsUrlState>) => void;
};

export default function AdminPathToPurchasePanel({ urlState, onPatch }: Props) {
  const [bundle, setBundle] = useState<AdminPathBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const params = buildAdminAnalyticsSearchParams(urlState);
        const response = await fetch(
          `/api/admin/analytics/path?${params.toString()}`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => null)) as
          | AdminPathBundle
          | { error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok || !body || !("stages" in body)) {
          setError(
            body && "error" in body && typeof body.error === "string"
              ? body.error
              : "load_failed",
          );
          setBundle(null);
          return;
        }
        setBundle(body);
      } catch {
        if (!cancelled) {
          setError("load_failed");
          setBundle(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    urlState.pathPeriod,
    urlState.includeTestPayments,
    urlState.pathProduct,
    urlState.pathSurface,
    urlState.pathMode,
  ]);

  const noExactLinks =
    bundle != null && bundle.cohort.exactClickLinkedOrders === 0;

  return (
    <section className="space-y-4" aria-labelledby="path-to-purchase-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            id="path-to-purchase-heading"
            className="text-[19px] font-semibold text-[#25135c]"
          >
            Путь до покупки
          </h3>
          <p
            className="mt-1 text-sm text-[#796ba0]"
            title={bundle?.methodologyNote}
          >
            Order cohort: исходы считаются по заказам, созданным в периоде.
            Просмотры/клики — отдельный engagement ratio, не строгая person funnel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
            onClick={() => {
              if (!bundle) return;
              downloadCsv(
                "audiolad-path-summary.csv",
                buildPathSummaryCsv(bundle),
              );
            }}
          >
            CSV summary
          </button>
          <button
            type="button"
            className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
            onClick={() => {
              if (!bundle) return;
              downloadCsv(
                "audiolad-path-products.csv",
                buildPathProductsCsv(bundle.products),
              );
            }}
          >
            CSV продукты
          </button>
          <button
            type="button"
            className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
            onClick={() => {
              if (!bundle) return;
              downloadCsv(
                "audiolad-path-surfaces.csv",
                buildPathSurfacesCsv(bundle.surfaces),
              );
            }}
          >
            CSV surfaces
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Период пути">
        {ADMIN_ANALYTICS_PERIOD_OPTIONS.map((option) => {
          const active = option.id === urlState.pathPeriod;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onPatch({ pathPeriod: option.id, pathDrill: null })}
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

      {loading ? (
        <p className="text-sm text-[#796ba0]">Загрузка пути до покупки…</p>
      ) : error ? (
        <p className="text-sm text-[#b34f63]">Не удалось загрузить путь: {error}</p>
      ) : bundle ? (
        <>
          {noExactLinks ? (
            <p
              className="rounded-[14px] border border-[#eadff8] bg-[#faf7ff] px-3 py-2 text-sm text-[#5f4a8f]"
              role="status"
            >
              {bundle.emptyExactNote}
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CoverageCard
              label="Exact click-linked"
              value={bundle.cohort.exactClickLinkedOrders}
              hint="Заказы с validated buy_clicked"
            />
            <CoverageCard
              label="Exact session"
              value={bundle.cohort.exactSessionAttributedOrders}
              hint="Заказы с validated session snapshot"
            />
            <CoverageCard
              label="Without click link"
              value={bundle.cohort.ordersWithoutClickLink}
              hint="Включая историю до P3.2.1"
            />
            <CoverageCard
              label="Unknown history"
              value={bundle.cohort.unknownHistoricalOrders}
              hint="Без session snapshot — не exact"
            />
          </div>

          <div className="space-y-2" aria-label="Воронка пути">
            {bundle.stages.map((stage) => (
              <div
                key={stage.key}
                className="flex flex-col gap-1 rounded-[14px] border border-[#eadff8] bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-[#25135c]">{stage.label}</p>
                  <p className="text-xs text-[#796ba0]">Тип: {stage.entity}</p>
                </div>
                <p className="text-lg font-semibold text-[#25135c] sm:text-xl">
                  {stage.value.toLocaleString("ru-RU")}
                </p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-[16px] border border-[#eadff8] bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#faf7ff] text-[#796ba0]">
                <tr>
                  <th className="px-3 py-2 font-medium">Конверсия</th>
                  <th className="px-3 py-2 font-medium">Значение</th>
                  <th className="px-3 py-2 font-medium">Формула</th>
                </tr>
              </thead>
              <tbody>
                <ConversionRow
                  label="View → click (unique)"
                  rate={bundle.engagement.viewToClickUniquePct}
                  formula="unique clickers / unique viewers"
                />
                <ConversionRow
                  label="Click → order (exact)"
                  rate={bundle.conversions.clickToOrderExact.ratePct}
                  formula={
                    bundle.conversions.clickToOrderExact.formula ??
                    "exact linked orders / unique clickers"
                  }
                />
                <ConversionRow
                  label="Order → payment attempt"
                  rate={bundle.conversions.orderToPaymentAttempt.ratePct}
                  formula="payment attempts / orders"
                />
                <ConversionRow
                  label="Attempt → succeeded"
                  rate={bundle.conversions.paymentAttemptToSucceeded.ratePct}
                  formula="succeeded / attempts (P3.1 SoT)"
                />
                <ConversionRow
                  label="Succeeded → access"
                  rate={bundle.conversions.succeededToAccess.ratePct}
                  formula="access grants / succeeded"
                />
                <ConversionRow
                  label="Succeeded → first play"
                  rate={bundle.conversions.succeededToFirstPlay.ratePct}
                  formula="first play after paid_at / succeeded"
                />
              </tbody>
            </table>
          </div>

          {bundle.products.length > 0 ? (
            <div className="overflow-x-auto rounded-[16px] border border-[#eadff8] bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#faf7ff] text-[#796ba0]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Продукт</th>
                    <th className="px-3 py-2 font-medium">Views</th>
                    <th className="px-3 py-2 font-medium">Clicks</th>
                    <th className="px-3 py-2 font-medium">Orders</th>
                    <th className="px-3 py-2 font-medium">Succeeded</th>
                    <th className="px-3 py-2 font-medium">Gross</th>
                    <th className="px-3 py-2 font-medium">Click conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.products.map((row) => (
                    <tr key={row.practiceId} className="border-t border-[#f1e9fb]">
                      <td className="px-3 py-2 text-[#25135c]">{row.title}</td>
                      <td className="px-3 py-2">{row.views}</td>
                      <td className="px-3 py-2">{row.buyClicks}</td>
                      <td className="px-3 py-2">{row.ordersCreated}</td>
                      <td className="px-3 py-2">{row.succeededPayments}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatRubFromMinor(row.grossMinor)}
                      </td>
                      <td className="px-3 py-2 text-[#796ba0]">
                        {row.clickConfidence}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {bundle.surfaces.length > 0 ? (
            <div className="overflow-x-auto rounded-[16px] border border-[#eadff8] bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#faf7ff] text-[#796ba0]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Surface</th>
                    <th className="px-3 py-2 font-medium">Clicks</th>
                    <th className="px-3 py-2 font-medium">Linked orders</th>
                    <th className="px-3 py-2 font-medium">Succeeded</th>
                    <th className="px-3 py-2 font-medium">Gross (linked)</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.surfaces.map((row) => (
                    <tr key={row.surface} className="border-t border-[#f1e9fb]">
                      <td className="px-3 py-2">{row.surface}</td>
                      <td className="px-3 py-2">{row.buyClicks}</td>
                      <td className="px-3 py-2">{row.ordersLinked}</td>
                      <td className="px-3 py-2">{row.succeeded}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatRubFromMinor(row.grossMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function CoverageCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div
      className="rounded-[14px] border border-[#eadff8] bg-white px-3 py-3"
      title={hint}
    >
      <p className="text-xs font-medium text-[#796ba0]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#25135c]">
        {value.toLocaleString("ru-RU")}
      </p>
    </div>
  );
}

function ConversionRow({
  label,
  rate,
  formula,
}: {
  label: string;
  rate: number | null;
  formula: string;
}) {
  return (
    <tr className="border-t border-[#f1e9fb]">
      <td className="px-3 py-2 text-[#25135c]">{label}</td>
      <td className="px-3 py-2 font-medium text-[#25135c]">
        {formatPathRate(rate)}
      </td>
      <td className="px-3 py-2 text-[#796ba0]" title={formula}>
        {formula}
      </td>
    </tr>
  );
}
