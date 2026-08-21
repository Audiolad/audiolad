import { NextResponse } from "next/server";

import { getAdminSale, listAdminSales } from "@/lib/admin/sales-queries";
import type { requireAdminSalesViewActor } from "@/lib/admin/sales-route-guard";
import type { AdminSaleDetail, AdminSalesPageData } from "@/lib/admin/sales";

type SalesGuard = typeof requireAdminSalesViewActor;

export function createAdminSalesListHandler(deps: {
  requireAccess: SalesGuard;
  listSales?: typeof listAdminSales;
}) {
  const listSales = deps.listSales ?? listAdminSales;

  return async function GET(request: Request) {
    const guard = await deps.requireAccess();
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);

    try {
      const data: AdminSalesPageData = await listSales({
        page: Number.isFinite(page) ? page : 1,
      });

      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.error(
        "admin_sales_list_route_error",
        error instanceof Error ? error.message : "unknown",
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  };
}

export function createAdminSalesDetailHandler(deps: {
  requireAccess: SalesGuard;
  getSale?: typeof getAdminSale;
}) {
  const getSale = deps.getSale ?? getAdminSale;

  return async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const guard = await deps.requireAccess();
    if (!guard.ok) return guard.response;

    const { id } = await context.params;

    try {
      const sale: AdminSaleDetail | null = await getSale(id);

      if (!sale) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }

      return NextResponse.json(sale, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.error(
        "admin_sales_detail_route_error",
        error instanceof Error ? error.message : "unknown",
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  };
}
