import { NextResponse } from "next/server";

import { getAuthorFinanceTerms } from "@/lib/author-finance/queries";
import { requireAuthorFinanceAccess } from "@/lib/author-finance/route-guard";
import { handleAuthorRouteError } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { authorId } = await requireAuthorFinanceAccess(request);
    const terms = await getAuthorFinanceTerms({ authorId });

    return NextResponse.json(terms);
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
