import { NextResponse } from "next/server";

import { adminRatingsInternalErrorBody } from "@/lib/admin/analytics-ratings";
import { isAdminRatingsListenerUuid } from "@/lib/admin/analytics-ratings-listeners";
import {
  getAdminRatingsListenerDetailBundle,
  writeAdminRatingsListenersAccessLog,
} from "@/lib/admin/analytics-ratings-listeners-queries";
import { requireRatingsListenersViewActor } from "@/lib/admin/analytics-ratings-route-guard";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const guard = await requireRatingsListenersViewActor();
  if (!guard.ok) return guard.response;

  const { userId } = await context.params;
  if (!isAdminRatingsListenerUuid(userId)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const bundle = await getAdminRatingsListenerDetailBundle(userId);
    if (!bundle.found) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await writeAdminRatingsListenersAccessLog({
      actorUserId: guard.actor.userId,
      kind: "detail",
      targetUserId: userId,
      targetEmail: bundle.profile.email,
      counts: { ratings: bundle.ratings.length, events: bundle.events.length },
    });
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    console.error(
      "admin_ratings_listener_detail_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(adminRatingsInternalErrorBody(), { status: 500 });
  }
}
