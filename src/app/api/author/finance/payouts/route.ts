import { NextResponse } from "next/server";

import { getAuthorFinancePayouts } from "@/lib/author-finance/queries";
import {
  parseOffset,
  parsePositiveInt,
  requireAuthorFinanceAccess,
} from "@/lib/author-finance/route-guard";
import {
  isAuthorFinancePeriod,
  resolveAuthorFinancePeriodRange,
} from "@/lib/author-finance/types";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { authorId } = await requireAuthorFinanceAccess(request);
    const url = new URL(request.url);

    const periodParam = url.searchParams.get("period");
    const range = resolveAuthorFinancePeriodRange(
      isAuthorFinancePeriod(periodParam) ? periodParam : "all",
      {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      },
    );

    const payouts = await getAuthorFinancePayouts({
      authorId,
      from: range.from,
      to: range.to,
      status: url.searchParams.get("status"),
      limit: parsePositiveInt(url.searchParams.get("limit"), 50, 200),
      offset: parseOffset(url.searchParams.get("offset")),
    });

    return NextResponse.json({ ...payouts, period: range.period });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
