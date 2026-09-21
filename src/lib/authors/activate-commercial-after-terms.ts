import "server-only";

import { ensureCommercialPayeeSetupAfterTerms } from "@/lib/authors/ensure-commercial-payee-setup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ActivateCommercialAfterTermsResult = {
  fromStatus: string | null;
  toStatus: string | null;
  activated: boolean;
  payeeSetupReady: boolean;
};

/**
 * Promote commercial_onboarding → commercial_active when Author Terms are
 * already accepted. Used after terms accept, after admin approve (if terms
 * were accepted earlier), and as a read-path self-heal for stuck cabinets.
 * Payout profile is intentionally not part of this transition.
 */
export async function activateCommercialAccessAfterTermsAccepted(input: {
  authorId: string;
  actorUserId: string;
  reason?: string;
}): Promise<ActivateCommercialAfterTermsResult> {
  const client = createServiceRoleClient();
  const { data: author, error: loadError } = await client
    .from("authors")
    .select("access_status")
    .eq("id", input.authorId)
    .maybeSingle();

  if (loadError) {
    console.error("activate_commercial_after_terms_load_failed");
    return {
      fromStatus: null,
      toStatus: null,
      activated: false,
      payeeSetupReady: false,
    };
  }

  const fromStatus =
    typeof author?.access_status === "string" ? author.access_status : null;

  let toStatus = fromStatus;
  let activated = false;
  const reason = input.reason?.trim() || "author_terms_accepted";

  if (fromStatus === "commercial_onboarding") {
    const { data, error } = await client.rpc(
      "set_author_access_status_for_commercial_application",
      {
        p_author_id: input.authorId,
        p_new_status: "commercial_active",
        p_changed_by: input.actorUserId,
        p_reason: reason,
        p_commercial_application_id: null,
      },
    );

    if (error) {
      console.error("activate_commercial_after_terms_rpc_failed", error.message);
      return {
        fromStatus,
        toStatus: fromStatus,
        activated: false,
        payeeSetupReady: false,
      };
    }

    toStatus = typeof data === "string" ? data : "commercial_active";
    activated = toStatus === "commercial_active";
  } else if (
    fromStatus === "commercial_active" ||
    fromStatus === "commercial"
  ) {
    toStatus = fromStatus;
  } else {
    return {
      fromStatus,
      toStatus: fromStatus,
      activated: false,
      payeeSetupReady: false,
    };
  }

  const payeeSetup = await ensureCommercialPayeeSetupAfterTerms({
    authorId: input.authorId,
    actorUserId: input.actorUserId,
  });

  return {
    fromStatus,
    toStatus,
    activated,
    payeeSetupReady:
      payeeSetup.payoutEligible &&
      (payeeSetup.termsProvisioned || payeeSetup.alreadyReady),
  };
}
