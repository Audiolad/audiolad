import { NextResponse } from "next/server";

import { getAdminAppreciationAnalytics } from "@/lib/admin/appreciation-analytics-queries";
import { getPlatformAccess, snapshotHasPermission } from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const access = await getPlatformAccess(supabase, user.id);
  const canView =
    snapshotHasPermission(access, "admin_panel.access") &&
    (snapshotHasPermission(access, "sales.view") ||
      snapshotHasPermission(access, "analytics.view"));

  if (!canView) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const bundle = await getAdminAppreciationAnalytics();
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "admin_appreciation_analytics_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
