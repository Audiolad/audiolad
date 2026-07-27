import { randomUUID } from "node:crypto";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import { payoutResponse } from "@/lib/admin/author-payout-route-helpers";
import { markAuthorPayoutProcessing } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ payoutId: string }>;
};

/** Marks that the transfer was handed to the bank. Still not paid. */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canApprovePayouts");
  if (!guard.ok) return guard.response;

  const { payoutId } = await context.params;

  return payoutResponse(
    await markAuthorPayoutProcessing({
      payoutId,
      actorUserId: guard.actor.userId,
      correlationId: `admin-payout-processing:${randomUUID()}`,
    }),
  );
}
