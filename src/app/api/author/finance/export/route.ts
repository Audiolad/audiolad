import { NextResponse } from "next/server";

import {
  buildAuthorFinanceExportFilename,
  buildAuthorFinanceLedgerCsv,
  buildAuthorFinancePayoutsCsv,
  isAuthorFinanceExportKind,
} from "@/lib/author-finance/csv";
import {
  getAuthorFinanceLedger,
  getAuthorFinancePayouts,
} from "@/lib/author-finance/queries";
import { requireAuthorFinanceAccess } from "@/lib/author-finance/route-guard";
import {
  isAuthorFinancePeriod,
  resolveAuthorFinancePeriodRange,
} from "@/lib/author-finance/types";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

const EXPORT_ROW_LIMIT = 5000;

/**
 * The export re-runs ownership and re-queries the rows server-side. It never
 * accepts rows from the client: a CSV is the easiest place to smuggle a field
 * or another author's line into, so nothing the browser sends is echoed back.
 */
export async function GET(request: Request) {
  try {
    const { authorId } = await requireAuthorFinanceAccess(request);
    const url = new URL(request.url);

    const kindParam = url.searchParams.get("kind");
    if (!isAuthorFinanceExportKind(kindParam)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const periodParam = url.searchParams.get("period");
    const range = resolveAuthorFinancePeriodRange(
      isAuthorFinancePeriod(periodParam) ? periodParam : "all",
      {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      },
    );

    const csv =
      kindParam === "ledger"
        ? buildAuthorFinanceLedgerCsv(
            (
              await getAuthorFinanceLedger({
                authorId,
                from: range.from,
                to: range.to,
                type: url.searchParams.get("type"),
                search: url.searchParams.get("search"),
                limit: EXPORT_ROW_LIMIT,
              })
            ).rows,
          )
        : buildAuthorFinancePayoutsCsv(
            (
              await getAuthorFinancePayouts({
                authorId,
                from: range.from,
                to: range.to,
                status: url.searchParams.get("status"),
                limit: EXPORT_ROW_LIMIT,
              })
            ).rows,
          );

    const filename = buildAuthorFinanceExportFilename(kindParam);

    // The BOM is what makes Excel on Windows read Cyrillic correctly.
    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
