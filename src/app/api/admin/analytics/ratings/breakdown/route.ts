import { NextResponse } from "next/server";

import { adminRatingsInternalErrorBody } from "@/lib/admin/analytics-ratings";
import { getAdminRatingsBreakdownBundle } from "@/lib/admin/analytics-ratings-queries";
import { requireRatingsAnalyticsViewActor } from "@/lib/admin/analytics-ratings-route-guard";
import { parseAdminAnalyticsUrlState } from "@/lib/admin/analytics-url-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireRatingsAnalyticsViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const state = parseAdminAnalyticsUrlState(url.searchParams);

  try {
    const bundle = await getAdminRatingsBreakdownBundle({
      q: state.ratingsQ,
      productsSort: state.ratingsProductsSort,
      productsSortDir: state.ratingsProductsSortDir,
      authorsSort: state.ratingsAuthorsSort,
      authorsSortDir: state.ratingsAuthorsSortDir,
    });
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "admin_ratings_breakdown_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(adminRatingsInternalErrorBody(), { status: 500 });
  }
}
