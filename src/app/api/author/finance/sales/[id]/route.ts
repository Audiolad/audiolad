import { NextResponse } from "next/server";

import { requireAuthorFinanceAccess } from "@/lib/author-finance/route-guard";
import { getAuthorSaleDetail } from "@/lib/author-sales/queries";
import { AuthorAccessError } from "@/lib/author-products/auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SalesDetailDependencies = {
  requireAccess: typeof requireAuthorFinanceAccess;
  getSaleDetail: typeof getAuthorSaleDetail;
};

export function createAuthorFinanceSalesDetailHandler(
  dependencies: SalesDetailDependencies = {
    requireAccess: requireAuthorFinanceAccess,
    getSaleDetail: getAuthorSaleDetail,
  },
) {
  return async function GET(request: Request, context: RouteContext) {
  try {
    const { authorId } = await dependencies.requireAccess(request);
    const { id } = await context.params;
    const saleId = id?.trim() ?? "";

    if (!UUID_PATTERN.test(saleId)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const detail = await dependencies.getSaleDetail({ authorId, saleId });
    if (!detail) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ detail });
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("author_finance_sales_detail_route_error");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  };
}

export const GET = createAuthorFinanceSalesDetailHandler();
