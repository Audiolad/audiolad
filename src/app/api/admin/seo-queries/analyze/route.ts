import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import {
  classifySeoQuery,
  SEO_QUERY_AUDIO_FITS,
  SEO_QUERY_FORMATS,
  SEO_QUERY_INTENTS,
} from "@/lib/seo-queries/classifier";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 20;

function uniqueIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITEMS) return null;
  const ids = [...new Set(value)];
  return ids.every((id) => typeof id === "string" && UUID.test(id)) ? ids : null;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request) {
  await requireAdminPermission("seo.manage");
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const ids = uniqueIds(body.query_ids);
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
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  const ids = items.map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).id : null);
  if (!uniqueIds(ids)) return NextResponse.json({ error: "invalid_items" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const results: Array<Record<string, unknown>> = [];
  for (const input of items as Record<string, unknown>[]) {
    const id = input.id as string;
    const intent = nullableString(input.intent);
    const recommendedFormat = nullableString(input.recommended_format);
    const audioFit = nullableString(input.audio_fit);
    const analysisStatus = input.analysis_status;
    if (
      intent === undefined || !SEO_QUERY_INTENTS.includes(intent as typeof SEO_QUERY_INTENTS[number])
      || recommendedFormat === undefined || (recommendedFormat !== null && !SEO_QUERY_FORMATS.includes(recommendedFormat as typeof SEO_QUERY_FORMATS[number]))
      || audioFit === undefined || !SEO_QUERY_AUDIO_FITS.includes(audioFit as typeof SEO_QUERY_AUDIO_FITS[number])
      || (analysisStatus !== "analyzed" && analysisStatus !== "not_applicable")
    ) {
      results.push({ id, status: "invalid_item" });
      continue;
    }
    const { data: reservation } = await supabase
      .from("seo_query_reservations").select("id").eq("query_id", id).in("status", ["active", "used"]).maybeSingle();
    if (reservation) { results.push({ id, status: "reservation_conflict" }); continue; }
    const { data, error } = await supabase.from("seo_queries").update({
      intent, recommended_format: recommendedFormat, audio_fit: audioFit, analysis_status: analysisStatus,
    }).eq("id", id).eq("analysis_status", "not_analyzed").select("id, intent, recommended_format, audio_fit, analysis_status").maybeSingle();
    if (error) { results.push({ id, status: "error" }); continue; }
    results.push(data ? { ...data, status: "applied" } : { id, status: "already_reviewed" });
  }
  const summary = {
    analyzed: results.filter((item) => item.status === "applied" && item.analysis_status === "analyzed").length,
    not_applicable: results.filter((item) => item.status === "applied" && item.analysis_status === "not_applicable").length,
    conflicts: results.filter((item) => item.status === "already_reviewed" || item.status === "reservation_conflict").length,
    errors: results.filter((item) => item.status === "error" || item.status === "invalid_item").length,
  };
  return NextResponse.json({ results, summary });
}
