import {
  ADMIN_SOURCE_LABELS,
  type AdminSourceGroup,
} from "@/lib/analytics/sources";
import {
  parseAdminAnalyticsPeriod,
  resolveAdminAnalyticsPeriodRange,
  formatAdminPercent,
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
};

export type AdminAnalyticsFunnelStep = {
  key: string;
  label: string;
  value: number;
};

export type AdminAnalyticsSourceRow = {
  source: AdminSourceGroup;
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

export type AdminAnalyticsDashboard = {
  period: AdminAnalyticsPeriod;
  periodLabel: string;
  generatedAt: string;
  includeTest: boolean;
  excludedTestVisitors: number;
  excludedTestSessions: number;
  metrics: AdminAnalyticsMetricCard[];
  funnel: AdminAnalyticsFunnelStep[];
  sources: AdminAnalyticsSourceRow[];
  popularPractices: AdminPopularPracticeRow[];
  recentActivity: AdminRecentActivityItem[];
};

type SnapshotSourceRow = {
  source?: string;
  visitors?: number;
  registrations?: number;
  playStarts?: number;
  completions?: number;
  applications?: number;
};

type SnapshotPracticeRow = {
  practiceId?: string;
  title?: string;
  authorName?: string;
  views?: number;
  playStarts?: number;
  uniqueListeners?: number;
  completions?: number;
};

type SnapshotActivityRow = {
  id?: string;
  occurredAt?: string;
  kind?: string;
  practiceTitle?: string | null;
};

type DashboardSnapshot = {
  visits?: number;
  visitors?: number;
  registrations?: number;
  excluded_test_sessions?: number;
  excluded_test_visitors?: number;
  practice_views?: number;
  play_starts?: number;
  listeners?: number;
  completions?: number;
  author_applications?: number;
  funnel_practice_view_sessions?: number;
  funnel_play_sessions?: number;
  funnel_completion_sessions?: number;
  sources?: SnapshotSourceRow[];
  popular_practices?: SnapshotPracticeRow[];
  recent_activity?: SnapshotActivityRow[];
};

function asNonNegativeInt(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function isAdminSourceGroup(value: string): value is AdminSourceGroup {
  return value in ADMIN_SOURCE_LABELS;
}

function buildMetrics(snapshot: DashboardSnapshot): AdminAnalyticsMetricCard[] {
  const visits = asNonNegativeInt(snapshot.visits);
  const visitors = asNonNegativeInt(snapshot.visitors);
  const registrations = asNonNegativeInt(snapshot.registrations);
  const practiceViews = asNonNegativeInt(snapshot.practice_views);
  const playStarts = asNonNegativeInt(snapshot.play_starts);
  const listeners = asNonNegativeInt(snapshot.listeners);
  const completions = asNonNegativeInt(snapshot.completions);
  const authorApplications = asNonNegativeInt(snapshot.author_applications);

  return [
    {
      key: "visits",
      label: "Внутренние сессии",
      hint:
        "Сессии, зафиксированные внутренней аналитикой АудиоЛада. " +
        "Методика отличается от визитов Яндекс.Метрики.",
      value: visits,
    },
    {
      key: "visitors",
      label: "Внутренние посетители",
      hint:
        "Единый visitor_key: user_id, либо anonymous_id с учётом identity link, " +
        "либо anonymous_id. Один человек на разных устройствах может учитываться " +
        "несколько раз, пока нет связи с аккаунтом.",
      value: visitors,
    },
    {
      key: "registrations",
      label: "Регистрации",
      hint: "Новые профили пользователей за период (profiles.created_at).",
      value: registrations,
    },
    {
      key: "registration_rate",
      label: "Конверсия посетитель → регистрация",
      hint:
        "Регистрации / внутренние посетители × 100% " +
        "(округление Math.round). Период и фильтр совпадают с карточками.",
      value: registrations,
      formatted: formatAdminPercent(registrations, visitors),
    },
    {
      key: "practice_views",
      label: "Просмотры практик",
      hint: "Открытия публичных страниц практик.",
      value: practiceViews,
    },
    {
      key: "play_starts",
      label: "Запуски аудио",
      hint: "Подтверждённые старты воспроизведения (событие playing).",
      value: playStarts,
    },
    {
      key: "listeners",
      label: "Слушатели",
      hint: "Уникальные посетители или пользователи с audio_play_started.",
      value: listeners,
    },
    {
      key: "completions",
      label: "Дослушивания",
      hint: "Подтверждённые завершения audio_completed.",
      value: completions,
    },
    {
      key: "completion_rate",
      label: "Конверсия запуск → дослушивание",
      hint:
        "Дослушивания / запуски аудио × 100% " +
        "(события к событиям, округление Math.round).",
      value: completions,
      formatted: formatAdminPercent(completions, playStarts),
    },
    {
      key: "author_applications",
      label: "Заявки авторов",
      hint: "Подтверждённые отправки author_application_submitted.",
      value: authorApplications,
    },
  ];
}

function buildFunnel(snapshot: DashboardSnapshot): AdminAnalyticsFunnelStep[] {
  return [
    {
      key: "visitors",
      label: "Внутренние посетители",
      value: asNonNegativeInt(snapshot.visitors),
    },
    {
      key: "practice_view",
      label: "Открыли практику",
      value: asNonNegativeInt(snapshot.funnel_practice_view_sessions),
    },
    {
      key: "play_started",
      label: "Запустили аудио",
      value: asNonNegativeInt(snapshot.funnel_play_sessions),
    },
    {
      key: "completed",
      label: "Дослушали",
      value: asNonNegativeInt(snapshot.funnel_completion_sessions),
    },
    {
      key: "registered",
      label: "Зарегистрировались",
      value: asNonNegativeInt(snapshot.registrations),
    },
  ];
}

function buildSources(snapshot: DashboardSnapshot): AdminAnalyticsSourceRow[] {
  const bySource = new Map<AdminSourceGroup, SnapshotSourceRow>();

  for (const row of snapshot.sources ?? []) {
    if (typeof row.source === "string" && isAdminSourceGroup(row.source)) {
      bySource.set(row.source, row);
    }
  }

  return (Object.keys(ADMIN_SOURCE_LABELS) as AdminSourceGroup[]).map((source) => {
    const row = bySource.get(source);
    const visitors = asNonNegativeInt(row?.visitors);
    const registrations = asNonNegativeInt(row?.registrations);
    const playStarts = asNonNegativeInt(row?.playStarts);
    const completions = asNonNegativeInt(row?.completions);
    const applications = asNonNegativeInt(row?.applications);

    return {
      source,
      label: ADMIN_SOURCE_LABELS[source],
      visitors,
      registrations,
      playStarts,
      completions,
      applications,
      registrationRate: formatAdminPercent(registrations, visitors),
      playRate: formatAdminPercent(playStarts, visitors),
      completionRate: formatAdminPercent(completions, playStarts),
    };
  });
}

function buildPopularPractices(
  snapshot: DashboardSnapshot,
): AdminPopularPracticeRow[] {
  return (snapshot.popular_practices ?? [])
    .map((row) => {
      const playStarts = asNonNegativeInt(row.playStarts);
      const completions = asNonNegativeInt(row.completions);

      return {
        practiceId: typeof row.practiceId === "string" ? row.practiceId : "",
        title: typeof row.title === "string" && row.title.trim() ? row.title : "Практика",
        authorName:
          typeof row.authorName === "string" && row.authorName.trim()
            ? row.authorName
            : "Автор",
        views: asNonNegativeInt(row.views),
        playStarts,
        uniqueListeners: asNonNegativeInt(row.uniqueListeners),
        completions,
        completionRate: formatAdminPercent(completions, playStarts),
      };
    })
    .filter((row) => row.practiceId);
}

function buildRecentActivity(
  snapshot: DashboardSnapshot,
): AdminRecentActivityItem[] {
  const allowedKinds = new Set([
    "registration",
    "author_application",
    "audio_play",
    "audio_completed",
  ]);

  return (snapshot.recent_activity ?? [])
    .map((row) => {
      const kind = typeof row.kind === "string" ? row.kind : "";
      if (!allowedKinds.has(kind)) {
        return null;
      }

      if (typeof row.id !== "string" || typeof row.occurredAt !== "string") {
        return null;
      }

      return {
        id: row.id,
        occurredAt: row.occurredAt,
        kind: kind as AdminRecentActivityItem["kind"],
        practiceTitle:
          typeof row.practiceTitle === "string" ? row.practiceTitle : null,
      };
    })
    .filter((row): row is AdminRecentActivityItem => row !== null);
}

export async function getAdminAnalyticsDashboard(input?: {
  period?: string | null;
  includeTest?: string | null;
}): Promise<AdminAnalyticsDashboard> {
  const period = parseAdminAnalyticsPeriod(input?.period);
  const includeTest = parseAdminIncludeTestParam(input?.includeTest);
  const range = resolveAdminAnalyticsPeriodRange(period);
  const generatedAt = new Date().toISOString();

  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("admin_analytics_dashboard_snapshot", {
    p_from: range.from,
    p_to: range.to,
    p_include_test: includeTest,
  });

  if (error) {
    console.error("admin_analytics_dashboard_snapshot_failed", error.message);
    throw new Error("admin_analytics_dashboard_failed");
  }

  const snapshot = (data ?? {}) as DashboardSnapshot;

  return {
    period,
    periodLabel: range.label,
    generatedAt,
    includeTest,
    excludedTestVisitors: asNonNegativeInt(snapshot.excluded_test_visitors),
    excludedTestSessions: asNonNegativeInt(snapshot.excluded_test_sessions),
    metrics: buildMetrics(snapshot),
    funnel: buildFunnel(snapshot),
    sources: buildSources(snapshot),
    popularPractices: buildPopularPractices(snapshot),
    recentActivity: buildRecentActivity(snapshot),
  };
}

export { parseAdminAnalyticsPeriod, parseAdminIncludeTestParam };
