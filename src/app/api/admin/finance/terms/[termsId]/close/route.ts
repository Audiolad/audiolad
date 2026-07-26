import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import { closeAuthorCommercialTerms } from "@/lib/payments/author-finance/terms-rpc";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ termsId: string }>;
};

/**
 * Ends a terms period. Approved rows are otherwise immutable, so this is the
 * only way to stop a rate — and entries already written keep their historic
 * share.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canManageTerms");
  if (!guard.ok) return guard.response;

  const { termsId } = await context.params;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const validTo =
    typeof body.validTo === "string" && body.validTo.trim() !== ""
      ? body.validTo
      : new Date().toISOString();
  const newStatus = body.newStatus === "cancelled" ? "cancelled" : "superseded";

  const result = await closeAuthorCommercialTerms({
    termsId,
    validTo,
    reason:
      typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : null,
    actorUserId: guard.actor.userId,
    correlationId: `admin-terms-close:${randomUUID()}`,
    newStatus,
  });

  if (!result.ok) {
    const status = result.error === "terms_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { outcome: result.outcome, terms: result.terms, status: result.status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
