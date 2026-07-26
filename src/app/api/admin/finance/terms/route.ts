import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getAdminAuthorTerms } from "@/lib/admin/analytics-author-finance-queries";
import {
  requireAuthorFinanceCapability,
  requireAuthorFinanceViewActor,
} from "@/lib/admin/author-finance-route-guard";
import { createAuthorCommercialTermsDraft } from "@/lib/payments/author-finance/terms-rpc";
import { isValidHoldDays, isValidShareBps } from "@/lib/payments/author-finance/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireAuthorFinanceViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const terms = await getAdminAuthorTerms({
    authorId: url.searchParams.get("authorId"),
  });

  return NextResponse.json(
    { terms, capabilities: guard.capabilities },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Creates a terms version. Approving on creation is allowed for owner/finance. */
export async function POST(request: Request) {
  const guard = await requireAuthorFinanceCapability("canManageTerms");
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const authorId = typeof body.authorId === "string" ? body.authorId : null;
  const authorShareBps = Number(body.authorShareBps);
  const holdDays = body.holdDays === undefined ? 14 : Number(body.holdDays);
  const validFrom =
    typeof body.validFrom === "string" && body.validFrom.trim() !== ""
      ? body.validFrom
      : null;

  if (!authorId || !validFrom) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!isValidShareBps(authorShareBps)) {
    return NextResponse.json(
      { error: "invalid_author_share_bps" },
      { status: 400 },
    );
  }

  if (!isValidHoldDays(holdDays)) {
    return NextResponse.json({ error: "invalid_hold_days" }, { status: 400 });
  }

  const result = await createAuthorCommercialTermsDraft({
    authorId,
    authorShareBps,
    validFrom,
    validTo: typeof body.validTo === "string" ? body.validTo : null,
    holdDays,
    currency: typeof body.currency === "string" ? body.currency : "RUB",
    notes:
      typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
    actorUserId: guard.actor.userId,
    correlationId: `admin-terms:${randomUUID()}`,
    approveImmediately: body.approveImmediately === true,
  });

  if (!result.ok) {
    const status =
      result.error === "author_not_found"
        ? 404
        : result.error === "author_commercial_terms_overlap"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { outcome: result.outcome, terms: result.terms, status: result.status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
