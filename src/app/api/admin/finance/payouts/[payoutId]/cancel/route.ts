import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import {
  payoutResponse,
  readJsonBody,
  trimmedString,
} from "@/lib/admin/author-payout-route-helpers";
import { cancelAuthorPayout } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ payoutId: string }>;
};

/** Only before the transfer: cancelling gives the reservation back. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canManagePayouts");
  if (!guard.ok) return guard.response;

  const { payoutId } = await context.params;
  const body = await readJsonBody(request);

  return payoutResponse(
    await cancelAuthorPayout({
      payoutId,
      reason: body ? trimmedString(body.reason) || null : null,
      actorUserId: guard.actor.userId,
      correlationId: `admin-payout-cancel:${randomUUID()}`,
    }),
  );
}
