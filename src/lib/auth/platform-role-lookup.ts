import type { SupabaseClient } from "@supabase/supabase-js";

/** Reads legacy profiles.role. Prefer RBAC helpers for authorization decisions. */
export async function fetchUserPlatformRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("platform_role_lookup_failed");
  }

  return typeof data?.role === "string" ? data.role : null;
}
