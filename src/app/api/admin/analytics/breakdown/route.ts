import { NextResponse } from "next/server";

import { getAdminAnalyticsBreakdownBundle } from "@/lib/admin/analytics-queries";
import { topNToLimit } from "@/lib/admin/analytics-url-state";
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
  const top = url.searchParams.get("top") ?? "25";
  const limit = topNToLimit(top === "10" || top === "25" || top === "all" ? top : "25");

  try {
    const breakdown = await getAdminAnalyticsBreakdownBundle({
      period: url.searchParams.get("period"),
      includeTest: url.searchParams.get("includeTest"),
      authorId: url.searchParams.get("authorId"),
      practiceId: url.searchParams.get("practiceId"),
      utmSource: url.searchParams.get("utmSource"),
      deviceType: url.searchParams.get("deviceType"),
      practicesSort: url.searchParams.get("practicesSort"),
      practicesSortDir: url.searchParams.get("practicesSortDir"),
      authorsSort: url.searchParams.get("authorsSort"),
      authorsSortDir: url.searchParams.get("authorsSortDir"),
      practicesLimit: limit,
      authorsLimit: limit,
      acquisitionLimit: 100,
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
