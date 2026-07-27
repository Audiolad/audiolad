import { Suspense } from "react";
import { redirect } from "next/navigation";

import AdminAnalyticsWorkbench from "@/components/admin/AdminAnalyticsWorkbench";
import AdminStatGrid from "@/components/admin/AdminStatGrid";
import CommercialApplicationsAttentionCard from "@/components/admin/CommercialApplicationsAttentionCard";
import { getAdminAnalyticsSummaryBundle } from "@/lib/admin/analytics-queries";
import type { CommercialApplicationAttentionSummary } from "@/lib/admin/commercial-application-attention";
import { getCachedAdminCommercialApplicationAttentionSummary } from "@/lib/admin/commercial-application-attention-cache";
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

  const canViewAuthors = snapshotHasPermission(session.access, "authors.view");

  let overviewStats;
  let analyticsSummary = null;
  let commercialAttention: CommercialApplicationAttentionSummary | null = null;

  try {
    const commercialPromise = canViewAuthors
      ? getCachedAdminCommercialApplicationAttentionSummary()
      : Promise.resolve(null);

    if (canViewAnalytics) {
      [overviewStats, analyticsSummary, commercialAttention] = await Promise.all([
        getAdminOverviewStats(),
        getAdminAnalyticsSummaryBundle({
          period: params.period,
          includeTest: params.includeTest,
          authorId: params.authorId,
          practiceId: params.practiceId,
          utmSource: params.utmSource,
          deviceType: params.deviceType,
        }),
        commercialPromise,
      ]);
    } else {
      [overviewStats, commercialAttention] = await Promise.all([
        getAdminOverviewStats(),
        commercialPromise,
      ]);
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
      {commercialAttention ? (
        <CommercialApplicationsAttentionCard summary={commercialAttention} />
      ) : null}

      {canViewAnalytics && analyticsSummary ? (
        <section aria-labelledby="admin-analytics-heading">
          <Suspense
            fallback={
              <p className="text-sm text-[#796ba0]">Загружаем аналитику…</p>
            }
          >
            <AdminAnalyticsWorkbench summary={analyticsSummary} />
          </Suspense>
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
