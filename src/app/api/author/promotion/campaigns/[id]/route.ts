import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  getPromotionPeriodBounds,
  parsePromotionPeriod,
} from "@/lib/promotion/dates";
import { requirePromotionCampaignAccess } from "@/lib/promotion/access";
import {
  aggregatePromotionFunnelMetrics,
  buildPromotionChannelBreakdown,
  calculatePromotionConversions,
  detectPromotionStatsKind,
} from "@/lib/promotion/stats";
import type { PromotionStatsRow } from "@/lib/promotion/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const period = parsePromotionPeriod(url.searchParams.get("period"));
    const { dateFrom, dateTo } = getPromotionPeriodBounds(period);

    const { supabase } = await requirePromotionCampaignAccess(id);

    const { data, error } = await supabase.rpc("get_promotion_campaign_stats", {
      p_campaign_id: id,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    });

    if (error) {
      console.error("promotion_campaign_stats_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const rows: PromotionStatsRow[] = (data ?? []).map(
      (row: Record<string, unknown>) => ({
        utm_source: String(row.utm_source ?? "(none)"),
        utm_medium: String(row.utm_medium ?? "(none)"),
        utm_content: String(row.utm_content ?? "(none)"),
        event_name: String(row.event_name),
        unique_visitors: Number(row.unique_visitors ?? 0),
        event_count: Number(row.event_count ?? 0),
      }),
    );

    const metrics = aggregatePromotionFunnelMetrics(rows);
    const conversions = calculatePromotionConversions(metrics);
    const channels = buildPromotionChannelBreakdown(rows);
    const statsKind = detectPromotionStatsKind(rows);

    return NextResponse.json({
      period,
      rows,
      metrics,
      conversions,
      channels,
      statsKind,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const status =
      "status" in body && typeof body.status === "string"
        ? body.status.trim()
        : "";

    if (status !== "active" && status !== "archived") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requirePromotionCampaignAccess(id);

    const { data, error } = await supabase
      .from("promotion_campaigns")
      .update({ status })
      .eq("id", id)
      .select("id, status, updated_at")
      .single();

    if (error) {
      console.error("promotion_campaign_update_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ campaign: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
