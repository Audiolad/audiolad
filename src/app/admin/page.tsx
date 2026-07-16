import { Suspense } from "react";

import AdminAnalyticsFunnel from "@/components/admin/AdminAnalyticsFunnel";
import AdminAnalyticsMetrics from "@/components/admin/AdminAnalyticsMetrics";
import AdminAnalyticsPeriodPicker from "@/components/admin/AdminAnalyticsPeriodPicker";
import AdminAnalyticsSourcesTable from "@/components/admin/AdminAnalyticsSourcesTable";
import AdminPopularPracticesTable from "@/components/admin/AdminPopularPracticesTable";
import AdminRecentActivityList from "@/components/admin/AdminRecentActivityList";
import AdminStatGrid from "@/components/admin/AdminStatGrid";
import { getAdminAnalyticsDashboard } from "@/lib/admin/analytics-queries";
import { getAdminOverviewStats } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;

  let overviewStats;
  let analyticsDashboard;

  try {
    [overviewStats, analyticsDashboard] = await Promise.all([
      getAdminOverviewStats(),
      getAdminAnalyticsDashboard({ period: params.period }),
    ]);
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
      <section aria-labelledby="admin-analytics-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
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

          <Suspense fallback={null}>
            <AdminAnalyticsPeriodPicker currentPeriod={analyticsDashboard.period} />
          </Suspense>
        </div>

        <AdminAnalyticsMetrics metrics={analyticsDashboard.metrics} />

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <AdminAnalyticsFunnel steps={analyticsDashboard.funnel} />
          <AdminRecentActivityList items={analyticsDashboard.recentActivity} />
        </div>

        <div className="mt-6 space-y-6">
          <AdminAnalyticsSourcesTable rows={analyticsDashboard.sources} />
          <AdminPopularPracticesTable rows={analyticsDashboard.popularPractices} />
        </div>
      </section>

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
