/**
 * Route handlers for admin «Оценки → Слушатели», built from injected deps so
 * access control, fail-closed audit logging and "no PII on denial" can be
 * tested without Next/Supabase. Uses the Web `Response` only.
 */
import {
  isAdminRatingsListenerUuid,
  normalizeAdminRatingsListenerSearch,
  parseAdminRatingsListenerOffset,
  parseAdminRatingsListenerSort,
  parseAdminRatingsListenerSortDir,
  type AdminRatingsListenerDetailBundle,
  type AdminRatingsListenerSort,
  type AdminRatingsListenerSortDir,
  type AdminRatingsListenersBundle,
} from "@/lib/admin/analytics-ratings-listeners";

export type RatingsListenersGuardResult =
  | { ok: true; actor: { userId: string } }
  | { ok: false; response: Response };

export type RatingsListenersAccessLogInput = {
  actorUserId: string;
  kind: "list" | "detail";
  targetUserId?: string | null;
  targetEmail?: string | null;
  counts: Record<string, number | boolean | string>;
};

export type RatingsListenersRouteDeps = {
  requireActor: () => Promise<RatingsListenersGuardResult>;
  getList: (input: {
    search: string | null;
    sort: AdminRatingsListenerSort;
    sortDir: AdminRatingsListenerSortDir;
    offset: number;
  }) => Promise<AdminRatingsListenersBundle>;
  getDetail: (userId: string) => Promise<AdminRatingsListenerDetailBundle>;
  /** Must resolve true only when the access row was durably written. */
  writeAccessLog: (input: RatingsListenersAccessLogInput) => Promise<boolean>;
  logError?: (code: string, detail: string) => void;
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } as const;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

/** Access log is mandatory: if it cannot be written, PII is withheld (503). */
export const AUDIT_UNAVAILABLE_BODY = { error: "audit_log_unavailable" } as const;

export async function handleRatingsListenersList(
  request: Request,
  deps: RatingsListenersRouteDeps,
): Promise<Response> {
  const guard = await deps.requireActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const search = normalizeAdminRatingsListenerSearch(url.searchParams.get("q"));

  try {
    const bundle = await deps.getList({
      search,
      sort: parseAdminRatingsListenerSort(url.searchParams.get("sort")),
      sortDir: parseAdminRatingsListenerSortDir(url.searchParams.get("dir")),
      offset: parseAdminRatingsListenerOffset(url.searchParams.get("offset")),
    });
    const logged = await deps.writeAccessLog({
      actorUserId: guard.actor.userId,
      kind: "list",
      counts: { rows: bundle.rows.length, total: bundle.total, search_used: search != null },
    });
    if (!logged) return json(AUDIT_UNAVAILABLE_BODY, 503);
    return json(bundle);
  } catch (error) {
    deps.logError?.("admin_ratings_listeners_route_error", errorDetail(error));
    return json({ error: "internal_error" }, 500);
  }
}

export async function handleRatingsListenerDetail(
  userId: string,
  deps: RatingsListenersRouteDeps,
): Promise<Response> {
  const guard = await deps.requireActor();
  if (!guard.ok) return guard.response;

  if (!isAdminRatingsListenerUuid(userId)) {
    return json({ error: "invalid_request" }, 400);
  }

  try {
    const bundle = await deps.getDetail(userId);
    if (!bundle.found) return json({ error: "not_found" }, 404);
    const logged = await deps.writeAccessLog({
      actorUserId: guard.actor.userId,
      kind: "detail",
      targetUserId: userId,
      targetEmail: bundle.profile.email,
      counts: { ratings: bundle.ratings.length, events: bundle.events.length },
    });
    if (!logged) return json(AUDIT_UNAVAILABLE_BODY, 503);
    return json(bundle);
  } catch (error) {
    deps.logError?.("admin_ratings_listener_detail_route_error", errorDetail(error));
    return json({ error: "internal_error" }, 500);
  }
}
