"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import AdminAnalyticsBreakdownPanel from "@/components/admin/AdminAnalyticsBreakdownPanel";
import AdminAnalyticsDefinitions from "@/components/admin/AdminAnalyticsDefinitions";
import AdminAnalyticsDrilldownDrawer from "@/components/admin/AdminAnalyticsDrilldownDrawer";
import AdminAnalyticsFilters from "@/components/admin/AdminAnalyticsFilters";
import AdminAnalyticsFunnelPanel from "@/components/admin/AdminAnalyticsFunnelPanel";
import AdminAnalyticsKpiStrip from "@/components/admin/AdminAnalyticsKpiStrip";
import AdminAnalyticsMetricCards from "@/components/admin/AdminAnalyticsMetricCards";
import AdminAnalyticsTestTrafficControls from "@/components/admin/AdminAnalyticsTestTrafficControls";
import AdminAnalyticsTimeseriesChart from "@/components/admin/AdminAnalyticsTimeseriesChart";
import { ADMIN_ANALYTICS_PERIOD_OPTIONS } from "@/lib/admin/analytics-period";
import type {
  AdminAnalyticsBreakdownBundle,
  AdminAnalyticsKpiCard,
  AdminAnalyticsSummaryBundle,
} from "@/lib/admin/analytics-queries";
import {
  buildAdminAnalyticsSearchParams,
  parseAdminAnalyticsUrlState,
  type AdminAnalyticsDrillMetric,
  type AdminAnalyticsTab,
  type AdminAnalyticsTopN,
  type AdminAnalyticsUtmGroup,
} from "@/lib/admin/analytics-url-state";

const emptyBreakdown: AdminAnalyticsBreakdownBundle = {
  practices: {
    total: 0,
    rows: [],
    sort: "play_starts",
    sortDir: "desc",
    page: 1,
    pageSize: 25,
    error: null,
  },
  authors: {
    total: 0,
    rows: [],
    sort: "play_starts",
    sortDir: "desc",
    page: 1,
    pageSize: 25,
    error: null,
  },
  acquisition: {
    attribution: "session_touch",
    total: 0,
    rows: [],
    page: 1,
    pageSize: 100,
    error: null,
  },
};

export default function AdminAnalyticsWorkbench({
  summary,
}: {
  summary: AdminAnalyticsSummaryBundle;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const urlState = useMemo(
    () => parseAdminAnalyticsUrlState(searchParams),
    [searchParams],
  );

  const [breakdown, setBreakdown] =
    useState<AdminAnalyticsBreakdownBundle>(emptyBreakdown);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const replaceState = useCallback(
    (patch: Partial<typeof urlState>) => {
      const next = { ...urlState, ...patch };
      const params = buildAdminAnalyticsSearchParams(next);
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, urlState],
  );

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingBreakdown(true);
    setBreakdownError(null);

    const params = buildAdminAnalyticsSearchParams(urlState);
    params.set("top", urlState.top);

    void fetch(`/api/admin/analytics/breakdown?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`breakdown_${response.status}`);
        }
        return (await response.json()) as AdminAnalyticsBreakdownBundle;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setBreakdown(data);
          setLoadingBreakdown(false);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setBreakdownError(error instanceof Error ? error.message : "error");
        setLoadingBreakdown(false);
      });

    return () => controller.abort();
  }, [
    urlState.period,
    urlState.includeTest,
    urlState.authorId,
    urlState.practiceId,
    urlState.utmSource,
    urlState.deviceType,
    urlState.top,
    urlState.practicesSort,
    urlState.practicesSortDir,
    urlState.authorsSort,
    urlState.authorsSortDir,
  ]);

  const activeKpi: AdminAnalyticsKpiCard | null = useMemo(() => {
    if (!urlState.drill) {
      return null;
    }
    return summary.kpi.find((item) => item.key === urlState.drill) ?? null;
  }, [summary.kpi, urlState.drill]);

  function openDrill(key: AdminAnalyticsKpiCard["key"]) {
    replaceState({ drill: key as AdminAnalyticsDrillMetric });
  }

  function togglePracticesSort(sort: string) {
    if (urlState.practicesSort === sort) {
      replaceState({
        practicesSortDir: urlState.practicesSortDir === "desc" ? "asc" : "desc",
      });
      return;
    }
    replaceState({ practicesSort: sort, practicesSortDir: "desc" });
  }

  function toggleAuthorsSort(sort: string) {
    if (urlState.authorsSort === sort) {
      replaceState({
        authorsSortDir: urlState.authorsSortDir === "desc" ? "asc" : "desc",
      });
      return;
    }
    replaceState({ authorsSort: sort, authorsSortDir: "desc" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-analytics-heading" className="text-[21px] font-semibold">
            Аналитика платформы
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Период: {summary.periodLabel}. Обновлено{" "}
            {new Intl.DateTimeFormat("ru-RU", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Moscow",
            }).format(new Date(summary.generatedAt))}
          </p>
        </div>

        <AdminAnalyticsTestTrafficControls
          currentPeriod={summary.period}
          includeTest={summary.includeTest}
          excludedTestVisitors={summary.excludedTestVisitors}
          excludedTestSessions={summary.excludedTestSessions}
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Быстрый период">
        {ADMIN_ANALYTICS_PERIOD_OPTIONS.map((option) => {
          const active = option.id === urlState.period;
          const params = buildAdminAnalyticsSearchParams({
            ...urlState,
            period: option.id,
            drill: null,
          });
          return (
            <button
              key={option.id}
              type="button"
              onClick={() =>
                startTransition(() => {
                  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
                })
              }
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

      <AdminAnalyticsFilters
        currentPeriod={summary.period}
        includeTest={summary.includeTest}
        authorId={summary.filters.authorId}
        practiceId={summary.filters.practiceId}
        utmSource={summary.filters.utmSource}
        deviceType={summary.filters.deviceType}
        authors={summary.filterOptions.authors}
        practices={summary.filterOptions.practices}
        filterNotes={summary.filterNotes}
      />

      <AdminAnalyticsKpiStrip items={summary.kpi} onOpen={openDrill} />

      <AdminAnalyticsDefinitions />

      <section aria-labelledby="admin-audience-heading" className="space-y-3">
        <h3 id="admin-audience-heading" className="text-[19px] font-semibold">
          Аудитория
        </h3>
        <AdminAnalyticsMetricCards metrics={summary.audience} />
      </section>

      <AdminAnalyticsFunnelPanel
        events={summary.funnelEvents}
        people={summary.funnelPeople}
        purchasesPlaceholder={summary.purchasesPlaceholder}
      />

      <AdminAnalyticsTimeseriesChart
        points={summary.timeseries.points}
        granularity={summary.timeseries.granularity}
        error={summary.timeseries.error}
      />

      <AdminAnalyticsBreakdownPanel
        tab={urlState.tab}
        top={urlState.top}
        query={urlState.q}
        utmGroup={urlState.utmGroup}
        practices={breakdown.practices}
        authors={breakdown.authors}
        acquisition={breakdown.acquisition}
        loading={loadingBreakdown}
        error={breakdownError}
        onTabChange={(tab: AdminAnalyticsTab) => replaceState({ tab })}
        onTopChange={(top: AdminAnalyticsTopN) => replaceState({ top })}
        onQueryChange={(q) => replaceState({ q })}
        onUtmGroupChange={(utmGroup: AdminAnalyticsUtmGroup) =>
          replaceState({ utmGroup })
        }
        onPracticesSort={togglePracticesSort}
        onAuthorsSort={toggleAuthorsSort}
      />

      <AdminAnalyticsDrilldownDrawer
        open={Boolean(urlState.drill && activeKpi)}
        kpi={activeKpi}
        points={summary.timeseries.points}
        practices={breakdown.practices.rows}
        authors={breakdown.authors.rows}
        acquisition={breakdown.acquisition.rows}
        loading={loadingBreakdown}
        onClose={() => replaceState({ drill: null })}
      />
    </div>
  );
}
