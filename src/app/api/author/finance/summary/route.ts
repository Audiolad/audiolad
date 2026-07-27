import { NextResponse } from "next/server";

import {
  getAuthorFinanceIntegrityStatus,
  getAuthorFinanceSummary,
} from "@/lib/author-finance/queries";
import { requireAuthorFinanceAccess } from "@/lib/author-finance/route-guard";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { authorId } = await requireAuthorFinanceAccess(request);

    const [summary, integrityStatus] = await Promise.all([
      getAuthorFinanceSummary({ authorId }),
      getAuthorFinanceIntegrityStatus({ authorId }),
    ]);

    if (!summary) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ summary, integrityStatus });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
