import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import {
  payoutResponse,
  readJsonBody,
  trimmedString,
} from "@/lib/admin/author-payout-route-helpers";
import { markAuthorPayoutRequiresReview } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ payoutId: string }>;
};

/** Parks a payout without releasing its reservation. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canManagePayouts");
  if (!guard.ok) return guard.response;

  const { payoutId } = await context.params;
  const body = await readJsonBody(request);
  const reason = body ? trimmedString(body.reason) : "";

  if (reason === "") {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  return payoutResponse(
    await markAuthorPayoutRequiresReview({
      payoutId,
      reason,
      actorUserId: guard.actor.userId,
      correlationId: `admin-payout-review:${randomUUID()}`,
    }),
  );
}
