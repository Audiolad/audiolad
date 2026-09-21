"use client";

import { useMemo, useState } from "react";

import {
  SEO_QUERY_AUDIO_FITS,
  SEO_QUERY_AUDIO_FIT_LABELS,
  SEO_QUERY_FORMATS,
  SEO_QUERY_INTENTS,
} from "@/lib/seo-queries/analysis-taxonomy";

type Row = {
  id: string; queryText: string; normalizedQuery: string; source: string;
  frequency: number | null; cluster: string | null; intent: string | null;
  recommendedFormat: string | null; audioFit: string | null; lifecycle: string;
  author: string | null; product: string | null; reservedAt: string | null; expiresAt: string | null; createdAt: string;
  reservationId: string | null; clusterId: string | null; analysisStatus: "not_analyzed" | "analyzed" | "not_applicable";
  proposalId: string | null;
  proposalAuthorId: string | null;
  proposalAuthorName: string | null;
  proposalAuthorSlug: string | null;
  proposalCreatedAt: string | null;
  proposedByAuthor: boolean;
  needsReview: boolean;
  approvedUnreserved: boolean;
};
type Cluster = { id: string; name: string };
type WordstatSuggestion = {
  phrase: string;
  count: number;
  source: "result" | "association";
  opportunity: { color: "green" | "yellow" | "red"; label: string; description: string };
};
type WordstatResults = {
  region: { id: string; label: string };
  periodLabel: string;
  topicTotalCount: number | null;
  suggestions: WordstatSuggestion[];
};
type ReviewSuggestion = {
  intent: string;
  recommended_format: string | null;
  audio_fit: string;
  recommended_disposition: "analyzed" | "not_applicable";
  confidence: string;
  reasons: string[];
};
type ReviewItem = {
  id: string;
  query_text: string;
  frequency: number | null;
  suggested: ReviewSuggestion;
};

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function readReviewItem(value: unknown): ReviewItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const suggested = item.suggested;
  if (!suggested || typeof suggested !== "object") return null;
  const recommendation = suggested as Record<string, unknown>;
  if (
    typeof item.id !== "string" || typeof item.query_text !== "string"
    || (item.frequency !== null && typeof item.frequency !== "number")
    || typeof recommendation.intent !== "string"
    || (recommendation.recommended_format !== null && typeof recommendation.recommended_format !== "string")
    || typeof recommendation.audio_fit !== "string"
    || (recommendation.recommended_disposition !== "analyzed" && recommendation.recommended_disposition !== "not_applicable")
    || typeof recommendation.confidence !== "string" || !Array.isArray(recommendation.reasons)
    || !recommendation.reasons.every((reason) => typeof reason === "string")
  ) return null;
  return {
    id: item.id, query_text: item.query_text, frequency: item.frequency as number | null,
    suggested: recommendation as unknown as ReviewSuggestion,
  };
}

export default function AdminSeoQueriesClient({ initialRows, clusters: initialClusters }: { initialRows: Row[]; clusters: Cluster[] }) {
  const [rows, setRows] = useState(initialRows);
  const [clusterOptions, setClusterOptions] = useState(initialClusters);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [source, setSource] = useState("");
  const [cluster, setCluster] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [newCluster, setNewCluster] = useState("");
  const [editingId, setEditingId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [wordstatSeed, setWordstatSeed] = useState("");
  const [wordstatResults, setWordstatResults] = useState<WordstatResults | null>(null);
  const [selectedWordstatPhrases, setSelectedWordstatPhrases] = useState<Set<string>>(new Set());
  const [importedWordstatPhrases, setImportedWordstatPhrases] = useState<Set<string>>(new Set());
  const [wordstatBusy, setWordstatBusy] = useState(false);
  const [wordstatNotice, setWordstatNotice] = useState<string | null>(null);
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<Set<string>>(new Set());
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
  const clusters = useMemo(() => [...new Set(rows.map((row) => row.cluster).filter((value): value is string => Boolean(value)))], [rows]);
  const sources = useMemo(() => [...new Set(rows.map((row) => row.source))], [rows]);
  const filtered = useMemo(() => {
    const next = rows.filter((row) =>
      (row.queryText.toLowerCase().includes(search.toLowerCase()) || row.normalizedQuery.includes(search.toLowerCase()))
      && (!status || row.lifecycle === status)
      && (!analysisStatus || row.analysisStatus === analysisStatus)
      && (!source || row.source === source)
      && (!cluster || row.cluster === cluster),
    );
    return next.sort((a, b) => {
      if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
      if (a.approvedUnreserved !== b.approvedUnreserved) {
        return a.approvedUnreserved ? -1 : 1;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [rows, search, status, analysisStatus, source, cluster]);

  async function addQuery(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/seo-queries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query_text: newQuery, source: "manual" }) });
    const payload = await response.json();
    if (!response.ok) return setNotice(payload.error === "normalized_query_duplicate" ? "Такой нормализованный запрос уже существует." : "Не удалось добавить запрос.");
    setRows((current) => [{ id: payload.query.id, queryText: payload.query.query_text, normalizedQuery: payload.query.normalized_query, source: payload.query.source, frequency: null, cluster: null, clusterId: null, intent: null, recommendedFormat: null, audioFit: null, analysisStatus: "not_analyzed", lifecycle: "Свободен", author: null, product: null, reservedAt: null, expiresAt: null, createdAt: payload.query.created_at, reservationId: null, proposalId: null, proposalAuthorId: null, proposalAuthorName: null, proposalAuthorSlug: null, proposalCreatedAt: null, proposedByAuthor: false, needsReview: false, approvedUnreserved: false }, ...current]);
    setNewQuery(""); setNotice("SEO-запрос добавлен.");
  }

  async function addCluster(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/seo-queries", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newCluster }) });
    const payload = await response.json();
    if (!response.ok) return setNotice("Не удалось создать кластер.");
    setClusterOptions((current) => [...current, payload.cluster].sort((a, b) => a.name.localeCompare(b.name, "ru")));
    setNewCluster(""); setNotice("Кластер создан.");
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") ?? "");
    const response = await fetch("/api/admin/seo-queries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
      id, query_text: form.get("query_text"), frequency: form.get("frequency") === "" ? null : Number(form.get("frequency")),
      source: form.get("source"), cluster_id: form.get("cluster_id"), intent: form.get("intent"),
      recommended_format: form.get("recommended_format"), audio_fit: form.get("audio_fit"),
    }) });
    const payload = await response.json();
    if (!response.ok) return setNotice(payload.error === "normalized_query_duplicate" ? "Такой нормализованный запрос уже существует." : "Не удалось сохранить изменения.");
    const clusterItem = clusterOptions.find((item) => item.id === payload.query.cluster_id);
    setRows((current) => current.map((row) => row.id === id ? { ...row, queryText: payload.query.query_text, normalizedQuery: payload.query.normalized_query, frequency: payload.query.frequency, source: payload.query.source, clusterId: payload.query.cluster_id, cluster: clusterItem?.name ?? null, intent: payload.query.intent, recommendedFormat: payload.query.recommended_format, audioFit: payload.query.audio_fit } : row));
    setEditingId(""); setNotice("Изменения сохранены.");
  }

  async function release(reservationId: string) {
    const response = await fetch("/api/admin/seo-queries", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reservation_id: reservationId }) });
    if (!response.ok) return setNotice("Не удалось снять бронь.");
    setRows((current) => current.map((row) => row.reservationId === reservationId ? { ...row, reservationId: null, lifecycle: "Свободен", author: null, product: null, reservedAt: null, expiresAt: null } : row));
    setNotice("Бронь снята.");
  }

  async function searchWordstat(event: React.FormEvent) {
    event.preventDefault();
    setWordstatBusy(true);
    setWordstatNotice(null);
    const response = await fetch("/api/admin/seo-queries/wordstat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phrase: wordstatSeed }),
    });
    const payload = await response.json();
    setWordstatBusy(false);
    if (!response.ok) {
      setWordstatResults(null);
      return setWordstatNotice(payload.error ?? "Не удалось выполнить поиск в Wordstat.");
    }
    setWordstatResults(payload);
    setSelectedWordstatPhrases(new Set());
    setImportedWordstatPhrases(new Set());
  }

  function toggleWordstatSelection(phrase: string) {
    setSelectedWordstatPhrases((current) => {
      const next = new Set(current);
      if (next.has(phrase)) next.delete(phrase);
      else next.add(phrase);
      return next;
    });
  }

  function selectAllWordstat() {
    setSelectedWordstatPhrases(
      new Set(wordstatResults?.suggestions.map((item) => item.phrase) ?? []),
    );
  }

  async function importWordstatSelections() {
    if (!wordstatResults || selectedWordstatPhrases.size === 0) return;
    setWordstatBusy(true);
    setWordstatNotice(null);
    const items = wordstatResults.suggestions
      .filter((item) => selectedWordstatPhrases.has(item.phrase))
      .map((item) => ({ phrase: item.phrase, count: item.count }));
    const response = await fetch("/api/admin/seo-queries/wordstat", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const payload = await response.json();
    setWordstatBusy(false);
    if (!response.ok) return setWordstatNotice(payload.error ?? "Не удалось добавить выбранные запросы.");
    const imported = payload.results
      .filter((item: { status: string }) => item.status === "created" || item.status === "refreshed")
      .map((item: { phrase: string }) => item.phrase);
    setImportedWordstatPhrases((current) => new Set([...current, ...imported]));
    setWordstatNotice(`Добавлено: ${payload.summary.created}; обновлено: ${payload.summary.refreshed}; ошибок: ${payload.summary.errors}.`);
  }

  function toggleAnalysis(id: string) {
    setSelectedAnalysisIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function analyzeSelected(ids = [...selectedAnalysisIds]) {
    if (!ids.length) return;
    setAnalysisBusy(true);
    const response = await fetch("/api/admin/seo-queries/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query_ids: ids }) });
    const payload = await response.json();
    setAnalysisBusy(false);
    if (!response.ok) return setAnalysisSummary("Не удалось подготовить рекомендации.");
    const results: unknown[] = Array.isArray(payload.results) ? payload.results : [];
    setReviewItems(results
      .filter((item: unknown) => typeof item === "object" && item !== null && (item as Record<string, unknown>).status === "ready_for_review")
      .map(readReviewItem)
      .filter((item): item is ReviewItem => item !== null));
    setAnalysisSummary("Рекомендации подготовлены. Перед сохранением проверьте их.");
  }

  function setReviewValue(id: string, key: "intent" | "recommended_format" | "audio_fit", value: string) {
    setReviewItems((current) => current.map((item) => item.id === id ? {
      ...item,
      suggested: { ...item.suggested, [key]: value || null } as ReviewSuggestion,
    } : item));
  }

  function applyFailureMessage(status: string | undefined) {
    if (status === "reservation_limit_reached") {
      return "Нельзя одобрить запрос: у автора уже 5 поисковых запросов в работе. Снимите одну бронь или дождитесь её окончания.";
    }
    if (status === "reservation_conflict") {
      return "Запрос уже забронирован или использован другим автором.";
    }
    if (status === "already_reviewed") {
      return "Запись уже просмотрена с другим решением.";
    }
    return "Не удалось применить решение: запись уже просмотрена или зарезервирована.";
  }

  async function applyReview(id: string, analysis_status: "analyzed" | "not_applicable") {
    const item = reviewItems.find((candidate) => candidate.id === id);
    const row = rows.find((candidate) => candidate.id === id);
    if (!item) return;
    const suggested = item.suggested;
    setAnalysisBusy(true);
    const bodyItem: Record<string, unknown> = {
      id,
      intent: suggested.intent,
      recommended_format: suggested.recommended_format,
      audio_fit: suggested.audio_fit,
      analysis_status,
    };
    if (row?.proposalId) bodyItem.proposal_id = row.proposalId;
    const response = await fetch("/api/admin/seo-queries/analyze", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [bodyItem] }),
    });
    const payload = await response.json();
    setAnalysisBusy(false);
    const result = payload.results?.[0];
    if (!response.ok || result?.status !== "applied") {
      return setAnalysisSummary(applyFailureMessage(result?.status));
    }
    const reservationId =
      typeof result.reservation_id === "string" ? result.reservation_id : null;
    const expiresAt =
      typeof result.expires_at === "string" ? result.expires_at : null;
    setRows((current) => current.map((candidate) => {
      if (candidate.id !== id) return candidate;
      const nextStatus = (result.analysis_status ?? analysis_status) as Row["analysisStatus"];
      const reserved = Boolean(reservationId);
      return {
        ...candidate,
        intent: suggested.intent,
        recommendedFormat: suggested.recommended_format,
        audioFit: suggested.audio_fit,
        analysisStatus: nextStatus,
        reservationId,
        reservedAt: reserved ? new Date().toISOString() : candidate.reservedAt,
        expiresAt: reserved ? expiresAt : candidate.expiresAt,
        lifecycle: reserved ? "В работе" : nextStatus === "not_applicable" ? "Свободен" : candidate.lifecycle,
        author: reserved
          ? (candidate.proposalAuthorName ?? candidate.author)
          : nextStatus === "not_applicable"
            ? null
            : candidate.author,
        needsReview: false,
        approvedUnreserved: nextStatus === "analyzed" && !reserved && Boolean(candidate.proposalId),
      };
    }));
    setReviewItems((current) => current.filter((candidate) => candidate.id !== id));
    setSelectedAnalysisIds((current) => { const next = new Set(current); next.delete(id); return next; });
    setAnalysisSummary(`Применено: готово ${payload.summary.analyzed}; не подходит ${payload.summary.not_applicable}; конфликтов ${payload.summary.conflicts}; ошибок ${payload.summary.errors}.`);
  }

  async function reconcileReservation(row: Row) {
    if (!row.proposalId || !row.approvedUnreserved) return;
    setAnalysisBusy(true);
    const response = await fetch("/api/admin/seo-queries/analyze", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [{
          id: row.id,
          proposal_id: row.proposalId,
          intent: row.intent ?? "informational",
          recommended_format: row.recommendedFormat,
          audio_fit: row.audioFit ?? "medium",
          analysis_status: "analyzed",
        }],
      }),
    });
    const payload = await response.json();
    setAnalysisBusy(false);
    const result = payload.results?.[0];
    if (!response.ok || result?.status !== "applied") {
      return setAnalysisSummary(applyFailureMessage(result?.status));
    }
    const reservationId =
      typeof result.reservation_id === "string" ? result.reservation_id : null;
    const expiresAt =
      typeof result.expires_at === "string" ? result.expires_at : null;
    setRows((current) => current.map((candidate) => candidate.id === row.id ? {
      ...candidate,
      analysisStatus: "analyzed",
      reservationId,
      reservedAt: reservationId ? new Date().toISOString() : candidate.reservedAt,
      expiresAt: reservationId ? expiresAt : candidate.expiresAt,
      lifecycle: reservationId ? "В работе" : candidate.lifecycle,
      author: reservationId
        ? (candidate.proposalAuthorName ?? candidate.author)
        : candidate.author,
      needsReview: false,
      approvedUnreserved: !reservationId,
    } : candidate));
    setAnalysisSummary(reservationId ? "Запрос закреплён за автором." : "Решение применено.");
  }

  return <div className="space-y-5">
    <form onSubmit={addQuery} className="flex flex-col gap-2 rounded-[22px] border border-[#eadff8] bg-white p-4 sm:flex-row">
      <input value={newQuery} onChange={(event) => setNewQuery(event.target.value)} required placeholder="Добавить SEO-запрос вручную" className="min-h-11 flex-1 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
      <button className="min-h-11 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white">Добавить</button>
    </form>
    <form onSubmit={addCluster} className="flex flex-col gap-2 rounded-[22px] border border-[#eadff8] bg-white p-4 sm:flex-row">
      <input value={newCluster} onChange={(event) => setNewCluster(event.target.value)} required placeholder="Создать кластер" className="min-h-11 flex-1 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
      <button className="min-h-11 rounded-full border border-[#bda6e1] px-5 text-sm font-semibold text-[#7042c5]">Создать кластер</button>
    </form>
    <section className="rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] p-4">
      <h3 className="text-base font-semibold text-[#25135c]">Найти запросы в Wordstat</h3>
      <form onSubmit={searchWordstat} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input value={wordstatSeed} onChange={(event) => setWordstatSeed(event.target.value)} required placeholder="Введите исходную фразу" className="min-h-11 flex-1 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm" />
        <button disabled={wordstatBusy} className="min-h-11 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white disabled:opacity-60">{wordstatBusy ? "Поиск…" : "Найти запросы"}</button>
      </form>
      {wordstatNotice ? <p role="status" className="mt-3 text-sm text-[#4c3d78]">{wordstatNotice}</p> : null}
      {wordstatResults ? <div className="mt-4 space-y-3">
        <p className="text-sm text-[#5f5484]">Период: {wordstatResults.periodLabel}. Регион: {wordstatResults.region.label}.</p>
        <p className="text-sm text-[#5f5484]">Всего по теме: {wordstatResults.topicTotalCount ?? "—"} <span className="text-xs">(агрегат темы, не частотность исходной фразы)</span></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={selectAllWordstat} className="min-h-10 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5]">Выбрать все</button>
          <button type="button" disabled={wordstatBusy || selectedWordstatPhrases.size === 0} onClick={importWordstatSelections} className="min-h-10 rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-60">Добавить выбранные в SEO-базу</button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#eadff8] bg-white">
          <table className="min-w-full text-left text-sm"><thead className="bg-[#f4edff] text-[#796ba0]"><tr><th className="px-3 py-2"> </th><th className="px-3 py-2">Запрос</th><th className="px-3 py-2">Частотность</th><th className="px-3 py-2">Источник</th><th className="px-3 py-2">Оценка</th></tr></thead><tbody>
            {wordstatResults.suggestions.map((item) => {
              const imported = importedWordstatPhrases.has(item.phrase);
              return <tr key={`${item.source}-${item.phrase}`} className={`border-t border-[#f3edf9] ${imported ? "bg-[#f3faf1]" : ""}`}><td className="px-3 py-2"><input aria-label={`Выбрать ${item.phrase}`} type="checkbox" checked={selectedWordstatPhrases.has(item.phrase)} onChange={() => toggleWordstatSelection(item.phrase)} /></td><td className="px-3 py-2 font-medium">{item.phrase}{imported ? <span className="ml-2 text-xs text-[#2f6b2a]">Добавлено</span> : null}</td><td className="px-3 py-2">{item.count}</td><td className="px-3 py-2">{item.source === "result" ? "результат" : "ассоциация"}</td><td className="px-3 py-2"><span className={item.opportunity.color === "green" ? "text-[#2f6b2a]" : item.opportunity.color === "yellow" ? "text-[#7a5b12]" : "text-[#8b2d2d]"} title={item.opportunity.description}>{item.opportunity.label}</span></td></tr>;
            })}
          </tbody></table>
        </div>
      </div> : null}
    </section>
    <div className="grid gap-2 sm:grid-cols-5">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm" />
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все статусы</option>{["Свободен", "В работе", "На модерации", "Опубликован"].map((value) => <option key={value}>{value}</option>)}</select>
      <select value={analysisStatus} onChange={(event) => setAnalysisStatus(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все</option><option value="not_analyzed">Не анализировались</option><option value="analyzed">Готовы</option><option value="not_applicable">Не подходят</option></select>
      <select value={source} onChange={(event) => setSource(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все источники</option>{sources.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={cluster} onChange={(event) => setCluster(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все кластеры</option>{clusters.map((value) => <option key={value}>{value}</option>)}</select>
    </div>
    {notice ? <p role="status" className="text-sm text-[#4c3d78]">{notice}</p> : null}
    <section className="rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] p-4">
      <button type="button" disabled={analysisBusy || selectedAnalysisIds.size === 0} onClick={() => analyzeSelected()} className="min-h-10 rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-60">Анализировать выбранные</button>
      {analysisSummary ? <p role="status" className="mt-2 text-sm text-[#4c3d78]">{analysisSummary}</p> : null}
      {reviewItems.map((item) => { const { suggested } = item; const queryText = String(item.query_text ?? ""); const frequency = typeof item.frequency === "number" ? String(item.frequency) : "—"; const reasons = Array.isArray(suggested.reasons) ? suggested.reasons.join(" ") : ""; return <article key={item.id} className="mt-3 rounded-xl border border-[#eadff8] bg-white p-3 text-sm"><p className="font-semibold">{queryText} · {frequency}</p><p className="mt-1 text-xs text-[#796ba0]">Уверенность: {suggested.confidence}. {reasons}</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><select value={suggested.intent} onChange={(event) => setReviewValue(item.id, "intent", event.target.value)}>{SEO_QUERY_INTENTS.map((value) => <option key={value}>{value}</option>)}</select><select value={suggested.recommended_format ?? ""} onChange={(event) => setReviewValue(item.id, "recommended_format", event.target.value)}><option value="">—</option>{SEO_QUERY_FORMATS.map((value) => <option key={value}>{value}</option>)}</select><select value={suggested.audio_fit} onChange={(event) => setReviewValue(item.id, "audio_fit", event.target.value)}>{SEO_QUERY_AUDIO_FITS.map((value) => <option key={value} value={value}>{SEO_QUERY_AUDIO_FIT_LABELS[value]}</option>)}</select></div><p className="mt-2">Рекомендация: {suggested.recommended_disposition === "not_applicable" ? "Не подходит" : "Допустить авторам"}</p><div className="mt-2 flex gap-3"><button type="button" onClick={() => applyReview(item.id, "analyzed")} className="font-semibold text-[#7042c5]">Допустить авторам</button><button type="button" onClick={() => applyReview(item.id, "not_applicable")} className="font-semibold text-[#7042c5]">Не подходит</button></div></article>; })}
    </section>
    {editingId ? (() => {
      const row = rows.find((item) => item.id === editingId);
      return row ? <form onSubmit={saveEdit} className="grid gap-3 rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] p-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={row.id} />
        <input name="query_text" defaultValue={row.queryText} required className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm sm:col-span-2" />
        <input name="frequency" type="number" min="0" defaultValue={row.frequency ?? ""} placeholder="Частотность" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <select name="source" defaultValue={row.source} className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm">{["manual", "wordstat", "search_console", "yandex_webmaster", "other"].map((value) => <option key={value}>{value}</option>)}</select>
        <select name="cluster_id" defaultValue={row.clusterId ?? ""} className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm"><option value="">Без кластера</option>{clusterOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input name="intent" defaultValue={row.intent ?? ""} placeholder="Intent" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <input name="recommended_format" defaultValue={row.recommendedFormat ?? ""} placeholder="Рекомендуемый формат" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <input name="audio_fit" defaultValue={row.audioFit ?? ""} placeholder="Audio Fit" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <div className="flex gap-2"><button className="min-h-11 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white">Сохранить</button><button type="button" onClick={() => setEditingId("")} className="min-h-11 px-4 text-sm text-[#7042c5]">Отмена</button></div>
      </form> : null;
    })() : null}
    <div className="hidden overflow-x-auto rounded-[22px] border border-[#eadff8] bg-white md:block"><table className="min-w-full text-left text-sm"><thead className="bg-[#faf6ff] text-[#796ba0]"><tr>{["", "Запрос", "Normalized", "Частотность", "Источник", "Кластер", "Intent", "Формат", "Audio Fit", "Анализ", "Статус", "Автор / продукт", "Бронь", "Создан", ""].map((title, index) => <th key={`${title}-${index}`} className="px-3 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{filtered.map((row) => {
      const rowTone = row.needsReview
        ? "border-t border-[#f3edf9] bg-[#fff7e8]"
        : row.approvedUnreserved
          ? "border-t border-[#f3edf9] bg-[#fff4ec]"
          : "border-t border-[#f3edf9]";
      return <tr key={row.id} id={`seo-query-${row.id}`} className={rowTone}><td className="px-3 py-3">{row.analysisStatus === "not_analyzed" ? <input aria-label={`Анализировать ${row.queryText}`} type="checkbox" checked={selectedAnalysisIds.has(row.id)} onChange={() => toggleAnalysis(row.id)} /> : null}</td><td className="px-3 py-3 font-medium">{row.queryText}{row.needsReview ? <span className="ml-2 inline-flex rounded-full bg-[#f5c451] px-2 py-0.5 text-[11px] font-semibold text-[#7a5b12]">Нужно проверить</span> : null}{row.approvedUnreserved ? <span className="ml-2 inline-flex rounded-full bg-[#ffd0b0] px-2 py-0.5 text-[11px] font-semibold text-[#8a4b1a]">Одобрен — не закреплён</span> : null}{row.proposedByAuthor && row.proposalAuthorName ? <span className="mt-1 block text-xs font-normal text-[#796ba0]">Предложил: {row.proposalAuthorName}</span> : null}</td><td className="px-3 py-3 text-[#796ba0]">{row.normalizedQuery}</td><td className="px-3 py-3">{row.frequency ?? "—"}</td><td className="px-3 py-3">{row.source}</td><td className="px-3 py-3">{row.cluster ?? "—"}</td><td className="px-3 py-3">{row.intent ?? "—"}</td><td className="px-3 py-3">{row.recommendedFormat ?? "—"}</td><td className="px-3 py-3">{row.audioFit ?? "—"}</td><td className="px-3 py-3">{row.analysisStatus === "analyzed" ? "Готов" : row.analysisStatus === "not_applicable" ? "Не подходит" : "Не анализировался"}</td><td className="px-3 py-3">{row.lifecycle}</td><td className="px-3 py-3">{row.author ?? row.proposalAuthorName ?? "—"}{row.product ? ` / ${row.product}` : ""}</td><td className="px-3 py-3">{date(row.reservedAt)} / {date(row.expiresAt)}</td><td className="px-3 py-3">{date(row.createdAt)}</td><td className="px-3 py-3 whitespace-nowrap"><button onClick={() => setEditingId(row.id)} className="mr-2 text-xs font-semibold text-[#7042c5]">Изменить</button>{row.analysisStatus === "not_analyzed" ? <button onClick={() => analyzeSelected([row.id])} className="mr-2 text-xs font-semibold text-[#7042c5]">Анализировать</button> : null}{row.approvedUnreserved ? <button type="button" disabled={analysisBusy} onClick={() => reconcileReservation(row)} className="mr-2 text-xs font-semibold text-[#c45c16] disabled:opacity-60">Закрепить автору</button> : null}{row.reservationId && row.lifecycle !== "Опубликован" ? <button onClick={() => release(row.reservationId!)} className="text-xs font-semibold text-[#7042c5]">Снять бронь</button> : null}</td></tr>;
    })}</tbody></table></div>
    <div className="space-y-3 md:hidden">{filtered.map((row) => {
      const cardTone = row.needsReview
        ? "rounded-[22px] border border-[#f0c35a] bg-[#fff7e8] p-4"
        : row.approvedUnreserved
          ? "rounded-[22px] border border-[#f0a66a] bg-[#fff4ec] p-4"
          : "rounded-[22px] border border-[#eadff8] bg-white p-4";
      return <article key={row.id} id={`seo-query-${row.id}`} className={cardTone}><h2 className="font-semibold text-[#25135c]">{row.queryText}</h2>{row.needsReview ? <p className="mt-1 text-xs font-semibold text-[#7a5b12]">Нужно проверить</p> : null}{row.approvedUnreserved ? <p className="mt-1 text-xs font-semibold text-[#8a4b1a]">Одобрен — не закреплён</p> : null}<p className="mt-1 text-xs text-[#796ba0]">{row.normalizedQuery}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#5f5484]"><span>{row.lifecycle}</span><span>{row.frequency ?? "—"} частотность</span><span>{row.cluster ?? "Без кластера"}</span><span>{row.author ?? row.proposalAuthorName ?? "Свободен"}</span></div>{row.approvedUnreserved ? <button type="button" disabled={analysisBusy} onClick={() => reconcileReservation(row)} className="mt-3 text-sm font-semibold text-[#c45c16] disabled:opacity-60">Закрепить автору</button> : null}</article>;
    })}</div>
  </div>;
}
