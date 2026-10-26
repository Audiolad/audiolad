import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";

import AdminAnalyticsWorkbench from "@/components/admin/AdminAnalyticsWorkbench";
import { YandexRecrawlAdminAlert } from "@/components/admin/YandexRecrawlAdminAlert";
import AdminSectionError from "@/components/admin/AdminSectionError";
import AdminStatGrid from "@/components/admin/AdminStatGrid";
import {
  EcompanyCatalogStatsFallback,
  EcompanyCatalogStatsSection,
} from "@/components/admin/EcompanyCatalogStats";
import { getAdminAnalyticsSummaryBundle } from "@/lib/admin/analytics-queries";
import {
  getFirstAllowedAdminPath,
  requireAdminPanelAccess,
  requireAdminPermission,
} from "@/lib/admin/guard";
import {
  ADMIN_OVERVIEW_SECTION_ERRORS,
  adminOverviewRetryHref,
  loadAdminOverviewSections,
} from "@/lib/admin/overview-blocks";
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
  const retryHref = adminOverviewRetryHref(params);

  const loaded = await loadAdminOverviewSections({
    stats: () => getAdminOverviewStats(),
    analytics: canViewAnalytics
      ? () =>
          getAdminAnalyticsSummaryBundle({
            period: params.period,
            includeTest: params.includeTest,
            authorId: params.authorId,
            practiceId: params.practiceId,
            utmSource: params.utmSource,
            deviceType: params.deviceType,
          })
      : null,
    rethrow: unstable_rethrow,
  });

  // Pending author/commercial applications are signalled by the admin tab
  // highlight (buildAdminNavAttention in layout), so «Обзор» has no cards for them.
  return (
    <div className="space-y-8">
      <YandexRecrawlAdminAlert />
      {loaded.analytics.status === "ready" ? (
        <section aria-labelledby="admin-analytics-heading">
          <Suspense
            fallback={
              <p className="text-sm text-[#796ba0]">Загружаем аналитику…</p>
            }
          >
            <AdminAnalyticsWorkbench summary={loaded.analytics.value} />
          </Suspense>
        </section>
      ) : null}
      {loaded.analytics.status === "failed" ? (
        <AdminSectionError
          message={ADMIN_OVERVIEW_SECTION_ERRORS.analytics}
          retryHref={retryHref}
        />
      ) : null}

      <section aria-labelledby="admin-overview-heading">
        <div className="mb-5">
          <h2 id="admin-overview-heading" className="text-[21px] font-semibold">
            Операционный обзор
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Операционные показатели платформы. Периоды 7 и 30 дней рассчитываются независимо от выбранного периода аналитики.
          </p>
        </div>
        {loaded.stats.status === "ready" ? (
          <AdminStatGrid cards={loaded.stats.value.cards} />
        ) : (
          <AdminSectionError
            message={ADMIN_OVERVIEW_SECTION_ERRORS.stats}
            retryHref={retryHref}
          />
        )}
      </section>

      {/* c353a4b5: статистика каталога АудиоЛада живёт в разделе статистики, не на табло ИИ-компании. */}
      <Suspense fallback={<EcompanyCatalogStatsFallback />}>
        <EcompanyCatalogStatsSection />
      </Suspense>
    </div>
  );
}
