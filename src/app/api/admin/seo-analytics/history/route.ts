import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import { loadSeoQueryMetricHistory } from "@/lib/seo-analytics/load-dashboard";
import { normalizeSeoQueryText } from "@/lib/seo-queries/published-query-occupancy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireAdminPermission("seo.manage");
  const normalized = normalizeSeoQueryText(new URL(request.url).searchParams.get("q"));
  if (!normalized || normalized.length > 500) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }
  try {
    const points = await loadSeoQueryMetricHistory(normalized);
    return NextResponse.json({ normalizedQuery: normalized, points });
  } catch (error) {
    console.error("seo_analytics_history_failed", error);
    return NextResponse.json({ error: "history_failed" }, { status: 500 });
  }
}
