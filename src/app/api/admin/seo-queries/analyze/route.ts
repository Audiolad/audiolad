import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import { classifySeoQuery } from "@/lib/seo-queries/classifier";
import {
  parseSeoQueryIds,
  SEO_QUERY_ANALYSIS_MAX_ITEMS,
  validateSeoQueryApplyItem,
} from "@/lib/seo-queries/analysis-validation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(request: Request) {
  await requireAdminPermission("seo.manage");
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const ids = parseSeoQueryIds(body.query_ids);
  if (!ids) return NextResponse.json({ error: "invalid_query_ids" }, { status: 400 });

  const { data, error } = await createServiceRoleClient()
    .from("seo_queries")
    .select("id, query_text, source, frequency, analysis_status")
    .in("id", ids);
  if (error) return NextResponse.json({ error: "seo_query_analysis_load_failed" }, { status: 400 });
  const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
  const results = ids.map((id) => {
    const row = byId.get(id);
    if (!row) return { id, status: "not_found" as const };
    if (row.analysis_status !== "not_analyzed") {
      return { id, query_text: row.query_text, source: row.source, frequency: row.frequency, current_analysis_status: row.analysis_status, status: "already_reviewed" as const };
    }
    const suggested = classifySeoQuery({ queryText: row.query_text as string });
    return {
      id, query_text: row.query_text, source: row.source, frequency: row.frequency,
      current_analysis_status: row.analysis_status, status: "ready_for_review" as const,
      suggested: {
        intent: suggested.intent, recommended_format: suggested.recommendedFormat, audio_fit: suggested.audioFit,
        recommended_disposition: suggested.recommendedDisposition, confidence: suggested.confidence, reasons: suggested.reasons,
      },
    };
  });
  return NextResponse.json({ results });
}

export async function PUT(request: Request) {
  await requireAdminPermission("seo.manage");
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const items = body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > SEO_QUERY_ANALYSIS_MAX_ITEMS) return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  const ids = items.map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).id : null);
  if (!parseSeoQueryIds(ids)) return NextResponse.json({ error: "invalid_items" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const results: Array<Record<string, unknown>> = [];
  for (const input of items) {
    const parsed = validateSeoQueryApplyItem(input);
    const id = input && typeof input === "object" && typeof (input as Record<string, unknown>).id === "string" ? (input as Record<string, unknown>).id : null;
    if (!parsed) {
      results.push({ id, status: "invalid_item" });
      continue;
    }
    const { id: queryId, intent, recommendedFormat, audioFit, analysisStatus } = parsed;
    const { data: reservation } = await supabase
      .from("seo_query_reservations").select("id").eq("query_id", queryId).in("status", ["active", "used"]).maybeSingle();
    if (reservation) { results.push({ id: queryId, status: "reservation_conflict" }); continue; }
    const { data, error } = await supabase.from("seo_queries").update({
      intent, recommended_format: recommendedFormat, audio_fit: audioFit, analysis_status: analysisStatus,
    }).eq("id", queryId).eq("analysis_status", "not_analyzed").select("id, intent, recommended_format, audio_fit, analysis_status").maybeSingle();
    if (error) { results.push({ id: queryId, status: "error" }); continue; }
    results.push(data ? { ...data, status: "applied" } : { id: queryId, status: "already_reviewed" });
  }
  const summary = {
    analyzed: results.filter((item) => item.status === "applied" && item.analysis_status === "analyzed").length,
    not_applicable: results.filter((item) => item.status === "applied" && item.analysis_status === "not_applicable").length,
    conflicts: results.filter((item) => item.status === "already_reviewed" || item.status === "reservation_conflict").length,
    errors: results.filter((item) => item.status === "error" || item.status === "invalid_item").length,
  };
  return NextResponse.json({ results, summary });
}
