import { NextResponse } from "next/server";

import {
  parseOffset,
  parsePositiveInt,
  requireAuthorFinanceAccess,
} from "@/lib/author-finance/route-guard";
import {
  isAuthorFinancePeriod,
  resolveAuthorFinancePeriodRange,
} from "@/lib/author-finance/types";
import {
  getAuthorSalesList,
  getAuthorSalesProductOptions,
} from "@/lib/author-sales/queries";
import {
  isAuthorSaleAccrualStatus,
  isAuthorSalePayoutStatus,
} from "@/lib/author-sales/types";
import { AuthorAccessError } from "@/lib/author-products/auth";

type SalesListDependencies = {
  requireAccess: typeof requireAuthorFinanceAccess;
  getSalesList: typeof getAuthorSalesList;
  getProductOptions: typeof getAuthorSalesProductOptions;
};

export function createAuthorFinanceSalesListHandler(
  dependencies: SalesListDependencies = {
    requireAccess: requireAuthorFinanceAccess,
    getSalesList: getAuthorSalesList,
    getProductOptions: getAuthorSalesProductOptions,
  },
) {
  return async function GET(request: Request) {
  try {
    const { authorId } = await dependencies.requireAccess(request);
    const url = new URL(request.url);
    const periodRaw = url.searchParams.get("period") ?? "all";
    const period = isAuthorFinancePeriod(periodRaw) ? periodRaw : "all";
    const range = resolveAuthorFinancePeriodRange(period, {
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    const productSlug = url.searchParams.get("product_slug")?.trim() || null;

    const accrualRaw = url.searchParams.get("accrual_status")?.trim() ?? "";
    const accrualStatus = isAuthorSaleAccrualStatus(accrualRaw)
      ? accrualRaw
      : null;

    const payoutRaw = url.searchParams.get("payout_status")?.trim() ?? "";
    const payoutStatus = isAuthorSalePayoutStatus(payoutRaw) ? payoutRaw : null;

    const [list, products] = await Promise.all([
      dependencies.getSalesList({
        authorId,
        from: range.from,
        to: range.to,
        productSlug,
        accrualStatus,
        payoutStatus,
        limit: parsePositiveInt(url.searchParams.get("limit"), 50, 200),
        offset: parseOffset(url.searchParams.get("offset")),
      }),
      dependencies.getProductOptions(authorId),
    ]);

    return NextResponse.json({
      total: list.total,
      limit: list.limit,
      offset: list.offset,
      rows: list.rows,
      products,
      period,
    });
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("author_finance_sales_list_route_error");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  };
}

export const GET = createAuthorFinanceSalesListHandler();
