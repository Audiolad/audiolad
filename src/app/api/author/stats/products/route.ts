import { NextResponse } from "next/server";

import { loadAuthorAppreciationCabinetFacts } from "@/lib/author-finance/appreciation-queries";
import { attachAppreciationToProducts } from "@/lib/author-stats/appreciation";
import { getAuthorStatsProducts } from "@/lib/author-stats/queries";
import { requireAuthorStatsAccess } from "@/lib/author-stats/route-guard";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { authorId, period, dateFrom, dateTo } =
      await requireAuthorStatsAccess(request);

    const [products, facts] = await Promise.all([
      getAuthorStatsProducts({
        authorId,
        dateFrom,
        dateTo,
      }),
      loadAuthorAppreciationCabinetFacts({ authorId }),
    ]);

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
      {
        period,
        products: attachAppreciationToProducts(products, facts, {
          from: dateFrom,
          to: dateTo,
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
