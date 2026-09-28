import { NextResponse } from "next/server";

import { getAdminAnalyticsBreakdownBundle } from "@/lib/admin/analytics-queries";
import {
  parseAdminAnalyticsUrlState,
  topNToLimit,
} from "@/lib/admin/analytics-url-state";
import { STATS_TABLE_ROW_CAP } from "@/lib/stats/table-sort";
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

  const url = new URL(request.url);
  const state = parseAdminAnalyticsUrlState(url.searchParams);
  const limit = topNToLimit(state.top);

  try {
    const breakdown = await getAdminAnalyticsBreakdownBundle({
      period: state.period,
      includeTest: state.includeTest ? "1" : "0",
      authorId: state.authorId,
      practiceId: state.practiceId,
      utmSource: state.utmSource,
      deviceType: state.deviceType,
      practicesSort: state.practicesSort,
      practicesSortDir: state.practicesSortDir,
      practicesQuery: state.q,
      authorsSort: state.authorsSort,
      authorsSortDir: state.authorsSortDir,
      utmSort: state.utmSort,
      utmSortDir: state.utmSortDir,
      utmGroup: state.utmGroup,
      practicesLimit: limit,
      authorsLimit: limit,
      acquisitionLimit: STATS_TABLE_ROW_CAP,
      practicesPage: "1",
      authorsPage: "1",
      acquisitionPage: "1",
    });

    return NextResponse.json(breakdown, { status: 200 });
  } catch (error) {
    console.error("admin_analytics_breakdown_api_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
