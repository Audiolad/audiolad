"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  aggregateSearchMetrics,
  boardsForMetric,
  DEFAULT_SEO_ANALYTICS_IMPRESSION_THRESHOLD,
  filterAnalyticsRows,
  formatCtr,
  formatPeriod,
  formatPosition,
  formatSignedInt,
  formatSignedPosition,
  parseImpressionThreshold,
  type SeoAnalyticsRowFilter,
} from "@/lib/seo-analytics/aggregate";
import { seoAnalyticsErrorMessage } from "@/lib/seo-analytics/messages";
import type {
  SeoAnalyticsBoardId,
  SeoAnalyticsDashboardData,
  SeoAnalyticsDashboardRow,
  SeoAnalyticsHistoryPoint,
} from "@/lib/seo-analytics/types";
import { lifecycleLabel } from "@/lib/seo-queries/types";

const VIEWS = [
  { id: "overview", label: "Обзор" },
  { id: "opportunities", label: "Возможности" },
  { id: "queries", label: "Запросы" },
  { id: "imports", label: "Импорты" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

const BOARDS: { id: SeoAnalyticsBoardId; title: string; definition: string }[] = [
  {
    id: "winners",
    title: "Победители",
    definition: "Средняя позиция не больше 3 и есть клики.",
  },
  {
    id: "fast_reserve",
    title: "Быстрый резерв",
    definition: "Средняя позиция больше 3 и не больше 10, показы не ниже порога.",
  },
  {
    id: "positions_11_20",
    title: "11–20",
    definition: "Средняя позиция больше 10 и не больше 20.",
  },
  {
    id: "zero_ctr",
    title: "Нулевой CTR",
    definition: "Показы не ниже порога и ни одного клика.",
  },
  {
    id: "new_queries",
    title: "Новые запросы Яндекса",
    definition: "Запроса ещё нет в SEO-карте. В карту он попадает только вручную.",
  },
];

const PAGE_SIZE = 30;
const BOARD_LIMIT = 40;

type Preview = {
  periodStart: string;
  periodEnd: string;
  rowCount: number;
  sourceRowCount: number;
  metricCount: number;
  collapsedGroupCount: number;
  impressions: number;
  clicks: number;
  matched: number;
  fresh: number;
};

function deltaText(row: SeoAnalyticsDashboardRow): string {
  if (row.deltaKind === "no_baseline") return "нет прошлого периода";
  if (row.deltaKind === "new_in_period" || !row.delta) return "новый в этом периоде";
  return `показы ${formatSignedInt(row.delta.impressions)} · клики ${formatSignedInt(row.delta.clicks)} · позиция ${formatSignedPosition(row.delta.avgPosition)}`;
}

function MetricCards({
  rows,
  onOpen,
}: {
  rows: readonly SeoAnalyticsDashboardRow[];
  onOpen: (row: SeoAnalyticsDashboardRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#796ba0]">В этой группе нет запросов.</p>;
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#faf6ff] text-[#796ba0]">
            <tr>
              {["Запрос", "Частотность", "Показы", "Клики", "CTR", "Позиция", "К прошлому периоду", "Кластер", "Формат", "Статус", "Автор / продукт"].map((title) => (
                <th key={title} className="px-3 py-3 font-medium">{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.normalizedQuery} className="border-t border-[#f3edf9]">
                <td className="px-3 py-3 font-medium text-[#25135c]">
                  <button type="button" className="text-left font-medium text-[#25135c] underline-offset-2 hover:underline" onClick={() => onOpen(row)}>
                    {row.queryText}
                  </button>
                </td>
                <td className="px-3 py-3">{row.frequency ?? "—"}</td>
                <td className="px-3 py-3">{row.impressions.toLocaleString("ru-RU")}</td>
                <td className="px-3 py-3">{row.clicks.toLocaleString("ru-RU")}</td>
                <td className="px-3 py-3">{formatCtr(row.ctr)}</td>
                <td className="px-3 py-3">{formatPosition(row.avgPosition)}</td>
                <td className="px-3 py-3 text-[#5f5484]">{deltaText(row)}</td>
                <td className="px-3 py-3">{row.cluster ?? "—"}</td>
                <td className="px-3 py-3">{row.recommendedFormat ?? "—"}</td>
                <td className="px-3 py-3">{row.lifecycle ? lifecycleLabel(row.lifecycle) : "Новый запрос"}</td>
                <td className="px-3 py-3">{row.authorName ?? "—"}{row.productTitle ? ` / ${row.productTitle}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={row.normalizedQuery} className="rounded-[22px] border border-[#eadff8] bg-white p-4">
            <button type="button" className="text-left font-semibold text-[#25135c]" onClick={() => onOpen(row)}>
              {row.queryText}
            </button>
            <p className="mt-1 text-xs text-[#796ba0]">{deltaText(row)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#5f5484]">
              <span>{row.impressions.toLocaleString("ru-RU")} показов</span>
              <span>{row.clicks.toLocaleString("ru-RU")} кликов</span>
              <span>CTR {formatCtr(row.ctr)}</span>
              <span>позиция {formatPosition(row.avgPosition)}</span>
              <span>{row.frequency ?? "—"} частотность</span>
              <span>{row.lifecycle ? lifecycleLabel(row.lifecycle) : "Новый запрос"}</span>
              <span>{row.cluster ?? "Без кластера"}</span>
              <span>{row.recommendedFormat ?? "Без формата"}</span>
            </div>
            {row.authorName || row.productTitle ? (
              <p className="mt-2 text-sm text-[#25135c]">{row.authorName ?? "—"}{row.productTitle ? ` / ${row.productTitle}` : ""}</p>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}

function HistoryPanel({
  query,
  points,
  error,
}: {
  query: string;
  points: SeoAnalyticsHistoryPoint[] | null;
  error: string | null;
}) {
  return (
    <section className="rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-[#25135c]">История: {query}</h3>
      {error ? <p className="mt-2 text-sm text-[#b34f63]">{error}</p> : null}
      {!error && points == null ? <p className="mt-2 text-sm text-[#796ba0]">Загружаем недели…</p> : null}
      {points && points.length === 0 ? <p className="mt-2 text-sm text-[#796ba0]">Для этого запроса ещё нет снимков.</p> : null}
      {points && points.length > 0 ? (
        <div className="mt-3 space-y-2">
          {points.map((point) => (
            <div key={`${point.periodStart}-${point.periodEnd}`} className="grid grid-cols-2 gap-2 rounded-xl bg-[#faf6ff] px-3 py-2 text-sm sm:grid-cols-5">
              <span className="font-medium text-[#25135c] sm:col-span-1">{formatPeriod(point.periodStart, point.periodEnd)}</span>
              <span>{point.impressions.toLocaleString("ru-RU")} показов</span>
              <span>{point.clicks.toLocaleString("ru-RU")} кликов</span>
              <span>CTR {formatCtr(point.ctr)}</span>
              <span>позиция {formatPosition(point.avgPosition)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function AdminSeoAnalyticsClient({ data }: { data: SeoAnalyticsDashboardData }) {
  const router = useRouter();
  const [view, setView] = useState<ViewId>(data.snapshots.length === 0 ? "imports" : "overview");
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_SEO_ANALYTICS_IMPRESSION_THRESHOLD));
  const [filter, setFilter] = useState<SeoAnalyticsRowFilter>({});
  const [page, setPage] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [historyQuery, setHistoryQuery] = useState<string | null>(null);
  const [history, setHistory] = useState<SeoAnalyticsHistoryPoint[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const threshold = parseImpressionThreshold(thresholdInput);
  const filtered = useMemo(() => filterAnalyticsRows(data.rows, filter), [data.rows, filter]);
  const totals = useMemo(() => aggregateSearchMetrics(filtered), [filtered]);
  const selected = data.snapshots.find((snapshot) => snapshot.id === data.selectedSnapshotId) ?? null;
  const clusters = useMemo(
    () => [...new Set(data.rows.flatMap((row) => (row.cluster ? [row.cluster] : [])))].sort((a, b) => a.localeCompare(b, "ru")),
    [data.rows],
  );
  const formats = useMemo(
    () => [...new Set(data.rows.flatMap((row) => (row.recommendedFormat ? [row.recommendedFormat] : [])))].sort((a, b) => a.localeCompare(b, "ru")),
    [data.rows],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function openHistory(row: SeoAnalyticsDashboardRow) {
    setHistoryQuery(row.queryText);
    setHistory(null);
    setHistoryError(null);
    const response = await fetch(`/api/admin/seo-analytics/history?q=${encodeURIComponent(row.normalizedQuery)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setHistoryError("Не удалось загрузить историю запроса.");
      return;
    }
    setHistory(payload?.points ?? []);
  }

  async function sendFile(nextFile: File, intent: "preview" | "commit") {
    setBusy(true);
    setError(null);
    setNotice(null);
    const body = new FormData();
    body.set("file", nextFile);
    body.set("intent", intent);
    let response: Response;
    try {
      response = await fetch("/api/admin/seo-analytics/import", { method: "POST", body });
    } catch {
      setBusy(false);
      setError("Не удалось отправить файл.");
      return;
    }
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setPreview(intent === "preview" ? null : preview);
      setError(typeof payload?.message === "string" ? payload.message : seoAnalyticsErrorMessage(String(payload?.error ?? "")));
      return;
    }
    if (intent === "preview") {
      setPreview(payload as Preview);
      setNotice("Проверьте итоги и подтвердите импорт. До подтверждения база не меняется.");
      return;
    }
    setPreview(null);
    setFile(null);
    setNotice(payload.replaced
      ? "Период обновлён без дублей. Более ранние периоды сохранены."
      : "Период сохранён. Более ранние периоды не изменены.");
    const params = new URLSearchParams();
    if (payload.snapshot_id) params.set("snapshot", payload.snapshot_id);
    router.push(`/admin/seo-analytics?${params.toString()}`);
    router.refresh();
    setView("overview");
  }

  function chooseFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setError(null);
    setNotice(null);
    if (nextFile) void sendFile(nextFile, "preview");
  }

  const kpis = [
    { label: "Запросы", value: totals.queryCount.toLocaleString("ru-RU"), hint: "Строки выбранного периода" },
    { label: "Показы", value: totals.impressions.toLocaleString("ru-RU"), hint: "Сумма показов" },
    { label: "Клики", value: totals.clicks.toLocaleString("ru-RU"), hint: "Сумма кликов" },
    { label: "CTR", value: formatCtr(totals.ctr), hint: "Клики / показы" },
    { label: "Запросы 1–3", value: totals.queriesPosition1to3.toLocaleString("ru-RU"), hint: "Средняя позиция не больше 3" },
    { label: "Запросы 4–10", value: totals.queriesPosition4to10.toLocaleString("ru-RU"), hint: `${totals.impressionsPosition4to10.toLocaleString("ru-RU")} показов` },
    { label: "Запросы 11–20", value: totals.queriesPosition11to20.toLocaleString("ru-RU"), hint: `${totals.impressionsPosition11to20.toLocaleString("ru-RU")} показов` },
    { label: "Нулевой CTR", value: totals.zeroClickQueries.toLocaleString("ru-RU"), hint: `${totals.zeroClickImpressions.toLocaleString("ru-RU")} показов без кликов` },
    { label: "Новые запросы", value: totals.newQueries.toLocaleString("ru-RU"), hint: "Нет записи в SEO-карте" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Разделы SEO-аналитики">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${view === item.id ? "bg-[#7042c5] text-white" : "border border-[#e4d7f4] bg-white text-[#7042c5]"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <label className="text-sm font-medium text-[#25135c]" htmlFor="seo-analytics-snapshot">Период</label>
        <select
          id="seo-analytics-snapshot"
          className="min-h-11 flex-1 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"
          value={data.selectedSnapshotId ?? ""}
          onChange={(event) => {
            const params = new URLSearchParams();
            if (event.target.value) params.set("snapshot", event.target.value);
            router.push(`/admin/seo-analytics?${params.toString()}`);
          }}
        >
          {data.snapshots.length === 0 ? <option value="">Импортов ещё нет</option> : null}
          {data.snapshots.map((snapshot) => (
            <option key={snapshot.id} value={snapshot.id}>
              {formatPeriod(snapshot.periodStart, snapshot.periodEnd)} · {snapshot.originalFilename}
            </option>
          ))}
        </select>
        {selected && data.previousPeriodStart && data.previousPeriodEnd ? (
          <p className="text-sm text-[#796ba0]">Сравнение с {formatPeriod(data.previousPeriodStart, data.previousPeriodEnd)}</p>
        ) : (
          <p className="text-sm text-[#796ba0]">Предыдущего периода пока нет</p>
        )}
      </div>

      {historyQuery ? <HistoryPanel query={historyQuery} points={history} error={historyError} /> : null}

      {view === "overview" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {kpis.map((item) => (
            <article key={item.label} className="rounded-[18px] border border-[#eadff8] bg-white p-3 shadow-sm">
              <p className="text-xs font-medium text-[#796ba0]">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#25135c]">{item.value}</p>
              <p className="mt-1 text-xs text-[#796ba0]">{item.hint}</p>
            </article>
          ))}
        </div>
      ) : null}

      {view === "opportunities" || view === "queries" ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input value={filter.search ?? ""} onChange={(event) => { setFilter((current) => ({ ...current, search: event.target.value })); setPage(0); }} placeholder="Поиск запроса" className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm" />
          <select value={filter.cluster ?? ""} onChange={(event) => { setFilter((current) => ({ ...current, cluster: event.target.value })); setPage(0); }} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm">
            <option value="">Все кластеры</option>
            <option value="__none__">Без кластера</option>
            {clusters.map((cluster) => <option key={cluster}>{cluster}</option>)}
          </select>
          <select value={filter.position ?? ""} onChange={(event) => { setFilter((current) => ({ ...current, position: event.target.value as SeoAnalyticsRowFilter["position"] })); setPage(0); }} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm">
            <option value="">Все позиции</option>
            <option value="1-3">1–3</option>
            <option value="4-10">4–10</option>
            <option value="11-20">11–20</option>
            <option value="21+">21+</option>
          </select>
          <select value={filter.status ?? ""} onChange={(event) => { setFilter((current) => ({ ...current, status: event.target.value })); setPage(0); }} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm">
            <option value="">Все статусы</option>
            <option value="available">Свободен</option>
            <option value="in_progress">В работе</option>
            <option value="moderation">На модерации</option>
            <option value="published">Опубликован</option>
          </select>
          <select value={filter.format ?? ""} onChange={(event) => { setFilter((current) => ({ ...current, format: event.target.value })); setPage(0); }} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm">
            <option value="">Все форматы</option>
            {formats.map((format) => <option key={format}>{format}</option>)}
          </select>
          <select value={filter.origin ?? ""} onChange={(event) => { setFilter((current) => ({ ...current, origin: event.target.value as SeoAnalyticsRowFilter["origin"] })); setPage(0); }} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm">
            <option value="">Новые и из карты</option>
            <option value="new">Новые запросы Яндекса</option>
            <option value="mapped">Из SEO-карты</option>
          </select>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm text-[#25135c]">
            Порог показов
            <input
              inputMode="numeric"
              value={thresholdInput}
              onChange={(event) => setThresholdInput(event.target.value.replace(/[^\d]/g, ""))}
              className="w-20 bg-transparent text-right outline-none"
              aria-label="Порог показов"
            />
          </label>
        </div>
      ) : null}

      {view === "opportunities" ? (
        <div className="space-y-4">
          <p className="text-sm text-[#796ba0]">Порог для «Быстрого резерва» и «Нулевого CTR»: {threshold.toLocaleString("ru-RU")} показов.</p>
          {BOARDS.map((board) => {
            const rows = filtered
              .filter((row) => boardsForMetric(row, threshold).includes(board.id))
              .slice(0, BOARD_LIMIT);
            const total = filtered.filter((row) => boardsForMetric(row, threshold).includes(board.id)).length;
            return (
              <section key={board.id} className="rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm sm:p-5">
                <h3 className="text-lg font-semibold text-[#25135c]">{board.title}</h3>
                <p className="mt-1 text-sm text-[#796ba0]">{board.definition} {total.toLocaleString("ru-RU")} запросов{total > rows.length ? `, показаны первые ${rows.length} по показам` : ""}.</p>
                <div className="mt-4">
                  <MetricCards rows={rows} onOpen={openHistory} />
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {view === "queries" ? (
        <section className="rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-[#25135c]">Запросы периода</h3>
            <p className="text-sm text-[#796ba0]">{filtered.length.toLocaleString("ru-RU")} строк</p>
          </div>
          <MetricCards rows={pageRows} onOpen={openHistory} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="min-h-11 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-40">Назад</button>
            <p className="text-sm text-[#796ba0]">{page + 1} / {pageCount}</p>
            <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-40">Дальше</button>
          </div>
        </section>
      ) : null}

      {view === "imports" ? (
        <div className="space-y-4">
          <section
            className={`rounded-[22px] border border-dashed bg-white p-5 shadow-sm ${dragOver ? "border-[#7042c5] bg-[#faf6ff]" : "border-[#d7c4f5]"}`}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              chooseFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <h3 className="text-lg font-semibold text-[#25135c]">Импорт XLSX Яндекс.Вебмастера</h3>
            <p className="mt-2 text-sm text-[#796ba0]">
              Колонки Query, Dates range, Impressions, Clicks, CTR %, Avg. position.
              URL в этой выгрузке нет и не угадывается. Новые запросы не добавляются в SEO-карту.
              Одинаковые запросы после нормализации суммируются, повтор периода не плодит строки.
            </p>
            <label className="mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-[#eadff8] bg-[#faf6ff] px-4 py-6 text-center text-sm text-[#5f5484]">
              Перетащите файл или выберите его
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="mt-3 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-[#7042c5] file:px-4 file:text-sm file:font-semibold file:text-white"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {file ? <p className="mt-3 text-sm text-[#25135c]">{file.name}</p> : null}
            {error ? <p role="alert" className="mt-3 text-sm text-[#b34f63]">{error}</p> : null}
            {notice ? <p role="status" className="mt-3 text-sm text-[#4c3d78]">{notice}</p> : null}
            {preview ? (
              <div className="mt-4 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4">
                <p className="font-semibold text-[#25135c]">{formatPeriod(preview.periodStart, preview.periodEnd)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#5f5484] sm:grid-cols-3">
                  <span>{preview.sourceRowCount.toLocaleString("ru-RU")} строк файла</span>
                  <span>{preview.metricCount.toLocaleString("ru-RU")} запросов</span>
                  <span>{preview.impressions.toLocaleString("ru-RU")} показов</span>
                  <span>{preview.clicks.toLocaleString("ru-RU")} кликов</span>
                  <span>{preview.matched.toLocaleString("ru-RU")} в SEO-карте</span>
                  <span>{preview.fresh.toLocaleString("ru-RU")} новых</span>
                </div>
                <button
                  type="button"
                  disabled={busy || !file}
                  onClick={() => file && void sendFile(file, "commit")}
                  className="mt-4 min-h-11 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Импортируем…" : "Импортировать"}
                </button>
              </div>
            ) : null}
          </section>
          <section className="rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm sm:p-5">
            <h3 className="text-lg font-semibold text-[#25135c]">Сохранённые периоды</h3>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[#796ba0]">
                  <tr>
                    {["Период", "Файл", "Импорт", "Строки файла", "Запросы", "Показы", "Клики"].map((title) => (
                      <th key={title} className="px-3 py-2 font-medium">{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.snapshots.map((snapshot) => (
                    <tr key={snapshot.id} className="border-t border-[#f3edf9]">
                      <td className="px-3 py-3">{formatPeriod(snapshot.periodStart, snapshot.periodEnd)}</td>
                      <td className="px-3 py-3">{snapshot.originalFilename}</td>
                      <td className="px-3 py-3">{new Date(snapshot.importedAt).toLocaleString("ru-RU")}</td>
                      <td className="px-3 py-3">{snapshot.sourceRowCount.toLocaleString("ru-RU")}</td>
                      <td className="px-3 py-3">{snapshot.metricCount.toLocaleString("ru-RU")}</td>
                      <td className="px-3 py-3">{snapshot.totalImpressions.toLocaleString("ru-RU")}</td>
                      <td className="px-3 py-3">{snapshot.totalClicks.toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-3 md:hidden">
              {data.snapshots.map((snapshot) => (
                <article key={snapshot.id} className="rounded-[22px] border border-[#eadff8] p-4">
                  <h4 className="font-semibold text-[#25135c]">{formatPeriod(snapshot.periodStart, snapshot.periodEnd)}</h4>
                  <p className="mt-1 text-sm text-[#796ba0]">{snapshot.originalFilename}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#5f5484]">
                    <span>{snapshot.sourceRowCount.toLocaleString("ru-RU")} строк файла</span>
                    <span>{snapshot.metricCount.toLocaleString("ru-RU")} запросов</span>
                    <span>{snapshot.totalImpressions.toLocaleString("ru-RU")} показов</span>
                    <span>{snapshot.totalClicks.toLocaleString("ru-RU")} кликов</span>
                    <span>{new Date(snapshot.importedAt).toLocaleString("ru-RU")}</span>
                  </div>
                </article>
              ))}
            </div>
            {data.snapshots.length === 0 ? <p className="mt-3 text-sm text-[#796ba0]">История импортов появится после первой записи.</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
