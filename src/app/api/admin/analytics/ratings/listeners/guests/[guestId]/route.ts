import {
  getAdminRatingsGuestListenerDetailBundle,
  writeAdminRatingsListenersAccessLog,
} from "@/lib/admin/analytics-ratings-listeners-queries";
import { isAdminRatingsListenerUuid } from "@/lib/admin/analytics-ratings-listeners";
import { requireRatingsListenersViewActor } from "@/lib/admin/analytics-ratings-route-guard";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } as const;

type RouteContext = { params: Promise<{ guestId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireRatingsListenersViewActor();
  if (!guard.ok) return guard.response;

  const { guestId } = await context.params;
  if (!isAdminRatingsListenerUuid(guestId)) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }

  try {
    const bundle = await getAdminRatingsGuestListenerDetailBundle(guestId);
    if (!bundle.found) {
      return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    const logged = await writeAdminRatingsListenersAccessLog({
      actorUserId: guard.actor.userId,
      kind: "detail",
      counts: {
        audience_guest: true,
        guest_id: guestId,
        ratings: bundle.ratings.length,
        events: bundle.events.length,
      },
    });
    if (!logged) {
      return Response.json({ error: "audit_log_unavailable" }, { status: 503, headers: NO_STORE });
    }
    return Response.json(bundle, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "admin_ratings_guest_listener_detail_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json({ error: "internal_error" }, { status: 500, headers: NO_STORE });
  }
}
