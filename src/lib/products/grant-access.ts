import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const GRANT_PRACTICE_ACCESS_RPC = "grant_practice_access" as const;

export type GrantAccessSource =
  | "starter"
  | "free_claim"
  | "purchase"
  | "gift"
  | "subscription"
  | "program"
  | "admin"
  | "external_manual";

export type GrantAccessInput = {
  userId: string;
  practiceId: string;
  targetLevel: number;
  accessSource?: GrantAccessSource;
  metadata?: Record<string, unknown>;
};

export type GrantAccessResult = {
  user_id: string;
  practice_id: string;
  access_level: number;
  previous_access_level: number | null;
  inserted: boolean;
  raised: boolean;
};

/**
 * Canonical server-side entitlement grant.
 * Delegates to grant_practice_access: access_level = GREATEST(current, target).
 * Call only with a service_role / trusted client. Never from the browser.
 */
export async function grantAccess(
  supabase: SupabaseClient,
  input: GrantAccessInput,
): Promise<GrantAccessResult> {
  const { data, error } = await supabase.rpc(GRANT_PRACTICE_ACCESS_RPC, {
    p_user_id: input.userId,
    p_practice_id: input.practiceId,
    p_target_level: input.targetLevel,
    p_access_source: input.accessSource ?? "admin",
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(error.message || "grant_practice_access_failed");
  }

  const row = data as GrantAccessResult | null;
  if (!row || typeof row.access_level !== "number") {
    throw new Error("grant_practice_access_invalid_result");
  }

  return row;
}
