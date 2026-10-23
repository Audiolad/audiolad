import {
  getAdminRatingsGuestListenersBundle,
  writeAdminRatingsListenersAccessLog,
} from "@/lib/admin/analytics-ratings-listeners-queries";
import { normalizeGuestListenerSearch } from "@/lib/admin/analytics-ratings-listeners";
import { requireRatingsListenersViewActor } from "@/lib/admin/analytics-ratings-route-guard";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } as const;

export async function GET(request: Request) {
  const guard = await requireRatingsListenersViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const search = normalizeGuestListenerSearch(url.searchParams.get("q"));
  const sortParam = url.searchParams.get("sort");
  const sort =
    sortParam === "rating_count" || sortParam === "average" ? sortParam : "last_activity";
  const sortDir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  const offsetRaw = url.searchParams.get("offset");
  const offset = offsetRaw && /^\d+$/.test(offsetRaw) ? Number(offsetRaw) : 0;

  try {
    const bundle = await getAdminRatingsGuestListenersBundle({
      search,
      sort,
      sortDir,
      offset,
    });
    const logged = await writeAdminRatingsListenersAccessLog({
      actorUserId: guard.actor.userId,
      kind: "list",
      counts: {
        audience_guest: true,
        rows: bundle.rows.length,
        total: bundle.total,
        search_used: search != null,
      },
    });
    if (!logged) {
      return Response.json({ error: "audit_log_unavailable" }, { status: 503, headers: NO_STORE });
    }
    return Response.json(bundle, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "admin_ratings_guest_listeners_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json({ error: "internal_error" }, { status: 500, headers: NO_STORE });
  }
}
