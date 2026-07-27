import { NextResponse } from "next/server";

import type { AuthorPayoutRpcResult } from "@/lib/payments/author-finance/payout-rpc";

/** Validation codes are our own; anything else stays a generic 400. */
export function payoutErrorStatus(code: string | null): number {
  if (code === "payout_not_found" || code === "author_not_found") return 404;
  if (code === "invalid_payout_transition") return 409;
  if (code === "payout_underfunded") return 409;
  return 400;
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function payoutResponse(result: AuthorPayoutRpcResult): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: payoutErrorStatus(result.error) },
    );
  }

  return NextResponse.json(
    {
      outcome: result.outcome,
      payout: result.payout,
      releasedAllocations: result.releasedAllocations,
      reservationKept: result.reservationKept,
      ledgerEntryId: result.ledgerEntryId,
      reversalLedgerEntryId: result.reversalLedgerEntryId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function trimmedString(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
