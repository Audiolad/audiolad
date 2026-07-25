"use client";

import { useEffect, useState } from "react";

import {
  buildAttributionAuthorsCsv,
  buildAttributionCampaignsCsv,
  buildAttributionComparisonCsv,
  buildAttributionLandingsCsv,
  buildAttributionProductsCsv,
  buildAttributionSourcesCsv,
  buildAttributionTimeCsv,
  type AdminAttributionBundle,
} from "@/lib/admin/analytics-attribution-queries";
import { downloadCsv } from "@/lib/admin/analytics-csv";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import { ADMIN_ANALYTICS_PERIOD_OPTIONS } from "@/lib/admin/analytics-period";
import {
  buildAdminAnalyticsSearchParams,
  type AdminAnalyticsUrlState,
  type AdminAttributionConfidence,
  type AdminAttributionMode,
  type AdminAnalyticsTopN,
} from "@/lib/admin/analytics-url-state";
import { acquisitionSourceLabel } from "@/lib/analytics/source-class";

type Props = {
  urlState: AdminAnalyticsUrlState;
  onPatch: (patch: Partial<AdminAnalyticsUrlState>) => void;
};

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function ConfidenceBadge({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[#eadff8] bg-white px-2.5 py-1 text-xs text-[#25135c]"
      aria-label={`${label}: ${count}`}
    >
      <span className="font-semibold">{label}</span>
      <span aria-hidden="true">·</span>
      <span>{count}</span>
    </span>
  );
}

function SimpleTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[#796ba0]" role="status">
        Нет строк для выбранных фильтров.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#eadff8] bg-white">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-[#faf7ff] text-[#796ba0]">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t border-[#f0e8fb]">
              {row.map((cell, cidx) => (
                <td key={cidx} className="whitespace-nowrap px-3 py-2 text-[#25135c]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminAttributionPanel({ urlState, onPatch }: Props) {
  const [bundle, setBundle] = useState<AdminAttributionBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const key = [
    urlState.attributionPeriod,
    urlState.attributionMode,
    urlState.includeTestPayments ? "1" : "0",
    urlState.attributionConfidence,
    urlState.attributionSourceClass ?? "",
    urlState.attributionUtmSource ?? "",
    urlState.attributionUtmMedium ?? "",
    urlState.attributionCampaign ?? "",
    urlState.attributionLanding ?? "",
    urlState.attributionAuthorId ?? "",
    urlState.attributionPracticeId ?? "",
    urlState.attributionQ,
    urlState.attributionTop,
    urlState.attributionSort,
    urlState.attributionSortDir,
  ].join("|");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      try {
        const params = buildAdminAnalyticsSearchParams(urlState);
        const response = await fetch(
          `/api/admin/analytics/attribution/summary?${params.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json().catch(() => null)) as
          | AdminAttributionBundle
          | { error?: string }
          | null;
        if (controller.signal.aborted) return;
        if (!response.ok || !body || !("summary" in body)) {
          setError(
            body && "error" in body && typeof body.error === "string"
              ? body.error
              : "load_failed",
          );
          setBundle(null);
          setLoading(false);
          return;
        }
        setBundle(body);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setError("load_failed");
        setBundle(null);
        setLoading(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const summary = bundle?.summary;
  const mode = urlState.attributionMode;

  return (
    <section className="space-y-5" aria-labelledby="attribution-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="attribution-heading"
            className="text-[22px] font-semibold text-[#25135c]"
          >
            Источники
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Payment-period: оплаты с confirmed_at в выбранном периоде.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5] md:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Фильтры
          </button>
          <button
            type="button"
            className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
            disabled={!bundle}
            onClick={() => {
              if (!bundle) return;
              downloadCsv(
                `audiolad-attribution-sources-${mode}.csv`,
                buildAttributionSourcesCsv(mode, bundle.sources.rows),
              );
            }}
          >
            CSV sources
          </button>
          <button
            type="button"
            className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
            disabled={!bundle}
            onClick={() => {
              if (!bundle) return;
              downloadCsv(
                `audiolad-attribution-campaigns-${mode}.csv`,
                buildAttributionCampaignsCsv(mode, bundle.campaigns.rows),
              );
            }}
          >
            CSV campaigns
          </button>
          <button
            type="button"
            className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
            disabled={!bundle}
            onClick={() => {
              if (!bundle) return;
              downloadCsv(
                "audiolad-attribution-comparison.csv",
                buildAttributionComparisonCsv(bundle.comparison.groups),
              );
              downloadCsv(
                "audiolad-attribution-time.csv",
                buildAttributionTimeCsv(bundle.timeToPurchase),
              );
              downloadCsv(
                "audiolad-attribution-landings.csv",
                buildAttributionLandingsCsv(mode, bundle.landings.rows),
              );
              downloadCsv(
                "audiolad-attribution-products.csv",
                buildAttributionProductsCsv(bundle.products.rows),
              );
              downloadCsv(
                "audiolad-attribution-authors.csv",
                buildAttributionAuthorsCsv(bundle.authors.rows),
              );
            }}
          >
            CSV all
          </button>
        </div>
      </div>

      <div
        className="rounded-2xl border border-[#d8c6f5] bg-[#f7f1ff] px-4 py-3 text-sm text-[#25135c]"
        role="note"
      >
        {bundle?.methodology.banner ??
          "First-touch и session-touch — разные модели, не multi-touch."}
        <div className="mt-2 space-y-1 text-[#7042c5]">
          <p>{bundle?.methodology.historicalNote}</p>
          <p>{bundle?.methodology.sessionTouchNote}</p>
        </div>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Режим атрибуции"
      >
        {(
          [
            {
              id: "session_touch" as AdminAttributionMode,
              label: "Сессия заказа",
              title:
                bundle?.methodology.sessionTouchTooltip ??
                "Источник сессии создания заказа",
            },
            {
              id: "first_touch" as AdminAttributionMode,
              label: "First-touch",
              title:
                bundle?.methodology.firstTouchTooltip ??
                "Первый известный источник пользователя",
            },
          ] as const
        ).map((item) => {
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={item.title}
              onClick={() => onPatch({ attributionMode: item.id })}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                active
                  ? "bg-[#25135c] text-white"
                  : "border border-[#eadff8] bg-white text-[#7042c5]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        className={`flex flex-wrap gap-2 ${filtersOpen ? "" : "hidden md:flex"}`}
        role="group"
        aria-label="Период атрибуции"
      >
        {ADMIN_ANALYTICS_PERIOD_OPTIONS.map((option) => {
          const active = option.id === urlState.attributionPeriod;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onPatch({ attributionPeriod: option.id })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                active
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#eadff8] bg-white text-[#7042c5]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div
        className={`flex flex-wrap items-center gap-3 ${filtersOpen ? "" : "hidden md:flex"}`}
      >
        <label className="flex items-center gap-2 text-sm text-[#25135c]">
          <input
            type="checkbox"
            checked={urlState.includeTestPayments}
            onChange={(e) =>
              onPatch({ includeTestPayments: e.target.checked })
            }
          />
          Включить тестовые платежи
        </label>
        <label className="flex items-center gap-2 text-sm text-[#25135c]">
          Confidence
          <select
            className="rounded-lg border border-[#eadff8] bg-white px-2 py-1"
            value={urlState.attributionConfidence}
            onChange={(e) =>
              onPatch({
                attributionConfidence: e.target
                  .value as AdminAttributionConfidence,
              })
            }
          >
            <option value="all">Все</option>
            <option value="exact">Только exact</option>
            <option value="strong">strong</option>
            <option value="inferred">inferred</option>
            <option value="unknown">unknown</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-[#25135c]">
          Top
          <select
            className="rounded-lg border border-[#eadff8] bg-white px-2 py-1"
            value={urlState.attributionTop}
            onChange={(e) =>
              onPatch({
                attributionTop: e.target.value as AdminAnalyticsTopN,
              })
            }
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex min-w-[180px] flex-1 items-center gap-2 text-sm text-[#25135c]">
          Поиск
          <input
            className="w-full rounded-lg border border-[#eadff8] bg-white px-2 py-1"
            value={urlState.attributionQ}
            onChange={(e) => onPatch({ attributionQ: e.target.value })}
            placeholder="utm / landing / class"
          />
        </label>
      </div>

      {urlState.includeTestPayments ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Включены тестовые платежи. Это не analytics staff/bot traffic.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#796ba0]" role="status">
          Загрузка атрибуции…
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          Ошибка загрузки: {error}
        </p>
      ) : null}

      {summary ? (
        <>
          {bundle?.emptyState === "no_payments" ? (
            <p className="rounded-xl border border-[#eadff8] bg-white px-4 py-3 text-sm text-[#25135c]">
              За выбранный период успешных оплат не было.
            </p>
          ) : null}
          {bundle?.emptyState === "no_attribution" ? (
            <p className="rounded-xl border border-[#eadff8] bg-white px-4 py-3 text-sm text-[#25135c]">
              Оплаты есть, но для них пока нет точной атрибуции в режиме{" "}
              {mode === "first_touch" ? "first-touch" : "сессии заказа"}.
            </p>
          ) : null}
          {summary.tracking.smallSample ? (
            <p
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="status"
            >
              Точных{" "}
              {mode === "first_touch" ? "first-touch" : "session-touch"} данных
              пока мало
              {mode === "first_touch"
                ? `: ${summary.tracking.firstTouchUserExactTotal} user-записей`
                : `: ${summary.confidence.exact} exact оплат`}
              . Историческое восстановление не применялось.
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Успешные оплаты", summary.paymentsTotal],
              ["Атрибутированные", summary.paymentsAttributed],
              ["Неатрибутированные", summary.paymentsUnattributed],
              ["Покрытие", fmtPct(summary.coveragePct)],
              [
                "Gross attributed",
                formatRubFromMinor(summary.grossMinorAttributed),
              ],
              [
                "Gross unattributed",
                formatRubFromMinor(summary.grossMinorUnattributed),
              ],
              ["Gross total", formatRubFromMinor(summary.grossMinorTotal)],
              ["Buyers attributed", summary.buyersAttributed],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-[#eadff8] bg-white px-4 py-3"
              >
                <div className="text-xs uppercase tracking-wide text-[#796ba0]">
                  {label}
                </div>
                <div className="mt-1 text-xl font-semibold text-[#25135c]">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Confidence breakdown">
            <ConfidenceBadge label="exact" count={summary.confidence.exact} />
            <ConfidenceBadge label="strong" count={summary.confidence.strong} />
            <ConfidenceBadge
              label="inferred"
              count={summary.confidence.inferred}
            />
            <ConfidenceBadge
              label="unknown"
              count={summary.confidence.unknown}
            />
            <ConfidenceBadge
              label="missing record"
              count={summary.linkage.missingRecord}
            />
            <ConfidenceBadge
              label="direct_or_unknown"
              count={summary.linkage.directOrUnknown}
            />
          </div>

          <p className="text-xs text-[#796ba0]">{summary.linkage.note}</p>

          <section className="space-y-2" aria-labelledby="attr-sources-h">
            <h3 id="attr-sources-h" className="text-[19px] font-semibold text-[#25135c]">
              Источники ({mode === "first_touch" ? "first-touch" : "session-touch"})
            </h3>
            <SimpleTable
              caption="Source breakdown"
              headers={[
                "source_class",
                "utm_source",
                "utm_medium",
                "payments",
                "buyers",
                "gross",
                "exact",
                "share",
              ]}
              rows={bundle.sources.rows.map((row) => [
                acquisitionSourceLabel(
                  row.source_class as Parameters<
                    typeof acquisitionSourceLabel
                  >[0],
                ),
                typeof row.utm_source === "string" && row.utm_source
                  ? row.utm_source
                  : "Без UTM",
                typeof row.utm_medium === "string" && row.utm_medium
                  ? row.utm_medium
                  : "Без medium",
                Number(row.payment_count ?? 0),
                Number(row.unique_buyers ?? 0),
                formatRubFromMinor(Number(row.gross_minor ?? 0)),
                Number(row.exact_count ?? 0),
                fmtPct(
                  typeof row.coverage_share_pct === "number"
                    ? row.coverage_share_pct
                    : null,
                ),
              ])}
            />
          </section>

          <section className="space-y-2" aria-labelledby="attr-campaigns-h">
            <h3 id="attr-campaigns-h" className="text-[19px] font-semibold text-[#25135c]">
              Кампании
            </h3>
            <SimpleTable
              caption="Campaign breakdown"
              headers={[
                "source",
                "medium",
                "campaign",
                "term",
                "payments",
                "buyers",
                "gross",
              ]}
              rows={bundle.campaigns.rows.map((row) => [
                typeof row.utm_source === "string" && row.utm_source
                  ? row.utm_source
                  : "Без UTM",
                typeof row.utm_medium === "string" && row.utm_medium
                  ? row.utm_medium
                  : "Без medium",
                typeof row.utm_campaign === "string" && row.utm_campaign
                  ? row.utm_campaign
                  : "Без campaign",
                typeof row.utm_term === "string" ? row.utm_term : "",
                Number(row.payment_count ?? 0),
                Number(row.unique_buyers ?? 0),
                formatRubFromMinor(Number(row.gross_minor ?? 0)),
              ])}
            />
          </section>

          <section className="space-y-2" aria-labelledby="attr-landings-h">
            <h3 id="attr-landings-h" className="text-[19px] font-semibold text-[#25135c]">
              Landing pages
            </h3>
            {bundle.landings.conversionNote ? (
              <p className="text-xs text-[#796ba0]">
                {bundle.landings.conversionNote}
              </p>
            ) : null}
            <SimpleTable
              caption="Landing breakdown"
              headers={[
                "landing",
                "payments",
                "buyers",
                "gross",
                "top product",
                "top author",
              ]}
              rows={bundle.landings.rows.map((row) => [
                String(row.landing_path ?? "—"),
                Number(row.payment_count ?? 0),
                Number(row.unique_buyers ?? 0),
                formatRubFromMinor(Number(row.gross_minor ?? 0)),
                String(row.top_product ?? "—"),
                String(row.top_author ?? "—"),
              ])}
            />
          </section>

          <section className="space-y-2" aria-labelledby="attr-products-h">
            <h3 id="attr-products-h" className="text-[19px] font-semibold text-[#25135c]">
              Продукты
            </h3>
            <SimpleTable
              caption="Product attribution"
              headers={[
                "product",
                "payments",
                "gross",
                "FT attr",
                "ST attr",
                "top FT",
                "top ST",
              ]}
              rows={bundle.products.rows.map((row) => [
                String(row.practice_title ?? "—"),
                Number(row.payment_count ?? 0),
                formatRubFromMinor(Number(row.gross_minor ?? 0)),
                Number(row.ft_attributed ?? 0),
                Number(row.st_attributed ?? 0),
                String(row.top_ft_source ?? "—"),
                String(row.top_st_source ?? "—"),
              ])}
            />
          </section>

          <section className="space-y-2" aria-labelledby="attr-authors-h">
            <h3
              id="attr-authors-h"
              className="text-[19px] font-semibold text-[#25135c]"
              title="Сумма успешных оплат за продукты автора. Это не сумма выплаты автору."
            >
              Авторы
            </h3>
            <p className="text-xs text-[#796ba0]">
              {bundle.authors.note ??
                "Gross generated — не выплата автору и не net revenue."}
            </p>
            <SimpleTable
              caption="Author attribution"
              headers={[
                "author",
                "payments",
                "gross",
                "attributed",
                "unattributed",
                "top FT",
                "top ST",
              ]}
              rows={bundle.authors.rows.map((row) => [
                String(row.author_name ?? "—"),
                Number(row.payment_count ?? 0),
                formatRubFromMinor(Number(row.gross_minor ?? 0)),
                formatRubFromMinor(Number(row.attributed_gross_minor ?? 0)),
                formatRubFromMinor(Number(row.unattributed_gross_minor ?? 0)),
                String(row.top_ft_source ?? "—"),
                String(row.top_st_source ?? "—"),
              ])}
            />
          </section>

          <section className="space-y-2" aria-labelledby="attr-cmp-h">
            <h3 id="attr-cmp-h" className="text-[19px] font-semibold text-[#25135c]">
              First-touch ↔ Session-touch
            </h3>
            <p className="text-xs text-[#796ba0]">
              {bundle.comparison.note}
            </p>
            <SimpleTable
              caption="Touch comparison groups"
              headers={["group", "payments", "buyers", "gross"]}
              rows={bundle.comparison.groups.map((row) => [
                String(row.cmp_group ?? ""),
                Number(row.payment_count ?? 0),
                Number(row.unique_buyers ?? 0),
                formatRubFromMinor(Number(row.gross_minor ?? 0)),
              ])}
            />
            <SimpleTable
              caption="Path examples"
              headers={["first-touch", "session-touch", "payments", "buyers", "gross"]}
              rows={bundle.comparison.pathExamples.map((row) => [
                String(row.first_touch_source_class ?? "unknown"),
                String(row.session_touch_source_class ?? "unknown"),
                Number(row.payment_count ?? 0),
                Number(row.unique_buyers ?? 0),
                formatRubFromMinor(Number(row.gross_minor ?? 0)),
              ])}
            />
          </section>

          <section className="space-y-2" aria-labelledby="attr-time-h">
            <h3 id="attr-time-h" className="text-[19px] font-semibold text-[#25135c]">
              Time to purchase
            </h3>
            <p className="text-xs text-[#796ba0]">
              Median / p25 / p75; first purchase only for first-touch duration.
              Display TZ Europe/Moscow.
            </p>
            <SimpleTable
              caption="Time buckets first-touch to first payment"
              headers={["bucket", "count"]}
              rows={(() => {
                const ft = (bundle.timeToPurchase
                  .first_touch_to_first_payment ?? {}) as Record<string, unknown>;
                return [
                  ["median_sec", String(ft.median_sec ?? "—")],
                  ["p25_sec", String(ft.p25_sec ?? "—")],
                  ["p75_sec", String(ft.p75_sec ?? "—")],
                  ["до 10 минут", Number(ft.bucket_lt_10m ?? 0)],
                  ["10–60 минут", Number(ft.bucket_10m_60m ?? 0)],
                  ["1–24 часа", Number(ft.bucket_1h_24h ?? 0)],
                  ["1–7 дней", Number(ft.bucket_1d_7d ?? 0)],
                  ["больше 7 дней", Number(ft.bucket_gt_7d ?? 0)],
                  ["неизвестно", Number(ft.bucket_unknown ?? 0)],
                ];
              })()}
            />
          </section>

          <section className="space-y-2" aria-labelledby="attr-backfill-h">
            <h3 id="attr-backfill-h" className="text-[19px] font-semibold text-[#25135c]">
              Historical backfill preview
            </h3>
            <p className="text-sm text-[#796ba0]">
              Read-only. Apply недоступен в UI. Confidence при apply был бы только
              inferred.
            </p>
            <SimpleTable
              caption="Backfill preview"
              headers={["metric", "value"]}
              rows={[
                [
                  "proposed_anonymous_inserts",
                  Number(
                    bundle.backfillPreview.proposed_anonymous_inserts ?? 0,
                  ),
                ],
                [
                  "proposed_user_inserts_from_session",
                  Number(
                    bundle.backfillPreview
                      .proposed_user_inserts_from_session ?? 0,
                  ),
                ],
                [
                  "unknown_users_no_history",
                  Number(
                    bundle.backfillPreview.unknown_users_no_history ?? 0,
                  ),
                ],
                [
                  "apply_available_in_ui",
                  String(bundle.backfillPreview.apply_available_in_ui ?? false),
                ],
              ]}
            />
          </section>

          <p className="text-xs text-[#796ba0]">
            Integrity: critical={bundle.integrity.critical}, warning=
            {bundle.integrity.warning}, coverage_limitation=
            {bundle.integrity.coverageLimitation}
          </p>
        </>
      ) : null}
    </section>
  );
}
