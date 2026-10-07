export type AdminOverviewSection<T> =
  | { status: "ready"; value: T }
  | { status: "failed" }
  | { status: "skipped" };

export type AdminOverviewSections<TStats, TAnalytics, TCommercial, TAuthors> = {
  stats: AdminOverviewSection<TStats>;
  analytics: AdminOverviewSection<TAnalytics>;
  commercial: AdminOverviewSection<TCommercial>;
  authors: AdminOverviewSection<TAuthors>;
};

export const ADMIN_OVERVIEW_SECTION_ERRORS = {
  stats: "Не удалось загрузить операционные показатели.",
  analytics: "Не удалось загрузить аналитику.",
  authors: "Не удалось загрузить заявки авторов.",
  commercial: "Не удалось загрузить коммерческие заявки.",
} as const;

type OverviewRetryParams = {
  period?: string;
  includeTest?: string;
  authorId?: string;
  practiceId?: string;
  utmSource?: string;
  deviceType?: string;
};

const RETRY_PARAM_KEYS = [
  "period",
  "includeTest",
  "authorId",
  "practiceId",
  "utmSource",
  "deviceType",
] as const;

export function adminOverviewRetryHref(params: OverviewRetryParams): string {
  const search = new URLSearchParams();

  for (const key of RETRY_PARAM_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/admin?${query}` : "/admin";
}

async function loadSection<T>(
  label: string,
  load: (() => Promise<T>) | null,
  rethrow: (error: unknown) => void,
): Promise<AdminOverviewSection<T>> {
  if (!load) {
    return { status: "skipped" };
  }

  try {
    return { status: "ready", value: await load() };
  } catch (error) {
    rethrow(error);
    console.error(
      label,
      error instanceof Error ? error.message : "admin_overview_section_failed",
    );
    return { status: "failed" };
  }
}

/**
 * Loads Обзор sections independently.
 * A rejected data dependency becomes `failed` and does not reject the others.
 * `rethrow` must rethrow framework control-flow (redirect, notFound, forbidden)
 * so those are never stored as a failed section.
 */
export async function loadAdminOverviewSections<
  TStats,
  TAnalytics,
  TCommercial,
  TAuthors,
>(input: {
  stats: () => Promise<TStats>;
  analytics: (() => Promise<TAnalytics>) | null;
  commercial: (() => Promise<TCommercial>) | null;
  authors: (() => Promise<TAuthors>) | null;
  rethrow: (error: unknown) => void;
}): Promise<AdminOverviewSections<TStats, TAnalytics, TCommercial, TAuthors>> {
  const [stats, analytics, commercial, authors] = await Promise.all([
    loadSection("admin_overview_stats_load_error", input.stats, input.rethrow),
    loadSection(
      "admin_overview_analytics_load_error",
      input.analytics,
      input.rethrow,
    ),
    loadSection(
      "admin_overview_commercial_attention_load_error",
      input.commercial,
      input.rethrow,
    ),
    loadSection(
      "admin_overview_author_attention_load_error",
      input.authors,
      input.rethrow,
    ),
  ]);

  return { stats, analytics, commercial, authors };
}
