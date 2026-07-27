import { NextResponse } from "next/server";

import {
  getAdminAuthorPayoutCandidates,
  getAdminAuthorPayoutIntegrity,
  getAdminAuthorPayoutList,
  getAdminAuthorPayoutSummary,
} from "@/lib/admin/analytics-author-payout-queries";
import { parseAdminAnalyticsUrlState } from "@/lib/admin/analytics-url-state";
import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";
import { createAuthorPayoutDraft } from "@/lib/payments/author-finance/payout-rpc";

export const dynamic = "force-dynamic";

function parseOffset(value: string | null): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function GET(request: Request) {
  const guard = await requireAuthorFinanceCapability("canViewPayouts");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const state = parseAdminAnalyticsUrlState(url.searchParams);

  try {
    const [summary, payouts, candidates, integrity] = await Promise.all([
      getAdminAuthorPayoutSummary({
        period: state.moneyPeriod,
        includeTest: state.includeTestPayments,
      }),
      getAdminAuthorPayoutList({
        period: state.moneyPeriod,
        includeTest: state.includeTestPayments,
        status: state.payoutStatus,
        authorId: state.authorEconomyAuthorId,
        search: state.authorEconomyQ,
        limit: 50,
        offset: parseOffset(url.searchParams.get("payoutsOffset")),
      }),
      getAdminAuthorPayoutCandidates({
        includeTest: state.includeTestPayments,
        search: state.authorEconomyQ,
        limit: 50,
        offset: parseOffset(url.searchParams.get("candidatesOffset")),
      }),
      getAdminAuthorPayoutIntegrity({
        includeTest: state.includeTestPayments,
      }),
    ]);

    return NextResponse.json(
      {
        summary,
        payouts,
        candidates,
        integrity,
        capabilities: guard.capabilities,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "admin_author_payouts_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * Creates a draft and reserves the money. The body may narrow the amount for a
 * partial payout, but it can never widen it: the server recomputes capacity.
 */
export async function POST(request: Request) {
  const guard = await requireAuthorFinanceCapability("canCreatePayouts");
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const authorId = typeof body.authorId === "string" ? body.authorId : null;
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";

  if (!authorId || idempotencyKey === "") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const desiredRaw = body.desiredAmountMinor;
  let desiredAmountMinor: number | null = null;
  if (desiredRaw !== null && desiredRaw !== undefined && desiredRaw !== "") {
    const parsed = Number(desiredRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: "invalid_payout_amount" },
        { status: 400 },
      );
    }
    desiredAmountMinor = parsed;
  }

  const allowBelowMinimum = body.allowBelowMinimum === true;
  const overrideReason =
    typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";

  // Overriding the minimum is a decision someone signs for, not a toggle.
  if (allowBelowMinimum) {
    if (!guard.capabilities.canManagePayouts) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (overrideReason === "") {
      return NextResponse.json(
        { error: "override_reason_required" },
        { status: 400 },
      );
    }
  }

  const result = await createAuthorPayoutDraft({
    authorId,
    idempotencyKey,
    cutoff: typeof body.cutoff === "string" ? body.cutoff : null,
    desiredAmountMinor,
    allowBelowMinimum,
    overrideReason: overrideReason || null,
    notes:
      typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
    includeTest: body.includeTest === true,
    actorUserId: guard.actor.userId,
    correlationId: `admin-payout-draft:${idempotencyKey}`,
  });

  if (!result.ok) {
    const status = result.error === "author_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    {
      outcome: result.outcome,
      payout: result.payout,
      allocationCount: result.allocationCount,
      allocatedMinor: result.allocatedMinor,
      capacityMinor: result.capacityMinor,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
