import { NextResponse } from "next/server";

import {
  getAdminAuthorFinanceAuthors,
  getAdminAuthorFinanceLedger,
  getAdminAuthorFinanceSummary,
  getAdminAuthorTerms,
} from "@/lib/admin/analytics-author-finance-queries";
import { parseAdminAnalyticsUrlState } from "@/lib/admin/analytics-url-state";
import { requireAuthorFinanceViewActor } from "@/lib/admin/author-finance-route-guard";

export const dynamic = "force-dynamic";

function parseOffset(value: string | null): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function GET(request: Request) {
  const guard = await requireAuthorFinanceViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const state = parseAdminAnalyticsUrlState(url.searchParams);
  const authorsOffset = parseOffset(url.searchParams.get("authorsOffset"));
  const ledgerOffset = parseOffset(url.searchParams.get("ledgerOffset"));

  try {
    const [summary, authors, ledger, terms] = await Promise.all([
      getAdminAuthorFinanceSummary({
        period: state.moneyPeriod,
        includeTest: state.includeTestPayments,
      }),
      getAdminAuthorFinanceAuthors({
        period: state.moneyPeriod,
        includeTest: state.includeTestPayments,
        search: state.authorEconomyQ,
        limit: 50,
        offset: authorsOffset,
      }),
      getAdminAuthorFinanceLedger({
        period: state.moneyPeriod,
        includeTest: state.includeTestPayments,
        authorId: state.authorEconomyAuthorId,
        entryType: state.authorEconomyEntryType,
        search: state.authorEconomyQ,
        limit: 50,
        offset: ledgerOffset,
      }),
      getAdminAuthorTerms({ authorId: state.authorEconomyAuthorId }),
    ]);

    return NextResponse.json(
      {
        summary,
        authors,
        ledger,
        terms,
        capabilities: guard.capabilities,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "admin_author_finance_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
