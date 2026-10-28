import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Copies the workspace name onto the approved application.
 * Service role is required: the applicant guard rejects display_name edits
 * once the application is approved. auth.uid() is null for this client, so
 * the existing guard allows the row through. No schema change.
 */
export async function syncApprovedAuthorApplicationDisplayName(
  authorId: string,
  displayName: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("author_applications")
    .update({ display_name: displayName })
    .eq("author_id", authorId)
    .eq("status", "approved");

  if (error) {
    console.error("approved_application_display_name_sync_failed");
    throw new Error("approved_application_display_name_sync_failed");
  }
}
