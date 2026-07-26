import { NextResponse } from "next/server";

import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import { createAuthorLedgerManualAdjustment } from "@/lib/payments/author-finance/finance-rpc";

export const dynamic = "force-dynamic";

/**
 * Appends a compensating entry. The ledger is append-only, so a correction is
 * a new row with its own reason — nothing in history is ever rewritten.
 */
export async function POST(request: Request) {
  const guard = await requireAuthorFinanceCapability("canManageAdjustments");
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const authorId = typeof body.authorId === "string" ? body.authorId : null;
  const amountMinor = Number(body.amountMinor);
  const reasonCode =
    typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";

  if (!authorId || !idempotencyKey) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!Number.isInteger(amountMinor) || amountMinor === 0) {
    return NextResponse.json(
      { error: "amount_must_be_nonzero" },
      { status: 400 },
    );
  }

  if (reasonCode === "") {
    return NextResponse.json({ error: "reason_code_required" }, { status: 400 });
  }

  const result = await createAuthorLedgerManualAdjustment({
    authorId,
    amountMinor,
    reasonCode,
    idempotencyKey,
    notes:
      typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
    currency: typeof body.currency === "string" ? body.currency : "RUB",
    effectiveAt: typeof body.effectiveAt === "string" ? body.effectiveAt : null,
    actorUserId: guard.actor.userId,
    correlationId: `admin-adjustment:${idempotencyKey}`,
  });

  if (!result.ok) {
    const status = result.resultCode === "author_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.resultCode }, { status });
  }

  return NextResponse.json(
    { outcome: result.outcome, entry: result.entry },
    { headers: { "Cache-Control": "no-store" } },
  );
}
