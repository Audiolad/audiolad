import type { SupabaseClient } from "@supabase/supabase-js";

import { moderationActorLabel } from "@/lib/practice-comments/copy";

/** Admin journal only. The public comment feed does not read these columns. */
export async function loadModerationActorLabels(
  client: SupabaseClient,
  userIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return {};
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if (error || !data) return {};
  const labels: Record<string, string> = {};
  for (const item of data) {
    const row = item as { id?: string; email?: string | null; full_name?: string | null };
    if (!row.id) continue;
    labels[row.id] = moderationActorLabel({ fullName: row.full_name, email: row.email });
  }
  return labels;
}
