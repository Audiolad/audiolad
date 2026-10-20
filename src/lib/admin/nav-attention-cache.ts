import "server-only";
import { cache } from "react";
import type { PlatformAccessSnapshot } from "@/lib/auth/platform-access";
import { ADMIN_NAV_ATTENTION_QUEUES, canCountAdminQueue, shouldExcludeOwnBusinessCases } from "@/lib/admin/nav-attention";
import { getCachedAdminProductModerationSubmittedCount } from "@/lib/admin/product-moderation-attention-cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

// React cache lives only in the current request tree; never persist counts across requests.
export const getCachedAdminNavAttentionCounts = cache(async (access: PlatformAccessSnapshot) => {
  const entries = await Promise.all(ADMIN_NAV_ATTENTION_QUEUES.map(async (queue) => {
    if (!canCountAdminQueue(access, queue.permission)) return [queue.href, null] as const;
    try {
      if (queue.href === "/admin/product-moderation") {
        return [queue.href, await getCachedAdminProductModerationSubmittedCount()] as const;
      }
      let excludeOwn = false;
      if (queue.href === "/admin/business-verification") {
        const userClient = await createClient();
        const owner = await userClient.rpc("is_platform_owner", { p_user_id: access.userId });
        if (owner.error) throw owner.error;
        excludeOwn = shouldExcludeOwnBusinessCases(owner.data === true);
      }
      const service = createServiceRoleClient();
      let query = service.from(queue.table).select("id", { count: "exact", head: true }).in(queue.column, [...queue.statuses]);
      if (excludeOwn) query = query.neq("owner_user_id", access.userId);
      const { count, error } = await query;
      if (error) throw error;
      return [queue.href, count] as const;
    } catch {
      // No raw errors or user identifiers: only the affected queue is logged.
      console.error("admin_nav_attention_count_failed", { queue: queue.href });
      return [queue.href, null] as const;
    }
  }));
  return Object.fromEntries(entries);
});
