import { NextResponse } from "next/server";

import { getAuthorFinanceLedgerDetail } from "@/lib/author-finance/queries";
import {
  isUuid,
  requireAuthorFinanceAccess,
} from "@/lib/author-finance/route-guard";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { authorId } = await requireAuthorFinanceAccess(request);
    const { id } = await context.params;

    if (!isUuid(id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const detail = await getAuthorFinanceLedgerDetail({
      authorId,
      entryId: id,
    });

    // The RPC answers found=false for both an unknown entry and someone
    // else's entry; the route keeps that indistinguishable.
    if (!detail) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ detail });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
