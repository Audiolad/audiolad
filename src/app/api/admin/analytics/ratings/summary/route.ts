import { NextResponse } from "next/server";

import { adminRatingsInternalErrorBody } from "@/lib/admin/analytics-ratings";
import { getAdminRatingsSummaryBundle } from "@/lib/admin/analytics-ratings-queries";
import { requireRatingsAnalyticsViewActor } from "@/lib/admin/analytics-ratings-route-guard";
import { parseAdminAnalyticsUrlState } from "@/lib/admin/analytics-url-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireRatingsAnalyticsViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const state = parseAdminAnalyticsUrlState(url.searchParams);

  try {
    const bundle = await getAdminRatingsSummaryBundle({
      period: state.ratingsPeriod,
    });
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "admin_ratings_summary_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(adminRatingsInternalErrorBody(), { status: 500 });
  }
}
