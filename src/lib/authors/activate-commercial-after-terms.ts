import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ActivateCommercialAfterTermsResult = {
  fromStatus: string | null;
  toStatus: string | null;
  activated: boolean;
};

/**
 * After Author Terms acceptance, promote commercial_onboarding → commercial_active.
 * Payout profile is intentionally not part of this transition.
 */
export async function activateCommercialAccessAfterTermsAccepted(input: {
  authorId: string;
  actorUserId: string;
}): Promise<ActivateCommercialAfterTermsResult> {
  const client = createServiceRoleClient();
  const { data: author, error: loadError } = await client
    .from("authors")
    .select("access_status")
    .eq("id", input.authorId)
    .maybeSingle();

  if (loadError) {
    console.error("activate_commercial_after_terms_load_failed");
    return { fromStatus: null, toStatus: null, activated: false };
  }

  const fromStatus =
    typeof author?.access_status === "string" ? author.access_status : null;

  if (fromStatus !== "commercial_onboarding") {
    return {
      fromStatus,
      toStatus: fromStatus,
      activated: false,
    };
  }

  const { data, error } = await client.rpc(
    "set_author_access_status_for_commercial_application",
    {
      p_author_id: input.authorId,
      p_new_status: "commercial_active",
      p_changed_by: input.actorUserId,
      p_reason: "author_terms_accepted",
      p_commercial_application_id: null,
    },
  );

  if (error) {
    console.error("activate_commercial_after_terms_rpc_failed", error.message);
    return { fromStatus, toStatus: fromStatus, activated: false };
  }

  const toStatus = typeof data === "string" ? data : "commercial_active";
  return {
    fromStatus,
    toStatus,
    activated: toStatus === "commercial_active",
  };
}
