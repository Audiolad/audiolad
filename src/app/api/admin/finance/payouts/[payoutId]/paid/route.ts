import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import {
  payoutResponse,
  readJsonBody,
  trimmedString,
} from "@/lib/admin/author-payout-route-helpers";
import { markAuthorPayoutPaid } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ payoutId: string }>;
};

/**
 * The one irreversible step: it writes the negative ledger row. It therefore
 * demands the bank reference of a transfer that already happened — this
 * endpoint never moves money itself.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canMarkPayoutsPaid");
  if (!guard.ok) return guard.response;

  const { payoutId } = await context.params;
  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const externalReference = trimmedString(body.externalReference, 200);
  if (externalReference === "") {
    return NextResponse.json(
      { error: "external_reference_required" },
      { status: 400 },
    );
  }

  const paidAt = typeof body.paidAt === "string" ? body.paidAt : null;
  if (paidAt !== null && Number.isNaN(new Date(paidAt).getTime())) {
    return NextResponse.json({ error: "invalid_paid_at" }, { status: 400 });
  }

  return payoutResponse(
    await markAuthorPayoutPaid({
      payoutId,
      externalReference,
      paidAt,
      actorUserId: guard.actor.userId,
      correlationId: `admin-payout-paid:${payoutId}:${externalReference}`,
    }),
  );
}
