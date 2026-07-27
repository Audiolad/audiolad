import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import {
  payoutResponse,
  readJsonBody,
  trimmedString,
} from "@/lib/admin/author-payout-route-helpers";
import { reverseAuthorPayout } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ payoutId: string }>;
};

/**
 * Full reversal only: the whole transfer came back. A partially returned
 * transfer is handled with a P3.3.2 manual adjustment instead, so the payout
 * document keeps matching exactly one bank movement.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canReversePayouts");
  if (!guard.ok) return guard.response;

  const { payoutId } = await context.params;
  const body = await readJsonBody(request);
  const reason = body ? trimmedString(body.reason) : "";

  if (reason === "") {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const effectiveAt =
    body && typeof body.effectiveAt === "string" ? body.effectiveAt : null;
  if (effectiveAt !== null && Number.isNaN(new Date(effectiveAt).getTime())) {
    return NextResponse.json({ error: "invalid_effective_at" }, { status: 400 });
  }

  return payoutResponse(
    await reverseAuthorPayout({
      payoutId,
      reason,
      effectiveAt,
      actorUserId: guard.actor.userId,
      correlationId: `admin-payout-reverse:${payoutId}`,
    }),
  );
}
