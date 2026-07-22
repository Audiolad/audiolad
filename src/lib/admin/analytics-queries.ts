import {
  ADMIN_SOURCE_LABELS,
  groupAdminSource,
  resolveTrafficSource,
  type AdminSourceGroup,
} from "@/lib/analytics/sources";
import {
  parseAdminAnalyticsPeriod,
  resolveAdminAnalyticsPeriodRange,
  formatAdminPercent,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import {
  isTestAnalyticsSession,
  isTestAnonymousId,
  parseAdminIncludeTestParam,
} from "@/lib/admin/analytics-test-traffic";
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

type SessionRow = {
  id: string;
  anonymous_id: string;
  user_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  referrer_domain: string | null;
  started_at?: string;
};

type RegisteredProfileRow = {
  id: string;
  created_at: string;
};

function filterIncludedEvents(
  events: EventRow[],
  includedSessionIds: Set<string>,
  includeTest: boolean,
): EventRow[] {
  if (includeTest) {
    return events;
  }

  return events.filter((event) => {
    if (event.session_id) {
      return includedSessionIds.has(event.session_id);
    }

    return !isTestAnonymousId(event.anonymous_session_id);
  });
}

type EventRow = {
  id: string;
  session_id: string | null;
  user_id: string | null;
  anonymous_session_id: string | null;
  event_name: string;
  practice_id: string | null;
  occurred_at: string;
};

function visitorKey(session: SessionRow): string {
  return session.user_id ?? session.anonymous_id;
}

function eventVisitorKey(event: EventRow, sessionMap: Map<string, SessionRow>): string {
  if (event.user_id) {
    return event.user_id;
  }

  if (event.session_id) {
    const session = sessionMap.get(event.session_id);

    if (session?.user_id) {
      return session.user_id;
    }

    if (session?.anonymous_id) {
      return session.anonymous_id;
    }
  }

  return event.anonymous_session_id ?? event.id;
}

async function fetchSessions(range: { from: string | null; to: string | null }) {
  const service = createServiceRoleClient();

  let query = service
    .from("analytics_sessions")
    .select(
      "id, anonymous_id, user_id, utm_source, utm_campaign, referrer_domain, started_at",
    );

  if (range.from) {
    query = query.gte("started_at", range.from);
  }

  if (range.to) {
    query = query.lt("started_at", range.to);
  }

  const { data, error } = await query.limit(50_000);

  if (error) {
    throw new Error("admin_analytics_sessions_failed");
  }

  return (data ?? []) as (SessionRow & { started_at: string })[];
}

async function fetchEvents(range: { from: string | null; to: string | null }) {
  const service = createServiceRoleClient();

  let query = service
    .from("analytics_events")
    .select(
      "id, session_id, user_id, anonymous_session_id, event_name, practice_id, occurred_at",
    )
    .in("event_name", [
      "page_view",
      "practice_view",
      "listen_page_view",
      "audio_play_started",
      "audio_progress_25",
      "audio_progress_50",
      "audio_progress_75",
      "audio_progress_90",
      "audio_completed",
      "signup_started",
      "signup_completed",
      "author_application_started",
      "author_application_submitted",
    ]);

  if (range.from) {
    query = query.gte("occurred_at", range.from);
  }

  if (range.to) {
    query = query.lt("occurred_at", range.to);
  }

  const { data, error } = await query.limit(100_000);

  if (error) {
    throw new Error("admin_analytics_events_failed");
  }

  return (data ?? []) as EventRow[];
}

async function fetchRegisteredProfiles(range: {
  from: string | null;
  to: string | null;
}): Promise<RegisteredProfileRow[]> {
  const service = createServiceRoleClient();

  let query = service.from("profiles").select("id, created_at");

  if (range.from) {
    query = query.gte("created_at", range.from);
  }

  if (range.to) {
    query = query.lt("created_at", range.to);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(50_000);

  if (error) {
    throw new Error("admin_analytics_registrations_failed");
  }

  return (data ?? []) as RegisteredProfileRow[];
}

async function fetchRegistrationSessions(
  userIds: string[],
): Promise<(SessionRow & { started_at: string })[]> {
  if (userIds.length === 0) {
    return [];
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("analytics_sessions")
    .select(
      "id, anonymous_id, user_id, utm_source, utm_campaign, referrer_domain, started_at",
    )
    .in("user_id", userIds)
    .order("started_at", { ascending: true })
    .limit(50_000);

  if (error) {
    throw new Error("admin_analytics_registration_sessions_failed");
  }

  return (data ?? []) as (SessionRow & { started_at: string })[];
}

function groupSessionsByUserId(
  sessions: (SessionRow & { started_at: string })[],
): Map<string, (SessionRow & { started_at: string })[]> {
  const grouped = new Map<string, (SessionRow & { started_at: string })[]>();

  for (const session of sessions) {
    if (!session.user_id) {
      continue;
    }

    const bucket = grouped.get(session.user_id) ?? [];
    bucket.push(session);
    grouped.set(session.user_id, bucket);
  }

  return grouped;
}

function resolveRegistrationSession(
  sessions: (SessionRow & { started_at: string })[],
  includeTest: boolean,
): (SessionRow & { started_at: string }) | null {
  if (sessions.length === 0) {
    return null;
  }

  if (includeTest) {
    return sessions[0] ?? null;
  }

  return sessions.find((session) => !isTestAnalyticsSession(session)) ?? null;
}

function shouldIncludeRegisteredProfile(
  sessions: (SessionRow & { started_at: string })[],
  includeTest: boolean,
): boolean {
  if (includeTest || sessions.length === 0) {
    return true;
  }

  return sessions.some((session) => !isTestAnalyticsSession(session));
}

function resolveRegistrationSource(
  session: (SessionRow & { started_at: string }) | null,
): AdminSourceGroup {
  return groupAdminSource(
    resolveTrafficSource({
      utmSource: session?.utm_source ?? null,
      referrerDomain: session?.referrer_domain ?? null,
    }),
  );
}

function filterRegisteredProfiles(
  profiles: RegisteredProfileRow[],
  sessionsByUserId: Map<string, (SessionRow & { started_at: string })[]>,
  includeTest: boolean,
): RegisteredProfileRow[] {
  return profiles.filter((profile) =>
    shouldIncludeRegisteredProfile(
      sessionsByUserId.get(profile.id) ?? [],
      includeTest,
    ),
  );
}

function buildSourceRows(
  sessions: SessionRow[],
  events: EventRow[],
  registeredProfiles: RegisteredProfileRow[],
  registrationSessionsByUserId: Map<string, (SessionRow & { started_at: string })[]>,
  includeTest: boolean,
): AdminAnalyticsSourceRow[] {
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  const grouped = new Map<
    AdminSourceGroup,
    {
      visitors: Set<string>;
      registrations: Set<string>;
      playStarts: Set<string>;
      completions: Set<string>;
      applications: Set<string>;
    }
  >();

  for (const group of Object.keys(ADMIN_SOURCE_LABELS) as AdminSourceGroup[]) {
    grouped.set(group, {
      visitors: new Set(),
      registrations: new Set(),
      playStarts: new Set(),
      completions: new Set(),
      applications: new Set(),
    });
  }

  for (const session of sessions) {
    const source = groupAdminSource(
      resolveTrafficSource({
        utmSource: session.utm_source,
        referrerDomain: session.referrer_domain,
      }),
    );
    grouped.get(source)?.visitors.add(visitorKey(session));
  }

  for (const event of events) {
    const session = event.session_id ? sessionMap.get(event.session_id) : null;
    const source = groupAdminSource(
      resolveTrafficSource({
        utmSource: session?.utm_source ?? null,
        referrerDomain: session?.referrer_domain ?? null,
      }),
    );
    const bucket = grouped.get(source);

    if (!bucket) {
      continue;
    }

    const key = eventVisitorKey(event, sessionMap);

    if (event.event_name === "audio_play_started") {
      bucket.playStarts.add(key);
    }

    if (event.event_name === "audio_completed") {
      bucket.completions.add(key);
    }

    if (event.event_name === "author_application_submitted") {
      bucket.applications.add(key);
    }
  }

  for (const profile of registeredProfiles) {
    const registrationSession = resolveRegistrationSession(
      registrationSessionsByUserId.get(profile.id) ?? [],
      includeTest,
    );
    const source = resolveRegistrationSource(registrationSession);
    grouped.get(source)?.registrations.add(profile.id);
  }

  return (Object.keys(ADMIN_SOURCE_LABELS) as AdminSourceGroup[]).map((source) => {
    const bucket = grouped.get(source)!;

    return {
      source,
      label: ADMIN_SOURCE_LABELS[source],
      visitors: bucket.visitors.size,
      registrations: bucket.registrations.size,
      playStarts: bucket.playStarts.size,
      completions: bucket.completions.size,
      applications: bucket.applications.size,
      registrationRate: formatAdminPercent(
        bucket.registrations.size,
        bucket.visitors.size,
      ),
      playRate: formatAdminPercent(bucket.playStarts.size, bucket.visitors.size),
      completionRate: formatAdminPercent(
        bucket.completions.size,
        bucket.playStarts.size,
      ),
    };
  });
}

async function fetchPracticeMeta(practiceIds: string[]) {
  if (practiceIds.length === 0) {
    return new Map<string, { title: string; authorName: string }>();
  }

  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("practices")
    .select("id, title, authors(name)")
    .in("id", practiceIds);

  if (error) {
    return new Map();
  }

  const map = new Map<string, { title: string; authorName: string }>();

  for (const row of data ?? []) {
    const authors = row.authors as
      | { name: string | null }
      | { name: string | null }[]
      | null;
    const authorName = Array.isArray(authors)
      ? authors[0]?.name
      : authors?.name;

    map.set(row.id, {
      title: row.title ?? "Практика",
      authorName: authorName?.trim() || "Автор",
    });
  }

  return map;
}

export async function getAdminAnalyticsDashboard(input?: {
  period?: string | null;
  includeTest?: string | null;
}): Promise<AdminAnalyticsDashboard> {
  const period = parseAdminAnalyticsPeriod(input?.period);
  const includeTest = parseAdminIncludeTestParam(input?.includeTest);
  const range = resolveAdminAnalyticsPeriodRange(period);
  const generatedAt = new Date().toISOString();

  const [allSessions, allEvents, registeredProfiles] = await Promise.all([
    fetchSessions(range),
    fetchEvents(range),
    fetchRegisteredProfiles(range),
  ]);

  const registrationSessionsByUserId = groupSessionsByUserId(
    await fetchRegistrationSessions(registeredProfiles.map((profile) => profile.id)),
  );
  const includedRegisteredProfiles = filterRegisteredProfiles(
    registeredProfiles,
    registrationSessionsByUserId,
    includeTest,
  );

  const testSessions = allSessions.filter((session) => isTestAnalyticsSession(session));
  const excludedTestSessions = testSessions.length;
  const excludedTestVisitors = new Set(testSessions.map(visitorKey)).size;

  const sessions = includeTest
    ? allSessions
    : allSessions.filter((session) => !isTestAnalyticsSession(session));
  const includedSessionIds = new Set(sessions.map((session) => session.id));
  const events = filterIncludedEvents(allEvents, includedSessionIds, includeTest);

  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  const visitorSet = new Set(sessions.map(visitorKey));

  const practiceViewSessions = new Set<string>();
  const playSessions = new Set<string>();
  const completionSessions = new Set<string>();

  let practiceViews = 0;
  let playStarts = 0;
  let completions = 0;
  let authorApplications = 0;

  const registrations = includedRegisteredProfiles.length;

  const listenerSet = new Set<string>();
  const practiceStats = new Map<
    string,
    {
      views: number;
      playStarts: number;
      listeners: Set<string>;
      completions: number;
    }
  >();

  for (const event of events) {
    const visitor = eventVisitorKey(event, sessionMap);
    const sessionId = event.session_id ?? event.id;

    if (event.event_name === "practice_view") {
      practiceViews += 1;
      practiceViewSessions.add(sessionId);
    }

    if (event.event_name === "audio_play_started") {
      playStarts += 1;
      playSessions.add(sessionId);
      listenerSet.add(visitor);
    }

    if (event.event_name === "audio_completed") {
      completions += 1;
      completionSessions.add(sessionId);
    }

    if (event.event_name === "author_application_submitted") {
      authorApplications += 1;
    }

    if (event.practice_id) {
      const stats = practiceStats.get(event.practice_id) ?? {
        views: 0,
        playStarts: 0,
        listeners: new Set<string>(),
        completions: 0,
      };

      if (event.event_name === "practice_view") {
        stats.views += 1;
      }

      if (event.event_name === "audio_play_started") {
        stats.playStarts += 1;
        stats.listeners.add(visitor);
      }

      if (event.event_name === "audio_completed") {
        stats.completions += 1;
      }

      practiceStats.set(event.practice_id, stats);
    }
  }

  const metrics: AdminAnalyticsMetricCard[] = [
    {
      key: "visits",
      label: "Посещения",
      hint: "Количество сессий за период (30 мин без активности = новая сессия).",
      value: sessions.length,
    },
    {
      key: "visitors",
      label: "Уникальные посетители",
      hint:
        "Считаются по аккаунту или анонимному идентификатору браузера. " +
        "Один человек на разных устройствах, в разных браузерах или после очистки данных " +
        "может учитываться несколько раз.",
      value: visitorSet.size,
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
      hint: "Новые регистрации / уникальные посетители.",
      value: registrations,
      formatted: formatAdminPercent(registrations, visitorSet.size),
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
      value: listenerSet.size,
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
      hint: "Дослушивания / запуски аудио.",
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

  const funnel: AdminAnalyticsFunnelStep[] = [
    {
      key: "visitors",
      label: "Уникальные посетители",
      value: visitorSet.size,
    },
    {
      key: "practice_view",
      label: "Открыли практику",
      value: practiceViewSessions.size,
    },
    {
      key: "play_started",
      label: "Запустили аудио",
      value: playSessions.size,
    },
    {
      key: "completed",
      label: "Дослушали",
      value: completionSessions.size,
    },
    {
      key: "registered",
      label: "Зарегистрировались",
      value: registrations,
    },
  ];

  const practiceMeta = await fetchPracticeMeta([...practiceStats.keys()]);

  const popularPractices: AdminPopularPracticeRow[] = [...practiceStats.entries()]
    .map(([practiceId, stats]) => {
      const meta = practiceMeta.get(practiceId);

      return {
        practiceId,
        title: meta?.title ?? "Практика",
        authorName: meta?.authorName ?? "Автор",
        views: stats.views,
        playStarts: stats.playStarts,
        uniqueListeners: stats.listeners.size,
        completions: stats.completions,
        completionRate: formatAdminPercent(stats.completions, stats.playStarts),
      };
    })
    .sort((left, right) => right.playStarts - left.playStarts)
    .slice(0, 10);

  const recentRegistrationItems: AdminRecentActivityItem[] = includedRegisteredProfiles
    .slice()
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 6)
    .map((profile) => ({
      id: `registration:${profile.id}`,
      occurredAt: profile.created_at,
      kind: "registration" as const,
      practiceTitle: null,
    }));

  const recentBehaviorEvents = events
    .filter((event) =>
      [
        "author_application_submitted",
        "audio_play_started",
        "audio_completed",
      ].includes(event.event_name),
    )
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
    .slice(0, 12);

  const recentPracticeMeta = await fetchPracticeMeta(
    recentBehaviorEvents
      .map((event) => event.practice_id)
      .filter((value): value is string => Boolean(value)),
  );

  const recentBehaviorItems: AdminRecentActivityItem[] = recentBehaviorEvents.map(
    (event) => {
      let kind: AdminRecentActivityItem["kind"] = "audio_play";

      if (event.event_name === "author_application_submitted") {
        kind = "author_application";
      } else if (event.event_name === "audio_completed") {
        kind = "audio_completed";
      }

      return {
        id: event.id,
        occurredAt: event.occurred_at,
        kind,
        practiceTitle: event.practice_id
          ? recentPracticeMeta.get(event.practice_id)?.title ?? null
          : null,
      };
    },
  );

  const recentActivity = [...recentRegistrationItems, ...recentBehaviorItems]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 12);

  return {
    period,
    periodLabel: range.label,
    generatedAt,
    includeTest,
    excludedTestVisitors,
    excludedTestSessions,
    metrics,
    funnel,
    sources: buildSourceRows(
      sessions,
      events,
      includedRegisteredProfiles,
      registrationSessionsByUserId,
      includeTest,
    ),
    popularPractices,
    recentActivity,
  };
}

export { parseAdminAnalyticsPeriod, parseAdminIncludeTestParam };
