import { NextResponse } from "next/server";

import { getAdminRatingsDiagnosticsBundle } from "@/lib/admin/analytics-ratings-queries";
import { requireRatingsAnalyticsViewActor } from "@/lib/admin/analytics-ratings-route-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireRatingsAnalyticsViewActor();
  if (!guard.ok) return guard.response;

  try {
    const bundle = await getAdminRatingsDiagnosticsBundle();
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "admin_ratings_diagnostics_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
