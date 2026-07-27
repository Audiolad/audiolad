import { NextResponse } from "next/server";

import { getAdminAuthorPayoutDetail } from "@/lib/admin/analytics-author-payout-queries";
import { requireAuthorFinanceCapability } from "@/lib/admin/author-finance-route-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ payoutId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAuthorFinanceCapability("canViewPayouts");
  if (!guard.ok) return guard.response;

  const { payoutId } = await context.params;
  const detail = await getAdminAuthorPayoutDetail(payoutId);

  if (!detail.found) {
    return NextResponse.json({ error: "payout_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { ...detail, capabilities: guard.capabilities },
    { headers: { "Cache-Control": "no-store" } },
  );
}
