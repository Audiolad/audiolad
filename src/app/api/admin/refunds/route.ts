import { NextResponse } from "next/server";

import {
  getAdminPaymentSettlement,
  getAdminRefundList,
  getAdminRefundSummary,
} from "@/lib/admin/analytics-refunds-queries";
import { parseAdminAnalyticsUrlState } from "@/lib/admin/analytics-url-state";
import { requireRefundsViewActor } from "@/lib/admin/refunds-route-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireRefundsViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const state = parseAdminAnalyticsUrlState(url.searchParams);
  const paymentId = url.searchParams.get("paymentId");
  const offset = Number.parseInt(url.searchParams.get("refundsOffset") ?? "0", 10);

  try {
    const [summary, list, settlement] = await Promise.all([
      getAdminRefundSummary({
        period: state.moneyPeriod,
        includeTest: state.includeTestPayments,
      }),
      getAdminRefundList({
        period: state.moneyPeriod,
        includeTest: state.includeTestPayments,
        status: state.refundsStatus,
        paymentId,
        search: state.refundsQ,
        limit: 50,
        offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
      }),
      paymentId ? getAdminPaymentSettlement(paymentId) : Promise.resolve(null),
    ]);

    return NextResponse.json(
      { summary, list, paymentSettlement: settlement, canManage: guard.canManage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "admin_refunds_route_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
