import { NextResponse } from "next/server";

import { adminRatingsInternalErrorBody } from "@/lib/admin/analytics-ratings";
import {
  normalizeAdminRatingsListenerSearch,
  parseAdminRatingsListenerOffset,
  parseAdminRatingsListenerSort,
  parseAdminRatingsListenerSortDir,
} from "@/lib/admin/analytics-ratings-listeners";
import {
  getAdminRatingsListenersBundle,
  writeAdminRatingsListenersAccessLog,
} from "@/lib/admin/analytics-ratings-listeners-queries";
import { requireRatingsListenersViewActor } from "@/lib/admin/analytics-ratings-route-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireRatingsListenersViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const search = normalizeAdminRatingsListenerSearch(url.searchParams.get("q"));

  try {
    const bundle = await getAdminRatingsListenersBundle({
      search,
      sort: parseAdminRatingsListenerSort(url.searchParams.get("sort")),
      sortDir: parseAdminRatingsListenerSortDir(url.searchParams.get("dir")),
      offset: parseAdminRatingsListenerOffset(url.searchParams.get("offset")),
    });
    await writeAdminRatingsListenersAccessLog({
      actorUserId: guard.actor.userId,
      kind: "list",
      counts: { rows: bundle.rows.length, total: bundle.total, search_used: search != null },
    });
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    console.error(
      "admin_ratings_listeners_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(adminRatingsInternalErrorBody(), { status: 500 });
  }
}
