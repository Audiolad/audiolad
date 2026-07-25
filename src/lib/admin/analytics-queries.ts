import {
  METRIKA_DIFF_TOOLTIP,
  metricKindLabel,
  type AdminMetricKind,
} from "@/lib/admin/analytics-metrics-dictionary";
import {
  formatAdminDelta,
  formatAdminPercent,
  parseAdminAnalyticsPeriod,
  resolveAdminAnalyticsPeriodRange,
  resolvePreviousAdminAnalyticsPeriodRange,
  type AdminAnalyticsDelta,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import { parseAdminIncludeTestParam } from "@/lib/admin/analytics-test-traffic";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminAnalyticsMetricCard = {
  key: string;
  label: string;
  hint: string;
  value: number;
  formatted?: string;
  kind?: AdminMetricKind;
  kindLabel?: string;
  delta?: AdminAnalyticsDelta | null;
};

/** @deprecated P1 UI remnant — kept for unused legacy components compile. */
export type AdminAnalyticsSourceRow = {
  source: string;
  label: string;
  visitors: number;
  registrations: number;
  playStarts: number;
  completions: number;
  applications: number;
  registrationRate: string;
  playRate: string;
  completionRate: string;
};

/** @deprecated P1 UI remnant */
export type AdminPopularPracticeRow = {
  practiceId: string;
  title: string;
  authorName: string;
  views: number;
  playStarts: number;
  uniqueListeners: number;
  completions: number;
  completionRate: string;
};

/** @deprecated P1 UI remnant */
export type AdminRecentActivityItem = {
  id: string;
  occurredAt: string;
  kind:
    | "registration"
    | "author_application"
    | "audio_play"
    | "audio_completed";
  practiceTitle: string | null;
};

export type AdminAnalyticsFunnelStep = {
  key: string;
  label: string;
  value: number;
  kind: AdminMetricKind;
  kindLabel: string;
  conversionFromPrevious?: string | null;
  conversionHint?: string | null;
};

export type AdminAnalyticsTimeseriesPoint = {
  bucket: string;
  visitors: number;
  registrations: number;
  practiceViews: number;
  playStarts: number;
  listeners: number;
  completions: number;
  saves: number;
};

export type AdminAnalyticsPracticeRow = {
  practiceId: string;
  title: string;
  authorId: string | null;
  authorName: string;
  authorSlug: string | null;
  practiceSlug: string | null;
  href: string | null;
  views: number;
  uniqueVisitors: number;
  playStarts: number;
  uniqueListeners: number;
  completions: number;
  uniqueCompleters: number;
  saves: number;
  uniqueSavers: number;
  viewToPlayRate: string;
  playToCompleteRate: string;
};

export type AdminAnalyticsAuthorRow = {
  authorId: string;
  name: string;
  slug: string | null;
  href: string | null;
  publishedPractices: number;
  views: number;
  playStarts: number;
  uniqueListeners: number;
  completions: number;
  saves: number;
};

export type AdminAnalyticsAcquisitionRow = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  label: string;
  sessions: number;
  visitors: number;
  registrations: number;
  playStarts: number;
  listeners: number;
  saves: number;
};

export type AdminAnalyticsFilterOption = {
  id: string;
  label: string;
};

export type AdminAnalyticsDashboard = {
  period: AdminAnalyticsPeriod;
  periodLabel: string;
  generatedAt: string;
  includeTest: boolean;
  filters: {
    authorId: string | null;
    practiceId: string | null;
    utmSource: string | null;
    deviceType: string | null;
  };
  filterNotes: string[];
  excludedTestVisitors: number;
  excludedTestSessions: number;
  audience: AdminAnalyticsMetricCard[];
  funnelEvents: AdminAnalyticsFunnelStep[];
  funnelPeople: AdminAnalyticsFunnelStep[];
  purchasesPlaceholder: string;
  timeseries: {
    granularity: "day" | "week";
    points: AdminAnalyticsTimeseriesPoint[];
    error: string | null;
  };
  practices: {
    total: number;
    rows: AdminAnalyticsPracticeRow[];
    sort: string;
    sortDir: "asc" | "desc";
    page: number;
    pageSize: number;
    error: string | null;
  };
  authors: {
    total: number;
    rows: AdminAnalyticsAuthorRow[];
    sort: string;
    sortDir: "asc" | "desc";
    page: number;
    pageSize: number;
    error: string | null;
  };
  acquisition: {
    attribution: "session_touch";
    total: number;
    rows: AdminAnalyticsAcquisitionRow[];
    page: number;
    pageSize: number;
    error: string | null;
  };
  filterOptions: {
    authors: AdminAnalyticsFilterOption[];
    practices: AdminAnalyticsFilterOption[];
  };
};

type SummarySnapshot = {
  audience?: {
    sessions?: number;
    visitors?: number;
    registrations?: number;
    excluded_service_sessions?: number;
    excluded_service_visitors?: number;
  };
  events?: {
    practice_views?: number;
    play_starts?: number;
    completions?: number;
    saves?: number;
  };
  people?: {
    practice_visitors?: number;
    listeners?: number;
    completers?: number;
    savers?: number;
  };
  purchases?: null;
  previous?: {
    sessions?: number;
    visitors?: number;
    registrations?: number;
    practice_views?: number;
    play_starts?: number;
    listeners?: number;
    completions?: number;
    saves?: number;
    savers?: number;
  } | null;
};

function asNonNegativeInt(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function asOptionalUuid(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return null;
  }
  return trimmed;
}

function asOptionalDevice(value: string | null | undefined): string | null {
  if (value === "mobile" || value === "tablet" || value === "desktop") {
    return value;
  }
  return null;
}

function asOptionalUtm(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) {
    return null;
  }
  return trimmed;
}

function parseSortDir(value: string | null | undefined): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parsePage(value: string | null | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.min(n, 500);
}

function clampPageSize(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 20;
  }
  return Math.min(Math.floor(value), 100);
}

function card(
  key: string,
  label: string,
  hint: string,
  value: number,
  kind: AdminMetricKind,
  previous?: number | null,
  formatted?: string,
): AdminAnalyticsMetricCard {
  return {
    key,
    label,
    hint,
    value,
    formatted,
    kind,
    kindLabel: metricKindLabel(kind),
    delta: formatAdminDelta(value, previous),
  };
}

function funnelStep(
  key: string,
  label: string,
  value: number,
  kind: AdminMetricKind,
  previousValue?: number | null,
): AdminAnalyticsFunnelStep {
  const conversionFromPrevious =
    previousValue === null || previousValue === undefined
      ? null
      : formatAdminPercent(value, previousValue);

  return {
    key,
    label,
    value,
    kind,
    kindLabel: metricKindLabel(kind),
    conversionFromPrevious,
    conversionHint:
      previousValue === null || previousValue === undefined
        ? null
        : `${label}: ${metricKindLabel(kind)}; конверсия от предыдущего этапа той же линии`,
  };
}

function buildAudience(summary: SummarySnapshot): AdminAnalyticsMetricCard[] {
  const a = summary.audience ?? {};
  const prev = summary.previous ?? null;
  const sessions = asNonNegativeInt(a.sessions);
  const visitors = asNonNegativeInt(a.visitors);
  const registrations = asNonNegativeInt(a.registrations);

  return [
    card(
      "sessions",
      "Внутренние сессии",
      `${METRIKA_DIFF_TOOLTIP} Считаются first-party сессии АудиоЛада.`,
      sessions,
      "session",
      prev?.sessions,
    ),
    card(
      "visitors",
      "Внутренние посетители",
      `${METRIKA_DIFF_TOOLTIP} Единый visitor_key (user_id / identity link / anonymous_id).`,
      visitors,
      "unique_person",
      prev?.visitors,
    ),
    card(
      "registrations",
      "Регистрации",
      "Новые профили по profiles.created_at (не клиентская цель Метрики).",
      registrations,
      "account",
      prev?.registrations,
    ),
    card(
      "registration_rate",
      "Конверсия посетитель → регистрация",
      "Регистрации (аккаунты) / внутренние посетители (люди).",
      registrations,
      "ratio",
      null,
      formatAdminPercent(registrations, visitors),
    ),
  ];
}

function buildFunnelLines(summary: SummarySnapshot): {
  events: AdminAnalyticsFunnelStep[];
  people: AdminAnalyticsFunnelStep[];
} {
  const e = summary.events ?? {};
  const p = summary.people ?? {};

  const practiceViews = asNonNegativeInt(e.practice_views);
  const playStarts = asNonNegativeInt(e.play_starts);
  const completions = asNonNegativeInt(e.completions);
  const saves = asNonNegativeInt(e.saves);

  const practiceVisitors = asNonNegativeInt(p.practice_visitors);
  const listeners = asNonNegativeInt(p.listeners);
  const completers = asNonNegativeInt(p.completers);
  const savers = asNonNegativeInt(p.savers);

  return {
    events: [
      funnelStep("practice_views", "Открыли практику", practiceViews, "event"),
      funnelStep("play_starts", "Запустили аудио", playStarts, "event", practiceViews),
      funnelStep("completions", "Дослушали", completions, "event", playStarts),
      funnelStep(
        "saves",
        "Сохранили практику в Аудиотеку",
        saves,
        "event",
        completions,
      ),
    ],
    people: [
      funnelStep(
        "practice_visitors",
        "Посетители практик",
        practiceVisitors,
        "unique_person",
      ),
      funnelStep("listeners", "Слушатели", listeners, "unique_person", practiceVisitors),
      funnelStep("completers", "Дослушавшие", completers, "unique_person", listeners),
      funnelStep(
        "savers",
        "Сохранившие",
        savers,
        "unique_person",
        listeners,
      ),
    ],
  };
}

function mapTimeseriesPoints(raw: unknown): AdminAnalyticsTimeseriesPoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((row) => {
    const record = (row ?? {}) as Record<string, unknown>;
    return {
      bucket: typeof record.bucket === "string" ? record.bucket : "",
      visitors: asNonNegativeInt(record.visitors),
      registrations: asNonNegativeInt(record.registrations),
      practiceViews: asNonNegativeInt(record.practice_views ?? record.practiceViews),
      playStarts: asNonNegativeInt(record.play_starts ?? record.playStarts),
      listeners: asNonNegativeInt(record.listeners),
      completions: asNonNegativeInt(record.completions),
      saves: asNonNegativeInt(record.saves),
    };
  }).filter((row) => row.bucket);
}

async function loadFilterOptions(): Promise<AdminAnalyticsDashboard["filterOptions"]> {
  const service = createServiceRoleClient();

  const [authorsRes, practicesRes] = await Promise.all([
    service
      .from("authors")
      .select("id, name, slug")
      .order("name", { ascending: true })
      .limit(200),
    service
      .from("practices")
      .select("id, title, author_id, status")
      .eq("status", "published")
      .order("title", { ascending: true })
      .limit(300),
  ]);

  const authors = (authorsRes.data ?? [])
    .map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!id || !name) {
        return null;
      }
      return { id, label: name };
    })
    .filter((row): row is AdminAnalyticsFilterOption => row !== null);

  const authorNameById = new Map(authors.map((author) => [author.id, author.label]));

  const practices = (practicesRes.data ?? [])
    .map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const authorId = typeof row.author_id === "string" ? row.author_id : "";
      const authorName = authorId ? authorNameById.get(authorId) : undefined;
      if (!id || !title) {
        return null;
      }
      return {
        id,
        label: authorName ? `${title} · ${authorName}` : title,
      };
    })
    .filter((row): row is AdminAnalyticsFilterOption => row !== null);

  return { authors, practices };
}

function buildFilterNotes(filters: AdminAnalyticsDashboard["filters"]): string[] {
  const notes: string[] = [];

  if (filters.authorId) {
    notes.push("Фильтр автора применяется к продуктовым событиям и связанной аудитории.");
  }
  if (filters.practiceId) {
    notes.push("Фильтр практики ограничивает события выбранной практикой.");
  }
  if (filters.utmSource) {
    notes.push(
      filters.utmSource === "__none__"
        ? "UTM source: только сессии без utm_source."
        : `UTM source: ${filters.utmSource} (session-touch).`,
    );
  }
  if (filters.deviceType) {
    notes.push(`Устройство: ${filters.deviceType}.`);
  }
  if (!filters.authorId && !filters.practiceId) {
    notes.push("Регистрации считаются по БД профилей; атрибуция автору не применяется.");
  }

  return notes;
}

export async function getAdminAnalyticsDashboard(input?: {
  period?: string | null;
  includeTest?: string | null;
  authorId?: string | null;
  practiceId?: string | null;
  utmSource?: string | null;
  deviceType?: string | null;
  practicesSort?: string | null;
  practicesSortDir?: string | null;
  practicesPage?: string | null;
  authorsSort?: string | null;
  authorsSortDir?: string | null;
  authorsPage?: string | null;
  acquisitionPage?: string | null;
}): Promise<AdminAnalyticsDashboard> {
  const period = parseAdminAnalyticsPeriod(input?.period);
  const includeTest = parseAdminIncludeTestParam(input?.includeTest);
  const range = resolveAdminAnalyticsPeriodRange(period);
  const previous = resolvePreviousAdminAnalyticsPeriodRange(period);
  const generatedAt = new Date().toISOString();

  const filters = {
    authorId: asOptionalUuid(input?.authorId),
    practiceId: asOptionalUuid(input?.practiceId),
    utmSource: asOptionalUtm(input?.utmSource),
    deviceType: asOptionalDevice(input?.deviceType),
  };

  const practicesSort = input?.practicesSort?.trim() || "play_starts";
  const practicesSortDir = parseSortDir(input?.practicesSortDir);
  const practicesPage = parsePage(input?.practicesPage);
  const authorsSort = input?.authorsSort?.trim() || "play_starts";
  const authorsSortDir = parseSortDir(input?.authorsSortDir);
  const authorsPage = parsePage(input?.authorsPage);
  const acquisitionPage = parsePage(input?.acquisitionPage);
  const pageSize = clampPageSize(20);

  const service = createServiceRoleClient();
  const sharedFilters = {
    p_from: range.from,
    p_to: range.to,
    p_include_test: includeTest,
    p_author_id: filters.authorId,
    p_practice_id: filters.practiceId,
    p_utm_source: filters.utmSource,
    p_device_type: filters.deviceType,
  };

  const [
    summaryRes,
    timeseriesRes,
    practicesRes,
    authorsRes,
    acquisitionRes,
    filterOptions,
  ] = await Promise.all([
    service.rpc("admin_analytics_p2_summary", {
      ...sharedFilters,
      p_prev_from: previous?.from ?? null,
      p_prev_to: previous?.to ?? null,
    }),
    service.rpc("admin_analytics_p2_timeseries", sharedFilters),
    service.rpc("admin_analytics_p2_practices", {
      ...sharedFilters,
      p_sort: practicesSort,
      p_sort_dir: practicesSortDir,
      p_limit: pageSize,
      p_offset: (practicesPage - 1) * pageSize,
    }),
    service.rpc("admin_analytics_p2_authors", {
      ...sharedFilters,
      p_sort: authorsSort,
      p_sort_dir: authorsSortDir,
      p_limit: pageSize,
      p_offset: (authorsPage - 1) * pageSize,
    }),
    service.rpc("admin_analytics_p2_acquisition", {
      ...sharedFilters,
      p_limit: pageSize,
      p_offset: (acquisitionPage - 1) * pageSize,
    }),
    loadFilterOptions().catch(() => ({ authors: [], practices: [] })),
  ]);

  if (summaryRes.error) {
    console.error("admin_analytics_p2_summary_failed", summaryRes.error.message);
    throw new Error("admin_analytics_dashboard_failed");
  }

  const summary = (summaryRes.data ?? {}) as SummarySnapshot;
  const funnel = buildFunnelLines(summary);

  const timeseriesData = (timeseriesRes.data ?? {}) as {
    granularity?: string;
    points?: unknown;
  };
  const practicesData = (practicesRes.data ?? {}) as {
    total?: number;
    rows?: Array<Record<string, unknown>>;
  };
  const authorsData = (authorsRes.data ?? {}) as {
    total?: number;
    rows?: Array<Record<string, unknown>>;
  };
  const acquisitionData = (acquisitionRes.data ?? {}) as {
    attribution?: string;
    total?: number;
    rows?: Array<Record<string, unknown>>;
  };

  return {
    period,
    periodLabel: range.label,
    generatedAt,
    includeTest,
    filters,
    filterNotes: buildFilterNotes(filters),
    excludedTestVisitors: asNonNegativeInt(
      summary.audience?.excluded_service_visitors,
    ),
    excludedTestSessions: asNonNegativeInt(
      summary.audience?.excluded_service_sessions,
    ),
    audience: buildAudience(summary),
    funnelEvents: funnel.events,
    funnelPeople: funnel.people,
    purchasesPlaceholder:
      "Покупки появятся здесь после запуска продаж. Сейчас показатель скрыт, чтобы не показывать фиктивные нули.",
    timeseries: {
      granularity: timeseriesData.granularity === "week" ? "week" : "day",
      points: timeseriesRes.error ? [] : mapTimeseriesPoints(timeseriesData.points),
      error: timeseriesRes.error?.message ?? null,
    },
    practices: {
      total: asNonNegativeInt(practicesData.total),
      rows: practicesRes.error
        ? []
        : (practicesData.rows ?? []).map((row) => {
            const views = asNonNegativeInt(row.views);
            const playStarts = asNonNegativeInt(row.playStarts ?? row.play_starts);
            const completions = asNonNegativeInt(row.completions);
            return {
              practiceId: typeof row.practiceId === "string" ? row.practiceId : String(row.practice_id ?? ""),
              title: typeof row.title === "string" ? row.title : "Практика",
              authorId:
                typeof row.authorId === "string"
                  ? row.authorId
                  : typeof row.author_id === "string"
                    ? row.author_id
                    : null,
              authorName:
                typeof row.authorName === "string"
                  ? row.authorName
                  : typeof row.author_name === "string"
                    ? row.author_name
                    : "Автор",
              authorSlug:
                typeof row.authorSlug === "string"
                  ? row.authorSlug
                  : typeof row.author_slug === "string"
                    ? row.author_slug
                    : null,
              practiceSlug:
                typeof row.practiceSlug === "string"
                  ? row.practiceSlug
                  : typeof row.practice_slug === "string"
                    ? row.practice_slug
                    : null,
              href: typeof row.href === "string" ? row.href : null,
              views,
              uniqueVisitors: asNonNegativeInt(
                row.uniqueVisitors ?? row.unique_visitors,
              ),
              playStarts,
              uniqueListeners: asNonNegativeInt(
                row.uniqueListeners ?? row.unique_listeners,
              ),
              completions,
              uniqueCompleters: asNonNegativeInt(
                row.uniqueCompleters ?? row.unique_completers,
              ),
              saves: asNonNegativeInt(row.saves),
              uniqueSavers: asNonNegativeInt(row.uniqueSavers ?? row.unique_savers),
              viewToPlayRate: formatAdminPercent(playStarts, views),
              playToCompleteRate: formatAdminPercent(completions, playStarts),
            };
          }).filter((row) => row.practiceId),
      sort: practicesSort,
      sortDir: practicesSortDir,
      page: practicesPage,
      pageSize,
      error: practicesRes.error?.message ?? null,
    },
    authors: {
      total: asNonNegativeInt(authorsData.total),
      rows: authorsRes.error
        ? []
        : (authorsData.rows ?? []).map((row) => ({
            authorId:
              typeof row.authorId === "string"
                ? row.authorId
                : String(row.author_id ?? ""),
            name: typeof row.name === "string" ? row.name : "Автор",
            slug: typeof row.slug === "string" ? row.slug : null,
            href: typeof row.href === "string" ? row.href : null,
            publishedPractices: asNonNegativeInt(
              row.publishedPractices ?? row.published_practices,
            ),
            views: asNonNegativeInt(row.views),
            playStarts: asNonNegativeInt(row.playStarts ?? row.play_starts),
            uniqueListeners: asNonNegativeInt(
              row.uniqueListeners ?? row.unique_listeners,
            ),
            completions: asNonNegativeInt(row.completions),
            saves: asNonNegativeInt(row.saves),
          })).filter((row) => row.authorId),
      sort: authorsSort,
      sortDir: authorsSortDir,
      page: authorsPage,
      pageSize,
      error: authorsRes.error?.message ?? null,
    },
    acquisition: {
      attribution: "session_touch",
      total: asNonNegativeInt(acquisitionData.total),
      rows: acquisitionRes.error
        ? []
        : (acquisitionData.rows ?? []).map((row) => ({
            utmSource:
              typeof row.utmSource === "string"
                ? row.utmSource
                : typeof row.utm_source === "string"
                  ? row.utm_source
                  : "",
            utmMedium:
              typeof row.utmMedium === "string"
                ? row.utmMedium
                : typeof row.utm_medium === "string"
                  ? row.utm_medium
                  : "",
            utmCampaign:
              typeof row.utmCampaign === "string"
                ? row.utmCampaign
                : typeof row.utm_campaign === "string"
                  ? row.utm_campaign
                  : "",
            utmContent:
              typeof row.utmContent === "string"
                ? row.utmContent
                : typeof row.utm_content === "string"
                  ? row.utm_content
                  : "",
            label:
              typeof row.label === "string"
                ? row.label
                : "Без UTM / прямые и неопределённые переходы",
            sessions: asNonNegativeInt(row.sessions),
            visitors: asNonNegativeInt(row.visitors),
            registrations: asNonNegativeInt(row.registrations),
            playStarts: asNonNegativeInt(row.playStarts ?? row.play_starts),
            listeners: asNonNegativeInt(row.listeners),
            saves: asNonNegativeInt(row.saves),
          })),
      page: acquisitionPage,
      pageSize,
      error: acquisitionRes.error?.message ?? null,
    },
    filterOptions,
  };
}

export { parseAdminAnalyticsPeriod, parseAdminIncludeTestParam };
