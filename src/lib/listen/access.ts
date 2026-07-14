import type { SupabaseClient } from "@supabase/supabase-js";

import type { ListenAccess } from "./types";

type PracticeAccessRow = {
  id: string;
  author_id: string;
  status: string | null;
};

function isAccessActive(expiresAt: string | null): boolean {
  if (expiresAt === null) {
    return true;
  }

  const expiresDate = new Date(expiresAt);

  if (Number.isNaN(expiresDate.getTime())) {
    return false;
  }

  return expiresDate > new Date();
}

export async function resolveListenAccess(
  supabase: SupabaseClient,
  userId: string,
  practice: PracticeAccessRow,
): Promise<ListenAccess | null> {
  const { data: entitlement, error: entitlementError } = await supabase
    .from("user_practices")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("practice_id", practice.id)
    .maybeSingle();

  if (entitlementError) {
    throw new Error("entitlement_lookup_failed");
  }

  if (entitlement && isAccessActive(entitlement.expires_at)) {
    return { mode: "entitled" };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("author_members")
    .select("id")
    .eq("author_id", practice.author_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw new Error("author_membership_lookup_failed");
  }

  if (membership?.id) {
    return { mode: "author_preview" };
  }

  return null;
}
