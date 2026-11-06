import type { SupabaseClient } from "@supabase/supabase-js";

/** Optional, expand-only capability: old schemas and failed reads stay on the legacy path. */
export async function loadBusinessPilotSlots(db: Pick<SupabaseClient, "from">, organizationId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("business_organizations")
      .select("pilot_location_limit").eq("id", organizationId).maybeSingle();
    return !error && data?.pilot_location_limit === 3;
  } catch {
    return false;
  }
}
