import { NextResponse } from "next/server";

import { getAdminAuthorFinanceDryRun } from "@/lib/admin/analytics-author-finance-queries";
import { parseAdminAnalyticsUrlState } from "@/lib/admin/analytics-url-state";
import { requireAuthorFinanceViewActor } from "@/lib/admin/author-finance-route-guard";

export const dynamic = "force-dynamic";

/**
 * Read-only preview of what a historical backfill would propose.
 * P3.3.2 performs no backfill: this endpoint exists so the decision can be
 * made with numbers instead of guesses, and it never writes.
 */
export async function GET(request: Request) {
  const guard = await requireAuthorFinanceViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const state = parseAdminAnalyticsUrlState(url.searchParams);

  try {
    const dryRun = await getAdminAuthorFinanceDryRun({
      period: state.moneyPeriod,
      includeTest: state.includeTestPayments,
      limit: 200,
    });

    if (!dryRun) {
      return NextResponse.json({ error: "dry_run_failed" }, { status: 500 });
    }

    return NextResponse.json(
      { dryRun },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "admin_author_finance_dry_run_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
