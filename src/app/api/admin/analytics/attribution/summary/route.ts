import { NextResponse } from "next/server";

import { getAdminAttributionBundle } from "@/lib/admin/analytics-attribution-queries";
import { parseAdminAnalyticsUrlState } from "@/lib/admin/analytics-url-state";
import { getPlatformAccess, snapshotHasPermission } from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const access = await getPlatformAccess(supabase, user.id);

  if (
    !snapshotHasPermission(access, "admin_panel.access") ||
    !snapshotHasPermission(access, "analytics.view")
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const state = parseAdminAnalyticsUrlState(new URL(request.url).searchParams);

  try {
    const bundle = await getAdminAttributionBundle({
      period: state.attributionPeriod,
      includeTest: state.includeTestPayments,
      mode: state.attributionMode,
      confidence: state.attributionConfidence,
      sourceClass: state.attributionSourceClass,
      utmSource: state.attributionUtmSource,
      utmMedium: state.attributionUtmMedium,
      campaign: state.attributionCampaign,
      landing: state.attributionLanding,
      authorId: state.attributionAuthorId,
      practiceId: state.attributionPracticeId,
      search: state.attributionQ,
      top: state.attributionTop,
      sort: state.attributionSort,
      sortDir: state.attributionSortDir,
    });

    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "admin_attribution_summary_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
