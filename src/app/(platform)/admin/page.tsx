import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";

import AdminAnalyticsWorkbench from "@/components/admin/AdminAnalyticsWorkbench";
import AdminSectionError from "@/components/admin/AdminSectionError";
import AdminStatGrid from "@/components/admin/AdminStatGrid";
import AuthorApplicationsAttentionCard from "@/components/admin/AuthorApplicationsAttentionCard";
import CommercialApplicationsAttentionCard from "@/components/admin/CommercialApplicationsAttentionCard";
import { getAdminAnalyticsSummaryBundle } from "@/lib/admin/analytics-queries";
import { getCachedAdminAuthorApplicationAttentionSummary } from "@/lib/admin/author-application-attention-cache";
import { getCachedAdminCommercialApplicationAttentionSummary } from "@/lib/admin/commercial-application-attention-cache";
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
  const canViewAuthors = snapshotHasPermission(session.access, "authors.view");
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
    commercial: canViewAuthors
      ? () => getCachedAdminCommercialApplicationAttentionSummary()
      : null,
    authors: canViewAuthors
      ? () => getCachedAdminAuthorApplicationAttentionSummary()
      : null,
    rethrow: unstable_rethrow,
  });

  return (
    <div className="space-y-8">
      {loaded.authors.status === "ready" ? (
        <AuthorApplicationsAttentionCard summary={loaded.authors.value} />
      ) : null}
      {loaded.authors.status === "failed" ? (
        <AdminSectionError
          message={ADMIN_OVERVIEW_SECTION_ERRORS.authors}
          retryHref={retryHref}
        />
      ) : null}

      {loaded.commercial.status === "ready" ? (
        <CommercialApplicationsAttentionCard summary={loaded.commercial.value} />
      ) : null}
      {loaded.commercial.status === "failed" ? (
        <AdminSectionError
          message={ADMIN_OVERVIEW_SECTION_ERRORS.commercial}
          retryHref={retryHref}
        />
      ) : null}

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
    </div>
  );
}
