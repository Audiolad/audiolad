import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import { readJsonBody } from "@/lib/admin/author-payout-route-helpers";
import { reconcileAuthorPayouts } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

/**
 * Finds payouts whose reservation no longer fits the balance. Reporting is
 * free; applying only moves them to review and never touches the ledger.
 */
export async function POST(request: Request) {
  const guard = await requireAuthorFinanceCapability("canManagePayouts");
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);

  const result = await reconcileAuthorPayouts({
    includeTest: body?.includeTest === true,
    apply: body?.apply === true,
    actorUserId: guard.actor.userId,
    correlationId: `admin-payout-reconcile:${randomUUID()}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
