import { randomUUID } from "node:crypto";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import { payoutResponse } from "@/lib/admin/author-payout-route-helpers";
import { approveAuthorPayout } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ payoutId: string }>;
};

/**
 * Re-checks funding before approving: a refund can land between the draft and
 * the approval, and an underfunded payout goes to review instead of shrinking.
 */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canApprovePayouts");
  if (!guard.ok) return guard.response;

  const { payoutId } = await context.params;

  return payoutResponse(
    await approveAuthorPayout({
      payoutId,
      actorUserId: guard.actor.userId,
      correlationId: `admin-payout-approve:${randomUUID()}`,
    }),
  );
}
