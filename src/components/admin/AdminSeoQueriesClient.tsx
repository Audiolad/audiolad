"use client";

import { useMemo, useState } from "react";

import {
  chunkIds,
  planSeoAnalysisRecommendations,
  seoAnalysisPlanConfirmText,
  sortByFrequencyDesc,
  type SeoFrequencyRefreshResult,
} from "@/lib/seo-queries/analysis-plan";
import {
  SEO_QUERY_AUDIO_FITS,
  SEO_QUERY_AUDIO_FIT_LABELS,
  SEO_QUERY_CONFIDENCE_LABELS,
  SEO_QUERY_FORMATS,
  SEO_QUERY_INTENTS,
  SEO_QUERY_INTENT_LABELS,
  SEO_QUERY_SOURCE_LABELS,
  seoQueryLabel,
} from "@/lib/seo-queries/analysis-taxonomy";
import { SEO_QUERY_ANALYSIS_MAX_ITEMS } from "@/lib/seo-queries/analysis-validation";
import { evaluateWordstatOpportunity } from "@/lib/seo/wordstat/opportunity";

import type { WordstatIntakeResult, WordstatIntakeStatus } from "@/lib/seo-queries/wordstat-intake";

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
type FrequencyStatus = "present" | "loading" | "fetched" | "not_found" | "failed";
type ReviewItem = {
  id: string;
  query_text: string;
  frequency: number | null;
  frequencyStatus: FrequencyStatus;
  frequencyMessage: string | null;
  suggested: ReviewSuggestion;
};
type Decision = { item: ReviewItem; analysis_status: "analyzed" | "not_applicable" };
type DecisionSummary = { analyzed: number; not_applicable: number; conflicts: number; errors: number; lastFailure: string | undefined };

const FREQUENCY_FETCH_FAILED = "Не удалось связаться с сервером.";

function isLowConfidence(item: ReviewItem) {
  return item.suggested.confidence !== "high" && item.suggested.confidence !== "medium";
}

function frequencyTone(frequency: number) {
  const color = evaluateWordstatOpportunity(frequency).color;
  return color === "green" ? "bg-[#e8f5e4] text-[#2f6b2a]" : color === "yellow" ? "bg-[#fff3d6] text-[#7a5b12]" : "bg-[#fde8e8] text-[#8b2d2d]";
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "–";
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
    frequencyStatus: typeof item.frequency === "number" ? "present" : "loading", frequencyMessage: null,
    suggested: recommendation as unknown as ReviewSuggestion,
  };
}

export default function AdminSeoQueriesClient({ initialRows, clusters: initialClusters, initialAnalysisStatus = "" }: { initialRows: Row[]; clusters: Cluster[]; initialAnalysisStatus?: "" | Row["analysisStatus"] }) {
  const [rows, setRows] = useState(initialRows);
  const [clusterOptions, setClusterOptions] = useState(initialClusters);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState<string>(initialAnalysisStatus);
  const [source, setSource] = useState("");
  const [cluster, setCluster] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [newCluster, setNewCluster] = useState("");
  const [editingId, setEditingId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [wordstatSeed, setWordstatSeed] = useState("");
  const [wordstatResults, setWordstatResults] = useState<WordstatResults | null>(null);
  const [selectedWordstatPhrases, setSelectedWordstatPhrases] = useState<Set<string>>(new Set());
  const [importedWordstatPhrases, setImportedWordstatPhrases] = useState<Map<string, WordstatIntakeStatus>>(new Map());
  const [wordstatBusy, setWordstatBusy] = useState(false);
  const [wordstatNotice, setWordstatNotice] = useState<string | null>(null);
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<Set<string>>(new Set());
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"created" | "frequency">("created");
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
      if (sortBy === "frequency" && a.frequency !== b.frequency) {
        if (a.frequency === null) return 1;
        if (b.frequency === null) return -1;
        return b.frequency - a.frequency;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [rows, search, status, analysisStatus, source, cluster, sortBy]);
  const selectableAnalysisIds = useMemo(() => filtered.filter((row) => row.analysisStatus === "not_analyzed").map((row) => row.id), [filtered]);
  const reviewPlan = useMemo(() => planSeoAnalysisRecommendations(reviewItems), [reviewItems]);

  async function addQuery(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/seo-queries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query_text: newQuery, source: "manual" }) });
    const payload = await response.json();
    if (!response.ok) return setNotice(payload.error === "normalized_query_duplicate" ? "Такой нормализованный запрос уже существует." : "Не удалось добавить запрос.");
    setRows((current) => [{ id: payload.query.id, queryText: payload.query.query_text, normalizedQuery: payload.query.normalized_query, source: payload.query.source, frequency: null, cluster: null, clusterId: null, intent: null, recommendedFormat: null, audioFit: null, analysisStatus: "analyzed", lifecycle: "Свободен", author: null, product: null, reservedAt: null, expiresAt: null, createdAt: payload.query.created_at, reservationId: null, proposalId: null, proposalAuthorId: null, proposalAuthorName: null, proposalAuthorSlug: null, proposalCreatedAt: null, proposedByAuthor: false, needsReview: false, approvedUnreserved: false }, ...current]);
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
    let response: Response;
    try {
      response = await fetch("/api/admin/seo-queries", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reservation_id: reservationId }) });
    } catch {
      setNotice("Не удалось снять бронь (network_error).");
      return;
    }
    let payload: { error?: unknown; code?: unknown } | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const code = typeof payload?.code === "string" && payload.code.trim()
        ? payload.code.trim()
        : typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : `http_${response.status}`;
      setNotice(`Не удалось снять бронь (${code}).`);
      return;
    }
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
    setImportedWordstatPhrases(new Map());
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
    try {
      const response = await fetch("/api/admin/seo-queries/wordstat", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`сервер вернул некорректный ответ (HTTP ${response.status})`);
      }
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
      if (!Array.isArray(payload?.results) || !payload?.summary) throw new Error("некорректный ответ сервера");
      const results: WordstatIntakeResult[] = payload.results;
      setImportedWordstatPhrases((current) => {
        const next = new Map(current);
        for (const item of results) next.set(item.phrase, item.status);
        return next;
      });
      setRows((current) => {
        const next = [...current];
        for (const item of results) {
          if (item.status === "error") continue;
          const query = item.query;
          const index = next.findIndex((row) => row.id === query.id);
          if (index >= 0) {
            const row = next[index];
            next[index] = { ...row, frequency: query.frequency, analysisStatus: query.analysisStatus,
              needsReview: row.proposedByAuthor && query.analysisStatus === "not_analyzed" };
          } else {
            next.unshift({ ...query, cluster: null, clusterId: null, intent: null,
              recommendedFormat: null, audioFit: null, lifecycle: "Свободен",
              author: null, product: null, reservedAt: null, expiresAt: null,
              reservationId: null, proposalId: null, proposalAuthorId: null,
              proposalAuthorName: null, proposalAuthorSlug: null, proposalCreatedAt: null,
              proposedByAuthor: false, needsReview: false, approvedUnreserved: false });
          }
        }
        return next;
      });
      setWordstatNotice(`Добавлено: ${payload.summary.created + payload.summary.promoted}; уже в базе: ${payload.summary.refreshed}; ждут проверки: ${payload.summary.needsReview}; ранее отклонены: ${payload.summary.notApplicable}; ошибок: ${payload.summary.errors}.`);
    } catch (error) {
      setWordstatNotice(`Не удалось добавить выбранные запросы: ${error instanceof Error ? error.message : "ошибка сети"}`);
    } finally {
      setWordstatBusy(false);
    }
  }

  function toggleAnalysis(id: string) {
    setSelectedAnalysisIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllForAnalysis() {
    setSelectedAnalysisIds(new Set(selectableAnalysisIds));
  }

  function mergeFrequencyResults(results: SeoFrequencyRefreshResult[]) {
    const byId = new Map(results.map((result) => [result.id, result]));
    setReviewItems((current) => sortByFrequencyDesc(current.map((item) => {
      const result = byId.get(item.id);
      if (!result) return item;
      if (result.status === "not_found" || result.status === "failed") {
        return { ...item, frequency: null, frequencyStatus: result.status, frequencyMessage: result.message };
      }
      return { ...item, frequency: result.frequency, frequencyStatus: result.status, frequencyMessage: null };
    })));
    setRows((current) => current.map((row) => {
      const result = byId.get(row.id);
      return result?.status === "fetched" ? { ...row, frequency: result.frequency } : row;
    }));
  }

  async function refreshFrequencies(ids: string[]) {
    if (!ids.length) return;
    const pending = new Set(ids);
    setReviewItems((current) => current.map((item) => pending.has(item.id) ? { ...item, frequencyStatus: "loading", frequencyMessage: null } : item));
    for (const chunk of chunkIds(ids, SEO_QUERY_ANALYSIS_MAX_ITEMS)) {
      let results: SeoFrequencyRefreshResult[] | null = null;
      try {
        const response = await fetch("/api/admin/seo-queries/frequency", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query_ids: chunk }) });
        const payload = await response.json();
        if (response.ok && Array.isArray(payload?.results)) results = payload.results as SeoFrequencyRefreshResult[];
      } catch {
        results = null;
      }
      const returned = new Set((results ?? []).map((result) => result.id));
      mergeFrequencyResults([
        ...(results ?? []),
        ...chunk.filter((id) => !returned.has(id)).map((id): SeoFrequencyRefreshResult => ({ id, status: "failed", frequency: null, code: "UPSTREAM_ERROR", message: FREQUENCY_FETCH_FAILED })),
      ]);
    }
  }

  async function analyzeSelected(ids = [...selectedAnalysisIds]) {
    if (!ids.length) return;
    setAnalysisBusy(true);
    const prepared: ReviewItem[] = [];
    let failedChunks = 0;
    for (const chunk of chunkIds(ids, SEO_QUERY_ANALYSIS_MAX_ITEMS)) {
      try {
        const response = await fetch("/api/admin/seo-queries/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query_ids: chunk }) });
        const payload = await response.json();
        if (!response.ok) { failedChunks += 1; continue; }
        const results: unknown[] = Array.isArray(payload.results) ? payload.results : [];
        prepared.push(...results
          .filter((item: unknown) => typeof item === "object" && item !== null && (item as Record<string, unknown>).status === "ready_for_review")
          .map(readReviewItem)
          .filter((item): item is ReviewItem => item !== null));
      } catch {
        failedChunks += 1;
      }
    }
    setAnalysisBusy(false);
    if (!prepared.length && failedChunks) return setAnalysisSummary("Не удалось подготовить рекомендации.");
    setReviewItems(sortByFrequencyDesc(prepared));
    const plan = planSeoAnalysisRecommendations(prepared);
    setAnalysisSummary(`Рекомендации подготовлены: ${prepared.length}. Допустить ${plan.approve.length}, отклонить ${plan.reject.length}, на ручное решение ${plan.manual.length}.${failedChunks ? " Часть запросов не удалось проанализировать – повторите." : ""}`);
    await refreshFrequencies(prepared.filter((item) => item.frequency === null).map((item) => item.id));
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

  async function submitDecisions(decisions: Decision[]): Promise<DecisionSummary> {
    const summary: DecisionSummary = { analyzed: 0, not_applicable: 0, conflicts: 0, errors: 0, lastFailure: undefined };
    const applied = new Map<string, { status: Row["analysisStatus"]; reservationId: string | null; expiresAt: string | null; item: ReviewItem }>();
    for (const chunk of chunkIds(decisions, SEO_QUERY_ANALYSIS_MAX_ITEMS)) {
      const items = chunk.map(({ item, analysis_status }) => {
        const bodyItem: Record<string, unknown> = {
          id: item.id,
          intent: item.suggested.intent,
          recommended_format: item.suggested.recommended_format,
          audio_fit: item.suggested.audio_fit,
          analysis_status,
        };
        const row = rows.find((candidate) => candidate.id === item.id);
        if (row?.proposalId) bodyItem.proposal_id = row.proposalId;
        return bodyItem;
      });
      let payload: { results?: Array<Record<string, unknown>>; summary?: Omit<DecisionSummary, "lastFailure"> } | null = null;
      try {
        const response = await fetch("/api/admin/seo-queries/analyze", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
        payload = await response.json();
        if (!response.ok) payload = null;
      } catch {
        payload = null;
      }
      if (!payload?.results || !payload.summary) {
        summary.errors += chunk.length;
        continue;
      }
      summary.analyzed += payload.summary.analyzed;
      summary.not_applicable += payload.summary.not_applicable;
      summary.conflicts += payload.summary.conflicts;
      summary.errors += payload.summary.errors;
      for (const [index, result] of payload.results.entries()) {
        const decision = chunk[index];
        if (!decision || result.id !== decision.item.id) continue;
        if (result.status !== "applied") {
          summary.lastFailure = typeof result.status === "string" ? result.status : undefined;
          continue;
        }
        applied.set(decision.item.id, {
          status: (result.analysis_status ?? decision.analysis_status) as Row["analysisStatus"],
          reservationId: typeof result.reservation_id === "string" ? result.reservation_id : null,
          expiresAt: typeof result.expires_at === "string" ? result.expires_at : null,
          item: decision.item,
        });
      }
    }
    if (applied.size) {
      setRows((current) => current.map((candidate) => {
        const result = applied.get(candidate.id);
        if (!result) return candidate;
        const { status: nextStatus, reservationId, expiresAt, item } = result;
        const reserved = Boolean(reservationId);
        return {
          ...candidate,
          intent: item.suggested.intent,
          recommendedFormat: item.suggested.recommended_format,
          audioFit: item.suggested.audio_fit,
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
      setReviewItems((current) => current.filter((candidate) => !applied.has(candidate.id)));
      setSelectedAnalysisIds((current) => { const next = new Set(current); for (const id of applied.keys()) next.delete(id); return next; });
    }
    return summary;
  }

  async function applyReview(id: string, analysis_status: "analyzed" | "not_applicable") {
    const item = reviewItems.find((candidate) => candidate.id === id);
    if (!item) return;
    setAnalysisBusy(true);
    const summary = await submitDecisions([{ item, analysis_status }]);
    setAnalysisBusy(false);
    if (summary.analyzed + summary.not_applicable === 0) {
      return setAnalysisSummary(applyFailureMessage(summary.lastFailure));
    }
    setAnalysisSummary(`Применено: готово ${summary.analyzed}; не подходит ${summary.not_applicable}; конфликтов ${summary.conflicts}; ошибок ${summary.errors}.`);
  }

  async function applyRecommendations() {
    const plan = planSeoAnalysisRecommendations(reviewItems);
    if (plan.approve.length + plan.reject.length === 0) return;
    if (!window.confirm(seoAnalysisPlanConfirmText(plan))) return;
    const approve = new Set(plan.approve);
    const decisions: Decision[] = reviewItems
      .filter((item) => !isLowConfidence(item))
      .map((item) => ({ item, analysis_status: approve.has(item.id) ? "analyzed" : "not_applicable" }));
    setAnalysisBusy(true);
    const summary = await submitDecisions(decisions);
    setAnalysisBusy(false);
    setAnalysisSummary(`Рекомендации применены: допущено ${summary.analyzed}, отклонено ${summary.not_applicable}; на ручное решение осталось ${plan.manual.length}; конфликтов ${summary.conflicts}; ошибок ${summary.errors}.`);
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
        <p className="text-sm text-[#5f5484]">Всего по теме: {wordstatResults.topicTotalCount ?? "–"} <span className="text-xs">(агрегат темы, не частотность исходной фразы)</span></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={selectAllWordstat} className="min-h-10 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5]">Выбрать все</button>
          <button type="button" disabled={wordstatBusy || selectedWordstatPhrases.size === 0} onClick={importWordstatSelections} className="min-h-10 rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-60">Добавить выбранные в SEO-базу</button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#eadff8] bg-white">
          <table className="min-w-full text-left text-sm"><thead className="bg-[#f4edff] text-[#796ba0]"><tr><th className="px-3 py-2"> </th><th className="px-3 py-2">Запрос</th><th className="px-3 py-2">Частотность</th><th className="px-3 py-2">Источник</th><th className="px-3 py-2">Оценка</th></tr></thead><tbody>
            {wordstatResults.suggestions.map((item) => {
              const importStatus = importedWordstatPhrases.get(item.phrase);
              const imported = importStatus === "created" || importStatus === "promoted";
              const importLabel = imported ? "Добавлено"
                : importStatus === "refreshed" ? "Уже в базе"
                : importStatus === "needs_review" ? "Ждёт проверки заявки автора"
                : importStatus === "not_applicable" ? "Ранее отмечен как неподходящий"
                : importStatus === "error" ? "Ошибка сохранения" : null;
              const importColor = importStatus === "needs_review" ? "text-[#7a5b12]"
                : importStatus === "not_applicable" || importStatus === "error" ? "text-[#8b2d2d]" : "text-[#2f6b2a]";
              return <tr key={`${item.source}-${item.phrase}`} className={`border-t border-[#f3edf9] ${imported ? "bg-[#f3faf1]" : ""}`}><td className="px-3 py-2"><input aria-label={`Выбрать ${item.phrase}`} type="checkbox" checked={selectedWordstatPhrases.has(item.phrase)} onChange={() => toggleWordstatSelection(item.phrase)} /></td><td className="px-3 py-2 font-medium">{item.phrase}{importLabel ? <span className={`ml-2 text-xs ${importColor}`}>{importLabel}</span> : null}</td><td className="px-3 py-2">{item.count}</td><td className="px-3 py-2">{item.source === "result" ? "результат" : "ассоциация"}</td><td className="px-3 py-2"><span className={item.opportunity.color === "green" ? "text-[#2f6b2a]" : item.opportunity.color === "yellow" ? "text-[#7a5b12]" : "text-[#8b2d2d]"} title={item.opportunity.description}>{item.opportunity.label}</span></td></tr>;
            })}
          </tbody></table>
        </div>
      </div> : null}
    </section>
    <div className="grid gap-2 sm:grid-cols-6">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm" />
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все статусы</option>{["Свободен", "В работе", "На модерации", "Опубликован"].map((value) => <option key={value}>{value}</option>)}</select>
      <select value={analysisStatus} onChange={(event) => setAnalysisStatus(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все</option><option value="not_analyzed">Не проверены</option><option value="analyzed">Готовы</option><option value="not_applicable">Не подходят</option></select>
      <select value={source} onChange={(event) => setSource(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все источники</option>{sources.map((value) => <option key={value} value={value}>{seoQueryLabel(SEO_QUERY_SOURCE_LABELS, value)}</option>)}</select>
      <select value={cluster} onChange={(event) => setCluster(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все кластеры</option>{clusters.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Сортировка" value={sortBy} onChange={(event) => setSortBy(event.target.value === "frequency" ? "frequency" : "created")} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="created">Сначала новые</option><option value="frequency">По частотности</option></select>
    </div>
    {notice ? <p role="status" className="text-sm text-[#4c3d78]">{notice}</p> : null}
    <section className="rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={analysisBusy || selectableAnalysisIds.length === 0} onClick={selectAllForAnalysis} className="min-h-10 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-60">Выбрать все непроверенные ({selectableAnalysisIds.length})</button>
        <button type="button" disabled={analysisBusy || selectedAnalysisIds.size === 0} onClick={() => analyzeSelected()} className="min-h-10 rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-60">Анализировать выбранные{selectedAnalysisIds.size ? ` (${selectedAnalysisIds.size})` : ""}</button>
        {reviewItems.length ? <button type="button" disabled={analysisBusy || reviewPlan.approve.length + reviewPlan.reject.length === 0} onClick={applyRecommendations} className="min-h-10 rounded-full bg-[#2f6b2a] px-4 text-sm font-semibold text-white disabled:opacity-60">Применить рекомендации к выбранным</button> : null}
      </div>
      {reviewItems.length ? <p className="mt-2 text-xs text-[#796ba0]">Сразу применятся рекомендации с высокой и средней уверенностью: допустить {reviewPlan.approve.length}, отклонить {reviewPlan.reject.length}. На ручное решение останется {reviewPlan.manual.length} – они отмечены жёлтым.</p> : null}
      {analysisSummary ? <p role="status" className="mt-2 text-sm text-[#4c3d78]">{analysisSummary}</p> : null}
      {reviewItems.map((item) => {
        const { suggested } = item;
        const queryText = String(item.query_text ?? "");
        const reasons = Array.isArray(suggested.reasons) ? suggested.reasons.join(" ") : "";
        const manual = isLowConfidence(item);
        const confidence = seoQueryLabel(SEO_QUERY_CONFIDENCE_LABELS, suggested.confidence);
        const frequencyBadge = typeof item.frequency === "number"
          ? <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${frequencyTone(item.frequency)}`} title={evaluateWordstatOpportunity(item.frequency).label}>Частотность: {item.frequency.toLocaleString("ru-RU")}</span>
          : item.frequencyStatus === "loading"
            ? <span className="inline-flex rounded-full bg-[#f4edff] px-3 py-1 text-sm text-[#5f5484]">Частотность: запрашиваем в Wordstat…</span>
            : <span className="inline-flex flex-wrap items-center gap-2 rounded-full bg-[#fde8e8] px-3 py-1 text-sm text-[#8b2d2d]">Частотность не получена{item.frequencyMessage ? ` – ${item.frequencyMessage}` : ""}<button type="button" disabled={analysisBusy} onClick={() => refreshFrequencies([item.id])} className="font-semibold underline disabled:opacity-60">Повторить</button></span>;
        return <article key={item.id} className={`mt-3 rounded-xl border p-3 text-sm ${manual ? "border-[#f0c35a] bg-[#fff7e8]" : "border-[#eadff8] bg-white"}`}>
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{queryText}</p>{frequencyBadge}{manual ? <span className="inline-flex rounded-full bg-[#f5c451] px-2 py-0.5 text-[11px] font-semibold text-[#7a5b12]">Нужно ваше решение</span> : null}</div>
          <p className="mt-1 text-xs text-[#796ba0]">Уверенность: {confidence}. {reasons}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select aria-label="Намерение" value={suggested.intent} onChange={(event) => setReviewValue(item.id, "intent", event.target.value)}>{SEO_QUERY_INTENTS.map((value) => <option key={value} value={value}>{SEO_QUERY_INTENT_LABELS[value]}</option>)}</select>
            <select aria-label="Формат" value={suggested.recommended_format ?? ""} onChange={(event) => setReviewValue(item.id, "recommended_format", event.target.value)}><option value="">Формат не выбран</option>{SEO_QUERY_FORMATS.map((value) => <option key={value}>{value}</option>)}</select>
            <select aria-label="Аудио-потенциал" value={suggested.audio_fit} onChange={(event) => setReviewValue(item.id, "audio_fit", event.target.value)}>{SEO_QUERY_AUDIO_FITS.map((value) => <option key={value} value={value}>{SEO_QUERY_AUDIO_FIT_LABELS[value]}</option>)}</select>
          </div>
          <p className="mt-2">Рекомендация: {manual ? "нет уверенной рекомендации – решите сами" : suggested.recommended_disposition === "not_applicable" ? "Не подходит" : "Допустить авторам"}</p>
          <div className="mt-2 flex gap-3"><button type="button" disabled={analysisBusy} onClick={() => applyReview(item.id, "analyzed")} className="font-semibold text-[#7042c5] disabled:opacity-60">Допустить авторам</button><button type="button" disabled={analysisBusy} onClick={() => applyReview(item.id, "not_applicable")} className="font-semibold text-[#7042c5] disabled:opacity-60">Не подходит</button></div>
        </article>;
      })}
    </section>
    {editingId ? (() => {
      const row = rows.find((item) => item.id === editingId);
      return row ? <form onSubmit={saveEdit} className="grid gap-3 rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] p-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={row.id} />
        <input name="query_text" defaultValue={row.queryText} required className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm sm:col-span-2" />
        <input name="frequency" type="number" min="0" defaultValue={row.frequency ?? ""} placeholder="Частотность" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <select name="source" defaultValue={row.source} className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm">{["manual", "wordstat", "search_console", "yandex_webmaster", "other"].map((value) => <option key={value} value={value}>{seoQueryLabel(SEO_QUERY_SOURCE_LABELS, value)}</option>)}</select>
        <select name="cluster_id" defaultValue={row.clusterId ?? ""} className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm"><option value="">Без кластера</option>{clusterOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input name="intent" defaultValue={row.intent ?? ""} placeholder="Намерение (код, например practice)" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <input name="recommended_format" defaultValue={row.recommendedFormat ?? ""} placeholder="Рекомендуемый формат" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <input name="audio_fit" defaultValue={row.audioFit ?? ""} placeholder="Аудио-потенциал (high, medium, low, none)" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <div className="flex gap-2"><button className="min-h-11 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white">Сохранить</button><button type="button" onClick={() => setEditingId("")} className="min-h-11 px-4 text-sm text-[#7042c5]">Отмена</button></div>
      </form> : null;
    })() : null}
    <div className="hidden overflow-x-auto rounded-[22px] border border-[#eadff8] bg-white md:block"><table className="min-w-full text-left text-sm"><thead className="bg-[#faf6ff] text-[#796ba0]"><tr>{["", "Запрос", "Нормализованный", "Частотность", "Источник", "Кластер", "Намерение", "Формат", "Аудио-потенциал", "Анализ", "Статус", "Автор / продукт", "Бронь", "Создан", ""].map((title, index) => <th key={`${title}-${index}`} className="px-3 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{filtered.map((row) => {
      const rowTone = row.needsReview
        ? "border-t border-[#f3edf9] bg-[#fff7e8]"
        : row.approvedUnreserved
          ? "border-t border-[#f3edf9] bg-[#fff4ec]"
          : "border-t border-[#f3edf9]";
      return <tr key={row.id} id={`seo-query-${row.id}`} className={rowTone}><td className="px-3 py-3">{row.analysisStatus === "not_analyzed" ? <input aria-label={`Анализировать ${row.queryText}`} type="checkbox" checked={selectedAnalysisIds.has(row.id)} onChange={() => toggleAnalysis(row.id)} /> : null}</td><td className="px-3 py-3 font-medium">{row.queryText}{row.needsReview ? <span className="ml-2 inline-flex rounded-full bg-[#f5c451] px-2 py-0.5 text-[11px] font-semibold text-[#7a5b12]">Нужно проверить</span> : null}{row.approvedUnreserved ? <span className="ml-2 inline-flex rounded-full bg-[#ffd0b0] px-2 py-0.5 text-[11px] font-semibold text-[#8a4b1a]">Одобрен – не закреплён</span> : null}{row.proposedByAuthor && row.proposalAuthorName ? <span className="mt-1 block text-xs font-normal text-[#796ba0]">Предложил: {row.proposalAuthorName}</span> : null}</td><td className="px-3 py-3 text-[#796ba0]">{row.normalizedQuery}</td><td className="px-3 py-3">{row.frequency ?? "–"}</td><td className="px-3 py-3">{seoQueryLabel(SEO_QUERY_SOURCE_LABELS, row.source)}</td><td className="px-3 py-3">{row.cluster ?? "–"}</td><td className="px-3 py-3">{seoQueryLabel(SEO_QUERY_INTENT_LABELS, row.intent)}</td><td className="px-3 py-3">{row.recommendedFormat ?? "–"}</td><td className="px-3 py-3">{seoQueryLabel(SEO_QUERY_AUDIO_FIT_LABELS, row.audioFit)}</td><td className="px-3 py-3">{row.analysisStatus === "analyzed" ? "Готов" : row.analysisStatus === "not_applicable" ? "Не подходит" : "Не анализировался"}</td><td className="px-3 py-3">{row.lifecycle}</td><td className="px-3 py-3">{row.author ?? row.proposalAuthorName ?? "–"}{row.product ? ` / ${row.product}` : ""}</td><td className="px-3 py-3">{date(row.reservedAt)} / {date(row.expiresAt)}</td><td className="px-3 py-3">{date(row.createdAt)}</td><td className="px-3 py-3 whitespace-nowrap"><button onClick={() => setEditingId(row.id)} className="mr-2 text-xs font-semibold text-[#7042c5]">Изменить</button>{row.analysisStatus === "not_analyzed" ? <button onClick={() => analyzeSelected([row.id])} className="mr-2 text-xs font-semibold text-[#7042c5]">Анализировать</button> : null}{row.approvedUnreserved ? <button type="button" disabled={analysisBusy} onClick={() => reconcileReservation(row)} className="mr-2 text-xs font-semibold text-[#c45c16] disabled:opacity-60">Закрепить автору</button> : null}{row.reservationId && row.lifecycle !== "Опубликован" ? <button onClick={() => release(row.reservationId!)} className="text-xs font-semibold text-[#7042c5]">Снять бронь</button> : null}</td></tr>;
    })}</tbody></table></div>
    <div className="space-y-3 md:hidden">{filtered.map((row) => {
      const cardTone = row.needsReview
        ? "rounded-[22px] border border-[#f0c35a] bg-[#fff7e8] p-4"
        : row.approvedUnreserved
          ? "rounded-[22px] border border-[#f0a66a] bg-[#fff4ec] p-4"
          : "rounded-[22px] border border-[#eadff8] bg-white p-4";
      return <article key={row.id} id={`seo-query-${row.id}`} className={cardTone}><h2 className="font-semibold text-[#25135c]">{row.queryText}</h2>{row.needsReview ? <p className="mt-1 text-xs font-semibold text-[#7a5b12]">Нужно проверить</p> : null}{row.approvedUnreserved ? <p className="mt-1 text-xs font-semibold text-[#8a4b1a]">Одобрен – не закреплён</p> : null}<p className="mt-1 text-xs text-[#796ba0]">{row.normalizedQuery}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#5f5484]"><span>{row.lifecycle}</span><span>{row.frequency ?? "–"} частотность</span><span>{row.cluster ?? "Без кластера"}</span><span>{row.author ?? row.proposalAuthorName ?? "Свободен"}</span></div>{row.approvedUnreserved ? <button type="button" disabled={analysisBusy} onClick={() => reconcileReservation(row)} className="mt-3 text-sm font-semibold text-[#c45c16] disabled:opacity-60">Закрепить автору</button> : null}</article>;
    })}</div>
  </div>;
}
