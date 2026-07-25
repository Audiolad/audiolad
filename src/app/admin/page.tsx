import { Suspense } from "react";
import { redirect } from "next/navigation";

import AdminAnalyticsBreakdownTabs from "@/components/admin/AdminAnalyticsBreakdownTabs";
import AdminAnalyticsDefinitions from "@/components/admin/AdminAnalyticsDefinitions";
import AdminAnalyticsFilters from "@/components/admin/AdminAnalyticsFilters";
import AdminAnalyticsFunnelPanel from "@/components/admin/AdminAnalyticsFunnelPanel";
import AdminAnalyticsMetricCards from "@/components/admin/AdminAnalyticsMetricCards";
import AdminAnalyticsPeriodPicker from "@/components/admin/AdminAnalyticsPeriodPicker";
import AdminAnalyticsTestTrafficControls from "@/components/admin/AdminAnalyticsTestTrafficControls";
import AdminAnalyticsTimeseriesChart from "@/components/admin/AdminAnalyticsTimeseriesChart";
import AdminStatGrid from "@/components/admin/AdminStatGrid";
import { getAdminAnalyticsDashboard } from "@/lib/admin/analytics-queries";
import {
  getFirstAllowedAdminPath,
  requireAdminPanelAccess,
  requireAdminPermission,
} from "@/lib/admin/guard";
import { getAdminOverviewStats } from "@/lib/admin/queries";
import { snapshotHasPermission } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    includeTest?: string;
    authorId?: string;
    practiceId?: string;
    utmSource?: string;
    deviceType?: string;
    practicesSort?: string;
    practicesSortDir?: string;
    practicesPage?: string;
    authorsSort?: string;
    authorsSortDir?: string;
    authorsPage?: string;
    acquisitionPage?: string;
  }>;
}) {
  const session = await requireAdminPanelAccess();

  if (!snapshotHasPermission(session.access, "dashboard.view")) {
    const fallback = getFirstAllowedAdminPath(session.access);
    if (fallback && fallback !== "/admin") {
      redirect(fallback);
    }
    await requireAdminPermission("dashboard.view");
  }

  const canViewAnalytics = snapshotHasPermission(
    session.access,
    "analytics.view",
  );
  const params = await searchParams;

  let overviewStats;
  let analyticsDashboard = null;

  try {
    if (canViewAnalytics) {
      [overviewStats, analyticsDashboard] = await Promise.all([
        getAdminOverviewStats(),
        getAdminAnalyticsDashboard({
          period: params.period,
          includeTest: params.includeTest,
          authorId: params.authorId,
          practiceId: params.practiceId,
          utmSource: params.utmSource,
          deviceType: params.deviceType,
          practicesSort: params.practicesSort,
          practicesSortDir: params.practicesSortDir,
          practicesPage: params.practicesPage,
          authorsSort: params.authorsSort,
          authorsSortDir: params.authorsSortDir,
          authorsPage: params.authorsPage,
          acquisitionPage: params.acquisitionPage,
        }),
      ]);
    } else {
      overviewStats = await getAdminOverviewStats();
    }
  } catch (error) {
    console.error("admin_overview_load_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить показатели. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {canViewAnalytics && analyticsDashboard ? (
        <section aria-labelledby="admin-analytics-heading" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="admin-analytics-heading" className="text-[21px] font-semibold">
                Аналитика платформы
              </h2>
              <p className="mt-1 text-sm text-[#796ba0]">
                Период: {analyticsDashboard.periodLabel}. Обновлено{" "}
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Moscow",
                }).format(new Date(analyticsDashboard.generatedAt))}
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
              <Suspense fallback={null}>
                <AdminAnalyticsPeriodPicker currentPeriod={analyticsDashboard.period} />
              </Suspense>
              <Suspense fallback={null}>
                <AdminAnalyticsTestTrafficControls
                  currentPeriod={analyticsDashboard.period}
                  includeTest={analyticsDashboard.includeTest}
                  excludedTestVisitors={analyticsDashboard.excludedTestVisitors}
                  excludedTestSessions={analyticsDashboard.excludedTestSessions}
                />
              </Suspense>
            </div>
          </div>

          <Suspense fallback={null}>
            <AdminAnalyticsFilters
              currentPeriod={analyticsDashboard.period}
              includeTest={analyticsDashboard.includeTest}
              authorId={analyticsDashboard.filters.authorId}
              practiceId={analyticsDashboard.filters.practiceId}
              utmSource={analyticsDashboard.filters.utmSource}
              deviceType={analyticsDashboard.filters.deviceType}
              authors={analyticsDashboard.filterOptions.authors}
              practices={analyticsDashboard.filterOptions.practices}
              filterNotes={analyticsDashboard.filterNotes}
            />
          </Suspense>

          <AdminAnalyticsDefinitions />

          <section aria-labelledby="admin-audience-heading" className="space-y-3">
            <h3 id="admin-audience-heading" className="text-[19px] font-semibold">
              Аудитория
            </h3>
            <AdminAnalyticsMetricCards metrics={analyticsDashboard.audience} />
          </section>

          <AdminAnalyticsFunnelPanel
            events={analyticsDashboard.funnelEvents}
            people={analyticsDashboard.funnelPeople}
            purchasesPlaceholder={analyticsDashboard.purchasesPlaceholder}
          />

          <AdminAnalyticsTimeseriesChart
            points={analyticsDashboard.timeseries.points}
            granularity={analyticsDashboard.timeseries.granularity}
            error={analyticsDashboard.timeseries.error}
          />

          <AdminAnalyticsBreakdownTabs
            practices={analyticsDashboard.practices}
            authors={analyticsDashboard.authors}
            acquisition={analyticsDashboard.acquisition}
          />
        </section>
      ) : null}

      <section aria-labelledby="admin-overview-heading">
        <div className="mb-5">
          <h2 id="admin-overview-heading" className="text-[21px] font-semibold">
            Операционный обзор
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Показатели из базы данных (без привязки к выбранному периоду аналитики).
          </p>
        </div>
        <AdminStatGrid cards={overviewStats.cards} />
      </section>
    </div>
  );
}
