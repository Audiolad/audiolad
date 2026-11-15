import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_ONLY_COLUMN, isBusinessOnlyPractice } from "./business-only";

/** Recheck before a public RPC, grant or signing operation, even with service role.
 * No membership/entitlement exception on the open platform. Business and studio
 * signing use their own authorisation and do not call this helper.
 */
export async function canUsePracticeOnOpenPlatform(
  db: SupabaseClient,
  key: { id: string } | { slug: string },
): Promise<boolean> {
  let query = db.from("practices").select("id, business_only")
    .eq(BUSINESS_ONLY_COLUMN, false);
  query = "id" in key ? query.eq("id", key.id) : query.eq("slug", key.slug);
  const { data, error } = await query.maybeSingle();
  return !error && Boolean(data?.id) && !isBusinessOnlyPractice(data);
}
