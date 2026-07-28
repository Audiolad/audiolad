import { NextResponse } from "next/server";

import { getAuthorStatsProducts } from "@/lib/author-stats/queries";
import { requireAuthorStatsAccess } from "@/lib/author-stats/route-guard";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { authorId, period, dateFrom, dateTo } =
      await requireAuthorStatsAccess(request);

    const products = await getAuthorStatsProducts({
      authorId,
      dateFrom,
      dateTo,
    });

    if (!products) {
      return NextResponse.json(
        { error: "internal_error" },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { period, products },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
