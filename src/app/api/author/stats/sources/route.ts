import { NextResponse } from "next/server";

import { getAuthorStatsSources } from "@/lib/author-stats/queries";
import { requireAuthorStatsAccess } from "@/lib/author-stats/route-guard";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { authorId, period, dateFrom, dateTo } =
      await requireAuthorStatsAccess(request);

    const sources = await getAuthorStatsSources({
      authorId,
      dateFrom,
      dateTo,
    });

    if (!sources) {
      return NextResponse.json(
        { error: "internal_error" },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { period, sources },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
