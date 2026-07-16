import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { loadAuthorPromotionSummary } from "@/lib/promotion/campaigns-api";

export async function GET(request: Request) {
  try {
    return await loadAuthorPromotionSummary(request);
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
