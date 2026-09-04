import { NextResponse } from "next/server";

import { loadAuthorAppreciationCabinetFacts } from "@/lib/author-finance/appreciation-queries";
import {
  attachAppreciationToSummary,
  summarizeAppreciationStats,
} from "@/lib/author-stats/appreciation";
import { getAuthorStatsSummary } from "@/lib/author-stats/queries";
import { requireAuthorStatsAccess } from "@/lib/author-stats/route-guard";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { authorId, period, dateFrom, dateTo } =
      await requireAuthorStatsAccess(request);

    const [summary, facts] = await Promise.all([
      getAuthorStatsSummary({
        authorId,
        dateFrom,
        dateTo,
      }),
      loadAuthorAppreciationCabinetFacts({ authorId }),
    ]);

    if (!summary) {
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
        summary: attachAppreciationToSummary(
          summary,
          summarizeAppreciationStats(facts, { from: dateFrom, to: dateTo }),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
