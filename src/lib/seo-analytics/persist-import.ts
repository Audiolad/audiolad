import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParsedWebmasterWorkbook } from "@/lib/seo-analytics/types";
import { YANDEX_WEBMASTER_SOURCE } from "@/lib/seo-analytics/types";

export type SeoSearchImportResult = {
  snapshot_id: string;
  replaced: boolean;
  row_count: number;
  source_row_count: number;
  metric_count: number;
  matched_count: number;
  new_count: number;
  total_impressions: number;
  total_clicks: number;
};

export function sanitizeImportFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ()\u0400-\u04FF]+/g, "_").slice(0, 180).trim();
  return cleaned || "webmaster.xlsx";
}

export function metricsPayload(workbook: ParsedWebmasterWorkbook) {
  return workbook.rows.map((row) => ({
    query_text: row.queryText,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    avg_position: row.avgPosition,
    avg_click_position: row.avgClickPosition,
    raw_metrics: row.rawMetrics,
  }));
}

export async function importYandexWebmasterSnapshot(
  supabase: SupabaseClient,
  workbook: ParsedWebmasterWorkbook,
  filename: string,
): Promise<SeoSearchImportResult> {
  const { data, error } = await supabase.rpc("import_seo_search_snapshot", {
    p_source: YANDEX_WEBMASTER_SOURCE,
    p_period_start: workbook.periodStart,
    p_period_end: workbook.periodEnd,
    p_original_filename: sanitizeImportFilename(filename),
    p_metrics: metricsPayload(workbook),
    p_source_row_count: workbook.sourceRowCount,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("import_failed");
  }
  const result = data as SeoSearchImportResult;
  return {
    snapshot_id: String(result.snapshot_id),
    replaced: Boolean(result.replaced),
    row_count: Number(result.row_count),
    source_row_count: Number(result.source_row_count),
    metric_count: Number(result.metric_count),
    matched_count: Number(result.matched_count),
    new_count: Number(result.new_count),
    total_impressions: Number(result.total_impressions),
    total_clicks: Number(result.total_clicks),
  };
}
