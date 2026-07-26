import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireRefundsManageActor } from "@/lib/admin/refunds-route-guard";
import { cancelPaymentRefundRequest } from "@/lib/payments/refunds/refund-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ refundId: string }>;
};

/** Releases the reserve of a refund the provider has not seen yet. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireRefundsManageActor();
  if (!guard.ok) return guard.response;

  const { refundId } = await context.params;

  let reasonText: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.reasonText === "string" && body.reasonText.trim() !== "") {
      reasonText = body.reasonText.trim().slice(0, 1000);
    }
  } catch {
    reasonText = null;
  }

  const result = await cancelPaymentRefundRequest({
    refundId,
    reasonText,
    actorUserId: guard.actor.userId,
    correlationId: `admin-cancel:${randomUUID()}`,
  });

  if (result.error === "refund_not_found") {
    return NextResponse.json({ error: "refund_not_found" }, { status: 404 });
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? "refund_not_cancellable",
        fromStatus: result.fromStatus,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      outcome: result.outcome,
      refund: result.refund,
      settlement: result.settlement,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
