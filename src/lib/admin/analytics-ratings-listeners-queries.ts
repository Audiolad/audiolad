import "server-only";

import { createHash } from "node:crypto";

import { throwIfAdminRatingsRpcFailed } from "@/lib/admin/analytics-ratings";
import {
  ADMIN_RATINGS_LISTENER_DETAIL_LIMIT,
  ADMIN_RATINGS_LISTENER_DETAIL_OPERATION,
  ADMIN_RATINGS_LISTENERS_LIST_OPERATION,
  ADMIN_RATINGS_LISTENERS_PAGE_SIZE,
  normalizeAdminRatingsListenerDetailRpc,
  normalizeAdminRatingsListenersRpc,
  type AdminRatingsListenerDetailBundle,
  type AdminRatingsListenerSort,
  type AdminRatingsListenerSortDir,
  type AdminRatingsListenersBundle,
} from "@/lib/admin/analytics-ratings-listeners";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  normalizeAdminRatingsGuestListenerDetailRpc,
  normalizeAdminRatingsGuestListenersRpc,
  type AdminRatingsGuestListenerDetail,
  type AdminRatingsGuestListenersBundle,
} from "@/lib/admin/analytics-ratings-listeners";

export async function getAdminRatingsListenersBundle(input: {
  search: string | null;
  sort: AdminRatingsListenerSort;
  sortDir: AdminRatingsListenerSortDir;
  offset: number;
}): Promise<AdminRatingsListenersBundle> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("admin_ratings_listeners", {
    p_search: input.search,
    p_sort: input.sort,
    p_sort_dir: input.sortDir,
    p_limit: ADMIN_RATINGS_LISTENERS_PAGE_SIZE,
    p_offset: input.offset,
  });
  if (error) {
    console.error("admin_ratings_listeners_error", error.message);
    throwIfAdminRatingsRpcFailed(error);
  }
  return normalizeAdminRatingsListenersRpc(data);
}

export async function getAdminRatingsListenerDetailBundle(
  userId: string,
): Promise<AdminRatingsListenerDetailBundle> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("admin_ratings_listener_detail", {
    p_user_id: userId,
    p_limit: ADMIN_RATINGS_LISTENER_DETAIL_LIMIT,
  });
  if (error) {
    console.error("admin_ratings_listener_detail_error", error.message);
    throwIfAdminRatingsRpcFailed(error);
  }
  return normalizeAdminRatingsListenerDetailRpc(data);
}

export async function getAdminRatingsGuestListenersBundle(input: {
  search: string | null;
  sort: "last_activity" | "rating_count" | "average";
  sortDir: "asc" | "desc";
  offset: number;
}): Promise<AdminRatingsGuestListenersBundle> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("admin_ratings_guest_listeners", {
    p_search: input.search,
    p_sort: input.sort,
    p_sort_dir: input.sortDir,
    p_limit: ADMIN_RATINGS_LISTENERS_PAGE_SIZE,
    p_offset: input.offset,
  });
  if (error) {
    console.error("admin_ratings_guest_listeners_error", error.message);
    throwIfAdminRatingsRpcFailed(error);
  }
  return normalizeAdminRatingsGuestListenersRpc(data);
}

export async function getAdminRatingsGuestListenerDetailBundle(
  guestId: string,
): Promise<AdminRatingsGuestListenerDetail> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("admin_ratings_guest_listener_detail", {
    p_guest_id: guestId,
    p_limit: ADMIN_RATINGS_LISTENER_DETAIL_LIMIT,
  });
  if (error) {
    console.error("admin_ratings_guest_listener_detail_error", error.message);
    throwIfAdminRatingsRpcFailed(error);
  }
  return normalizeAdminRatingsGuestListenerDetailRpc(data);
}

/** sha256 of normalized email; never the email itself. */
export function hashListenerEmailForAudit(email: string | null): string {
  const normalized = (email ?? "").trim().toLowerCase();
  return createHash("sha256")
    .update(normalized === "" ? "admin-ratings-listeners:no-email" : normalized, "utf8")
    .digest("hex");
}

/**
 * Append-only access log (admin_operation_log). Search text is NOT stored
 * (it may itself be PII); only whether a search was used and row counts.
 * Returns false on any failure: callers MUST then withhold PII (fail closed).
 */
export async function writeAdminRatingsListenersAccessLog(input: {
  actorUserId: string;
  kind: "list" | "detail";
  targetUserId?: string | null;
  targetEmail?: string | null;
  counts: Record<string, number | boolean | string>;
}): Promise<boolean> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service.from("admin_operation_log").insert({
      operation:
        input.kind === "detail"
          ? ADMIN_RATINGS_LISTENER_DETAIL_OPERATION
          : ADMIN_RATINGS_LISTENERS_LIST_OPERATION,
      actor_user_id: input.actorUserId,
      target_auth_user_id: input.targetUserId ?? null,
      target_email_hash:
        input.kind === "detail"
          ? hashListenerEmailForAudit(input.targetEmail ?? null)
          : "admin-ratings-listeners:list",
      counts: input.counts,
      status: "success",
      error_code: null,
    });
    if (error) {
      console.error("admin_ratings_listeners_audit_log_failed", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "admin_ratings_listeners_audit_log_failed",
      error instanceof Error ? error.message : "unknown",
    );
    return false;
  }
}
