import { NextResponse } from "next/server";

import {
  buildAuthorAppreciationCsv,
  buildAuthorFinanceExportFilename,
  buildAuthorFinanceLedgerCsv,
  buildAuthorFinancePayoutsCsv,
  isAuthorFinanceExportKind,
} from "@/lib/author-finance/csv";
import {
  getAuthorFinanceLedger,
  getAuthorFinancePayouts,
} from "@/lib/author-finance/queries";
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
  buildAuthorSalesCsv,
  buildAuthorSalesExportFilename,
} from "@/lib/author-sales/csv";
import {
  getAuthorSaleDetail,
  getAuthorSalesList,
  getAuthorSalesProductOptions,
} from "@/lib/author-sales/queries";
import {
  isAuthorSaleAccrualStatus,
  isAuthorSalePayoutStatus,
} from "@/lib/author-sales/types";
import {
  AuthorAccessError,
  handleAuthorRouteError,
} from "@/lib/author-products/auth";

const EXPORT_ROW_LIMIT = 5000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AppreciationListFn = (input: {
  authorId: string;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}) => Promise<{
  summary: unknown;
  total: number;
  limit: number;
  offset: number;
  rows: Array<{
    id: string;
    createdAt: string;
    paidAt: string | null;
    surface: "author" | "product";
    sourceTitle: string;
    grossAmountMinor: number;
    authorAccruedMinor: number | null;
    currency: string;
    financeStatus: "processing" | "held" | "available" | "reserved" | "paid";
    availableAt: string | null;
  }>;
}>;

type SalesExportDependencies = {
  requireAccess: typeof requireAuthorFinanceAccess;
  getSalesList: typeof getAuthorSalesList;
  getAppreciationList?: AppreciationListFn;
};

type SalesListDependencies = {
  requireAccess: typeof requireAuthorFinanceAccess;
  getSalesList: typeof getAuthorSalesList;
  getProductOptions: typeof getAuthorSalesProductOptions;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SalesDetailDependencies = {
  requireAccess: typeof requireAuthorFinanceAccess;
  getSaleDetail: typeof getAuthorSaleDetail;
};

type AppreciationListDependencies = {
  requireAccess: typeof requireAuthorFinanceAccess;
  getAppreciationList: AppreciationListFn;
};

async function loadAuthorAppreciationFinanceList() {
  const { getAuthorAppreciationFinanceList } = await import(
    "@/lib/author-finance/appreciation-queries"
  );
  return getAuthorAppreciationFinanceList;
}

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
      } else if (kindParam === "appreciation") {
        const getAppreciationList =
          dependencies.getAppreciationList ??
          (await loadAuthorAppreciationFinanceList());
        const list = await getAppreciationList({
          authorId,
          from: range.from,
          to: range.to,
          limit: EXPORT_ROW_LIMIT,
          offset: 0,
        });
        body = `\uFEFF${buildAuthorAppreciationCsv(list.rows)}`;
        filename = buildAuthorFinanceExportFilename(kindParam);
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

export function createAuthorFinanceAppreciationListHandler(
  dependencies: Partial<AppreciationListDependencies> = {},
) {
  return async function GET(request: Request) {
    try {
      const requireAccess =
        dependencies.requireAccess ?? requireAuthorFinanceAccess;
      const { authorId } = await requireAccess(request);
      const url = new URL(request.url);
      const periodRaw = url.searchParams.get("period") ?? "all";
      const period = isAuthorFinancePeriod(periodRaw) ? periodRaw : "all";
      const range = resolveAuthorFinancePeriodRange(period, {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });

      const getAppreciationList =
        dependencies.getAppreciationList ??
        (await loadAuthorAppreciationFinanceList());
      const list = await getAppreciationList({
        authorId,
        from: range.from,
        to: range.to,
        limit: parsePositiveInt(url.searchParams.get("limit"), 100, 200),
        offset: parseOffset(url.searchParams.get("offset")),
      });

      return NextResponse.json({
        summary: list.summary,
        total: list.total,
        limit: list.limit,
        offset: list.offset,
        rows: list.rows,
        period,
      });
    } catch (error) {
      return handleAuthorRouteError(error);
    }
  };
}

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
      const payoutStatus = isAuthorSalePayoutStatus(payoutRaw)
        ? payoutRaw
        : null;

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
