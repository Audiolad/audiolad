import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireRefundsManageActor } from "@/lib/admin/refunds-route-guard";
import { reconcileRefundWithProvider } from "@/lib/payments/refunds/webhook-refunds";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ refundId: string }>;
};

/** Polls the provider operation and applies the resulting refund status. */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireRefundsManageActor();
  if (!guard.ok) return guard.response;

  const { refundId } = await context.params;

  const result = await reconcileRefundWithProvider({
    refundId,
    correlationId: `admin-reconcile:${randomUUID()}`,
    actorUserId: guard.actor.userId,
  });

  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "refund_not_found" }, { status: 404 });
  }

  if (result.outcome === "provider_unavailable") {
    return NextResponse.json(
      { error: "provider_status_unavailable" },
      { status: 502 },
    );
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "reconcile_failed" },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      outcome: result.outcome,
      providerStatus: result.providerStatus,
      refund: result.rpc?.refund ?? null,
      settlement: result.rpc?.settlement ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
