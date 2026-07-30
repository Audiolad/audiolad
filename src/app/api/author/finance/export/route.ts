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
import {
  buildAuthorSalesCsv,
  buildAuthorSalesExportFilename,
} from "@/lib/author-sales/csv";
import { getAuthorSalesList } from "@/lib/author-sales/queries";
import {
  isAuthorSaleAccrualStatus,
  isAuthorSalePayoutStatus,
} from "@/lib/author-sales/types";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

const EXPORT_ROW_LIMIT = 5000;

/**
 * The export re-runs ownership and re-queries the rows server-side. It never
 * accepts rows from the client: a CSV is the easiest place to smuggle a field
 * or another author's line into, so nothing the browser sends is echoed back.
 */
type SalesExportDependencies = {
  requireAccess: typeof requireAuthorFinanceAccess;
  getSalesList: typeof getAuthorSalesList;
};

export function createAuthorFinanceExportHandler(
  dependencies: SalesExportDependencies = {
    requireAccess: requireAuthorFinanceAccess,
    getSalesList: getAuthorSalesList,
  },
) {
  return async function GET(request: Request) {
  try {
    const { authorId } = await dependencies.requireAccess(request);
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

    const productSlug = url.searchParams.get("product_slug");
    const accrualRaw = url.searchParams.get("accrual_status");
    const payoutRaw = url.searchParams.get("payout_status");

    let body: string;
    let filename: string;

    if (kindParam === "sales") {
      const list = await dependencies.getSalesList({
        authorId,
        from: range.from,
        to: range.to,
        productSlug,
        accrualStatus: isAuthorSaleAccrualStatus(accrualRaw)
          ? accrualRaw
          : null,
        payoutStatus: isAuthorSalePayoutStatus(payoutRaw) ? payoutRaw : null,
        limit: EXPORT_ROW_LIMIT,
        offset: 0,
      });
      body = buildAuthorSalesCsv(list.rows);
      filename = buildAuthorSalesExportFilename();
    } else if (kindParam === "ledger") {
      body = `\uFEFF${buildAuthorFinanceLedgerCsv(
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
      )}`;
      filename = buildAuthorFinanceExportFilename(kindParam);
    } else {
      body = `\uFEFF${buildAuthorFinancePayoutsCsv(
        (
          await getAuthorFinancePayouts({
            authorId,
            from: range.from,
            to: range.to,
            status: url.searchParams.get("status"),
            limit: EXPORT_ROW_LIMIT,
          })
        ).rows,
      )}`;
      filename = buildAuthorFinanceExportFilename(kindParam);
    }

    return new NextResponse(body, {
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
  };
}

export const GET = createAuthorFinanceExportHandler();
