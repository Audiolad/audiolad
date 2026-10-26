import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Stamp due schedules before the public read returns.
 * Search notification is not sent here. The recrawl worker claims again
 * (idempotent) and moves the outbox onto search_recrawl_queue.
 * Fail-open: a missing key or a write error must not break the public read.
 */
export async function releaseDueScheduledPublications(): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await claimDueScheduledPublications(supabase);
  } catch {
    // Public pages stay available when the service claim cannot run.
  }
}

export async function claimDueScheduledPublications(
  supabase: SupabaseClient,
): Promise<void> {
  const claim = await supabase.rpc("claim_due_scheduled_practice_publications");

  if (claim.error) {
    return;
  }
}
