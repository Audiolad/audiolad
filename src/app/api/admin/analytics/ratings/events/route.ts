import { NextResponse } from "next/server";

import { getAdminRatingsEventsBundle } from "@/lib/admin/analytics-ratings-queries";
import { requireRatingsAnalyticsViewActor } from "@/lib/admin/analytics-ratings-route-guard";
import { parseAdminAnalyticsUrlState } from "@/lib/admin/analytics-url-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireRatingsAnalyticsViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const state = parseAdminAnalyticsUrlState(url.searchParams);

  try {
    const bundle = await getAdminRatingsEventsBundle({
      period: state.ratingsPeriod,
      practiceId: state.ratingsJournalPracticeId,
      authorId: state.ratingsJournalAuthorId,
      eventKind: state.ratingsEventKind,
      excluded: state.ratingsExcludedFilter,
      offset: state.ratingsJournalOffset,
    });
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "admin_ratings_events_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
