import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import { approveAuthorCommercialTerms } from "@/lib/payments/author-finance/terms-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ termsId: string }>;
};

/** Turns a draft into the rate accruals will actually use. */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canManageTerms");
  if (!guard.ok) return guard.response;

  const { termsId } = await context.params;

  const result = await approveAuthorCommercialTerms({
    termsId,
    actorUserId: guard.actor.userId,
    correlationId: `admin-terms-approve:${randomUUID()}`,
  });

  if (!result.ok) {
    const status =
      result.error === "terms_not_found"
        ? 404
        : result.error === "author_commercial_terms_overlap"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    {
      outcome: result.outcome,
      terms: result.terms,
      idempotentReplay: result.idempotentReplay,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
