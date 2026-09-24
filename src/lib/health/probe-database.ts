import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Cheap read-only reachability probe. The selected row is discarded.
 * Callers must not put driver errors or credentials into the HTTP body.
 */
export async function probeDatabaseReachable(): Promise<boolean> {
  try {
    const client = createServiceRoleClient();
    const { error } = await client
      .from("authors")
      .select("id", { head: true })
      .limit(1);

    return !error;
  } catch {
    return false;
  }
}
