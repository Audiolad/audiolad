import { NextResponse } from "next/server";

import { getAdminMoneyBreakdownBundle } from "@/lib/admin/analytics-money-queries";
import {
  parseAdminAnalyticsUrlState,
  topNToLimit,
} from "@/lib/admin/analytics-url-state";
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

  try {
    const bundle = await getAdminMoneyBreakdownBundle({
      period: state.moneyPeriod,
      includeTest: state.includeTestPayments,
      authorId: state.moneyAuthorId,
      practiceId: state.moneyPracticeId,
      q: state.moneyQ,
      top: topNToLimit(state.moneyTop),
      productsSort: state.moneyProductsSort,
      productsSortDir: state.moneyProductsSortDir,
      authorsSort: state.moneyAuthorsSort,
      authorsSortDir: state.moneyAuthorsSortDir,
    });

    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "admin_money_breakdown_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
