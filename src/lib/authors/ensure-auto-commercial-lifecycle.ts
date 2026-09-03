import "server-only";

import { isAuthorCommercialActiveAccess } from "@/lib/authors/access";
import {
  AUTO_COMMERCIAL_PAYEE_SETUP_NOTES,
  ensureCommercialPayeeSetupAfterTerms,
  type EnsureCommercialPayeeSetupResult,
} from "@/lib/authors/ensure-commercial-payee-setup";
import { isOwnerControlledAuthorWorkspace } from "@/lib/authors/owner-controlled";

/**
 * Complete the auto-commercial / owner-controlled lifecycle.
 * commercial_active alone is not appreciation/finance-ready: the same
 * payout_eligible + approved author_commercial_terms bootstrap used after
 * Author Terms acceptance must run here too. Same share/hold model.
 * Does not write appreciation settings (missing row already means defaults).
 */
export async function ensureAutoCommercialAppreciationLifecycle(input: {
  authorId: string;
  accessStatus: string | null | undefined;
  ownerControlled: boolean;
  actorUserId?: string | null;
}): Promise<EnsureCommercialPayeeSetupResult | null> {
  if (
    !isOwnerControlledAuthorWorkspace(input.ownerControlled) ||
    !isAuthorCommercialActiveAccess(input.accessStatus)
  ) {
    return null;
  }

  return ensureCommercialPayeeSetupAfterTerms({
    authorId: input.authorId,
    actorUserId: input.actorUserId ?? null,
    notes: AUTO_COMMERCIAL_PAYEE_SETUP_NOTES,
    correlationId: `auto_commercial_payee_setup:${input.authorId}`,
  });
}
