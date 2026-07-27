import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import {
  payoutResponse,
  readJsonBody,
  trimmedString,
} from "@/lib/admin/author-payout-route-helpers";
import { markAuthorPayoutFailed } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ payoutId: string }>;
};

/**
 * `release` is for a bank rejection we are sure about — the reservation goes
 * back to the author. `review` is for an unknown outcome: the money stays
 * reserved so we cannot pay it twice while we find out what happened.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canManagePayouts");
  if (!guard.ok) return guard.response;

  const { payoutId } = await context.params;
  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const failureCode = trimmedString(body.failureCode, 100);
  if (failureCode === "") {
    return NextResponse.json(
      { error: "failure_code_required" },
      { status: 400 },
    );
  }

  const mode = body.mode === "review" ? "review" : "release";

  return payoutResponse(
    await markAuthorPayoutFailed({
      payoutId,
      failureCode,
      failureReason: trimmedString(body.failureReason) || null,
      mode,
      actorUserId: guard.actor.userId,
      correlationId: `admin-payout-failed:${randomUUID()}`,
    }),
  );
}
